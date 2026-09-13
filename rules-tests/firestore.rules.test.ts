import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type RulesTestEnvironment,
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  type Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firestoreAdapter } from '../src/sync/firestore';
import type { SyncScope } from '../src/sync/types';

/**
 * firestore.rules, exercised against the real rules engine in the emulator.
 * The table in the plan, one row at a time: who may read and write what.
 */

let env: RulesTestEnvironment;

const COACH = 'u-coach';
const OTHER_COACH = 'u-other-coach';
const MARCUS = 'u-marcus';

const coach = () => env.authenticatedContext(COACH, { role: 'trainer' }).firestore() as unknown as Firestore;
const otherCoach = () =>
  env.authenticatedContext(OTHER_COACH, { role: 'trainer' }).firestore() as unknown as Firestore;
const marcus = () =>
  env
    .authenticatedContext(MARCUS, { role: 'client', trainerId: COACH, clientId: 'c-marcus' })
    .firestore() as unknown as Firestore;
const nobody = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

/** Every app write carries the server time and its author. */
const stamp = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid });

const clientDoc = {
  name: 'Marcus Webb',
  email: 'marcus@example.com',
  unit: 'kg',
  blockName: 'Hypertrophy',
  blockWeek: 4,
  blockLength: 6,
  adherence: 92,
  sessionsCompleted: 38,
  inviteCode: 'MW7K2Q',
  inviteAccepted: true,
  uid: MARCUS,
  deleted: false,
};

const trainerWorkout = {
  clientId: 'c-marcus',
  name: 'Push Day A',
  date: '2026-09-11T22:00:00.000Z',
  exercises: [],
  coachNote: '',
  status: 'scheduled',
  loggedBy: 'trainer',
  deleted: false,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-strength-coach',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore;
    await setDoc(doc(db, 'users', COACH), { role: 'trainer', displayName: 'Ryan Armour', timezone: 'UTC' });
    await setDoc(doc(db, 'users', MARCUS), { role: 'client', trainerId: COACH, clientId: 'c-marcus' });
    await setDoc(doc(db, 'trainers', COACH), { name: 'Ryan Armour' });
    await setDoc(doc(db, `trainers/${COACH}/clients/c-marcus`), clientDoc);
    await setDoc(doc(db, `trainers/${COACH}/clients/c-priya`), { ...clientDoc, name: 'Priya Nair', uid: 'u-priya' });
    await setDoc(doc(db, `trainers/${COACH}/workouts/w-coach`), trainerWorkout);
    await setDoc(doc(db, `trainers/${COACH}/workouts/w-priya`), { ...trainerWorkout, clientId: 'c-priya' });
    await setDoc(doc(db, `trainers/${COACH}/workouts/w-solo`), { ...trainerWorkout, loggedBy: 'client' });
    await setDoc(doc(db, `trainers/${COACH}/dayTypes/day-push`), { name: 'Push Day', shortLabel: 'PUSH', colorIndex: 0 });
    await setDoc(doc(db, 'inviteCodes/MW7K2Q'), { trainerId: COACH, clientId: 'c-marcus' });
    await setDoc(doc(db, 'notificationLog/u-marcus_reminder:2026-09-11'), { uid: MARCUS });
  });
});

