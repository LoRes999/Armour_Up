import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/https';
import { CODE_LENGTH, UNITS, type WeightUnit, normaliseCode } from '../../src/models';
import { SEED_DAY_TYPES } from '../../src/sampleData';
import { logger } from 'firebase-functions';
import { SERVER, auth, db, requireUser, text, timeZoneOr, writeAll } from './admin';
import { deliver } from './deliver';
import { recipient } from './load';
import { DEFAULT_PREFS, leftMessage } from './planner';
import { removeStoredPhotos, trainerPhotoPrefix } from './photos';

/**
 * Accounts and roles. The role lives in the sign-in token (a custom claim),
 * which only these functions can set, so the security rules can trust it. The
 * app refreshes its token after calling one of them to pick up the change.
 */

/** Turns a new sign-up into a coach: profile, starter day types, and the claim. */
export const createTrainerProfile = onCall(async (request) => {
  const user = requireUser(request);
  if (user.token.role === 'client') {
    throw new HttpsError('failed-precondition', 'This account already belongs to a client.');
  }
  if (user.token.role === 'trainer') return { ok: true };

  const name = text(request.data?.name, 'Name', 80);
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.doc(`users/${user.uid}`), {
    role: 'trainer',
    email: user.token.email ?? null,
    displayName: name,
    timezone: timeZoneOr(request.data?.timezone),
    notificationPrefs: DEFAULT_PREFS,
    createdAt: now,
  });
  batch.set(db.doc(`trainers/${user.uid}`), { name, createdAt: now });
  // The same starter split a new install has, so the builder is never empty.
  for (const { id, ...fields } of SEED_DAY_TYPES) {
    batch.set(db.doc(`trainers/${user.uid}/dayTypes/${id}`), {
      ...fields,
      deleted: false,
      updatedAt: now,
      updatedBy: SERVER,
    });
  }
  await batch.commit();
  await auth.setCustomUserClaims(user.uid, { role: 'trainer' });
  return { ok: true };
});

const RATE_WINDOW_MS = 60 * 60_000;
const RATE_MAX = 10;

/**
 * Invite lookups allowed from one address per hour. The lookup needs no
 * sign-in, so without a limit a script could try codes until one matched and
 * read back a client's name and email. A person typing a code needs a
 * handful; guessing one of 32^6 at this rate is hopeless.
 */
export const PREVIEW_LIMIT = 30;

/** The caller's address, hashed: counted, never stored as it is. */
function callerKey(request: { rawRequest?: { ip?: string; headers?: Record<string, unknown> } }): string {
  // Behind Google's front end, the real address is the last one it appended.
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const chain =
    typeof forwarded === 'string'
      ? forwarded
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : [];
  const address = chain[chain.length - 1] ?? request.rawRequest?.ip ?? 'unknown';
  return createHash('sha256').update(address).digest('hex');
}

async function readInvite(rawCode: unknown) {
  const code = normaliseCode(typeof rawCode === 'string' ? rawCode : '');
  if (code.length !== CODE_LENGTH) {
    throw new HttpsError('invalid-argument', 'An invite code is six letters and numbers.');
  }
  const invite = await db.collection('inviteCodes').doc(code).get();
  if (!invite.exists) {
    throw new HttpsError('not-found', "That code doesn't match an invitation. Check it with your coach.");
  }
  const { trainerId, clientId } = invite.data() as { trainerId: string; clientId: string };
  return { code, trainerId, clientId };
}

/**
 * What the invitation screen shows before anyone has an account: who is
 * inviting whom. Callable without signing in, because the account is created
 * after this. Returns only what that screen needs.
 */
