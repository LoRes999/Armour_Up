export type Role = 'trainer' | 'client';

export type WeightUnit = 'kg' | 'lb';

/** Pounds first: it is the default unit, and the order drives every picker. */
export const UNITS: WeightUnit[] = ['lb', 'kg'];

/** What a new client gets until somebody chooses otherwise. */
export const DEFAULT_UNIT: WeightUnit = 'lb';

export function unitName(unit: WeightUnit): string {
  return unit === 'kg' ? 'Kilograms' : 'Pounds';
}

/** One tap on a stepper — the smallest plate pair people actually load. */
export function unitIncrement(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/**
 * Every weight in the store is kilograms. Nothing outside these two functions
 * is allowed to know that.
 *
 * Before this existed, `Client.unit` was a label and nothing more: switching a
 * client from kg to lb relabelled 100 kg as "100 lb" and left their whole
 * history off by a factor of 2.2.
 */
const KG_PER_LB = 0.45359237;

/**
 * Storage → screen. Snapped to the increment of the unit being shown, so a
 * converted number is one you can actually load on a bar: 100 kg reads as
 * 220 lb, not 220.462. Within a single unit this is the identity, so a client
 * who never switches never sees a number move.
 */
export function toDisplay(kg: number, unit: WeightUnit): number {
  const raw = unit === 'kg' ? kg : kg / KG_PER_LB;
  // A value that is already exact in this unit is somebody's actual entry — a
  // 12 kg cable stack, a 14 kg dumbbell — and must be shown as they typed it.
  // Snapping is only for the other case, where a conversion has left a number
  // nobody can load: 100 kg reads as 220 lb rather than 220.462.
  const exact = Math.round(raw * 10) / 10;
  if (Math.abs(raw - exact) < 1e-6) return exact;
  const step = unitIncrement(unit);
  return Math.round(raw / step) * step;
}

/** Screen → storage. Exact, so switching back and forth never drifts. */
export function toCanonical(shown: number, unit: WeightUnit): number {
  return unit === 'kg' ? shown : shown * KG_PER_LB;
}

export function formatWeight(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The common case: a stored weight, rendered in a client's chosen unit. */
export function formatIn(kg: number, unit: WeightUnit): string {
  return formatWeight(toDisplay(kg, unit));
}

/** How a run of top sets moved, first to last, in words a screen reader can say. */
export function trendVerb(first: number, last: number): string {
  if (last > first) return 'rising to';
  if (last < first) return 'falling to';
  return 'holding at';
}

/** Heavier than any lift on record, in canonical kilograms. */
export const MAX_WEIGHT_KG = 1000;

/** More reps than any set is programmed or logged with. */
export const MAX_REPS = 100;

export const clampReps = (reps: number) => Math.min(MAX_REPS, Math.max(1, Math.round(reps)));

/**
 * What the weight keypad accepts: a plain number with at most two decimals,
 * after a point or a comma, within the limit in the unit shown. Anything else
 * is refused: Number() read "1e4" as 10,000 and "1,000" became 1.
 */
export function parseWeightInput(text: string, unit: WeightUnit): number | undefined {
  const trimmed = text.trim();
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed.replace(',', '.'));
  return value <= toDisplay(MAX_WEIGHT_KG, unit) ? value : undefined;
}

/**
 * "Last session 3 days ago", counted in calendar days so a daylight-saving
 * change cannot tip it. Stands in for the training block, which nothing sets.
 */
export function lastSessionLabel(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return 'No sessions yet';
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'Last session today';
  if (days === 1) return 'Last session yesterday';
  if (days < 14) return `Last session ${days} days ago`;
  return `Last session ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/** "1 set", "3 sets". The same rule the server's notifications use. */
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "48 min", "1 hr 12 min"; nothing at all for a session that was not timed. */
export function formatDuration(minutes: number | undefined): string | undefined {
  if (!minutes) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** The heaviest prescribed set, reps and all. The first of a tie. */
export function topTargetSet(exercise: ExerciseEntry): SetEntry | undefined {
  return exercise.sets.reduce<SetEntry | undefined>(
    (best, set) => (best === undefined || set.targetWeight > best.targetWeight ? set : best),
    undefined
  );
}

/**
 * What the trainer is paying for. The domain type lives here; the mechanism
 * that grants it lives in purchases.ts, so swapping the purchase backend never
 * reaches the model.
 */
export type PlanId = 'monthly' | 'annual';

export interface Subscription {
  status: 'active' | 'expired';
  /** 'complimentary': access granted in RevenueCat rather than bought. */
  plan: PlanId | 'complimentary';
  /** ISO. Empty when the access has no end date. */
  renewsAt: string;
  /** False once cancelled: it runs until renewsAt and then ends. */
  willRenew?: boolean;
}

/** No O, 0, I or 1 — a code has to survive being read aloud in a gym. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export function makeInviteCode(taken: readonly string[] = []): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!taken.includes(code)) return code;
  }
  // Fifty collisions against 32^6 means something is very wrong; fail loudly
  // rather than hand back a duplicate that would sign two people into one account.
  throw new Error('Could not generate a unique invite code');
}

/** Forgiving input: people type spaces, hyphens and lowercase. */
export function normaliseCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('');
}

/**
 * 'MW7K2Q' -> 'MW7-K2Q'. Display only — never store the formatted form.
 *
 * Nothing is shown for a client whose code the server has not written yet.
 * That state is meant to be brief and is handled properly by the fallback in
 * sync/policy.ts; this is only here so a missing code can never be the reason
 * a screen goes down.
 */
export function formatInviteCode(code: string | undefined): string {
  if (!code) return '';
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

export type WorkoutStatus = 'scheduled' | 'inProgress' | 'completed';

export interface SetEntry {
  id: string;
  /** What the trainer prescribed while building. */
  targetWeight: number;
  targetReps: number;
  /** What actually happened. Undefined until the trainer logs it. */
  loggedWeight?: number;
  loggedReps?: number;
}

export interface ExerciseEntry {
  id: string;
  movementName: string;
  sets: SetEntry[];
}

export interface Workout {
  id: string;
  clientId: string;
  name: string;
  /** ISO timestamp. */
  date: string;
  exercises: ExerciseEntry[];
  coachNote: string;
  status: WorkoutStatus;
  /**
   * Who may write logged values. A trainer-led session is logged from the
   * trainer's live screen and is read-only to the client; a solo session the
   * client repeated on their own is the other way round. Required, not
   * optional — a workout nobody owns is how the invite bug happened.
   */
  loggedBy: 'trainer' | 'client';
  /**
   * When the first set was logged. The elapsed clock is derived from this
   * rather than counted from mount, so leaving a session and coming back does
   * not restart it — that used to record a 40-minute session as one minute.
   */
  startedAt?: string;
  /** Which trainer-defined day type this session belongs to. */
  dayTypeId?: string;
  durationMinutes?: number;
  /**
   * When the trainer tapped "Assign". The signal that the client has something
   * new waiting. Optional, so snapshots written before it existed still load.
   */
  assignedAt?: string;
  /** When the client acknowledged it, which clears the "new session" card. */
  seenByClientAt?: string;
}

/**
 * A trainer-defined kind of training day. Every trainer splits their week
 * differently, so the name, the short label the calendar can fit, and the
 * colour are all theirs to set.
 */
export interface DayType {
  id: string;
  name: string;
  /** What fits in a calendar cell — kept to DAY_LABEL_MAX characters. */
  shortLabel: string;
  /** Index into the palette's tagColors, so the hue resolves per theme. */
  colorIndex: number;
}

/** A calendar cell is ~45pt wide; longer labels are truncated on entry. */
export const DAY_LABEL_MAX = 6;

/**
 * A movement the trainer wrote themselves. Shared with their clients exactly
 * like the built-in catalogue entries.
 */
export interface CustomMovement {
  id: string;
  name: string;
  description: string;
  cues: string[];
  muscles: string[];
  /** This phone's own copies, from the photo picker. Never uploaded. */
  photoUris: string[];
  /**
   * The same photos in Cloud Storage, by object name, which is how a client
   * ever sees one. A name appears here only once its upload has succeeded, so
   * this doubles as the record of what is still to send — the local photos
   * whose name is not in here — and a client is never pointed at an object
   * that is not there.
   */
  photos?: string[];
}

export interface Client {
  id: string;
  name: string;
  email: string;
  /** Per client, so a mixed roster reads in each person's own unit. */
  unit: WeightUnit;
  blockName: string;
  blockWeek: number;
  blockLength: number;
  adherence: number;
  sessionsCompleted: number;
  /** What the trainer reads out to get this person into the app. */
  inviteCode: string;
  /** False until they redeem it, so the roster can show who is still pending. */
  inviteAccepted: boolean;
}

export interface PersonalRecord {
  movementName: string;
  weight: number;
  reps: number;
  date: string;
  previousWeight?: number;
}

// MARK: - Derived helpers

export const isSolo = (workout: Workout) => workout.loggedBy === 'client';

export const isLogged = (set: SetEntry) => set.loggedWeight !== undefined;

export const exerciseIsComplete = (exercise: ExerciseEntry) =>
  exercise.sets.length > 0 && exercise.sets.every(isLogged);

export const loggedCount = (exercise: ExerciseEntry) =>
  exercise.sets.filter(isLogged).length;

/** "3 × 8" when every set matches, otherwise just the count. */
export function schemeSummary(exercise: ExerciseEntry): string {
  const first = exercise.sets[0];
  if (!first) return 'No sets';
  const sameReps = exercise.sets.every((s) => s.targetReps === first.targetReps);
  return sameReps ? `${exercise.sets.length} × ${first.targetReps}` : `${exercise.sets.length} sets`;
}

export const topTargetWeight = (exercise: ExerciseEntry) =>
  exercise.sets.reduce((best, s) => Math.max(best, s.targetWeight), 0);

export function topLoggedWeight(exercise: ExerciseEntry): number | undefined {
  const logged = exercise.sets.map((s) => s.loggedWeight).filter((w): w is number => w !== undefined);
  return logged.length ? Math.max(...logged) : undefined;
}

export const totalSets = (workout: Workout) =>
  workout.exercises.reduce((total, e) => total + e.sets.length, 0);

export const loggedSets = (workout: Workout) =>
  workout.exercises.reduce((total, e) => total + loggedCount(e), 0);

export const completedExercises = (workout: Workout) =>
  workout.exercises.filter(exerciseIsComplete).length;

export function workoutProgress(workout: Workout): number {
  const total = totalSets(workout);
  return total === 0 ? 0 : loggedSets(workout) / total;
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    // Array.from walks whole characters: part[0] is half of an emoji.
    .map((part) => Array.from(part)[0] ?? '')
    .join('')
    .toUpperCase();
}

let counter = 0;
export function makeId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
