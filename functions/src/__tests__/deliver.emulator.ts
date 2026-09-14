import type { PushMessage, PushResult } from '../expoPush';
import type { Message } from '../planner';

/**
 * deliver(), against the Firestore emulator (`npm run test:rules`).
 *
 * It claimed every planned message first and sent them all at the end. A
 * scheduler run that ran out of time after claiming — hundreds of claims at
 * 7 AM — lost every message it had claimed, and the retry skipped them all as
 * already sent. Claiming and sending now go a batch at a time, so a run that
 * stops part-way loses at most the batch in hand.
 */

type Deliver = typeof import('../deliver');
type Admin = typeof import('../admin');

let deliverModule: Deliver;
let admin: Admin;

const USERS = ['u-1', 'u-2', 'u-3', 'u-4', 'u-5'];
const token = (uid: string) => `ExponentPushToken[${uid}]`;
const message = (uid: string): Message => ({
  uid,
  kind: 'reminder',
  group: 'reminders',
  title: 'Push Day A today',
  body: '6:00 PM with Sam.',
  route: '/(client)',
  dedupeKey: `deliver-test:${uid}`,
});

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  deliverModule = require('../deliver');
});

beforeEach(async () => {
  const { db } = admin;
  for (const uid of USERS) {
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`users/${uid}/pushTokens/${token(uid)}`).set({ platform: 'ios' });
    await db.doc(`notificationLog/${uid}_deliver-test:${uid}`).delete();
  }
});

const claimed = async (uid: string) =>
  (await admin.db.doc(`notificationLog/${uid}_deliver-test:${uid}`).get()).exists;

/** Sends like Expo would, except that the run stops on the second batch. */
function stopsOnSecondBatch(delivered: string[]) {
  let calls = 0;
  return async (batch: readonly PushMessage[]): Promise<PushResult> => {
    calls += 1;
    if (calls === 2) throw new Error('the run stopped here');
    delivered.push(...batch.map((m) => m.to));
    return { sent: batch.length, failed: 0, deadTokens: [], tickets: [] };
  };
}

describe('sending a run of notifications', () => {
  it('loses at most the batch in hand when the run stops part-way', async () => {
    const delivered: string[] = [];

    await expect(
      deliverModule.deliver(admin.db, USERS.map(message), stopsOnSecondBatch(delivered), 2)
    ).rejects.toThrow('the run stopped here');

    expect(delivered).toEqual([token('u-1'), token('u-2')]);
    // Never claimed, so the next run can still send it.
    expect(await claimed('u-5')).toBe(false);
  });

  it('sends what was never claimed on the next run', async () => {
    await deliverModule.deliver(admin.db, USERS.map(message), stopsOnSecondBatch([]), 2).catch(() => undefined);

    const delivered: string[] = [];
    await deliverModule.deliver(
      admin.db,
      USERS.map(message),
      async (batch) => {
        delivered.push(...batch.map((m) => m.to));
        return { sent: batch.length, failed: 0, deadTokens: [], tickets: [] };
      },
      2
    );

    expect(delivered).toEqual([token('u-5')]);
  });
});

/**
 * Expo reports most dead phones only in a receipt, fetched a while after the
 * send with the ticket id it returned. Nothing kept those ids, so nothing could
 * ever ask. Each accepted ticket is now kept, with its token and every account
 * that token is on, until its receipt has been read.
 */
describe('remembering what Expo accepted', () => {
  it('records each ticket with its token and every account it belongs to', async () => {
    const { db } = admin;
    await db.recursiveDelete(db.collection('pushReceipts'));
    // u-2 has u-1's phone on record too: both once signed in on it.
    await db.doc(`users/u-2/pushTokens/${token('u-1')}`).set({ platform: 'ios' });
    const send = async (batch: readonly PushMessage[]): Promise<PushResult> => ({
      sent: batch.length,
      failed: 0,
      deadTokens: [],
      tickets: batch.map((m) => ({ id: `ticket-${m.to.slice(18, -1)}`, token: m.to })),
    });

    await deliverModule.deliver(db, [message('u-1'), message('u-2')], send);

    const receipt = (await db.doc('pushReceipts/ticket-u-1').get()).data();
    expect(receipt?.token).toBe(token('u-1'));
    expect([...(receipt?.uids ?? [])].sort()).toEqual(['u-1', 'u-2']);
    expect(receipt?.checkAfter).toBeDefined();
  });
});
