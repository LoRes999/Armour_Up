import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Client, CustomMovement, DayType, Role, Subscription, Workout } from './models';
import type { Appearance } from './store';
import type { Outbox, Watermarks } from './sync/types';
import { notify } from './confirm';

/**
 * The whole store, written to disk as one JSON document.
 *
 * Everything used to live in useState and nothing survived a relaunch — a coach
 * who spent an evening programming a week lost it by closing the app. One
 * document rather than a row per entity because the data is small (a roster and
 * its sessions), it is always read and written whole, and a single key cannot
 * half-succeed and leave the roster disagreeing with the workouts.
 *
 * Writes are coalesced rather than immediate: logging a set is one state change
 * per tap, and a set of eight is eight writes we do not need to make.
 */

const KEY = 'strength-coach/v1';

/**
 * Where a payload this build cannot understand is copied before anything can
 * overwrite it — a corrupt write, or data from a newer version of the app.
 */
export const UNREADABLE_BACKUP_KEY = `${KEY}:unreadable`;

/**
 * Bump this when the shape changes in a way older data cannot satisfy, and add
 * a migration. An unrecognised version is set aside rather than reinterpreted —
 * guessing at somebody's training history is worse than starting empty.
 */
export const SNAPSHOT_VERSION = 2;

/** How long a burst of changes is allowed to coalesce before it is written. */
const WRITE_DELAY_MS = 300;

export interface Snapshot {
  version: number;
  clients: Client[];
  workouts: Workout[];
  dayTypes: DayType[];
  customMovements: CustomMovement[];
  role: Role | null;
  signedInClientId: string | null;
  appearance: Appearance;
  subscription: Subscription | null;
  /** Added in version 2. */
  sync: SyncSnapshot;
}

/**
 * Cloud sync's own state, saved in the same write as the data it describes.
 * A queue saved separately could be a change ahead of or behind the data after
 * a crash — uploading an edit the store no longer shows, or never uploading
 * one it does.
 */
export interface SyncSnapshot {
  /** Changes not yet confirmed by the server, oldest first. */
  outbox: Outbox;
  /**
   * How far along each collection is, so a launch asks each only for what it
   * has not seen. This replaced a single number for all four; an install
   * saved by an older build has none, upgradeSnapshot leaves it empty, and
   * that one full re-read is the point — it is what heals a phone the old
   * shared watermark had already skipped data on.
   */
  watermarks: Watermarks;
  /** The account this data belongs to. Null for data from before accounts existed. */
  ownerUid: string | null;
  /**
   * Which of that account's roles and coaches it belongs to. The account
   * alone was not enough: somebody removed by one coach keeps their sign-in
   * and can join another, and the first coach's data and watermarks carried
   * over. Absent in data saved before this existed, which is read as the
   * account's current scope once and then written down.
   */
  ownerScope?: string;
}

export const EMPTY_SYNC: SyncSnapshot = { outbox: [], watermarks: {}, ownerUid: null };

/**
 * What reading the saved store found.
 *
 * "Nothing saved" and "could not read it" used to be the same answer (null),
 * and the store then saved its empty state straight over the file. If storage
 * was ever unreadable — Android caps it at 6 MB — a relaunch quietly erased
 * everything. Those two now mean different things.
 */
export type ReadResult =
  | { status: 'ok'; snapshot: Snapshot }
  /** Nothing usable is saved; a readable payload that wasn't understood has been backed up. */
  | { status: 'empty' }
  /** Storage itself failed. Nothing may be written over it for the rest of this launch. */
  | { status: 'unreadable' };

function isSync(value: unknown): value is SyncSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SyncSnapshot>;
  return Array.isArray(candidate.outbox);
}

/**
 * Brings a saved payload up to the current version, or returns null when it
 * is not one this build understands.
 *
 * The check is structural, not deep. The point is to reject a payload that
 * would crash a screen — a missing array read as `.map` — not to re-validate
 * every field the type system already covers on the way in.
 */
export function upgradeSnapshot(value: unknown): Snapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<Snapshot>;
  const hasData =
    Array.isArray(candidate.clients) &&
    Array.isArray(candidate.workouts) &&
    Array.isArray(candidate.dayTypes) &&
    Array.isArray(candidate.customMovements);
  if (!hasData) return null;

  // Version 1 is everything saved before cloud sync existed: the same data,
  // no queue, and no account it belongs to yet.
  if (candidate.version === 1) {
    return { ...(candidate as Snapshot), version: SNAPSHOT_VERSION, sync: EMPTY_SYNC };
  }
  if (candidate.version === SNAPSHOT_VERSION && isSync(candidate.sync)) {
    return {
      ...(candidate as Snapshot),
      sync: { ...EMPTY_SYNC, ...candidate.sync },
    };
  }
  return null;
}

/**
 * Reads the saved store. Never throws: this runs before the first paint, so
 * anything that escapes here is a white screen with no way out of it.
 */
export async function readSnapshot(): Promise<ReadResult> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return { status: 'unreadable' };
  }
  if (!raw) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const snapshot = upgradeSnapshot(parsed);
  if (snapshot) return { status: 'ok', snapshot };

  // Readable, but not something this build understands. Keep a copy before the
  // app carries on as a fresh install and its first save replaces the original.
  try {
    await AsyncStorage.setItem(UNREADABLE_BACKUP_KEY, raw);
  } catch {
    // Could not keep a copy, so the original must not be overwritten either.
    return { status: 'unreadable' };
  }
  return { status: 'empty' };
}

/** The saved store, or null when there is nothing usable. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  const result = await readSnapshot();
  return result.status === 'ok' ? result.snapshot : null;
}

let pending: Snapshot | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// One notice a session: every change after a failed save fails the same way.
let warnedUnsaved = false;

async function write(snapshot: Snapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Out of space, or storage unavailable. Losing the write is better than
    // crashing, but it used to be lost without a word, and so was every save
    // after it: in a browser, a few photos were enough to fill the storage.
    if (warnedUnsaved) return;
    warnedUnsaved = true;
    notify({
      title: "Your changes aren't being saved",
      message:
        "There's no storage space left for the app. Free some up (removing movement photos helps) and your next change will save.",
    });
  }
}

/**
 * Queues a write. Repeated calls inside the window collapse into one, and the
 * most recent snapshot is the one that lands.
 */
export function saveSnapshot(snapshot: Snapshot): void {
  pending = snapshot;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const next = pending;
    pending = null;
    if (next) void write(next);
  }, WRITE_DELAY_MS);
}

/** Writes any queued snapshot immediately. Used by tests, deletion, and backgrounding. */
export async function flushSnapshot(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const next = pending;
  pending = null;
  if (next) await write(next);
}

/**
 * Removes the saved store outright. Account deletion has to leave nothing
 * behind, and waiting for a debounced write of the emptied state would be a
 * promise we cannot keep if the app is killed in between.
 */
export async function clearSnapshot(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  try {
    await AsyncStorage.removeItem(KEY);
    await AsyncStorage.removeItem(UNREADABLE_BACKUP_KEY);
  } catch {
    // Same reasoning as write(): nothing useful to do, and nothing to show.
  }
}
