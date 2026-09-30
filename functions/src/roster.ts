import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { SERVER, auth, db, requireTrainer, text, writeAll } from './admin';

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

  const linked = client.get('uid');
  const linkedUid = typeof linked === 'string' && linked ? linked : null;

  // Already removed: the phone may never have heard the first answer, or the
  // first attempt may have stopped before the account step. The tombstone
  // keeps the account's uid for exactly this, so asking again finishes the
  // job — it used to return early and leave the person a client for good.
  if (client.get('deleted') !== true) {
    const code = client.get('inviteCode');
    const workouts = await db
      .collection(`trainers/${trainer.uid}/workouts`)
      .where('clientId', '==', clientId)
      .get();

    // Tombstones, not deletes, for the same reason deleteAccount uses them: the
    // coach's other phones learn what changed by asking for documents updated
    // since they last looked, and a deleted document is simply absent from
    // that answer. Each is replaced whole, so nothing about the person
    // survives — except the two ids the removed person's own phone needs.
    // Its sessions are asked for by clientId; a tombstone without one simply
    // left that question, and the phone kept showing them.
    const stamp = { deleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER };
    await writeAll((writer) => [
      ...workouts.docs.map((doc) => writer.set(doc.ref, { ...stamp, clientId })),
      ...(typeof code === 'string' && code ? [writer.delete(db.collection('inviteCodes').doc(code))] : []),
      writer.set(clientRef, linkedUid ? { ...stamp, uid: linkedUid } : stamp),
    ]);
  }

  if (linkedUid) await releaseAccount(linkedUid, trainer.uid, clientId);
  return { ok: true };
});

/**
 * Takes the client role off the person's account, and only while it still
 * points at this coach's client: a retry that arrives after they joined
 * somebody else must leave their new membership alone.
 *
 * Deliberately not a sign-out. Revoking their tokens only signed them out
 * within the hour — onto the welcome screen rather than "You're not with a
 * coach." — and never shortened their access, since the rules cannot see a
 * revocation. Their phone notices the profile change below instead, fetches a
 * token without the role, and lands on that screen within a second.
 */
async function releaseAccount(uid: string, trainerId: string, clientId: string) {
  const account = await auth.getUser(uid).catch((error: { code?: string }) => {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (!account) return;

  const claims = account.customClaims ?? {};
  if (claims.trainerId === trainerId && claims.clientId === clientId) {
    await auth.setCustomUserClaims(uid, null);
  }

  // The profile last, after the claims: it is what the person's phone listens
  // to, and the token it fetches on hearing this must no longer carry the role.
  const profile = db.doc(`users/${uid}`);
  const current = await profile.get();
  if (current.get('trainerId') === trainerId && current.get('clientId') === clientId) {
    await profile.update({
      role: FieldValue.delete(),
      trainerId: FieldValue.delete(),
      clientId: FieldValue.delete(),
    });
  }
}
