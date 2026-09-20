import { FieldValue } from 'firebase-admin/firestore';

/**
 * The session count and the coach's name, against the Firestore emulator
 * (`npm run test:rules`).
 *
 * The count was recounted outside a transaction, so two sessions finished
 * close together could leave it stuck one short; it could also be written back
 * onto a client who had left, turning their tombstone into a half-record. And
 * scheduled messages named the coach from their profile while every other
 * message — and the app — used their coach record, so the two could disagree.
 */

type Triggers = typeof import('../triggers');
type Load = typeof import('../load');
type Admin = typeof import('../admin');

let triggers: Triggers;
let load: Load;
let admin: Admin;

const COACH = 't-sam';

beforeAll(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-strength-coach';
  admin = require('../admin');
  triggers = require('../triggers');
  load = require('../load');
});

beforeEach(async () => {
  const { db } = admin;
  await db.recursiveDelete(db.doc(`trainers/${COACH}`));
  await db.recursiveDelete(db.doc(`users/${COACH}`));
});

const workout = (clientId: string, over: Record<string, unknown>) => ({
  clientId,
  name: 'Push Day A',
  date: '2026-09-10T17:00:00.000Z',
  exercises: [],
  loggedBy: 'trainer',
  ...over,
});

async function read(path: string) {
  const snapshot = await admin.db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}

describe('recounting a client’s sessions', () => {
  it('counts their finished sessions that have not been deleted', async () => {
    const { db } = admin;
    await db.doc(`trainers/${COACH}/clients/c-jordan`).set({ name: 'Jordan Lee', sessionsCompleted: 0 });
    await db.doc(`trainers/${COACH}/workouts/w-1`).set(workout('c-jordan', { status: 'completed' }));
    await db.doc(`trainers/${COACH}/workouts/w-2`).set(workout('c-jordan', { status: 'completed' }));
    await db.doc(`trainers/${COACH}/workouts/w-3`).set(workout('c-jordan', { status: 'completed', deleted: true }));
    await db.doc(`trainers/${COACH}/workouts/w-4`).set(workout('c-jordan', { status: 'scheduled' }));

    await triggers.recountSessions(COACH, 'c-jordan');

    expect((await read(`trainers/${COACH}/clients/c-jordan`))?.sessionsCompleted).toBe(2);
  });

  it('never writes a count onto a client who has left', async () => {
    const { db } = admin;
    const tombstone = { deleted: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'server' };
    await db.doc(`trainers/${COACH}/clients/c-gone`).set(tombstone);
    await db.doc(`trainers/${COACH}/workouts/w-5`).set(workout('c-gone', { status: 'completed' }));

    await triggers.recountSessions(COACH, 'c-gone');

    expect(Object.keys((await read(`trainers/${COACH}/clients/c-gone`)) ?? {}).sort()).toEqual([
      'deleted',
      'updatedAt',
      'updatedBy',
    ]);
  });
});

/**
 * A coach who used the app before accounts signs in and their roster goes up.
 * Both invite fields are server-owned, so the upload strips them and the echo
 * carries neither — the app then read undefined for both, which took the
 * client's page down on formatInviteCode and left them reading PENDING.
 */
describe('a client adopted from a phone that had them before accounts', () => {
  it('is given a code, and is not counted as having joined', async () => {
    const { db } = admin;
    await db.doc(`trainers/${COACH}/clients/c-adopted`).set({ name: 'Jordan Lee', inviteAccepted: true });

    await triggers.backfillInvite(COACH, 'c-adopted');

    const client = await read(`trainers/${COACH}/clients/c-adopted`);
    expect(typeof client?.inviteCode).toBe('string');
    expect(client?.inviteCode).not.toBe('');
    expect(client?.inviteAccepted).toBe(false);
    expect(await read(`inviteCodes/${client?.inviteCode}`)).toMatchObject({
      trainerId: COACH,
      clientId: 'c-adopted',
    });
  });

  it('keeps having joined when an account really is linked', async () => {
    const { db } = admin;
    await db
      .doc(`trainers/${COACH}/clients/c-joined`)
      .set({ name: 'Jordan Lee', inviteAccepted: true, uid: 'u-jordan' });

    await triggers.backfillInvite(COACH, 'c-joined');

    expect((await read(`trainers/${COACH}/clients/c-joined`))?.inviteAccepted).toBe(true);
  });

  it('leaves a client who already has a code alone', async () => {
    const { db } = admin;
    await db.doc(`trainers/${COACH}/clients/c-coded`).set({ name: 'Jordan Lee', inviteCode: 'MW7K2Q' });

    await triggers.backfillInvite(COACH, 'c-coded');

    expect((await read(`trainers/${COACH}/clients/c-coded`))?.inviteCode).toBe('MW7K2Q');
  });
});

describe('the coach’s name in scheduled messages', () => {
  it('comes from their coach record, as everywhere else', async () => {
    const { db } = admin;
    // A fixed-offset zone where it is 7 AM right now: a send hour.
    const offset = (((7 - new Date().getUTCHours()) % 24) + 24) % 24;
    const signed = offset > 14 ? offset - 24 : offset;
    const zone = signed >= 0 ? `Etc/GMT-${signed}` : `Etc/GMT+${-signed}`;
    await db.doc(`users/${COACH}`).set({ role: 'trainer', displayName: 'Old Name', timezone: zone });
    await db.doc(`trainers/${COACH}`).set({ name: 'Sam Coach' });

    const due = await load.loadDueTrainers(new Date());

    expect(due.find((context) => context.account.uid === COACH)?.name).toBe('Sam Coach');
  });
});
