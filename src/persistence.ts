import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Client, CustomMovement, DayType, Role, Subscription, Workout } from './models';
import type { Appearance } from './store';

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
export const SNAPSHOT_VERSION = 1;

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
}

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

/**
 * Structural check, not a deep one. The point is to reject a payload that would
 * crash a screen — a missing array read as `.map` — not to re-validate every
 * field the type system already covers on the way in.
 */
function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Snapshot>;
  if (candidate.version !== SNAPSHOT_VERSION) return false;
  return (
    Array.isArray(candidate.clients) &&
    Array.isArray(candidate.workouts) &&
    Array.isArray(candidate.dayTypes) &&
    Array.isArray(candidate.customMovements)
  );
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
  if (isSnapshot(parsed)) return { status: 'ok', snapshot: parsed };

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

async function write(snapshot: Snapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Out of space, or storage unavailable. There is nowhere useful to report
    // this from — it fires on a background write, not on anything the user
    // just did — and losing the write is better than crashing on top of them.
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
