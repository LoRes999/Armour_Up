import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_SYNC,
  SNAPSHOT_VERSION,
  Snapshot,
  clearSnapshot,
  flushSnapshot,
  loadSnapshot,
  saveSnapshot,
} from '../persistence';
import { StoreProvider, useStore } from '../store';
import { SEED_DAY_TYPES } from '../sampleData';

const KEY = 'strength-coach/v1';

/**
 * Three things about @testing-library/react-native v14 that this file learned
 * the hard way, because each one fails as a wrong answer rather than an error:
 *
 *  - `renderHook`, `act` and `unmount` are all async. An unawaited `unmount`
 *    leaves the old root tearing down while the next one mounts, and the new
 *    provider comes up without its effects having run.
 *  - `waitFor` must be given a *synchronous* callback. An async one escapes the
 *    retry loop as an unhandled rejection and poisons every later test.
 *  - One `await Promise.resolve()` is not enough to settle hydration: reading a
 *    populated store is several awaits deep, so wait on the flag itself.
 */
const hydrated = async (result: { current: { hydrated: boolean } | null }) => {
  await waitFor(() => expect(result.current?.hydrated).toBe(true));
};

/** Real time, for the write-coalescing window. */
const wait = async (ms: number) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: SNAPSHOT_VERSION,
  clients: [],
  workouts: [],
  dayTypes: SEED_DAY_TYPES,
  customMovements: [],
  role: null,
  signedInClientId: null,
  appearance: 'system',
  subscription: null,
  sync: EMPTY_SYNC,
  ...over,
});

describe('the snapshot layer', () => {
  it('reads back what it wrote', async () => {
    const written = snapshot({ role: 'trainer', appearance: 'dark' });
    saveSnapshot(written);
    await flushSnapshot();

    expect(await loadSnapshot()).toEqual(written);
  });

  it('has nothing to load on a fresh install', async () => {
    expect(await loadSnapshot()).toBeNull();
  });

  // This runs before the first paint, so anything that escapes it is a white
  // screen with no way out. A bad payload has to look like a fresh install.
  it('degrades to a fresh install rather than throwing', async () => {
    await AsyncStorage.setItem(KEY, 'not json at all {{{');
    expect(await loadSnapshot()).toBeNull();
  });

  it('discards a payload from a future version instead of reinterpreting it', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...snapshot(), version: 99 }));
    expect(await loadSnapshot()).toBeNull();
  });

  it('rejects a payload missing the collections the screens map over', async () => {
    const withoutWorkouts: Record<string, unknown> = { ...snapshot() };
    delete withoutWorkouts.workouts;
    await AsyncStorage.setItem(KEY, JSON.stringify(withoutWorkouts));
    expect(await loadSnapshot()).toBeNull();
  });

  // Logging a set is one state change per tap. A set of eight should not be
  // eight writes.
  //
  // Counted by swapping the method rather than with jest.spyOn: the mock's
  // methods are already jest.fn()s, and restoring a spy over one of those does
  // not put things back cleanly — the next test in the file then sees writes
  // that never land.
  it('coalesces a burst of changes into a single write', async () => {
    const storage = AsyncStorage as unknown as Record<string, unknown>;
    const original = storage.setItem as (...args: unknown[]) => Promise<void>;
    let writes = 0;
    storage.setItem = (...args: unknown[]) => {
      writes += 1;
      return original.apply(AsyncStorage, args);
    };

    try {
      saveSnapshot(snapshot({ appearance: 'light' }));
      saveSnapshot(snapshot({ appearance: 'dark' }));
      saveSnapshot(snapshot({ appearance: 'system' }));
      await flushSnapshot();

      expect(writes).toBe(1);
      // The last one in is the one that lands.
      expect((await loadSnapshot())?.appearance).toBe('system');
    } finally {
      storage.setItem = original;
    }
  });

  it('writes on its own without being flushed', async () => {
    saveSnapshot(snapshot({ role: 'client' }));
    await wait(500);
    expect((await loadSnapshot())?.role).toBe('client');
  });

  it('removes the saved store outright', async () => {
    saveSnapshot(snapshot({ role: 'trainer' }));
    await flushSnapshot();
    await clearSnapshot();

    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(await loadSnapshot()).toBeNull();
  });

  it('drops a queued write when the store is cleared before it lands', async () => {
    saveSnapshot(snapshot({ role: 'trainer' }));
    await clearSnapshot();
    await flushSnapshot();

    expect(await loadSnapshot()).toBeNull();
  });
});

// MARK: - The whole point
//
// Everything above is machinery. This is the behaviour it exists for: a coach
// who spends an evening programming a week does not lose it by closing the app.

