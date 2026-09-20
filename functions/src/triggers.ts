import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/firestore';
import type { Client, WeightUnit, Workout } from '../../src/models';
import { SERVER, db } from './admin';
import { deliver } from './deliver';
import { allocateCode } from './invites';
import { clientWorkouts, recipient } from './load';
import { assignedMessage, finishedMessage, joinedMessage, recordsSet } from './planner';
import { movementPhotoPrefix, removeStoredPhotos } from './photos';

/**
 * Reactions to what phones write. Each is safe to run twice: counts are
 * recounted rather than incremented, and every message is de-duplicated by
 * deliver().
 */

type Doc = Record<string, unknown> | undefined;
const live = (doc: Doc) => doc !== undefined && doc.deleted !== true;
const asWorkout = (id: string, doc: Doc) => ({ ...(doc as object), id }) as Workout;

/**
 * Recounts a client's finished sessions, inside a transaction. Counted outside
 * one, two sessions finished close together raced, and the write that landed
 * last could leave the count one short. A client who has left is a tombstone,
 * and nothing is written back onto it.
 */
export async function recountSessions(trainerId: string, clientId: string): Promise<void> {
  const clientRef = db.doc(`trainers/${trainerId}/clients/${clientId}`);
  await db.runTransaction(async (tx) => {
    const client = await tx.get(clientRef);
    if (!client.exists || client.get('deleted') === true) return;
    const workouts = await tx.get(db.collection(`trainers/${trainerId}/workouts`).where('clientId', '==', clientId));
    const count = workouts.docs.filter((doc) => doc.get('deleted') !== true && doc.get('status') === 'completed').length;
    if (client.get('sessionsCompleted') === count) return;
    tx.update(clientRef, { sessionsCompleted: count, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER });
  });
}

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
    await recountSessions(trainerId, clientId).catch((error) =>
      logger.warn('session count not updated', { trainerId, clientId, error })
    );
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

/**
 * Gives a client an invite code when they reach the server without one —
 * a roster uploaded from a phone that had it before accounts existed.
 *
 * It settles `inviteAccepted` in the same write. Both fields are server-owned,
 * so an upload strips them and the phone gets whatever the echo carries; with
 * neither written, the app read `undefined` for both, which took the client's
 * page down on formatInviteCode and left every adopted client reading PENDING
 * for good. Accepted means an account has actually redeemed a code, so it can
 * only be true if one is linked.
 */
export async function backfillInvite(trainerId: string, clientId: string): Promise<void> {
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
    tx.update(ref, {
      inviteCode: code,
      inviteAccepted: current.get('inviteAccepted') === true && Boolean(current.get('uid')),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: SERVER,
    });
  });
}

/**
 * A deleted movement takes its photos with it.
 *
 * The coach's own phone deletes each object as it saves, but that only covers
 * the phone that did the deleting, and only if it had a connection. This is
 * what guarantees the bucket is not left holding photos of a movement nobody
 * can reach — deleting the whole folder, so it does not matter which names
 * the document still listed.
 *
 * Storage is not part of the data a delete is undone from, so this runs on the
 * tombstone appearing and never on anything live.
 */
export const onMovementWritten = onDocumentWritten(
  'trainers/{trainerId}/movements/{movementId}',
  async (event) => {
    const { trainerId, movementId } = event.params;
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (after?.deleted !== true || before?.deleted === true) return;

    await removeStoredPhotos(movementPhotoPrefix(trainerId, movementId), { trainerId, movementId });
  }
);

export const onClientWritten = onDocumentWritten('trainers/{trainerId}/clients/{clientId}', async (event) => {
  const { trainerId, clientId } = event.params;
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  if (!live(after)) return;

  if (!after?.inviteCode) await backfillInvite(trainerId, clientId);

  // They used their code: tell the coach.
  if (after?.inviteAccepted === true && before?.inviteAccepted !== true && after?.uid) {
    const account = await recipient(trainerId);
    const message = account
      ? joinedMessage({ recipient: account, client: { ...(after as object), id: clientId } as Client, now: new Date() })
      : null;
    if (message) await deliver(db, [message]);
  }
});