describe('a coach', () => {
  it('reads and writes their own roster', async () => {
    const db = coach();
    await assertSucceeds(getDocs(collection(db, `trainers/${COACH}/clients`)));
    await assertSucceeds(
      setDoc(doc(db, `trainers/${COACH}/clients/c-new`), { name: 'Dana Cole', unit: 'lb', ...stamp(COACH) })
    );
    await assertSucceeds(
      setDoc(doc(db, `trainers/${COACH}/workouts/w-coach`), { name: 'Push Day B', ...stamp(COACH) }, { merge: true })
    );
  });

  it("cannot see another coach's roster", async () => {
    await assertFails(getDocs(collection(otherCoach(), `trainers/${COACH}/clients`)));
    await assertFails(getDoc(doc(otherCoach(), `trainers/${COACH}/workouts/w-coach`)));
  });

  it('cannot set the fields the server keeps', async () => {
    const ref = doc(coach(), `trainers/${COACH}/clients/c-marcus`);
    for (const field of ['sessionsCompleted', 'inviteCode', 'inviteAccepted', 'uid']) {
      await assertFails(setDoc(ref, { [field]: 'forged', ...stamp(COACH) }, { merge: true }));
    }
    await assertFails(
      setDoc(doc(coach(), `trainers/${COACH}/clients/c-forged`), { name: 'X', inviteCode: 'AAAAAA', ...stamp(COACH) })
    );
  });

  it('must stamp every write with the server time and themselves', async () => {
    const ref = doc(coach(), `trainers/${COACH}/workouts/w-coach`);
    await assertFails(setDoc(ref, { name: 'Unstamped' }, { merge: true }));
    await assertFails(setDoc(ref, { name: 'Wrong author', ...stamp('someone-else') }, { merge: true }));
  });
});

describe('a client', () => {
  it('reads their own record, not anybody else’s', async () => {
    await assertSucceeds(getDoc(doc(marcus(), `trainers/${COACH}/clients/c-marcus`)));
    await assertFails(getDoc(doc(marcus(), `trainers/${COACH}/clients/c-priya`)));
    await assertFails(getDocs(collection(marcus(), `trainers/${COACH}/clients`)));
  });

  it('reads their own workouts only, and must ask for them by name', async () => {
    const workouts = collection(marcus(), `trainers/${COACH}/workouts`);
    await assertSucceeds(getDocs(query(workouts, where('clientId', '==', 'c-marcus'))));
    await assertFails(getDocs(workouts));
    await assertFails(getDoc(doc(marcus(), `trainers/${COACH}/workouts/w-priya`)));
  });

  it("reads their coach's day types", async () => {
    await assertSucceeds(getDocs(collection(marcus(), `trainers/${COACH}/dayTypes`)));
    await assertFails(
      setDoc(doc(marcus(), `trainers/${COACH}/dayTypes/day-x`), { name: 'Arms', ...stamp(MARCUS) })
    );
  });

  it('changes their own unit and nothing else on their record', async () => {
    const ref = doc(marcus(), `trainers/${COACH}/clients/c-marcus`);
    await assertSucceeds(setDoc(ref, { unit: 'lb', deleted: false, ...stamp(MARCUS) }, { merge: true }));
    await assertFails(setDoc(ref, { name: 'Marcus W', ...stamp(MARCUS) }, { merge: true }));
    await assertFails(setDoc(ref, { sessionsCompleted: 999, ...stamp(MARCUS) }, { merge: true }));
    await assertFails(setDoc(ref, { deleted: true, ...stamp(MARCUS) }, { merge: true }));
  });

  it("only marks a session from their coach as seen", async () => {
    const ref = doc(marcus(), `trainers/${COACH}/workouts/w-coach`);
    await assertSucceeds(
      setDoc(ref, { seenByClientAt: '2026-09-11T08:00:00.000Z', deleted: false, ...stamp(MARCUS) }, { merge: true })
    );
    await assertFails(setDoc(ref, { exercises: [{ id: 'x' }], ...stamp(MARCUS) }, { merge: true }));
    await assertFails(setDoc(ref, { deleted: true, ...stamp(MARCUS) }, { merge: true }));
  });

  it('owns their solo sessions, and only their own', async () => {
    const solo = doc(marcus(), `trainers/${COACH}/workouts/w-solo`);
    await assertSucceeds(setDoc(solo, { exercises: [{ id: 'x' }], ...stamp(MARCUS) }, { merge: true }));
    await assertSucceeds(setDoc(solo, { deleted: true, ...stamp(MARCUS) }, { merge: true }));

    const create = (id: string, over: Record<string, unknown>) =>
      setDoc(doc(marcus(), `trainers/${COACH}/workouts/${id}`), { ...trainerWorkout, ...over, ...stamp(MARCUS) });
    await assertSucceeds(create('w-new-solo', { loggedBy: 'client' }));
    await assertFails(create('w-for-priya', { loggedBy: 'client', clientId: 'c-priya' }));
    await assertFails(create('w-fake-coach', { loggedBy: 'trainer' }));
  });

  it('cannot hard-delete anything', async () => {
    await assertFails(deleteDoc(doc(marcus(), `trainers/${COACH}/workouts/w-solo`)));
  });
});

