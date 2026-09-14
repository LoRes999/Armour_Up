import type { CallableRequest } from 'firebase-functions/https';

/**
 * previewInvite, against the Firestore emulator (`npm run test:rules`).
 *
 * The lookup the join screen makes before anyone has an account — "Sam wants
 * to coach you, Jordan" — needs no sign-in, so nothing stopped a script trying
 * codes until one matched and handed back a client's name and email. It now
 * allows a few dozen lookups an hour from one address: plenty for a person
 * typing a code, useless for guessing one out of a billion.
 */

type Accounts = typeof import('../accounts');
type Admin = typeof import('../admin');

let accounts: Accounts;
let admin: Admin;

const COACH = 't-sam';
const JORDAN = 'c-jordan';
const CODE = 'JDC897';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  accounts = require('../accounts');
});

beforeEach(async () => {
  const { db } = admin;
  await db.recursiveDelete(db.collection('previewAttempts'));
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
  await db.doc(`trainers/${COACH}`).set({ name: 'Sam Coach' });
  await db.doc(`trainers/${COACH}/clients/${JORDAN}`).set({
    name: 'Jordan Lee',
    email: 'jordan@example.com',
    unit: 'lb',
    inviteCode: CODE,
    inviteAccepted: false,
  });
  await db.doc(`inviteCodes/${CODE}`).set({ trainerId: COACH, clientId: JORDAN });
});

const lookup = (code: string, ip: string) =>
  accounts.previewInvite.run({ data: { code }, rawRequest: { ip, headers: {} } } as unknown as CallableRequest);

/** The server's own limit, so the test follows it if it is ever tuned. */
const limit = () => (accounts as unknown as { PREVIEW_LIMIT?: number }).PREVIEW_LIMIT ?? 0;

describe('looking up an invite code', () => {
  it('shows who is inviting whom', async () => {
    await expect(lookup(CODE, '203.0.113.7')).resolves.toMatchObject({
      trainerName: 'Sam Coach',
      clientName: 'Jordan Lee',
    });
  });

  it('stops an address that keeps guessing, even once it guesses right', async () => {
    for (let i = 0; i < limit(); i += 1) {
      await expect(lookup('AAAAAA', '203.0.113.7')).rejects.toMatchObject({ code: 'not-found' });
    }

    await expect(lookup(CODE, '203.0.113.7')).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('still answers somebody else', async () => {
    for (let i = 0; i < limit(); i += 1) await lookup('AAAAAA', '203.0.113.7').catch(() => undefined);

    await expect(lookup(CODE, '198.51.100.20')).resolves.toMatchObject({ clientName: 'Jordan Lee' });
  });
});
