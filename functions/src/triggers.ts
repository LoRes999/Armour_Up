import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Client, WeightUnit, Workout } from '../../src/models';
import { SERVER, db } from './admin';
import { deliver } from './deliver';
import { allocateCode } from './invites';
import { clientWorkouts, recipient } from './load';
import { assignedMessage, finishedMessage, joinedMessage, recordsSet } from './planner';

/**
 * Reactions to what phones write. Each is safe to run twice: counts are
 * recounted rather than incremented, and every message is de-duplicated by
 * deliver().
 */

type Doc = Record<string, unknown> | undefined;
const live = (doc: Doc) => doc !== undefined && doc.deleted !== true;
const asWorkout = (id: string, doc: Doc) => ({ ...(doc as object), id }) as Workout;

export const onWorkoutWritten = onDocumentWritten('trainers/{trainerId}/workouts/{workoutId}', async (event) => {
  const { trainerId, workoutId } = event.params;
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  const clientId = String((after ?? before)?.clientId ?? '');
  if (!clientId) return;

  const wasCompleted = live(before) && before?.status === 'completed';
  const isCompleted = live(after) && after?.status === 'completed';
  const clientRef = db.doc(`trainers/${trainerId}/clients/${clientId}`);

  // The session count belongs to the server. Both the coach's phone and the
  // client's saw the session finish; recounting means it is counted once.
  if (wasCompleted !== isCompleted) {
    const count = (await clientWorkouts(trainerId, clientId)).filter((w) => w.status === 'completed').length;
    await clientRef
      .update({ sessionsCompleted: count, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER })
      .catch((error) => logger.warn('session count not updated', { trainerId, clientId, error }));
  }

  const client = await clientRef.get();
  const now = new Date();

  // The coach sent a session: tell the client.
  const newlyAssigned =
    live(after) && after?.loggedBy === 'trainer' && Boolean(after?.assignedAt) && !before?.assignedAt;
  const clientUid = client.get('uid');
  if (newlyAssigned && typeof clientUid === 'string') {
    const [account, trainer] = await Promise.all([recipient(clientUid), db.doc(`trainers/${trainerId}`).get()]);
    const message = account
      ? assignedMessage({
          recipient: account,
          workout: asWorkout(workoutId, after),
          trainerName: String(trainer.get('name') ?? ''),
          now,
        })
      : null;
    if (message) await deliver(db, [message]);
  }

  // A client finished a session on their own: tell the coach. A session the
  // coach ran, they were there for.
  if (!wasCompleted && isCompleted && after?.loggedBy === 'client') {
    const account = await recipient(trainerId);
    if (account) {
      const session = asWorkout(workoutId, after);
      const history = await clientWorkouts(trainerId, clientId);
      const message = finishedMessage({
        recipient: account,
        clientName: String(client.get('name') ?? ''),
        workout: session,
        records: recordsSet(session, history.filter((w) => w.date < session.date)),
        unit: (client.get('unit') as WeightUnit) ?? 'lb',
        now,
      });
      if (message) await deliver(db, [message]);
    }
  }
});

export const onClientWritten = onDocumentWritten('trainers/{trainerId}/clients/{clientId}', async (event) => {
  const { trainerId, clientId } = event.params;
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  if (!live(after)) return;

  // Uploaded from a phone that had it before accounts existed: no code yet.
  if (!after?.inviteCode) {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`trainers/${trainerId}/clients/${clientId}`);
      const current = await tx.get(ref);
      if (!current.exists || current.get('inviteCode')) return;
      const code = await allocateCode(tx);
      tx.create(db.collection('inviteCodes').doc(code), {
        trainerId,
        clientId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(ref, { inviteCode: code, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER });
    });
  }

  // They used their code: tell the coach.
  if (after?.inviteAccepted === true && before?.inviteAccepted !== true && after?.uid) {
    const account = await recipient(trainerId);
    const message = account
      ? joinedMessage({ recipient: account, client: { ...(after as object), id: clientId } as Client, now: new Date() })
      : null;
    if (message) await deliver(db, [message]);
  }
});
