import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { Client, CustomMovement, DayType, Workout } from '../models';
import type { SyncSnapshot } from '../persistence';
import { SEED_DAY_TYPES } from '../sampleData';
import { useCloud } from './context';
import { planUploads } from './diff';
import { flushOutbox, retryDelayMs } from './engine';
import { applyRemoteChanges } from './merge';
import { enqueue } from './outbox';
import {
  COLLECTIONS,
  type CollectionName,
  type RemoteChange,
  type SyncScope,
  type SyncStatus,
  type SyncedData,
  type Watermarks,
  listOf,
  withList,
} from './types';

/**
 * Connects the store to the cloud: queues what changed, uploads the queue,
 * and folds in what other phones changed.
 *
 * Everything that touches the comparison copy (`shadow`) happens in one place,
 * `capture`, which the store calls from its save effect with the data just
 * committed to the screen. Server changes wait in an inbox until then, so the
 * comparison never sees a server change on one side and not the other — the
 * mismatch that would upload a stale value over the change that just arrived.
 */

const EMPTY_DATA: SyncedData = { clients: [], workouts: [], dayTypes: [], customMovements: [] };

/** Long enough that logging a set and the next tap go up together. */
const UPLOAD_DELAY_MS = 800;

export interface SyncSetters {
  clients: Dispatch<SetStateAction<Client[]>>;
  workouts: Dispatch<SetStateAction<Workout[]>>;
  dayTypes: Dispatch<SetStateAction<DayType[]>>;
  customMovements: Dispatch<SetStateAction<CustomMovement[]>>;
}

function setterFor(setters: SyncSetters, collection: CollectionName) {
  const byName = {
    clients: setters.clients,
    workouts: setters.workouts,
    dayTypes: setters.dayTypes,
    movements: setters.customMovements,
  } as const;
  return byName[collection] as unknown as Dispatch<SetStateAction<readonly { id: string }[]>>;
}

const scopeKey = (scope: SyncScope | null) =>
  scope
    ? `${scope.role}:${scope.uid}:${scope.trainerId}:${scope.role === 'client' ? scope.clientId : ''}`
    : null;

