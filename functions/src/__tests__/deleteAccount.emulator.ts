import type { CallableRequest } from 'firebase-functions/https';

/**
 * deleteAccount, run against the Firestore and Auth emulators
 * (`npm run test:rules` starts them). Named .emulator.ts so the everyday
 * `npm test`, which has no emulator, leaves it alone.
 *
 * A coach's phone learns what changed by asking for documents updated since
 * its last sync. A document deleted outright is simply absent from that answer,
 * so a coach whose phone was closed when a client left kept that client — name,
 * email and every session — for good. Removals are tombstones instead: the
 * document stays, marked deleted and stamped, with nothing about the person.
 */

type Accounts = typeof import('../accounts');
type Admin = typeof import('../admin');

let accounts: Accounts;
let admin: Admin;

const COACH = 't-sam';
const JORDAN = 'c-jordan';
const JORDAN_UID = 'u-jordan';
const CODE = 'JDC897';

beforeAll(() => {
  // The admin app reads the project when it starts; the emulators run as this one.
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  accounts = require('../accounts');
});

beforeEach(async () => {
  const { db, auth } = admin;
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
  await db.recursiveDelete(db.doc(`users/${JORDAN_UID}`));
  await db.doc(`inviteCodes/${CODE}`).delete();
  await auth.deleteUser(JORDAN_UID).catch(() => undefined);

  await auth.createUser({ uid: JORDAN_UID, email: 'jordan@example.com' });
  await db.doc(`users/${JORDAN_UID}`).set({ role: 'client', trainerId: COACH, clientId: JORDAN });
  await db.doc(`trainers/${COACH}`).set({ name: 'Sam Coach' });
  await db.doc(`trainers/${COACH}/clients/${JORDAN}`).set({
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    unit: 'lb',
    inviteCode: CODE,
    inviteAccepted: true,
    uid: JORDAN_UID,
  });
  await db.doc(`trainers/${COACH}/clients/c-priya`).set({ name: 'Priya Nair', email: 'priya@example.com', unit: 'kg' });
  await db.doc(`inviteCodes/${CODE}`).set({ trainerId: COACH, clientId: JORDAN });
  const workout = { loggedBy: 'trainer', date: '2026-09-10T17:00:00.000Z', exercises: [] };
  await db.doc(`trainers/${COACH}/workouts/w-push`).set({ ...workout, clientId: JORDAN, name: 'Push', status: 'completed' });
  await db.doc(`trainers/${COACH}/workouts/w-pull`).set({ ...workout, clientId: JORDAN, name: 'Pull', status: 'scheduled' });
  await db.doc(`trainers/${COACH}/workouts/w-priya`).set({ ...workout, clientId: 'c-priya', name: 'Legs', status: 'scheduled' });
});

const asJordan = {
  auth: { uid: JORDAN_UID, token: { role: 'client', trainerId: COACH, clientId: JORDAN } },
  data: undefined,
} as unknown as CallableRequest;

async function read(path: string) {
  const snapshot = await admin.db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}

/** A tombstone: marked deleted, stamped, and holding nothing else. */
function expectTombstone(data: Record<string, unknown> | undefined) {
  expect(data).toBeDefined();
  expect(Object.keys(data ?? {}).sort()).toEqual(['deleted', 'updatedAt', 'updatedBy']);
  expect(data?.deleted).toBe(true);
}

/**
 * A coach's deletion used to disable their clients' accounts and stop there:
 * each client's email stayed taken for good, their profile and push tokens
 * stayed on the server, and — unable to sign in — they could never delete
 * themselves. Ryan decided (2026-09-13) those accounts are deleted too.
 */
describe('a coach deleting their account', () => {
  const asCoach = {
    auth: { uid: COACH, token: { role: 'trainer' } },
    data: undefined,
  } as unknown as CallableRequest;

  it("deletes their clients' accounts with it, leaving nothing of them behind", async () => {
    const { db, auth } = admin;
    await auth.deleteUser(COACH).catch(() => undefined);
    await auth.createUser({ uid: COACH, email: 'sam@example.com' });
    await db.recursiveDelete(db.doc(`users/${COACH}`));
    await db.doc(`users/${COACH}`).set({ role: 'trainer', displayName: 'Sam Coach' });
    await db.doc(`users/${JORDAN_UID}/pushTokens/ExponentPushToken[jordan]`).set({ platform: 'ios' });
    await db.doc(`redeemAttempts/${JORDAN_UID}`).set({ windowStart: 1, count: 1 });

    await accounts.deleteAccount.run(asCoach);

    await expect(auth.getUser(JORDAN_UID)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(await read(`users/${JORDAN_UID}`)).toBeUndefined();
    expect(await read(`users/${JORDAN_UID}/pushTokens/ExponentPushToken[jordan]`)).toBeUndefined();
    expect(await read(`redeemAttempts/${JORDAN_UID}`)).toBeUndefined();

    await expect(auth.getUser(COACH)).rejects.toMatchObject({ code: 'auth/user-not-found' });
    expect(await read(`trainers/${COACH}`)).toBeUndefined();
    expect(await read(`trainers/${COACH}/clients/${JORDAN}`)).toBeUndefined();
    expect(await read(`inviteCodes/${CODE}`)).toBeUndefined();
  });
});

describe('a client deleting their account', () => {
  it("leaves tombstones a coach's phone can still find, with nothing about the person", async () => {
    await accounts.deleteAccount.run(asJordan);

    expectTombstone(await read(`trainers/${COACH}/clients/${JORDAN}`));
    expectTombstone(await read(`trainers/${COACH}/workouts/w-push`));
    expectTombstone(await read(`trainers/${COACH}/workouts/w-pull`));
  });

  it('removes their code, their profile and their sign-in', async () => {
    await accounts.deleteAccount.run(asJordan);

    expect(await read(`inviteCodes/${CODE}`)).toBeUndefined();
    expect(await read(`users/${JORDAN_UID}`)).toBeUndefined();
    await expect(admin.auth.getUser(JORDAN_UID)).rejects.toMatchObject({ code: 'auth/user-not-found' });
  });

  // The first attempt removed everything but its answer never reached the
  // phone, which asks again. That second call used to fail on the sign-in
  // already being gone, so the app said "Your account was not deleted" for
  // good and never cleared itself.
  it('can be asked again after an attempt that already finished', async () => {
    await accounts.deleteAccount.run(asJordan);

    await expect(accounts.deleteAccount.run(asJordan)).resolves.toEqual({ ok: true });
  });

  it("leaves the coach's other clients alone", async () => {
    await accounts.deleteAccount.run(asJordan);

    expect((await read(`trainers/${COACH}/clients/c-priya`))?.name).toBe('Priya Nair');
    expect((await read(`trainers/${COACH}/workouts/w-priya`))?.name).toBe('Legs');
  });
});