describe('accounts', () => {
  it('can change their own preferences but never their role', async () => {
    const ref = doc(marcus(), 'users', MARCUS);
    await assertSucceeds(updateDoc(ref, { timezone: 'America/New_York', notificationPrefs: { recap: false } }));
    await assertFails(updateDoc(ref, { role: 'trainer' }));
    await assertFails(updateDoc(ref, { trainerId: OTHER_COACH }));
    await assertFails(getDoc(doc(marcus(), 'users', COACH)));
  });

  it('keep a push token per phone, their own only', async () => {
    await assertSucceeds(
      setDoc(doc(marcus(), `users/${MARCUS}/pushTokens/ExponentPushToken[abc]`), {
        platform: 'ios',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(marcus(), `users/${COACH}/pushTokens/ExponentPushToken[abc]`), {
        platform: 'ios',
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      setDoc(doc(marcus(), `users/${MARCUS}/pushTokens/ExponentPushToken[def]`), { platform: 'fax' })
    );
  });
});

/** A document as the server holds it, read past the rules. */
async function serverCopy(path: string) {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (context) => {
    data = (await getDoc(doc(context.firestore() as unknown as Firestore, path))).data();
  });
  return data;
}

describe('the sync adapter', () => {
  const coachScope: SyncScope = { role: 'trainer', uid: COACH, trainerId: COACH };
  const marcusScope: SyncScope = { role: 'client', uid: MARCUS, trainerId: COACH, clientId: 'c-marcus' };

  it('never brings back a document deleted on another phone', async () => {
    const adapter = firestoreAdapter(coach());
    await adapter.write(coachScope, [{ collection: 'workouts', id: 'w-coach', op: 'delete', fields: {}, rev: 0 }]);

    // The coach's tablet was offline when that happened, and uploads its edit now.
    await adapter.write(coachScope, [
      { collection: 'workouts', id: 'w-coach', op: 'upsert', fields: { name: 'Push Day B' }, rev: 0 },
    ]);

    expect((await serverCopy(`trainers/${COACH}/workouts/w-coach`))?.deleted).toBe(true);
  });

  it("lets a client's solo session stay deleted too", async () => {
    const adapter = firestoreAdapter(marcus());
    await adapter.write(marcusScope, [{ collection: 'workouts', id: 'w-solo', op: 'delete', fields: {}, rev: 0 }]);
    await adapter.write(marcusScope, [
      { collection: 'workouts', id: 'w-solo', op: 'upsert', fields: { name: 'Solo again' }, rev: 0 },
    ]);

    expect((await serverCopy(`trainers/${COACH}/workouts/w-solo`))?.deleted).toBe(true);
  });

  it('creates new documents that read as live', async () => {
    const { deleted: _stored, ...fields } = trainerWorkout;
    await firestoreAdapter(coach()).write(coachScope, [
      { collection: 'workouts', id: 'w-created', op: 'upsert', fields: { ...fields, name: 'Brand new' }, rev: 0 },
    ]);

    const created = await serverCopy(`trainers/${COACH}/workouts/w-created`);
    expect(created?.name).toBe('Brand new');
    expect(created?.deleted).not.toBe(true);
  });
});

describe('server-only data', () => {
  it('keeps invite codes and the notification log from every app', async () => {
    for (const db of [coach(), marcus(), nobody()]) {
      await assertFails(getDoc(doc(db, 'inviteCodes/MW7K2Q')));
      await assertFails(getDoc(doc(db, 'notificationLog/u-marcus_reminder:2026-09-11')));
    }
  });

  it('shows nothing to somebody who is not signed in', async () => {
    await assertFails(getDoc(doc(nobody(), `trainers/${COACH}`)));
    await assertFails(getDoc(doc(nobody(), `trainers/${COACH}/clients/c-marcus`)));
  });
});