export function useCloudSync({
  syncRef,
  setters,
  persist,
}: {
  syncRef: MutableRefObject<SyncSnapshot>;
  setters: SyncSetters;
  /** Saves the store now, with the latest data and the sync section. */
  persist: () => void;
}) {
  const session = useCloud();
  const scope = session?.scope ?? null;
  const services = session?.services ?? null;
  const key = scopeKey(scope);

  const shadowRef = useRef<SyncedData | null>(null);
  // undefined until the first capture, so a relaunch is told apart from a sign-in.
  const handledKeyRef = useRef<string | null | undefined>(undefined);
  const inboxRef = useRef<{ changes: RemoteChange[]; serverTime: Watermarks }>({
    changes: [],
    serverTime: {},
  });
  const [inboxTick, setInboxTick] = useState(0);
  // The scope whose local data has been prepared. Listening waits for it, so a
  // fresh start asks the server for everything rather than for changes since.
  const [readyKey, setReadyKey] = useState<string | null>(null);

  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [rejected, setRejected] = useState(0);

  const latest = useRef({ scope, services, online, persist, setters });
  latest.current = { scope, services, online, persist, setters };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);
  const failures = useRef(0);

  const flush = useCallback(async () => {
    const { scope: current, services: live, online: connected } = latest.current;
    if (!current || !live || !connected || flushing.current) return;
    if (syncRef.current.outbox.length === 0) return;
    // The queue belongs to the account it was prepared for. Until a new
    // sign-in has been prepared, it is somebody else's.
    if (syncRef.current.ownerUid !== current.uid) return;
    const flushKey = scopeKey(current);
    flushing.current = true;
    try {
      const result = await flushOutbox({
        adapter: live.adapter,
        scope: current,
        refreshToken: live.refreshAuth,
        // Stops the moment another account signs in: what is queued by then is theirs.
        stillCurrent: () =>
          scopeKey(latest.current.scope) === flushKey && syncRef.current.ownerUid === current.uid,
        readOutbox: () => syncRef.current.outbox,
        updateOutbox: (change) => {
          syncRef.current = { ...syncRef.current, outbox: change(syncRef.current.outbox) };
        },
      });
      latest.current.persist();
      setPending(syncRef.current.outbox.length);
      if (result.sent > 0) setLastSyncedAt(Date.now());
      if (result.rejected > 0) setRejected((count) => count + result.rejected);
      if (result.interrupted) {
        failures.current += 1;
        schedule(retryDelayMs(failures.current));
      } else {
        failures.current = 0;
        // More arrived while that upload was in flight.
        if (syncRef.current.outbox.length > 0) schedule(0);
      }
    } finally {
      flushing.current = false;
    }
    // schedule is declared below and only ever called after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncRef]);

  const schedule = useCallback(
    (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush();
      }, delay);
    },
    [flush]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  /** Prepares local data for a newly signed-in account. False when this round must stop. */
  const prepareScope = (current: SyncedData, next: SyncScope | null, nextKey: string | null): boolean => {
    const isFirst = handledKeyRef.current === undefined;
    handledKeyRef.current = nextKey;
    // Changes heard for the previous account are not this one's to fold in.
    inboxRef.current = { changes: [], serverTime: {} };
    if (!next) {
      shadowRef.current = current;
      if (!isFirst) setReadyKey(null);
      return true;
    }
    const sync = syncRef.current;
    if (sync.ownerUid === next.uid) {
      shadowRef.current = current;
    } else if (sync.ownerUid === null && next.role === 'trainer') {
      // Data from before accounts belongs to the first coach who signs in on
      // this phone. Comparing against nothing queues all of it for upload —
      // except the starter day types every install begins with, which the
      // server already created with the account. Counting those as known means
      // only a starter this phone actually changed goes up; sending them all
      // put a coach's renamed day types back to "Push Day" on every device
      // whenever they signed in on a new or reinstalled phone.
      syncRef.current = { ...sync, ownerUid: next.uid, watermarks: {} };
      shadowRef.current = { ...EMPTY_DATA, dayTypes: SEED_DAY_TYPES };
    } else {
      // Another account's data, or a client's phone: start clean and let the
      // server fill it. This round stops here — comparing the old data against
      // nothing would upload somebody else's roster into this account.
      syncRef.current = { outbox: [], watermarks: {}, ownerUid: next.uid };
      shadowRef.current = EMPTY_DATA;
      const { setters: live } = latest.current;
      live.clients([]);
      live.workouts([]);
      live.dayTypes([]);
      live.customMovements([]);
      setPending(0);
      setReadyKey(nextKey);
      return false;
    }
    setReadyKey(nextKey);
    return true;
  };

  /** Called by the store's save effect with the data just committed, before it saves. */
  const capture = (current: SyncedData) => {
    const { scope: live } = latest.current;
    const liveKey = scopeKey(live);
    if (liveKey !== handledKeyRef.current && !prepareScope(current, live, liveKey)) return;
    if (!live) {
      shadowRef.current = current;
      return;
    }

    const entries = planUploads(live, shadowRef.current ?? current, current);
    if (entries.length > 0) {
      syncRef.current = { ...syncRef.current, outbox: enqueue(syncRef.current.outbox, entries) };
    }
    shadowRef.current = current;

    const inbox = inboxRef.current;
    if (inbox.changes.length > 0) {
      inboxRef.current = { changes: [], serverTime: {} };
      const result = applyRemoteChanges(current, inbox.changes, syncRef.current.outbox);
      shadowRef.current = result.data;
      // Only the collections this batch carried move on. One of them racing
      // ahead used to take the others with it.
      const watermarks = { ...syncRef.current.watermarks };
      for (const [collection, serverTime] of Object.entries(inbox.serverTime)) {
        const name = collection as CollectionName;
        if (serverTime) watermarks[name] = Math.max(watermarks[name] ?? 0, serverTime);
      }
      syncRef.current = { ...syncRef.current, outbox: result.outbox, watermarks };
      setLastSyncedAt(Date.now());
      for (const collection of COLLECTIONS) {
        const before = listOf(current, collection);
        const after = listOf(result.data, collection);
        if (before === after) continue;
        const own = inbox.changes.filter((change) => change.collection === collection);
        // Functional, in case a tap has changed this list since the commit:
        // then the server's changes go on top of that newer version instead.
        setterFor(latest.current.setters, collection)((list) =>
          list === before
            ? after
            : listOf(
                applyRemoteChanges(withList(EMPTY_DATA, collection, list), own, syncRef.current.outbox).data,
                collection
              )
        );
      }
    }

    setPending(syncRef.current.outbox.length);
    if (entries.length > 0) schedule(UPLOAD_DELAY_MS);
  };

  // Listen for other phones' changes once local data is ready for this account.
  //
  // A listener the server stops is started again, after a growing wait. It
  // used to stop for good without a word, which left a client on a new phone
  // on "Getting your programme…" forever with nothing in any log to say why.
  // The usual cause is a sign-in token a moment older than the role it needs,
  // which the next attempt has.
  useEffect(() => {
    if (!services || !scope || readyKey !== key) return;
    let alive = true;
    let stop: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const start = () => {
      retry = null;
      stop = services.adapter.subscribe(
        scope,
        syncRef.current.watermarks,
        (collection, changes, serverTime) => {
          attempts = 0;
          if (changes.length === 0) {
            setLastSyncedAt(Date.now());
            return;
          }
          inboxRef.current = {
            changes: [...inboxRef.current.changes, ...changes],
            serverTime: {
              ...inboxRef.current.serverTime,
              [collection]: Math.max(inboxRef.current.serverTime[collection] ?? 0, serverTime),
            },
          };
          setInboxTick((tick) => tick + 1);
        },
        (error) => {
          // One subscription is several listeners, and the first to fail
          // restarts them all. Safe now that each carries its own watermark:
          // a restart asks every collection for what that collection is
          // missing, rather than for what the luckiest one already had.
          if (!alive || retry) return;
          console.warn('Cloud sync stopped listening for changes; trying again.', error);
          stop?.();
          stop = null;
          attempts += 1;
          retry = setTimeout(start, retryDelayMs(attempts));
        }
      );
    };

    start();
    schedule(0);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      stop?.();
    };
    // `scope` is read through `key`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, key, readyKey, schedule]);

  useEffect(() => {
    if (!services) return;
    return services.watchConnection((connected) => {
      latest.current.online = connected;
      setOnline(connected);
      if (connected) {
        failures.current = 0;
        schedule(0);
      }
    });
  }, [services, schedule]);

  // Coming back to the app is when a change made just before closing it has
  // its best chance of going up.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule(0);
    });
    return () => subscription.remove();
  }, [schedule]);

  const status: SyncStatus = { online, pending, lastSyncedAt, rejected };
  return { capture, inboxTick, status, active: Boolean(services && scope), scopeKey: key };
}
