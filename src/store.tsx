import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Client,
  CustomMovement,
  DAY_LABEL_MAX,
  DayType,
  ExerciseEntry,
  PersonalRecord,
  PlanId,
  Role,
  SetEntry,
  Subscription,
  WeightUnit,
  Workout,
  exerciseIsComplete,
  isLogged,
  loggedCount,
  makeId,
  makeInviteCode,
  loggedSets,
  normaliseCode,
  topLoggedWeight,
} from './models';
import { MOVEMENT_CATALOGUE, SAMPLE_CLIENT_IDS, SEED_DAY_TYPES, buildSeed } from './sampleData';
import { purchases } from './purchases';
import { AppState } from 'react-native';
import {
  EMPTY_SYNC,
  Snapshot,
  SNAPSHOT_VERSION,
  SyncSnapshot,
  clearSnapshot,
  flushSnapshot,
  readSnapshot,
  saveSnapshot,
} from './persistence';
import type { SyncStatus } from './sync/types';
import { useCloudSync } from './sync/useCloudSync';
import { useCloud } from './sync/context';
import { Streak, weekStreak as computeWeekStreak } from './rewards';

export type Appearance = 'light' | 'dark' | 'system';

interface StoreValue {
  // session
  /**
   * False until the saved store has been read back off disk. The root gate
   * decides between the paywall and the app synchronously, so rendering before
   * this flips shows a signed-in coach the paywall on every cold start.
   */
  hydrated: boolean;
  role: Role | null;
  signedInClientId: string | null;
  appearance: Appearance;
  /** Naming the client is mandatory — that is what stops everyone landing in one account. */
  signInAsTrainer: () => void;
  signInAsClient: (clientId: string) => void;
  signOut: () => void;
  /**
   * The single expression for "this half of the app is usable". The root gate
   * and the layout guard both read these, and must never restate the condition
   * themselves — two versions that disagree is an infinite redirect.
   */
  canUseTrainerApp: () => boolean;
  canUseClientApp: () => boolean;

  // subscription
  subscription: Subscription | null;
  purchasePending: boolean;
  purchasePlan: (plan: PlanId) => Promise<boolean>;
  restorePurchase: () => Promise<boolean>;
  /** Mock only — absent once a real purchase backend is wired in. */
  expireSubscriptionForDemo?: () => void;
  setAppearance: (value: Appearance) => void;

  // data
  clients: Client[];
  workouts: Workout[];
  dayTypes: DayType[];
  customMovements: CustomMovement[];

  // queries
  client: (id: string) => Client | undefined;
  currentClient: () => Client | undefined;
  workout: (id: string) => Workout | undefined;
  workoutsFor: (clientId: string) => Workout[];
  upcomingFor: (clientId: string) => Workout[];
  historyFor: (clientId: string) => Workout[];
  todayWorkoutFor: (clientId: string) => Workout | undefined;
  /** Today's session as the client sees it: only one their coach has sent. */
  sentWorkoutFor: (clientId: string) => Workout | undefined;
  clientsWithSessionToday: () => Client[];
  lapsedClients: () => Client[];
  dayType: (id?: string) => DayType | undefined;
  /** Built-in catalogue plus the trainer's own movements, de-duplicated. */
  allMovements: () => string[];
  customMovement: (name: string) => CustomMovement | undefined;
  completedOn: (clientId: string, day: Date) => Workout | undefined;
  /** Pure lookup, so a code field can validate as it is typed. */
  clientByCode: (code: string) => Client | undefined;
  /** The client's unfinished solo session, if one is open. */
  activeSoloFor: (clientId: string) => Workout | undefined;
  /** Sessions the coach has sent that the client has not acknowledged yet. */
  unseenFromCoach: (clientId: string) => Workout[];

