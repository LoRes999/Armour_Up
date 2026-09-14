import { Timestamp } from 'firebase-admin/firestore';

/**
 * checkReceipts, against the Firestore emulator (`npm run test:rules`).
 *
 * Most phones that have deleted the app are reported only in a receipt,
 * fetched a while after the send. Nothing ever asked, so their tokens stayed on
 * accounts for good and every send to them failed. Each scheduler run now reads
 * the receipts that are due and takes dead phones off their accounts.
 */

type Deliver = typeof import('../deliver');
type Admin = typeof import('../admin');

let deliverModule: Deliver;
let admin: Admin;

const DEAD = 'ExponentPushToken[dead]';
const LIVE = 'ExponentPushToken[live]';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  deliverModule = require('../deliver');
});

beforeEach(async () => {
  const { db } = admin;
  await db.recursiveDelete(db.collection('pushReceipts'));
  await db.recursiveDelete(db.doc('users/u-dana'));
  await db.doc(`users/u-dana/pushTokens/${DEAD}`).set({ platform: 'ios' });
  await db.doc(`users/u-dana/pushTokens/${LIVE}`).set({ platform: 'android' });
  const due = Timestamp.fromMillis(Date.now() - 60_000);
  const notYet = Timestamp.fromMillis(Date.now() + 15 * 60_000);
  await db.doc('pushReceipts/ticket-dead').set({ token: DEAD, uids: ['u-dana'], checkAfter: due });
  await db.doc('pushReceipts/ticket-live').set({ token: LIVE, uids: ['u-dana'], checkAfter: due });
  await db.doc('pushReceipts/ticket-soon').set({ token: LIVE, uids: ['u-dana'], checkAfter: notYet });
});

/** Answers receipt requests the way Expo does, recording what was asked. */
function fakeReceipts(receipts: Record<string, unknown>) {
  const asked: string[][] = [];
  const fetchImpl = async (_url: string, init: { body: string }) => {
    asked.push((JSON.parse(init.body) as { ids: string[] }).ids);
    return { ok: true, json: async () => ({ data: receipts }) };
  };
  return { asked, fetchImpl };
}

const exists = async (path: string) => (await admin.db.doc(path).get()).exists;

describe("checking Expo's receipts", () => {
  it('takes a phone that no longer has the app off its account', async () => {
    const { fetchImpl } = fakeReceipts({
      'ticket-dead': { status: 'error', details: { error: 'DeviceNotRegistered' } },
      'ticket-live': { status: 'ok' },
    });

    await deliverModule.checkReceipts(admin.db, fetchImpl);

    expect(await exists(`users/u-dana/pushTokens/${DEAD}`)).toBe(false);
    expect(await exists(`users/u-dana/pushTokens/${LIVE}`)).toBe(true);
  });

  it('is done with answered tickets and leaves the rest for later', async () => {
    const { asked, fetchImpl } = fakeReceipts({ 'ticket-live': { status: 'ok' } });

    await deliverModule.checkReceipts(admin.db, fetchImpl);

    // Only tickets old enough to have a receipt are asked about.
    expect(asked.flat().sort()).toEqual(['ticket-dead', 'ticket-live']);
    expect(await exists('pushReceipts/ticket-live')).toBe(false);
    // No receipt yet: asked about again next run.
    expect(await exists('pushReceipts/ticket-dead')).toBe(true);
    // Not due yet: untouched.
    expect(await exists('pushReceipts/ticket-soon')).toBe(true);
  });
});
