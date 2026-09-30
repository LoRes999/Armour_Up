import type { CallableRequest } from 'firebase-functions/https';

/**
 * removeClient, against the Firestore and Auth emulators
 * (`npm run test:rules`).
 *
 * A coach taking somebody off their roster. Ryan's call (2026-09-20): the
 * person keeps their sign-in — losing an account because a coach dropped you
 * is not the coach's to do — but loses every feature, because there is no
 * longer anyone paying for them. So their claims are cleared rather than the
 * account deleted, and they can redeem another coach's code later.
 */

type Roster = typeof import('../roster');
type Admin = typeof import('../admin');

let roster: Roster;
let admin: Admin;

const COACH = 'u-remove-coach';
const OTHER_COACH = 'u-remove-other';
const JORDAN = 'u-remove-jordan';
const CLIENT_ID = 'c-jordan';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  roster = require('../roster');
});

beforeEach(async () => {
  const { db, auth } = admin;
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
  await db.recursiveDelete(db.doc(`users/${JORDAN}`));
  await db.doc('inviteCodes/JDC897').delete();
  await auth.deleteUser(JORDAN).catch(() => undefined);
  await auth.createUser({ uid: JORDAN, email: 'remove-jordan@example.com' });
  await auth.setCustomUserClaims(JORDAN, { role: 'client', trainerId: COACH, clientId: CLIENT_ID });

  await db.doc(`trainers/${COACH}/clients/${CLIENT_ID}`).set({
    name: 'Jordan Lee',
    email: 'remove-jordan@example.com',
    unit: 'kg',
    inviteCode: 'JDC897',
    inviteAccepted: true,
    uid: JORDAN,
    deleted: false,
  });
  await db.doc('inviteCodes/JDC897').set({ trainerId: COACH, clientId: CLIENT_ID });
  await db.doc(`users/${JORDAN}`).set({ role: 'client', trainerId: COACH, clientId: CLIENT_ID });
  await db
    .doc(`trainers/${COACH}/workouts/w-1`)
    .set({ clientId: CLIENT_ID, name: 'Push Day A', loggedBy: 'trainer', deleted: false });
});

const asCoach = (uid = COACH) =>
  ({ auth: { uid, token: { role: 'trainer' } }, data: { clientId: CLIENT_ID } }) as unknown as CallableRequest;

async function read(path: string) {
  const snapshot = await admin.db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}

describe('a coach removing a client', () => {
  it('takes them off the roster, with their sessions', async () => {
    await roster.removeClient.run(asCoach());

    // Tombstones, not deletes: a second phone that was closed when this
    // happened learns about it by asking what changed, and a deleted document
    // is simply absent from that answer.
    expect(await read(`trainers/${COACH}/clients/${CLIENT_ID}`)).toMatchObject({ deleted: true });
    expect(await read(`trainers/${COACH}/workouts/w-1`)).toMatchObject({ deleted: true });
    expect(await read(`trainers/${COACH}/clients/${CLIENT_ID}`)).not.toHaveProperty('name');
  });

  it('frees the invite code', async () => {
    await roster.removeClient.run(asCoach());

    expect(await read('inviteCodes/JDC897')).toBeUndefined();
  });

  it('leaves them signed in to an account that can do nothing', async () => {
    await roster.removeClient.run(asCoach());

    const account = await admin.auth.getUser(JORDAN);
    expect(account.customClaims ?? {}).toEqual({});
    // Their profile no longer points at a coach, so the scheduler stops
    // treating them as this coach's client.
    const profile = await read(`users/${JORDAN}`);
    expect(profile).toBeDefined();
    expect(profile).not.toHaveProperty('trainerId');
    expect(profile).not.toHaveProperty('role');
  });

  it('can be asked twice, because the first answer may never have arrived', async () => {
    await roster.removeClient.run(asCoach());

    await expect(roster.removeClient.run(asCoach())).resolves.toEqual({ ok: true });
  });

  // The removed person's phone listens for sessions with their clientId. A
  // tombstone without one simply left that query, so the phone never heard
  // the sessions were gone and kept showing them.
  it("leaves tombstones the removed person's own phone can still find", async () => {
    await roster.removeClient.run(asCoach());

    const session = await read(`trainers/${COACH}/workouts/w-1`);
    expect(session).toMatchObject({ deleted: true, clientId: CLIENT_ID });
    expect(session).not.toHaveProperty('name');
  });

  // Revoking signed them out within the hour, onto the welcome screen, rather
  // than leaving them on "You're not with a coach." as Ryan chose. It never
  // shortened their access either: the rules cannot see a revocation.
  it('does not sign them out', async () => {
    const before = (await admin.auth.getUser(JORDAN)).tokensValidAfterTime;

    await roster.removeClient.run(asCoach());

    expect((await admin.auth.getUser(JORDAN)).tokensValidAfterTime).toBe(before);
  });

  // The tombstones went down and then clearing the claims failed. The retry
  // found a tombstone, called it done, and left the person a client for good.
  it('finishes the job when asked again after stopping part-way', async () => {
    await admin.db.doc(`trainers/${COACH}/clients/${CLIENT_ID}`).set({ deleted: true, uid: JORDAN });

    await roster.removeClient.run(asCoach());

    expect((await admin.auth.getUser(JORDAN)).customClaims ?? {}).toEqual({});
    expect(await read(`users/${JORDAN}`)).not.toHaveProperty('role');
  });

  it('never touches an account that has since joined another coach', async () => {
    await admin.db.doc(`trainers/${COACH}/clients/${CLIENT_ID}`).set({ deleted: true, uid: JORDAN });
    const elsewhere = { role: 'client', trainerId: OTHER_COACH, clientId: 'c-new' };
    await admin.auth.setCustomUserClaims(JORDAN, elsewhere);
    await admin.db.doc(`users/${JORDAN}`).set(elsewhere);

    await roster.removeClient.run(asCoach());

    expect((await admin.auth.getUser(JORDAN)).customClaims).toEqual(elsewhere);
    expect(await read(`users/${JORDAN}`)).toMatchObject(elsewhere);
  });

  it('refuses a client who is not on the calling coach\'s roster', async () => {
    await expect(roster.removeClient.run(asCoach(OTHER_COACH))).rejects.toMatchObject({
      code: 'not-found',
    });
    // And leaves the real coach's client exactly where they were.
    expect(await read(`trainers/${COACH}/clients/${CLIENT_ID}`)).toMatchObject({ deleted: false });
  });

  it('refuses a client account', async () => {
    const asClient = {
      auth: { uid: JORDAN, token: { role: 'client', trainerId: COACH, clientId: CLIENT_ID } },
      data: { clientId: CLIENT_ID },
    } as unknown as CallableRequest;

    await expect(roster.removeClient.run(asClient)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
