import React from 'react';
import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UNREADABLE_BACKUP_KEY, flushSnapshot, loadSnapshot, readSnapshot } from '../persistence';
import { StoreProvider, useStore } from '../store';

/**
 * Two ways the saved store could quietly disappear, and one way the last change
 * could. Each test here fails against the code before this change.
 */

const KEY = 'strength-coach/v1';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);
const mount = () => renderHook(() => useStore(), { wrapper });

const hydrated = async (result: { current: { hydrated: boolean } | null }) => {
  await waitFor(() => expect(result.current?.hydrated).toBe(true));
};

/** Lets pending promise chains (the mock storage is several awaits deep) settle. */
const ticks = async (n = 25) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};

describe('data this build cannot read', () => {
  it('keeps a copy of a corrupt payload before carrying on', async () => {
    await AsyncStorage.setItem(KEY, 'not json {{{');

    expect(await readSnapshot()).toEqual({ status: 'empty' });
    expect(await AsyncStorage.getItem(UNREADABLE_BACKUP_KEY)).toBe('not json {{{');
  });

  it('keeps a copy of data written by a newer version of the app', async () => {
    const future = JSON.stringify({ version: 99, clients: [], workouts: [] });
    await AsyncStorage.setItem(KEY, future);

    expect(await loadSnapshot()).toBeNull();
    expect(await AsyncStorage.getItem(UNREADABLE_BACKUP_KEY)).toBe(future);
  });

  it('carries on saving normally once the unreadable copy is safe', async () => {
    await AsyncStorage.setItem(KEY, 'not json {{{');
    const { result } = await mount();
    await hydrated(result);

    await act(() => {
      result.current.invite('Jordan Real', 'jordan@example.com', 'lb');
    });
    await flushSnapshot();

    expect((await loadSnapshot())?.clients).toHaveLength(1);
    expect(await AsyncStorage.getItem(UNREADABLE_BACKUP_KEY)).toBe('not json {{{');
  });

  // Android caps AsyncStorage, and a read can fail outright. The store used to
  // treat that as "nothing saved" and write its empty state over the file.
  it('never writes over storage it could not read', async () => {
    const storage = AsyncStorage as unknown as Record<string, unknown>;
    const originalGet = storage.getItem as (...args: unknown[]) => Promise<string | null>;
    const originalSet = storage.setItem as (...args: unknown[]) => Promise<void>;
    let writesToStore = 0;
    storage.getItem = async () => {
      throw new Error('CursorWindow: row too big');
    };
    storage.setItem = (...args: unknown[]) => {
      if (args[0] === KEY) writesToStore += 1;
      return originalSet.apply(AsyncStorage, args);
    };

    try {
      const { result } = await mount();
      await hydrated(result);
      await act(() => {
        result.current.invite('Jordan Real', 'jordan@example.com', 'lb');
      });
      await flushSnapshot();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });

      expect(writesToStore).toBe(0);
    } finally {
      storage.getItem = originalGet;
      storage.setItem = originalSet;
    }
  });
});

describe('going to the background', () => {
  // Saves are coalesced over 300ms, and iOS pauses timers the moment the app is
  // backgrounded — so a change made just before switching away could be lost
  // if the app was then closed.
  it('writes the latest change immediately rather than after the delay', async () => {
    const appState = AppState as unknown as Record<string, unknown>;
    const original = appState.addEventListener;
    let onChange: ((state: string) => void) | undefined;
    appState.addEventListener = (type: string, handler: (state: string) => void) => {
      if (type === 'change') onChange = handler;
      return { remove: () => {} };
    };

    try {
      const { result } = await mount();
      await hydrated(result);
      expect(onChange).toBeDefined();

      await act(() => {
        result.current.invite('Jordan Real', 'jordan@example.com', 'lb');
      });
      // Well inside the 300ms window: without the background write, nothing
      // would be on disk yet.
      await act(async () => {
        onChange?.('background');
        await ticks();
      });

      const raw = await AsyncStorage.getItem(KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw as string).clients).toHaveLength(1);
    } finally {
      appState.addEventListener = original;
    }
  });
});
