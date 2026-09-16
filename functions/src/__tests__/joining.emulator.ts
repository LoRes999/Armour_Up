import type { CallableRequest } from 'firebase-functions/https';

/**
 * The way in, end to end, against the Firestore and Auth emulators
 * (`npm run test:rules`): a new account becomes a coach, the coach invites a
 * client, and the client's account joins with the code. Written before the App
 * Store release (2026-09-16), when nothing tested these three together; the
 * sign-up screens themselves are checked on TestFlight.
 */

type Accounts = typeof import('../accounts');
type Invites = typeof import('../invites');
type Admin = typeof import('../admin');

let accounts: Accounts;
let invites: Invites;
let admin: Admin;

const COACH = 'u-journey-coach';
const CLIENT = 'u-journey-client';
const OTHER = 'u-journey-other';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  accounts = require('../accounts');
  invites = require('../invites');
});

beforeEach(async () => {
  const { db, auth } = admin;
  for (const uid of [COACH, CLIENT, OTHER]) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`redeemAttempts/${uid}`).delete();
    await auth.deleteUser(uid).catch(() => undefined);
    await auth.createUser({ uid, email: `${uid}@example.com` });
  }
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
});

/** A call as this account, with the claims its token holds right now. */
async function as(uid: string, data: Record<string, unknown>) {
  const user = await admin.auth.getUser(uid);
  return {
    auth: { uid, token: { email: user.email, ...(user.customClaims ?? {}) } },
    data,
  } as unknown as CallableRequest;
}

async function read(path: string) {
  const snapshot = await admin.db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}

async function coachWithInvite() {
  await accounts.createTrainerProfile.run(await as(COACH, { name: 'Sam Coach', timezone: 'UTC' }));
  const { client } = await invites.createInvite.run(
    await as(COACH, { name: 'Jordan Lee', email: 'jordan@example.com', unit: 'kg' })
  );
  return client;
}

describe('a coach signing up', () => {
  it('becomes a coach, with a profile and the starter day types', async () => {
    await accounts.createTrainerProfile.run(await as(COACH, { name: 'Sam Coach', timezone: 'UTC' }));

    expect((await admin.auth.getUser(COACH)).customClaims).toEqual({ role: 'trainer' });
    expect(await read(`trainers/${COACH}`)).toEqual(expect.objectContaining({ name: 'Sam Coach' }));
    expect(await read(`users/${COACH}`)).toEqual(
      expect.objectContaining({ role: 'trainer', email: `${COACH}@example.com`, displayName: 'Sam Coach' })
    );
    const dayTypes = await admin.db.collection(`trainers/${COACH}/dayTypes`).get();
    expect(dayTypes.size).toBeGreaterThan(0);
  });

  it('can finish setting up again without harm', async () => {
    await accounts.createTrainerProfile.run(await as(COACH, { name: 'Sam Coach', timezone: 'UTC' }));
    await expect(
      accounts.createTrainerProfile.run(await as(COACH, { name: 'Sam Coach', timezone: 'UTC' }))
    ).resolves.toEqual({ ok: true });
    expect((await admin.auth.getUser(COACH)).customClaims).toEqual({ role: 'trainer' });
  });
});

describe('a client joining with a code', () => {
  it('is linked to the coach and the client record the code belongs to', async () => {
    const invited = await coachWithInvite();
    expect(invited.inviteAccepted).toBe(false);

    const joined = await accounts.redeemInvite.run(await as(CLIENT, { code: invited.inviteCode, timezone: 'UTC' }));

    expect(joined).toEqual({ trainerId: COACH, clientId: invited.id });
    expect((await admin.auth.getUser(CLIENT)).customClaims).toEqual({
      role: 'client',
      trainerId: COACH,
      clientId: invited.id,
    });
    expect(await read(`trainers/${COACH}/clients/${invited.id}`)).toEqual(
      expect.objectContaining({ uid: CLIENT, inviteAccepted: true, name: 'Jordan Lee' })
    );
    expect(await read(`users/${CLIENT}`)).toEqual(
      expect.objectContaining({ role: 'client', trainerId: COACH, clientId: invited.id, displayName: 'Jordan Lee' })
    );
  });

  it('accepts the code in lower case and with a dash, as people type it', async () => {
    const invited = await coachWithInvite();
    const typed = `${invited.inviteCode.slice(0, 3)}-${invited.inviteCode.slice(3)}`.toLowerCase();

    await expect(accounts.redeemInvite.run(await as(CLIENT, { code: typed }))).resolves.toEqual({
      trainerId: COACH,
      clientId: invited.id,
    });
  });

  it('can be tried again by the same account', async () => {
    const invited = await coachWithInvite();
    await accounts.redeemInvite.run(await as(CLIENT, { code: invited.inviteCode }));

    await expect(accounts.redeemInvite.run(await as(CLIENT, { code: invited.inviteCode }))).resolves.toEqual({
      trainerId: COACH,
      clientId: invited.id,
    });
  });

  it('refuses a code another account has already used', async () => {
    const invited = await coachWithInvite();
    await accounts.redeemInvite.run(await as(CLIENT, { code: invited.inviteCode }));

    await expect(accounts.redeemInvite.run(await as(OTHER, { code: invited.inviteCode }))).rejects.toMatchObject({
      code: 'already-exists',
    });
    expect((await admin.auth.getUser(OTHER)).customClaims ?? {}).toEqual({});
  });

  it("refuses a coach's account", async () => {
    const invited = await coachWithInvite();

    await expect(accounts.redeemInvite.run(await as(COACH, { code: invited.inviteCode }))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('refuses a code that matches no invitation', async () => {
    await coachWithInvite();

    await expect(accounts.redeemInvite.run(await as(CLIENT, { code: 'ZZZZZZ' }))).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