  // mutations
  createWorkout: (clientId: string) => string;
  renameWorkout: (workoutId: string, name: string) => void;
  setWorkoutDate: (workoutId: string, iso: string) => void;
  setTargetWeight: (workoutId: string, exercise: number, set: number, weight: number) => void;
  setTargetReps: (workoutId: string, exercise: number, set: number, reps: number) => void;
  addSet: (workoutId: string, exercise: number) => void;
  removeSet: (workoutId: string, exercise: number, set: number) => void;
  addExercise: (workoutId: string, movementName: string) => void;
  removeExercise: (workoutId: string, exercise: number) => void;
  logSet: (
    workoutId: string,
    exercise: number,
    set: number,
    weight: number,
    reps: number
  ) => void;
  /** Client-side one-tap logging: fills the set from its target, or clears it. */
  toggleSetLogged: (workoutId: string, exercise: number, set: number) => void;
  finishWorkout: (workoutId: string, durationMinutes: number) => void;
  invite: (name: string, email: string, unit: WeightUnit) => Client;
  /** Signs the matched client in. Returns them, so the screen owns the copy. */
  redeemInviteCode: (code: string) => Client | undefined;
  regenerateInviteCode: (clientId: string) => string;
  /** Copies a completed session forward as a solo one the client owns. */
  repeatWorkout: (sourceWorkoutId: string) => string | undefined;
  removeWorkout: (workoutId: string) => void;
  /**
   * Stamps the moment the trainer sent it. True the first time only, so
   * re-saving an edit does not celebrate again. An empty workout is never sent.
   */
  assignWorkout: (workoutId: string) => boolean;
  /** The client has seen the "new session" card; it stops showing. */
  markSeenByClient: (workoutId: string) => void;
  setLoggedWeight: (workoutId: string, exercise: number, set: number, weight: number) => void;
  setLoggedReps: (workoutId: string, exercise: number, set: number, reps: number) => void;
  setClientUnit: (clientId: string, unit: WeightUnit) => void;
  deleteAccount: () => void;
  /** Demo roster on request, now that a fresh install starts empty. */
  hasSampleData: boolean;
  loadSampleData: () => string;
  clearSampleData: () => void;
  setWorkoutDayType: (workoutId: string, dayTypeId: string | undefined) => void;
  addDayType: (name: string, shortLabel: string, colorIndex: number) => string;
  updateDayType: (id: string, patch: Partial<Omit<DayType, 'id'>>) => void;
  removeDayType: (id: string) => void;
  addCustomMovement: (input: Omit<CustomMovement, 'id'>) => void;
  updateCustomMovement: (id: string, patch: Partial<Omit<CustomMovement, 'id'>>) => void;
  removeCustomMovement: (id: string) => void;

  // analytics
  personalRecords: (clientId: string) => PersonalRecord[];
  topSetSeries: (clientId: string, movementName: string) => { date: string; weight: number }[];
  trainedMovements: (clientId: string) => string[];
  sessionCount: (clientId: string, weeks?: number) => number;
  /** Sets logged in the last seven days. */
  weekSets: (clientId: string) => number;
  /** Consecutive weeks trained, and whether this week still needs a session to keep it. */
  weekStreak: (clientId: string) => Streak;

  /** True while cloud sync is running for a signed-in account. */
  cloudActive: boolean;
  /** Whether this phone is online, and what is still waiting to upload. */
  syncStatus: SyncStatus;
}

const StoreContext = createContext<StoreValue | null>(null);

