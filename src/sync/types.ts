import type { Client, CustomMovement, DayType, Workout } from '../models';

/**
 * The vocabulary of cloud sync.
 *
 * Nothing in src/sync imports Firebase except the adapter. The engine, the
 * comparison and the queue are plain functions over the store's own data, so
 * they run — and are tested — without a network, an emulator or a device.
 */

/** A Firestore collection under trainers/{trainerId}. */
export type CollectionName = 'clients' | 'dayTypes' | 'movements' | 'workouts';

/**
 * Upload order. A workout names its client and its day type, so those go up
 * first: a client's phone never receives a workout for a client record the
 * server does not have yet.
 */
export const COLLECTIONS: readonly CollectionName[] = ['clients', 'dayTypes', 'movements', 'workouts'];

/** The part of the store that lives in the cloud. */
export interface SyncedData {
  clients: Client[];
  workouts: Workout[];
  dayTypes: DayType[];
  customMovements: CustomMovement[];
}

export type Fields = Record<string, unknown>;

/**
 * A field set to this is removed from the cloud document. `undefined` cannot
 * survive the trip through JSON into the saved queue; null can, and no field
 * in the models is ever legitimately null.
 */
export const REMOVE = null;

export interface OutboxEntry {
  collection: CollectionName;
  id: string;
  /** A delete is soft in the cloud: the document is kept, marked deleted. */
  op: 'upsert' | 'delete';
  /** The changed top-level fields of an upsert. Empty for a delete. */
  fields: Fields;
  /**
   * Bumped whenever the entry absorbs a newer change. An upload that was
   * already in flight when the change arrived must not be acknowledged away,
   * or the newer change would never be sent.
   */
  rev: number;
  /**
   * A document the server has never seen, queued in full. Deleted again before
   * it is sent, it leaves nothing to upload: a delete of it would reach the
   * server as a bare tombstone, which the rules refuse.
   */
  created?: boolean;
  /** Handed to the server at least once, so its creation may already be there. */
  sent?: boolean;
}

/** Waiting changes, oldest first, at most one entry per document. */
export type Outbox = OutboxEntry[];

/** Whose data this phone is syncing. Comes from the signed-in account. */
export type SyncScope =
  | { role: 'trainer'; uid: string; trainerId: string }
  | { role: 'client'; uid: string; trainerId: string; clientId: string };

export interface RemoteChange {
  collection: CollectionName;
  id: string;
  /** The document as the server has it, or null once it has been deleted. */
  data: Fields | null;
}

/**
 * Thrown by an adapter. `retryable` separates "no signal, try again later"
 * from "the server refused this and always will" — retrying the second kind
 * forever would block every change queued behind it.
 */
export class RemoteWriteError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'RemoteWriteError';
  }
}

/** The only thing that talks to the server. Firestore in the app, a fake in tests. */
export interface RemoteAdapter {
  /** Writes the entries together. Rejects with RemoteWriteError. */
  write(scope: SyncScope, entries: readonly OutboxEntry[]): Promise<void>;
  /**
   * Streams every change in scope made after `since` (ms since epoch; 0 for
   * everything). `serverTime` is the newest update time seen, for next launch.
   */
  subscribe(
    scope: SyncScope,
    since: number,
    onChanges: (changes: RemoteChange[], serverTime: number) => void,
    onError: (error: unknown) => void
  ): () => void;
}

export interface SyncStatus {
  online: boolean;
  /** Changes on this phone not yet confirmed by the server. */
  pending: number;
  /** When the server last confirmed an upload or delivered changes. */
  lastSyncedAt: number | null;
  /** Changes the server refused and that were dropped, since launch. */
  rejected: number;
}

/** The store's array for a collection. */
export function listOf(data: SyncedData, collection: CollectionName): readonly { id: string }[] {
  switch (collection) {
    case 'clients':
      return data.clients;
    case 'workouts':
      return data.workouts;
    case 'dayTypes':
      return data.dayTypes;
    case 'movements':
      return data.customMovements;
  }
}

/** Returns `data` with one collection's array replaced. */
export function withList(
  data: SyncedData,
  collection: CollectionName,
  list: readonly { id: string }[]
): SyncedData {
  switch (collection) {
    case 'clients':
      return { ...data, clients: list as Client[] };
    case 'workouts':
      return { ...data, workouts: list as Workout[] };
    case 'dayTypes':
      return { ...data, dayTypes: list as DayType[] };
    case 'movements':
      return { ...data, customMovements: list as CustomMovement[] };
  }
}
