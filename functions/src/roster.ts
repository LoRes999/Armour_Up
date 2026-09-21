import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { SERVER, auth, db, requireTrainer, text } from './admin';

/**
 * Taking somebody off a roster.
 *
 * A coach could invite a client and issue them a new code, but never remove
 * them: a client who stopped training stayed on the roster for good, counted
 * in every total, and generated a "hasn't trained in 28 days" nudge every
 * week. The rules and the upload policy already allowed a coach to delete a
 * client — only the way to ask for it was missing.
 *
 * What happens to the person is Ryan's call (2026-09-20): they keep their
 * sign-in, because losing an account because a coach dropped you is not the
 * coach's to do, but they lose every feature, because nobody is paying for
 * them any more. Clearing their claims does both — and leaves them able to
 * redeem another coach's code later.
 */
export const removeClient = onCall(async (request) => {
  const trainer = requireTrainer(request);
  const clientId = text(request.data?.clientId, 'Client', 120);
  const clientRef = db.doc(`trainers/${trainer.uid}/clients/${clientId}`);

  const client = await clientRef.get();
  if (!client.exists) {
    throw new HttpsError('not-found', 'That client is not on your roster.');
  }
  // Already removed. The phone may simply never have heard the first answer,
  // and saying so would turn a finished job into an error on screen.
  if (client.get('deleted') === true) return { ok: true };

  const linked = client.get('uid');
  const linkedUid = typeof linked === 'string' && linked ? linked : null;
  const code = client.get('inviteCode');

  // Tombstones, not deletes, for the same reason deleteAccount uses them: the
  // coach's other phones learn what changed by asking for documents updated
  // since they last looked, and a deleted document is simply absent from that
  // answer. Each is replaced whole, so nothing about the person survives.
  const tombstone = () => ({ deleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER });
  const workouts = await db
    .collection(`trainers/${trainer.uid}/workouts`)
    .where('clientId', '==', clientId)
    .get();

  const writer = db.bulkWriter();
  workouts.docs.forEach((doc) => writer.set(doc.ref, tombstone()));
  if (typeof code === 'string' && code) writer.delete(db.collection('inviteCodes').doc(code));
  writer.set(clientRef, tombstone());
  await writer.close();

  if (linkedUid) {
    // Their profile first, so the scheduler stops treating that account as
    // this coach's client even if clearing the claims below fails.
    await db
      .doc(`users/${linkedUid}`)
      .update({
        role: FieldValue.delete(),
        trainerId: FieldValue.delete(),
        clientId: FieldValue.delete(),
      })
      .catch(() => undefined);

    // The role lives in the sign-in token. Clearing it and revoking the
    // refresh tokens signs that account out of the client app everywhere; the
    // token it already holds keeps working until it expires, within the hour.
    // Only an account that no longer exists is let pass — anything else must
    // not leave access behind.
    const unlessGone = (error: { code?: string }) => {
      if (error?.code !== 'auth/user-not-found') throw error;
    };
    await auth.setCustomUserClaims(linkedUid, null).catch(unlessGone);
    await auth.revokeRefreshTokens(linkedUid).catch(unlessGone);
  }

  return { ok: true };
});