describe('the store across a relaunch', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <StoreProvider>{children}</StoreProvider>
  );
  const mount = () => renderHook(() => useStore(), { wrapper });

  it('comes back with the roster, the sessions and who was signed in', async () => {
    const first = await mount();
    await hydrated(first.result);

    let code = '';
    await act(() => {
      code = first.result.current.loadSampleData();
    });
    await act(() => {
      first.result.current.redeemInviteCode(code);
    });

    const roster = first.result.current.clients.length;
    const sessions = first.result.current.workouts.length;
    const signedInAs = first.result.current.signedInClientId;
    expect(roster).toBeGreaterThan(0);

    await flushSnapshot();
    await first.unmount();

    // A cold start: a brand new provider, reading only what is on disk.
    const second = await mount();
    await hydrated(second.result);

    expect(second.result.current.clients).toHaveLength(roster);
    expect(second.result.current.workouts).toHaveLength(sessions);
    expect(second.result.current.signedInClientId).toBe(signedInAs);
    expect(second.result.current.role).toBe('client');
    expect(second.result.current.canUseClientApp()).toBe(true);
  });

  it('keeps a logged set', async () => {
    const first = await mount();
    await hydrated(first.result);

    let clientId = '';
    let workoutId = '';
    await act(() => {
      clientId = first.result.current.invite('Marcus Webb', 'marcus@example.com', 'lb').id;
    });
    await act(() => {
      workoutId = first.result.current.createWorkout(clientId);
    });
    await act(() => {
      first.result.current.addExercise(workoutId, 'Bench Press');
    });
    await act(() => {
      first.result.current.logSet(workoutId, 0, 0, 82.5, 5);
    });

    await flushSnapshot();
    await first.unmount();

    const second = await mount();
    await hydrated(second.result);

    const set = second.result.current.workout(workoutId)?.exercises[0].sets[0];
    expect(set?.loggedWeight).toBe(82.5);
    expect(set?.loggedReps).toBe(5);
    expect(second.result.current.workout(workoutId)?.status).toBe('inProgress');
  });

  it('starts empty when there is nothing saved', async () => {
    const { result } = await mount();
    await hydrated(result);

    expect(result.current.clients).toEqual([]);
    expect(result.current.workouts).toEqual([]);
    expect(result.current.role).toBeNull();
    // Day types are a starter split, so an empty install still has them.
    expect(result.current.dayTypes.length).toBeGreaterThan(0);
  });

  /**
   * The trap the hydrated flag exists for: the save effect fires on the initial
   * empty state and erases the saved store before the read has resolved.
   *
   * This has to hold the read open to catch it. Left to run at normal speed the
   * bug hides behind the write-coalescing window — the empty write is replaced
   * by the hydrated one long before it lands, and the test passes with the
   * guard deleted. Kill the app inside that window on a real device, though,
   * and the file on disk is empty.
   */
  it('does not erase the saved store while it is still reading it', async () => {
    saveSnapshot(snapshot({ role: 'trainer', appearance: 'dark' }));
    await flushSnapshot();

    const storage = AsyncStorage as unknown as Record<string, unknown>;
    const read = storage.getItem as (key: string) => Promise<string | null>;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.getItem = async (key: string) => {
      await held;
      return read.call(AsyncStorage, key);
    };

    try {
      const { result } = await mount();
      // Mounted, empty, and still reading.
      expect(result.current.hydrated).toBe(false);
      expect(result.current.clients).toEqual([]);

      // Anything the save effect queued lands now, mid-read.
      await flushSnapshot();

      const onDisk = await read.call(AsyncStorage, KEY);
      expect(onDisk).not.toBeNull();
      expect(JSON.parse(onDisk as string).role).toBe('trainer');

      release();
      storage.getItem = read;
      await hydrated(result);
      expect(result.current.role).toBe('trainer');
      expect(result.current.appearance).toBe('dark');
    } finally {
      release();
      storage.getItem = read;
    }
  });

  it('leaves nothing behind when an account is deleted', async () => {
    const first = await mount();
    await hydrated(first.result);

    await act(() => {
      first.result.current.loadSampleData();
    });
    await act(() => {
      first.result.current.signInAsTrainer();
    });
    await flushSnapshot();
    expect(await loadSnapshot()).not.toBeNull();

    await act(() => {
      first.result.current.deleteAccount();
    });
    await wait(50);
    expect(await loadSnapshot()).toBeNull();

    await first.unmount();

    const second = await mount();
    await hydrated(second.result);
    expect(second.result.current.clients).toEqual([]);
    expect(second.result.current.role).toBeNull();
  });
});