export const previewInvite = onCall(async (request) => {
  // Counted before the code is even read: wrong guesses are what is limited.
  const attempts = db.doc(`previewAttempts/${callerKey(request)}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(attempts);
    const now = Date.now();
    const windowStart = Number(snapshot.get('windowStart') ?? 0);
    const count = now - windowStart > RATE_WINDOW_MS ? 0 : Number(snapshot.get('count') ?? 0);
    if (count >= PREVIEW_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Too many tries. Wait an hour, or ask your coach for the code again.');
    }
    const start = count === 0 ? now : windowStart;
    // expireAt lets a TTL policy clear the count once its hour is up.
    tx.set(attempts, { windowStart: start, count: count + 1, expireAt: Timestamp.fromMillis(start + RATE_WINDOW_MS) });
  });

  const { trainerId, clientId } = await readInvite(request.data?.code);
  const [trainer, client] = await Promise.all([
    db.doc(`trainers/${trainerId}`).get(),
    db.doc(`trainers/${trainerId}/clients/${clientId}`).get(),
  ]);
  if (!client.exists || client.get('deleted') === true) {
    throw new HttpsError('not-found', "That code doesn't match an invitation. Check it with your coach.");
  }
  return {
    trainerName: String(trainer.get('name') ?? ''),
    clientName: String(client.get('name') ?? ''),
    email: String(client.get('email') ?? ''),
    unit: client.get('unit') as WeightUnit,
    alreadyJoined: Boolean(client.get('uid')),
  };
});

/** Links a newly created account to the client record its code belongs to. */
export const redeemInvite = onCall(async (request) => {
  const user = requireUser(request);
  if (user.token.role === 'trainer') {
    throw new HttpsError('failed-precondition', "This is a coach's account. Sign out to join as a client.");
  }

  // Ten tries an hour per account: plenty for typos, useless for guessing.
  const attempts = db.doc(`redeemAttempts/${user.uid}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(attempts);
    const now = Date.now();
    const windowStart = Number(snapshot.get('windowStart') ?? 0);
    const count = now - windowStart > RATE_WINDOW_MS ? 0 : Number(snapshot.get('count') ?? 0);
    if (count >= RATE_MAX) {
      throw new HttpsError('resource-exhausted', 'Too many tries. Wait an hour, or ask your coach for the code again.');
    }
    tx.set(attempts, { windowStart: count === 0 ? now : windowStart, count: count + 1 });
  });

  const { trainerId, clientId } = await readInvite(request.data?.code);
  if (user.token.role === 'client') {
    if (user.token.clientId === clientId) return { trainerId, clientId };
    throw new HttpsError('failed-precondition', 'This account has already joined a coach.');
  }

  const unit = UNITS.includes(request.data?.unit) ? (request.data.unit as WeightUnit) : undefined;
  const clientRef = db.doc(`trainers/${trainerId}/clients/${clientId}`);
  await db.runTransaction(async (tx) => {
    const client = await tx.get(clientRef);
    if (!client.exists || client.get('deleted') === true) {
      throw new HttpsError('not-found', "That code doesn't match an invitation. Check it with your coach.");
    }
    const linked = client.get('uid');
    if (linked && linked !== user.uid) {
      throw new HttpsError(
        'already-exists',
        'This code has already been used on another account. Sign in with that account, or ask your coach for a new code.'
      );
    }
    tx.update(clientRef, {
      uid: user.uid,
      inviteAccepted: true,
      ...(unit ? { unit } : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: SERVER,
    });
    tx.set(
      db.doc(`users/${user.uid}`),
      {
        role: 'client',
        email: user.token.email ?? null,
        displayName: client.get('name') ?? '',
        trainerId,
        clientId,
        timezone: timeZoneOr(request.data?.timezone),
        notificationPrefs: DEFAULT_PREFS,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await auth.setCustomUserClaims(user.uid, { role: 'client', trainerId, clientId });
  await attempts.delete();
  return { trainerId, clientId };
});

/**
 * Deletes the account and its data, as App Store guideline 5.1.1(v) requires.
 * A client takes their record and sessions with them, and their coach is told.
 * A coach takes their whole roster, and their clients' accounts are deleted
 * with it, since there is no longer a program for them to see.
 */
export const deleteAccount = onCall(async (request) => {
  const user = requireUser(request);
  const { role, trainerId, clientId } = user.token as { role?: string; trainerId?: string; clientId?: string };

  if (role === 'client' && trainerId && clientId) {
    const workouts = await db
      .collection(`trainers/${trainerId}/workouts`)
      .where('clientId', '==', clientId)
      .get();
    // Tombstones, not deletes. The coach's phones learn what changed by asking
    // for documents updated since they last looked, and a deleted document is
    // simply absent from that answer: a phone that was closed when the client
    // left kept them — name, email and every session — for good. Each document
    // is replaced whole, so nothing about the person survives in it.
    const tombstone = () => ({ deleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: SERVER });
    const client = await db.doc(`trainers/${trainerId}/clients/${clientId}`).get();
    const code = client.get('inviteCode');
    await writeAll((writer) => [
      ...workouts.docs.map((doc) => writer.set(doc.ref, tombstone())),
      ...(typeof code === 'string' && code ? [writer.delete(db.collection('inviteCodes').doc(code))] : []),
      ...(client.exists ? [writer.set(client.ref, tombstone())] : []),
    ]);

    // Tell their coach (Ryan's call, and his words). The name comes from the
    // record read above, before it became a tombstone; a retried deletion
    // finds only the tombstone and stays quiet. A notification that fails must
    // never stop the deletion itself.
    const name = client.get('name');
    if (typeof name === 'string' && name) {
      try {
        const coach = await recipient(trainerId);
        const message = coach ? leftMessage({ recipient: coach, clientName: name, clientId, now: new Date() }) : null;
        if (message) await deliver(db, [message]);
      } catch (error) {
        logger.warn('left notification not sent', { trainerId, clientId, error });
      }
    }
  }

  if (role === 'trainer') {
    const clients = await db.collection(`trainers/${user.uid}/clients`).get();
    const codes = await db.collection('inviteCodes').where('trainerId', '==', user.uid).get();
    await writeAll((writer) => codes.docs.map((doc) => writer.delete(doc.ref)));
    // Their clients' accounts go with it (Ryan's call, 2026-09-13). Only
    // disabling them left each client's email taken for good, their profile
    // and push tokens on the server, and no way to sign in and delete
    // themselves. Anything but an already-gone sign-in stops here, so the
    // deletion can be asked again.
    const clientUids = clients.docs
      .map((doc) => doc.get('uid'))
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);
    for (const clientUid of clientUids) {
      await db.recursiveDelete(db.doc(`users/${clientUid}`));
      await db.doc(`redeemAttempts/${clientUid}`).delete();
      await auth.deleteUser(clientUid).catch((error: { code?: string }) => {
        if (error?.code !== 'auth/user-not-found') throw error;
      });
    }
    // Their movement photos live in Storage, which recursiveDelete does not
    // reach. Deleting an account has to leave nothing behind.
    await removeStoredPhotos(trainerPhotoPrefix(user.uid), { uid: user.uid });
    await db.recursiveDelete(db.doc(`trainers/${user.uid}`));
  }

  await db.recursiveDelete(db.doc(`users/${user.uid}`));
  await db.doc(`redeemAttempts/${user.uid}`).delete();
  // Asked again after an attempt that already finished — its answer never
  // reached the phone — the sign-in is already gone. That is the goal, not a
  // failure: reporting it kept the app saying the account wasn't deleted.
  await auth.deleteUser(user.uid).catch((error: { code?: string }) => {
    if (error?.code !== 'auth/user-not-found') throw error;
  });
  return { ok: true };
});
