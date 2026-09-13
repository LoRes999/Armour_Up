import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { type Client, UNITS, type WeightUnit, makeInviteCode } from '../../src/models';
import { SERVER, auth, db, requireTrainer, text } from './admin';

/**
 * Invite codes are unique across every coach, so they are handed out here
 * and never on a phone. inviteCodes/{code} maps a code to its client and is
 * unreadable to the app — readable codes could be enumerated.
 */

/** Finds a code no coach is using, inside the caller's transaction. */
export async function allocateCode(tx: Transaction): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = makeInviteCode();
    const taken = await tx.get(db.collection('inviteCodes').doc(code));
    if (!taken.exists) return code;
  }
  // 32^6 codes; ten collisions in a row means something else is wrong.
  throw new HttpsError('resource-exhausted', 'Could not create a unique code. Try again.');
}

const newClientId = () =>
  `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function unitOf(value: unknown): WeightUnit {
  return UNITS.includes(value as WeightUnit) ? (value as WeightUnit) : 'lb';
}

export const createInvite = onCall(async (request) => {
  const trainer = requireTrainer(request);
  const name = text(request.data?.name, 'Name', 80);
  const email = text(request.data?.email, 'Email', 254);
  if (!email.includes('@')) throw new HttpsError('invalid-argument', 'That email address is missing an @.');
  const unit = unitOf(request.data?.unit);
  const clientId = newClientId();

  const client = await db.runTransaction(async (tx) => {
    const inviteCode = await allocateCode(tx);
    const created: Client = {
      id: clientId,
      name,
      email,
      unit,
      blockName: 'Onboarding',
      blockWeek: 1,
      blockLength: 4,
      adherence: 100,
      sessionsCompleted: 0,
      inviteCode,
      inviteAccepted: false,
    };
    const { id: _id, ...fields } = created;
    tx.create(db.collection('inviteCodes').doc(inviteCode), {
      trainerId: trainer.uid,
      clientId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(db.doc(`trainers/${trainer.uid}/clients/${clientId}`), {
      ...fields,
      deleted: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: SERVER,
    });
    return created;
  });

  return { client };
});

/**
 * A new code for an existing client; the old one stops working at once. It
 * also takes the client back from whoever joined with the old code, so a code
 * that reached the wrong person can be withdrawn — the real client joins again
 * with the new one. (Ryan's call, 2026-09-13; before, the account stayed joined
 * for good and the real client was told the code was "already used".)
 */
export const regenerateInviteCode = onCall(async (request) => {
  const trainer = requireTrainer(request);
  const clientId = text(request.data?.clientId, 'Client', 120);
  const ref = db.doc(`trainers/${trainer.uid}/clients/${clientId}`);

  const { inviteCode, unlinked } = await db.runTransaction(async (tx) => {
    // Every read before any write, as transactions require.
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.get('deleted') === true) {
      throw new HttpsError('not-found', 'That client is no longer on your roster.');
    }
    const linked = snapshot.get('uid');
    const linkedUid = typeof linked === 'string' && linked ? linked : null;
    const account = linkedUid ? await tx.get(db.doc(`users/${linkedUid}`)) : null;
    const next = await allocateCode(tx);

    const previous = snapshot.get('inviteCode');
    if (typeof previous === 'string' && previous) tx.delete(db.collection('inviteCodes').doc(previous));
    tx.create(db.collection('inviteCodes').doc(next), {
      trainerId: trainer.uid,
      clientId,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      inviteCode: next,
      inviteAccepted: false,
      uid: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: SERVER,
    });
    // So the scheduler stops treating that account as this client.
    if (account?.exists) {
      tx.update(account.ref, {
        role: FieldValue.delete(),
        trainerId: FieldValue.delete(),
        clientId: FieldValue.delete(),
      });
    }
    return { inviteCode: next, unlinked: linkedUid };
  });

  if (unlinked) {
    // The role lives in the sign-in token. Clearing it and revoking the refresh
    // tokens signs that account out everywhere; the token it already holds
    // keeps working until it expires, within the hour. Only an account that no
    // longer exists is let pass — anything else must not leave access behind.
    const unlessGone = (error: { code?: string }) => {
      if (error?.code !== 'auth/user-not-found') throw error;
    };
    await auth.setCustomUserClaims(unlinked, null).catch(unlessGone);
    await auth.revokeRefreshTokens(unlinked).catch(unlessGone);
  }

  return { inviteCode };
});
