import type { CallableRequest } from 'firebase-functions/https';

/**
 * regenerateInviteCode, against the Firestore and Auth emulators
 * (`npm run test:rules`).
 *
 * A new code used to leave whoever had joined with the old one fully joined:
 * their access comes from the role in their sign-in token, which a new code
 * never touched. So a code that reached the wrong person could not be taken
 * back, and the real client then got "already used on another account" for
 * good. Ryan decided (2026-09-13) that a new code unlinks the old account.
 */

type Invites = typeof import('../invites');
type Admin = typeof import('../admin');

let invites: Invites;
let admin: Admin;

const COACH = 't-sam';
const JORDAN = 'c-jordan';
const OLD_UID = 'u-stranger';
const OLD_CODE = 'JDC897';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  invites = require('../invites');
});

beforeEach(async () => {
  const { db, auth } = admin;
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
  await db.recursiveDelete(db.doc(`users/${OLD_UID}`));
  await db.doc(`inviteCodes/${OLD_CODE}`).delete();
  await auth.deleteUser(OLD_UID).catch(() => undefined);

  await auth.createUser({ uid: OLD_UID, email: 'stranger@example.com' });
  await auth.setCustomUserClaims(OLD_UID, { role: 'client', trainerId: COACH, clientId: JORDAN });
  await db.doc(`users/${OLD_UID}`).set({ role: 'client', trainerId: COACH, clientId: JORDAN, timezone: 'UTC' });
  await db.doc(`trainers/${COACH}`).set({ name: 'Sam Coach' });
  await db.doc(`trainers/${COACH}/clients/${JORDAN}`).set({
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    unit: 'lb',
    inviteCode: OLD_CODE,
    inviteAccepted: true,
    uid: OLD_UID,
  });
  await db.doc(`trainers/${COACH}/clients/c-priya`).set({
    name: 'Priya Nair',
    email: 'priya@example.com',
    unit: 'kg',
    inviteCode: 'PRY234',
    inviteAccepted: false,
  });
  await db.doc(`inviteCodes/${OLD_CODE}`).set({ trainerId: COACH, clientId: JORDAN });
});

const asCoach = (clientId: string) =>
  ({ auth: { uid: COACH, token: { role: 'trainer' } }, data: { clientId } }) as unknown as CallableRequest;

async function read(path: string) {
  const snapshot = await admin.db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}

describe('a coach issuing a new code', () => {
  it('unlinks the account that joined with the old one', async () => {
    const { inviteCode } = await invites.regenerateInviteCode.run(asCoach(JORDAN));

    expect(inviteCode).not.toBe(OLD_CODE);
    expect(await read(`inviteCodes/${OLD_CODE}`)).toBeUndefined();
    const client = await read(`trainers/${COACH}/clients/${JORDAN}`);
    expect(client?.uid).toBeUndefined();
    expect(client?.inviteAccepted).toBe(false);
    expect(client?.inviteCode).toBe(inviteCode);
    expect(client?.name).toBe('Jordan Lee');
  });

  it("takes the client's role out of that account and signs it out everywhere", async () => {
    // Revocation is stamped to the whole second.
    const startedAt = Math.floor(Date.now() / 1000) * 1000;

    await invites.regenerateInviteCode.run(asCoach(JORDAN));

    const account = await admin.auth.getUser(OLD_UID);
    expect(account.customClaims ?? {}).toEqual({});
    expect(Date.parse(account.tokensValidAfterTime ?? '')).toBeGreaterThanOrEqual(startedAt);
    // And the scheduler no longer finds them as Jordan.
    const profile = await read(`users/${OLD_UID}`);
    expect(profile?.role).toBeUndefined();
    expect(profile?.trainerId).toBeUndefined();
    expect(profile?.clientId).toBeUndefined();
  });

  it('still just replaces the code for a client who never joined', async () => {
    const { inviteCode } = await invites.regenerateInviteCode.run(asCoach('c-priya'));

    const client = await read(`trainers/${COACH}/clients/c-priya`);
    expect(client?.inviteCode).toBe(inviteCode);
    expect(client?.inviteAccepted).toBe(false);
    expect(await read(`inviteCodes/${inviteCode}`)).toEqual(expect.objectContaining({ clientId: 'c-priya' }));
  });
});
