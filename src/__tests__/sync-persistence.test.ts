import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_SYNC, SNAPSHOT_VERSION, readSnapshot, upgradeSnapshot } from '../persistence';
import { enqueue } from '../sync/outbox';

/**
 * Version 2 adds cloud sync's queue to the saved store. Everybody who used the
 * app before accounts existed has a version 1 file, and none of it may be lost
 * on the way up.
 */

const KEY = 'strength-coach/v1';

const version1 = {
  version: 1,
  clients: [
    {
      id: 'client-real',
      name: 'Jordan Real',
      email: 'jordan@example.com',
      unit: 'kg',
      blockName: 'Onboarding',
      blockWeek: 1,
      blockLength: 4,
      adherence: 100,
      sessionsCompleted: 2,
      inviteCode: 'ABCDEF',
      inviteAccepted: true,
    },
  ],
  workouts: [],
  dayTypes: [{ id: 'day-push', name: 'Push Day', shortLabel: 'PUSH', colorIndex: 0 }],
  customMovements: [],
  role: 'trainer',
  signedInClientId: null,
  appearance: 'dark',
  subscription: { status: 'active', plan: 'annual', renewsAt: '2027-09-11T00:00:00.000Z' },
};

describe('saved data from before cloud sync', () => {
  it('opens with everything intact, an empty queue and no owner yet', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(version1));
    const result = await readSnapshot();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const { version, sync, ...data } = result.snapshot;
    const { version: _old, ...original } = version1;
    expect(version).toBe(SNAPSHOT_VERSION);
    expect(data).toEqual(original);
    expect(sync).toEqual(EMPTY_SYNC);
  });
});

describe('version 2', () => {
  const queue = () =>
    enqueue([], [
      { collection: 'workouts', id: 'w-1', op: 'upsert', fields: { dayTypeId: null, name: 'A' }, rev: 0 },
      { collection: 'clients', id: 'c-1', op: 'delete', fields: {}, rev: 0 },
    ]);

  it('reads back its queue exactly, removals included', () => {
    const outbox = queue();
    const saved = {
      ...version1,
      version: 2,
      sync: { outbox, watermarks: { workouts: 1757613600000 }, ownerUid: 'u-coach' },
    };
    const upgraded = upgradeSnapshot(JSON.parse(JSON.stringify(saved)));
    expect(upgraded?.sync).toEqual(saved.sync);
  });

  /**
   * Saved by a build that kept one watermark for all four collections. That
   * number is not worth carrying over — it is the very thing that could have
   * skipped data — so the phone starts each collection from nothing and reads
   * everything once. The queue still has to survive: it is the changes this
   * phone has made and not yet sent.
   */
  it('starts the watermarks fresh for a file saved before they were split up', () => {
    const outbox = queue();
    const saved = {
      ...version1,
      version: 2,
      sync: { outbox, lastSyncedAt: 1757613600000, ownerUid: 'u-coach' },
    };
    const upgraded = upgradeSnapshot(JSON.parse(JSON.stringify(saved)));
    expect(upgraded?.sync.watermarks).toEqual({});
    expect(upgraded?.sync.outbox).toEqual(outbox);
    expect(upgraded?.sync.ownerUid).toBe('u-coach');
  });

  it('rejects a version 2 file without a queue rather than guessing', () => {
    expect(upgradeSnapshot({ ...version1, version: 2 })).toBeNull();
  });
});