const startOfDay = (input: string | Date) => {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const isToday = (iso: string) => startOfDay(iso) === startOfDay(new Date());

/**
 * One shared store. The trainer's writes and the client's reads hit the same
 * objects, so logging a set updates the client's Today screen live.
 * In-memory only: nothing survives a reload.
 */
/** A session the coach runs today that has something in it. */
const isTodaysSession = (w: Workout) =>
  w.loggedBy === 'trainer' && w.status !== 'completed' && isToday(w.date) && w.exercises.length > 0;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // A fresh install starts empty. Seeding six invented clients unconditionally
  // meant a trainer who had just paid landed on somebody else's roster, with
  // nothing anywhere to say it was sample data. The day types are the exception
  // — they are a starter split, not somebody's training history.
  const [clients, setClients] = useState<Client[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [dayTypes, setDayTypes] = useState<DayType[]>(SEED_DAY_TYPES);
  const [customMovements, setCustomMovements] = useState<CustomMovement[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [signedInClientId, setSignedInClientId] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>('system');
  // Read synchronously rather than in an effect, so a trainer who already owns
  // a subscription never sees the paywall flash on the first paint.
  const [subscription, setSubscription] = useState<Subscription | null>(() => purchases.cached());
  const [purchasePending, setPurchasePending] = useState(false);

  // Nothing may render until the saved store has been read back: the root gate
  // chooses between the paywall and the app synchronously.
  const [hydrated, setHydrated] = useState(false);
  // Set when the saved store exists but storage could not be read. The app
  // still opens, but nothing is written over the file for the rest of this
  // launch — writing the empty state is exactly how the data would be lost.
  const [saveBlocked, setSaveBlocked] = useState(false);
  // Cloud sync's queue and bookkeeping. A ref rather than state: it is written
  // in the same save as the data, and changing it must not re-render anything.
  const syncRef = useRef<SyncSnapshot>(EMPTY_SYNC);
  // The engine saves after the server confirms an upload, outside any render,
  // so it needs today's values rather than the ones it was created with.
  const persistRef = useRef<() => void>(() => {});
  const cloud = useCloudSync({
    syncRef,
    setters: {
      clients: setClients,
      workouts: setWorkouts,
      dayTypes: setDayTypes,
      customMovements: setCustomMovements,
    },
    persist: () => persistRef.current(),
  });

  useEffect(() => {
    let cancelled = false;
    void readSnapshot().then((result) => {
      if (cancelled) return;
      if (result.status === 'unreadable') setSaveBlocked(true);
      const saved = result.status === 'ok' ? result.snapshot : null;
      if (saved) {
        setClients(saved.clients);
        setWorkouts(saved.workouts);
        // A build that ships new starter day types should not strip them from
        // somebody who has never opened that screen.
        setDayTypes(saved.dayTypes.length ? saved.dayTypes : SEED_DAY_TYPES);
        setCustomMovements(saved.customMovements);
        setRole(saved.role);
        setSignedInClientId(saved.signedInClientId);
        setAppearance(saved.appearance);
        setSubscription(saved.subscription);
        // The mock purchase service keeps its own module-level copy. Telling it
        // what we restored stops cached() and the store disagreeing about
        // whether this person has paid.
        purchases.hydrate?.(saved.subscription);
        syncRef.current = saved.sync;
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // With accounts, who is signed in — and as which side — comes from the
  // account's sign-in token, not from a button on this phone.
  const cloudSession = useCloud();
  const cloudScopeKey = cloudSession ? JSON.stringify(cloudSession.scope) : null;
  // Accounts are switched on for this build; fixed for the life of the app.
  const cloudOn = cloudSession?.services != null;
  useEffect(() => {
    if (!hydrated || !cloudSession) return;
    const scope = cloudSession.scope;
    setRole(scope ? scope.role : null);
    setSignedInClientId(scope?.role === 'client' ? scope.clientId : null);
    // Keyed on the scope's content; the session object is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, cloudScopeKey]);

  useEffect(() => {
    // Guarding on hydrated is not optional. Without it this fires on the
    // initial empty state and erases the saved store before the read above has
    // resolved — silently, and only on a cold start.
    if (!hydrated) return;
    // Cloud sync queues what changed before the save, so the data and the
    // queue describing it land in the same write.
    cloud.capture({ clients, workouts, dayTypes, customMovements });
    if (saveBlocked) return;
    const snapshot: Snapshot = {
      version: SNAPSHOT_VERSION,
      clients,
      workouts,
      dayTypes,
      customMovements,
      role,
      signedInClientId,
      appearance,
      subscription,
      sync: syncRef.current,
    };
    persistRef.current = () => saveSnapshot({ ...snapshot, sync: syncRef.current });
    saveSnapshot(snapshot);
  }, [
    hydrated,
    saveBlocked,
    clients,
    workouts,
    dayTypes,
    customMovements,
    role,
    signedInClientId,
    appearance,
    subscription,
    // Changes from other phones wait for this effect to fold them in.
    cloud.inboxTick,
    // So a new sign-in is prepared even when nothing above changes: a second
    // coach on the same phone has the same role as the first.
    cloud.scopeKey,
  ]);

  // Saves are coalesced over 300ms, and iOS pauses timers the moment the app
  // goes to the background — a change made just before switching away could be
  // lost if the app was then closed. Write it out at once instead.
  useEffect(() => {
    if (!hydrated || saveBlocked) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushSnapshot();
    });
    return () => subscription.remove();
  }, [hydrated, saveBlocked]);

  const mutate = useCallback((workoutId: string, body: (draft: Workout) => void) => {
    setWorkouts((current) =>
      current.map((workout) => {
        if (workout.id !== workoutId) return workout;
        const clone: Workout = {
          ...workout,
          exercises: workout.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => ({ ...set })),
          })),
        };
        body(clone);
        return clone;
      })
    );
  }, []);

  const value = useMemo<StoreValue>(() => {
    const workoutsFor = (clientId: string) =>
      workouts
        .filter((w) => w.clientId === clientId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const historyFor = (clientId: string) =>
      workoutsFor(clientId).filter((w) => w.status === 'completed');

    const upcomingFor = (clientId: string) =>
      workoutsFor(clientId)
        // A solo session is the client's own; it must not show up in the
        // trainer's programme, where tapping a row opens the builder.
        .filter((w) => w.status !== 'completed' && w.loggedBy === 'trainer')
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      hydrated,
      cloudActive: cloud.active,
      syncStatus: cloud.status,
      role,
      signedInClientId,
      appearance,
      setAppearance,
      signInAsTrainer: () => setRole('trainer'),
      signInAsClient: (clientId) => {
        setSignedInClientId(clientId);
        setRole('client');
      },
      signOut: () => {
        setRole(null);
        setSignedInClientId(null);
      },

      canUseTrainerApp: () => role === 'trainer' && subscription?.status === 'active',
      // The client's own record has to be here too. On a new phone it arrives
      // from the cloud a moment after sign-in, and every client screen reads it.
      canUseClientApp: () =>
        role === 'client' &&
        signedInClientId !== null &&
        clients.some((c) => c.id === signedInClientId),

      subscription,
      purchasePending,

      purchasePlan: async (plan) => {
        setPurchasePending(true);
        try {
          setSubscription(await purchases.purchase(plan));
          return true;
        } catch {
          // A cancelled sheet is the common case, and is not an error worth
          // shouting about — the paywall simply stays where it is.
          return false;
        } finally {
          setPurchasePending(false);
        }
      },

      restorePurchase: async () => {
        setPurchasePending(true);
        try {
          const restored = await purchases.restore();
          setSubscription(restored);
          return restored?.status === 'active';
        } catch {
          return false;
        } finally {
          setPurchasePending(false);
        }
      },

      expireSubscriptionForDemo: purchases.debugExpire
        ? () => {
            purchases.debugExpire?.();
            setSubscription(purchases.cached());
          }
        : undefined,

      clients,
      workouts,
      dayTypes,
      customMovements,

      client: (id) => clients.find((c) => c.id === id),
      // No fallback to clients[0]. A fallback is what made every invited client
      // resolve to the first seeded one; every consumer already handles undefined.
      currentClient: () => clients.find((c) => c.id === signedInClientId),
      workout: (id) => workouts.find((w) => w.id === id),
      workoutsFor,
      upcomingFor,
      historyFor,

      // Trainer-led and dated today. Solo sessions have their own card, and an
      // unfinished session from three weeks ago is not "today".
      // The coach's view of today: any session they have built for today, sent
      // or not, since a coach may run one live without sending it. An empty
      // "New workout" draft is not a session yet. (Ryan's call, 2026-09-13.)
      todayWorkoutFor: (clientId) => workoutsFor(clientId).find(isTodaysSession),

      // The client's view of today: only what their coach has sent.
      sentWorkoutFor: (clientId) =>
        workoutsFor(clientId).find((w) => isTodaysSession(w) && w.assignedAt !== undefined),

      clientsWithSessionToday: () => clients.filter((c) => workoutsFor(c.id).some(isTodaysSession)),

      dayType: (id) => (id ? dayTypes.find((d) => d.id === id) : undefined),

      allMovements: () => {
        const names = [...MOVEMENT_CATALOGUE];
        customMovements.forEach((m) => {
          if (!names.some((n) => n.toLowerCase() === m.name.toLowerCase())) names.push(m.name);
        });
        return names;
      },

      customMovement: (name) =>
        customMovements.find((m) => m.name.toLowerCase() === name.toLowerCase()),

      /** The completed session on a given calendar day, if there was one. */
      completedOn: (clientId, day) => {
        const key = startOfDay(day);
        return historyFor(clientId).find((w) => startOfDay(w.date) === key);
      },

      clientByCode: (code) => {
        const wanted = normaliseCode(code);
        return wanted ? clients.find((c) => c.inviteCode === wanted) : undefined;
      },

      activeSoloFor: (clientId) =>
        workoutsFor(clientId).find((w) => w.loggedBy === 'client' && w.status !== 'completed'),

      /**
       * News, not history: sent, not yet acknowledged, and not already past.
       * A session whose day has gone is no longer something to look forward to.
       */
      unseenFromCoach: (clientId) => {
        const today = startOfDay(new Date());
        return workoutsFor(clientId)
          .filter(
            (w) =>
              w.loggedBy === 'trainer' &&
              w.status !== 'completed' &&
              w.assignedAt !== undefined &&
              w.seenByClientAt === undefined &&
              startOfDay(w.date) >= today
          )
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      },

      /**
       * Someone who has trained, but not lately. A client who has never trained
       * is not lapsed — they are new, and badging them LAPSED thirty seconds
       * after an invite is the first thing a trainer used to see.
       */
      lapsedClients: () => {
        const cutoff = Date.now() - 10 * 86_400_000;
        return clients.filter((c) => {
          const last = historyFor(c.id)[0];
          return last !== undefined && new Date(last.date).getTime() < cutoff;
        });
      },

      createWorkout: (clientId) => {
        const id = makeId('w');
        setWorkouts((current) => [
          ...current,
          {
            id,
            clientId,
            name: 'New workout',
            date: new Date().toISOString(),
            exercises: [],
            coachNote: '',
            status: 'scheduled',
            loggedBy: 'trainer',
          },
        ]);
        return id;
      },

      renameWorkout: (workoutId, name) => mutate(workoutId, (w) => { w.name = name; }),
      setWorkoutDate: (workoutId, iso) => mutate(workoutId, (w) => { w.date = iso; }),

      setTargetWeight: (workoutId, exercise, set, weight) =>
        mutate(workoutId, (w) => {
          const target = w.exercises[exercise]?.sets[set];
          if (target) target.targetWeight = Math.max(0, weight);
        }),

      setTargetReps: (workoutId, exercise, set, reps) =>
        mutate(workoutId, (w) => {
          const target = w.exercises[exercise]?.sets[set];
          if (target) target.targetReps = Math.max(1, reps);
        }),

      /** Duplicates the last set, which is what a trainer nearly always wants. */
      addSet: (workoutId, exercise) =>
        mutate(workoutId, (w) => {
          const entry = w.exercises[exercise];
          if (!entry) return;
          const previous = entry.sets[entry.sets.length - 1];
          entry.sets.push({
            id: makeId('set'),
            targetWeight: previous?.targetWeight ?? 20,
            targetReps: previous?.targetReps ?? 8,
          });
        }),

      removeSet: (workoutId, exercise, set) =>
        mutate(workoutId, (w) => {
          w.exercises[exercise]?.sets.splice(set, 1);
        }),

      addExercise: (workoutId, movementName) =>
        mutate(workoutId, (w) => {
          const sets: SetEntry[] = Array.from({ length: 3 }, () => ({
            id: makeId('set'),
            targetWeight: 20,
            targetReps: 10,
          }));
          const entry: ExerciseEntry = { id: makeId('ex'), movementName, sets };
          w.exercises.push(entry);
        }),

      removeExercise: (workoutId, exercise) =>
        mutate(workoutId, (w) => {
          w.exercises.splice(exercise, 1);
        }),

      logSet: (workoutId, exercise, set, weight, reps) =>
        mutate(workoutId, (w) => {
          if (w.loggedBy !== 'trainer') return;
          const target = w.exercises[exercise]?.sets[set];
          if (!target) return;
          target.loggedWeight = weight;
          target.loggedReps = reps;
          if (w.status === 'scheduled') {
            w.status = 'inProgress';
            w.startedAt = w.startedAt ?? new Date().toISOString();
          }
        }),

      /**
       * The client ticking a set off in a solo session — "did that as written".
       * It writes the same two fields the trainer's logging writes, so both
       * sides read one set of numbers. Tapping a logged set clears it again,
       * which is the undo for a mis-tap.
       */
      toggleSetLogged: (workoutId, exercise, set) =>
        mutate(workoutId, (w) => {
          if (w.loggedBy !== 'client') return;
          const target = w.exercises[exercise]?.sets[set];
          if (!target) return;
          if (target.loggedWeight !== undefined) {
            target.loggedWeight = undefined;
            target.loggedReps = undefined;
            return;
          }
          target.loggedWeight = target.targetWeight;
          target.loggedReps = target.targetReps;
          if (w.status === 'scheduled') {
            w.status = 'inProgress';
            w.startedAt = w.startedAt ?? new Date().toISOString();
          }
        }),

      /**
       * Touching a stepper *is* logging the set, so each setter fills in the
       * other field from its target rather than leaving a half-logged set that
       * isLogged would call done.
       */
      setLoggedWeight: (workoutId, exercise, set, weight) =>
        mutate(workoutId, (w) => {
          if (w.loggedBy !== 'client') return;
          const target = w.exercises[exercise]?.sets[set];
          if (!target) return;
          target.loggedWeight = Math.max(0, weight);
          target.loggedReps = target.loggedReps ?? target.targetReps;
          if (w.status === 'scheduled') {
            w.status = 'inProgress';
            w.startedAt = w.startedAt ?? new Date().toISOString();
          }
        }),

      setLoggedReps: (workoutId, exercise, set, reps) =>
        mutate(workoutId, (w) => {
          if (w.loggedBy !== 'client') return;
          const target = w.exercises[exercise]?.sets[set];
          if (!target) return;
          target.loggedReps = Math.max(1, reps);
          target.loggedWeight = target.loggedWeight ?? target.targetWeight;
          if (w.status === 'scheduled') {
            w.status = 'inProgress';
            w.startedAt = w.startedAt ?? new Date().toISOString();
          }
        }),

      /**
       * Yesterday's session, forward to today, as the client's own. Targets come
       * from what they actually lifted rather than what was prescribed back
       * then — repeating means repeating the real thing.
       */
      repeatWorkout: (sourceWorkoutId) => {
        const source = workouts.find((w) => w.id === sourceWorkoutId);
        if (!source) return undefined;

        // Repeated taps must not litter the calendar with empty sessions.
        const open = workouts.find(
          (w) =>
            w.clientId === source.clientId && w.loggedBy === 'client' && w.status !== 'completed'
        );
        if (open) return open.id;

        const id = makeId('w');
        setWorkouts((current) => [
          ...current,
          {
            id,
            clientId: source.clientId,
            name: source.name,
            date: new Date().toISOString(),
            status: 'scheduled',
            loggedBy: 'client',
            dayTypeId: source.dayTypeId,
            // The note was written for that day. Carrying it forward puts words
            // in the trainer's mouth about a session they were not at.
            coachNote: '',
            exercises: source.exercises.map((exercise) => ({
              id: makeId('ex'),
              movementName: exercise.movementName,
              sets: exercise.sets.map((set) => ({
                id: makeId('set'),
                targetWeight: set.loggedWeight ?? set.targetWeight,
                targetReps: set.loggedReps ?? set.targetReps,
              })),
            })),
          },
        ]);
        return id;
      },

      removeWorkout: (workoutId) =>
        setWorkouts((current) => current.filter((w) => w.id !== workoutId)),

      assignWorkout: (workoutId) => {
        const target = workouts.find((w) => w.id === workoutId);
        // A solo session is the client's own, and an empty one is nothing to send.
        if (
          !target ||
          target.loggedBy !== 'trainer' ||
          target.assignedAt !== undefined ||
          target.exercises.length === 0
        ) {
          return false;
        }
        mutate(workoutId, (w) => {
          w.assignedAt = new Date().toISOString();
        });
        return true;
      },

      markSeenByClient: (workoutId) =>
        mutate(workoutId, (w) => {
          w.seenByClientAt = w.seenByClientAt ?? new Date().toISOString();
        }),

      finishWorkout: (workoutId, durationMinutes) => {
        // Guard on the transition, not the call. Both the header flag and the
        // footer button reach this, and neither unmounts fast enough to stop a
        // second tap counting the same session twice.
        const target = workouts.find((w) => w.id === workoutId);
        if (!target || target.status === 'completed') return;
        // Nothing logged is not a session: it went into History as "0 sets",
        // counted for the streak and used up a milestone.
        if (loggedSets(target) === 0) return;
        mutate(workoutId, (w) => {
          w.status = 'completed';
          w.durationMinutes = durationMinutes;
        });
        // Otherwise a client finishes a session and their own profile disagrees.
        const clientId = target.clientId;
        if (clientId) {
          setClients((current) =>
            current.map((c) =>
              c.id === clientId ? { ...c, sessionsCompleted: c.sessionsCompleted + 1 } : c
            )
          );
        }
      },

      invite: (name, email, unit) => {
        const created: Client = {
          id: makeId('client'),
          name,
          email,
          unit,
          blockName: 'Onboarding',
          blockWeek: 1,
          blockLength: 4,
          adherence: 100,
          sessionsCompleted: 0,
          inviteCode: makeInviteCode(clients.map((c) => c.inviteCode)),
          inviteAccepted: false,
        };
        setClients((current) => [...current, created]);
        return created;
      },

      /**
       * Codes are not single-use. With no device or account identity, "consumed"
       * would just mean the client cannot sign in again on a new phone.
       * inviteAccepted records that they arrived; regenerateInviteCode is what
       * invalidates a code that leaked.
       */
      redeemInviteCode: (code) => {
        const wanted = normaliseCode(code);
        const match = clients.find((c) => c.inviteCode === wanted);
        if (!match) return undefined;
        setClients((current) =>
          current.map((c) => (c.id === match.id ? { ...c, inviteAccepted: true } : c))
        );
        setSignedInClientId(match.id);
        setRole('client');
        return match;
      },

      regenerateInviteCode: (clientId) => {
        const next = makeInviteCode(clients.map((c) => c.inviteCode));
        setClients((current) =>
          current.map((c) =>
            c.id === clientId ? { ...c, inviteCode: next, inviteAccepted: false } : c
          )
        );
        return next;
      },

      setClientUnit: (clientId, unit) =>
        setClients((current) => current.map((c) => (c.id === clientId ? { ...c, unit } : c))),

      /**
       * The demo roster, on request. It is how a reviewer gets a populated app
       * without a real client, and how the client side can be reached at all —
       * signing in as a client needs an invite code from somewhere.
       */
      hasSampleData: clients.some((c) => SAMPLE_CLIENT_IDS.has(c.id)),

      /**
       * Adds the demo roster alongside whoever is already here, and returns a
       * sample client's invite code so a caller can sign in as them. It used to
       * replace the whole roster — and the trainer's own day types — outright.
       * Loading it twice adds nothing the second time.
       */
      loadSampleData: () => {
        const seed = buildSeed();
        const present = new Set(clients.map((c) => c.id));
        const arriving = seed.clients.filter((c) => !present.has(c.id));
        const arrivingIds = new Set(arriving.map((c) => c.id));
        setClients((current) => [
          ...current,
          ...arriving.filter((c) => !current.some((existing) => existing.id === c.id)),
        ]);
        setWorkouts((current) => [
          ...current,
          ...seed.workouts.filter((w) => arrivingIds.has(w.clientId)),
        ]);
        setDayTypes((current) => [
          ...current,
          ...seed.dayTypes.filter((d) => !current.some((existing) => existing.id === d.id)),
        ]);
        const first = seed.clients[0];
        if (!first) return '';
        // Already loaded once? Hand back the code the store actually holds.
        return clients.find((c) => c.id === first.id)?.inviteCode ?? first.inviteCode;
      },

      /** Takes out the sample clients and their sessions, and nothing else. */
      clearSampleData: () => {
        setClients((current) => current.filter((c) => !SAMPLE_CLIENT_IDS.has(c.id)));
        setWorkouts((current) => current.filter((w) => !SAMPLE_CLIENT_IDS.has(w.clientId)));
      },

      /**
       * Apple requires deletion to actually remove the account, in app.
       *
       * Role-aware, because a trainer has no client record: reading
       * signedInClientId alone meant a trainer typed DELETE, confirmed, and
       * nothing at all was removed.
       */
      deleteAccount: () => {
        if (cloudOn) {
          // With accounts, this phone held one account's data — on a client's
          // phone that includes their coach's day types and movements. All of it
          // goes: the next person to sign up here starts from a fresh install
          // rather than adopting, and uploading, somebody else's.
          setClients([]);
          setWorkouts([]);
          setCustomMovements([]);
          setDayTypes(SEED_DAY_TYPES);
        } else if (role === 'trainer') {
          setClients([]);
          setWorkouts([]);
          setCustomMovements([]);
        } else if (signedInClientId) {
          const id = signedInClientId;
          setWorkouts((current) => current.filter((w) => w.clientId !== id));
          setClients((current) => current.filter((c) => c.id !== id));
        }
        setSignedInClientId(null);
        setRole(null);
        // Deletion has to leave nothing behind. Waiting for the debounced write
        // of the emptied state would be a promise we cannot keep if the app is
        // killed in between, so the saved store goes now.
        syncRef.current = EMPTY_SYNC;
        void clearSnapshot();
      },

      setWorkoutDayType: (workoutId, dayTypeId) =>
        mutate(workoutId, (w) => {
          w.dayTypeId = dayTypeId;
        }),

      addDayType: (name, shortLabel, colorIndex) => {
        const id = makeId('day');
        setDayTypes((current) => [
          ...current,
          { id, name: name.trim(), shortLabel: shortLabel.trim().slice(0, DAY_LABEL_MAX), colorIndex },
        ]);
        return id;
      },

      updateDayType: (id, patch) =>
        setDayTypes((current) =>
          current.map((d) =>
            d.id === id
              ? {
                  ...d,
                  ...patch,
                  shortLabel:
                    patch.shortLabel === undefined
                      ? d.shortLabel
                      : patch.shortLabel.trim().slice(0, DAY_LABEL_MAX),
                }
              : d
          )
        ),

      /** Sessions keep their history; they just lose the label. */
      removeDayType: (id) => {
        setDayTypes((current) => current.filter((d) => d.id !== id));
        setWorkouts((current) =>
          current.map((w) => (w.dayTypeId === id ? { ...w, dayTypeId: undefined } : w))
        );
      },

      addCustomMovement: (input) =>
        setCustomMovements((current) => [...current, { ...input, id: makeId('mv') }]),

      updateCustomMovement: (id, patch) =>
        setCustomMovements((current) =>
          current.map((m) => (m.id === id ? { ...m, ...patch } : m))
        ),

      removeCustomMovement: (id) =>
        setCustomMovements((current) => current.filter((m) => m.id !== id)),

      /**
       * Folded workout by workout, not set by set. Comparing individual sets
       * meant a ramp-up in the very first session became the "previous" record:
       * [45, 47.5, 47.5] rendered as "47.5 — was 45", as though 45 were a best
       * that had just been beaten. A previous record has to come from a
       * previous *workout*.
       */
      personalRecords: (clientId) => {
        const best = new Map<string, { set: SetEntry; date: string }>();
        const runnerUp = new Map<string, number>();

        historyFor(clientId)
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .forEach((workout) => {
            // The heaviest set of each movement in this one session first, so a
            // movement programmed twice in a workout is still one data point.
            const topPerMovement = new Map<string, SetEntry>();
            workout.exercises.forEach((exercise) => {
              exercise.sets.filter(isLogged).forEach((set) => {
                const name = exercise.movementName;
                const leader = topPerMovement.get(name);
                if (!leader || (set.loggedWeight ?? 0) > (leader.loggedWeight ?? 0)) {
                  topPerMovement.set(name, set);
                }
              });
            });

            topPerMovement.forEach((set, name) => {
              const current = best.get(name);
              if (!current) {
                best.set(name, { set, date: workout.date });
              } else if ((set.loggedWeight ?? 0) > (current.set.loggedWeight ?? 0)) {
                if (current.set.loggedWeight !== undefined) {
                  runnerUp.set(name, current.set.loggedWeight);
                }
                best.set(name, { set, date: workout.date });
              }
            });
          });

        return Array.from(best.entries())
          .map(([movementName, entry]) => ({
            movementName,
            weight: entry.set.loggedWeight ?? 0,
            reps: entry.set.loggedReps ?? 0,
            date: entry.date,
            previousWeight: runnerUp.get(movementName),
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      },

      /** Top logged set per session for one movement, oldest first. */
      topSetSeries: (clientId, movementName) =>
        historyFor(clientId)
          .slice()
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map((workout) => {
            // Every matching block, not just the first: a movement programmed
            // twice in one session used to contribute only its opening block
            // here while trainedMovements counted both, so the chart and the
            // chips disagreed about the same data.
            const tops = workout.exercises
              .filter((e) => e.movementName === movementName)
              .map(topLoggedWeight)
              .filter((top): top is number => top !== undefined);
            return tops.length === 0
              ? null
              : { date: workout.date, weight: Math.max(...tops) };
          })
          .filter((point): point is { date: string; weight: number } => point !== null),

      trainedMovements: (clientId) => {
        const counts = new Map<string, number>();
        historyFor(clientId).forEach((workout) =>
          workout.exercises.forEach((exercise) =>
            counts.set(exercise.movementName, (counts.get(exercise.movementName) ?? 0) + 1)
          )
        );
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);
      },

      sessionCount: (clientId, weeks = 13) => {
        const cutoff = Date.now() - weeks * 7 * 86_400_000;
        return historyFor(clientId).filter((w) => new Date(w.date).getTime() >= cutoff).length;
      },

      weekSets: (clientId) => {
        const cutoff = Date.now() - 7 * 86_400_000;
        return historyFor(clientId)
          .filter((w) => new Date(w.date).getTime() >= cutoff)
          .reduce((total, w) => total + loggedSets(w), 0);
      },

      weekStreak: (clientId) =>
        computeWeekStreak(
          historyFor(clientId).map((w) => w.date),
          new Date()
        ),
    };
  }, [
    hydrated,
    clients,
    workouts,
    dayTypes,
    customMovements,
    role,
    signedInClientId,
    appearance,
    subscription,
    purchasePending,
    mutate,
    cloudOn,
    cloud.active,
    cloud.status.online,
    cloud.status.pending,
    cloud.status.lastSyncedAt,
    cloud.status.rejected,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}

export { exerciseIsComplete, loggedCount };
