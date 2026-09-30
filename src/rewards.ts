import { PersonalRecord, Workout, loggedSets, topLoggedWeight } from './models';

/**
 * What a finished session earned, and how long someone has kept showing up.
 *
 * Pure functions over data the store already holds, so every rule here is
 * tested without rendering anything. The screens decide *when* to celebrate;
 * this decides *what* there is to celebrate.
 */

/** Session counts worth their own badge. Front-loaded, because early wins are what form a habit. */
export const MILESTONES = [1, 5, 10, 25, 50, 100, 250];

// MARK: - Weekly streak

/** Local midnight on the Monday of that week — the calendar is Monday-first too. */
export function mondayOf(input: Date): Date {
  const day = new Date(input.getFullYear(), input.getMonth(), input.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

/**
 * Keyed by calendar date rather than by timestamp. Stepping back a week across
 * a daylight-saving change is 167 or 169 hours, not 168, and a millisecond key
 * would silently miss the week on the other side of it.
 */
const weekKey = (monday: Date) =>
  `${monday.getFullYear()}-${monday.getMonth()}-${monday.getDate()}`;

export interface Streak {
  /** Consecutive weeks with at least one completed session. */
  weeks: number;
  /**
   * There is a streak, but nothing has been done yet this week. This is the
   * line that brings people back: something to lose, not just something won.
   */
  atRisk: boolean;
}

/**
 * Weekly, not daily. Strength training needs rest days, and a daily streak
 * punishes exactly the recovery a coach is programming. Only a whole
 * Monday-to-Sunday week without a session breaks this one.
 *
 * The current week never breaks it: on a Tuesday with nothing logged yet, the
 * streak through last week still stands — it is merely at risk.
 */
export function weekStreak(completedDates: readonly string[], now: Date): Streak {
  const current = mondayOf(now);
  const trained = new Set<string>();

  for (const iso of completedDates) {
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) continue;
    const monday = mondayOf(when);
    // A session dated in a future week has not happened yet.
    if (monday.getTime() <= current.getTime()) trained.add(weekKey(monday));
  }

  const cursor = new Date(current);
  const thisWeek = trained.has(weekKey(cursor));
  if (!thisWeek) cursor.setDate(cursor.getDate() - 7);

  let weeks = 0;
  while (trained.has(weekKey(cursor))) {
    weeks += 1;
    cursor.setDate(cursor.getDate() - 7);
  }

  return { weeks, atRisk: !thisWeek && weeks > 0 };
}

// MARK: - What a session earned

export type RewardTier = 'standard' | 'pr' | 'milestone';

export interface RecordBroken {
  movementName: string;
  /** Canonical kg, like every other stored weight. */
  weight: number;
  previousWeight: number;
}

export interface SessionReward {
  tier: RewardTier;
  sets: number;
  minutes: number;
  prs: RecordBroken[];
  /** The session count just reached, when it is one of MILESTONES. */
  milestone?: number;
  /** Weeks in a row, including this session. */
  streak: number;
  headline: string;
}

/**
 * A handful of lines per tier, picked at random. The same words every time is
 * the fastest way for a reward to stop registering at all.
 */
export const HEADLINES = {
  standard: [
    'Strong work.',
    'Another one banked.',
    'That one counts.',
    'In the books.',
    'Done and dusted.',
    'Showing up is the whole game.',
  ],
  pr: [
    'New personal best.',
    'Heavier than ever.',
    'You just raised the ceiling.',
    'Record broken.',
  ],
} as const;

export function milestoneHeadline(count: number): string {
  if (count === 1) return 'Your first session is done.';
  return `${count} sessions strong.`;
}

/**
 * The same moment in the trainer's voice. The lines above talk to the person
 * who lifted — "Your first session is done." — which read wrongly on the
 * trainer's card about somebody else. The standard pool is neutral, so it is
 * kept as it is.
 */
export function trainerHeadline(reward: SessionReward, clientFirstName: string): string {
  if (reward.tier === 'milestone' && reward.milestone !== undefined) {
    return reward.milestone === 1
      ? `${clientFirstName}'s first session is in the books.`
      : `${clientFirstName}'s ${ordinal(reward.milestone)} session.`;
  }
  if (reward.tier === 'pr') {
    return reward.prs.length > 1
      ? `${reward.prs.length} new records for ${clientFirstName}.`
      : `A new record for ${clientFirstName}.`;
  }
  return reward.headline;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/**
 * Everything the celebration needs, computed from the state *before* the
 * session is marked finished. finishWorkout writes through setState, so at the
 * moment a finish button runs the store still holds the old records — which is
 * exactly the "before" that "was 85, now 90" needs.
 *
 * Returns null when nothing was logged. The solo header flag can finish an empty
 * session, and confetti for that would be absurd.
 */
/**
 * Whether a finished session set this movement's record — the "NEW PR" badge.
 * The same rule as the finish celebration: the record has to have been set in
 * this session, and it has to have beaten an earlier best. A first-ever lift
 * sets a record but beats nothing, so it is not a PR.
 */
export function setsNewRecord(
  record: PersonalRecord | undefined,
  workoutDate: string,
  topWeight: number | undefined
): boolean {
  return (
    record !== undefined &&
    topWeight !== undefined &&
    record.previousWeight !== undefined &&
    record.date === workoutDate &&
    topWeight >= record.weight
  );
}

export function sessionReward(input: {
  workout: Workout;
  priorRecords: readonly PersonalRecord[];
  priorCompletedDates: readonly string[];
  minutes: number;
  now: Date;
  /** Injectable so tests are deterministic. */
  random?: () => number;
}): SessionReward | null {
  const { workout, priorRecords, priorCompletedDates, minutes, now } = input;
  const random = input.random ?? Math.random;

  const sets = loggedSets(workout);
  if (sets === 0) return null;

  // The heaviest set of each movement, across every block of it in the session.
  const tops = new Map<string, number>();
  for (const exercise of workout.exercises) {
    const top = topLoggedWeight(exercise);
    if (top === undefined) continue;
    tops.set(exercise.movementName, Math.max(tops.get(exercise.movementName) ?? 0, top));
  }

  // A record has to be *beaten*. A first-ever lift is not a PR here: counting it
  // would make every first session a gold "PR day" with four records, and the
  // tier would stop meaning anything. The first session gets a milestone instead.
  const previous = new Map(priorRecords.map((record) => [record.movementName, record.weight]));
  const prs: RecordBroken[] = [];
  tops.forEach((weight, movementName) => {
    const before = previous.get(movementName);
    // Strictly heavier, as personalRecords is. The epsilon is for pounds stored
    // as kilograms: 225 lb round-trips to a float, and a tie must stay a tie.
    if (before !== undefined && weight > before + 1e-9) {
      prs.push({ movementName, weight, previousWeight: before });
    }
  });

  const count = priorCompletedDates.length + 1;
  const milestone = MILESTONES.includes(count) ? count : undefined;

  // The session is being finished now, whatever day it was planned for: a
  // missed one logged late counts this week, as the store's streak counts it
  // (trainedAt), and so does one dated later in the week.
  const streak = weekStreak([...priorCompletedDates, now.toISOString()], now).weeks;

  const tier: RewardTier = milestone !== undefined ? 'milestone' : prs.length > 0 ? 'pr' : 'standard';
  const pool = tier === 'pr' ? HEADLINES.pr : HEADLINES.standard;
  const headline =
    tier === 'milestone'
      ? milestoneHeadline(count)
      : pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];

  return { tier, sets, minutes, prs, milestone, streak, headline };
}

// MARK: - Formatting

/** "Today", "Tomorrow", "Thursday", or a short date once it is more than a week out. */
export function relativeDay(iso: string, now: Date): string {
  const when = new Date(iso);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const offset = Math.round((midnight(when) - midnight(now)) / 86_400_000);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset > 1 && offset < 7) return when.toLocaleDateString(undefined, { weekday: 'long' });
  return when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
