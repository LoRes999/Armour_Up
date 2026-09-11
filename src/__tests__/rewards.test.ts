import { ExerciseEntry, PersonalRecord, Workout, toCanonical } from '../models';
import {
  HEADLINES,
  MILESTONES,
  milestoneHeadline,
  ordinal,
  relativeDay,
  sessionReward,
  weekStreak,
} from '../rewards';

/** Noon local time, so no test depends on the machine's time zone. */
const on = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12);

// Thursday 10 September 2026. Its week began on Monday the 7th.
const THURSDAY = at(2026, 9, 10);

describe('weekStreak', () => {
  it('is zero with no history', () => {
    expect(weekStreak([], THURSDAY)).toEqual({ weeks: 0, atRisk: false });
  });

  it('counts a session this week as one week', () => {
    expect(weekStreak([on(2026, 9, 8)], THURSDAY)).toEqual({ weeks: 1, atRisk: false });
  });

  it('counts consecutive weeks', () => {
    const dates = [on(2026, 9, 8), on(2026, 9, 2), on(2026, 8, 26)];
    expect(weekStreak(dates, THURSDAY).weeks).toBe(3);
  });

  it('counts three sessions in one week once', () => {
    const dates = [on(2026, 9, 7), on(2026, 9, 8), on(2026, 9, 9)];
    expect(weekStreak(dates, THURSDAY).weeks).toBe(1);
  });

  it('breaks at a whole week with no session', () => {
    // This week, last week, then nothing the week before.
    const dates = [on(2026, 9, 8), on(2026, 9, 1), on(2026, 8, 18)];
    expect(weekStreak(dates, THURSDAY).weeks).toBe(2);
  });

  // The rule the whole design rests on. Rest days are part of the programme,
  // so an untrained Tuesday must not wipe out a month of showing up.
  it('does not break during the current week — it puts the streak at risk', () => {
    const dates = [on(2026, 9, 3), on(2026, 8, 27)];
    expect(weekStreak(dates, THURSDAY)).toEqual({ weeks: 2, atRisk: true });
  });

  it('is gone once a full week passes with nothing', () => {
    expect(weekStreak([on(2026, 8, 27)], THURSDAY)).toEqual({ weeks: 0, atRisk: false });
  });

  it('puts Sunday in the old week and Monday in the new one', () => {
    const monday = at(2026, 9, 7);
    expect(weekStreak([on(2026, 9, 6)], monday)).toEqual({ weeks: 1, atRisk: true });
    expect(weekStreak([on(2026, 9, 7)], monday)).toEqual({ weeks: 1, atRisk: false });
  });

  it('ignores a session dated in a future week', () => {
    expect(weekStreak([on(2026, 9, 21)], THURSDAY).weeks).toBe(0);
  });

  // Stepping back seven days across a clock change is 167 or 169 hours. A
  // millisecond key would miss the week on the other side and snap the streak.
  it('survives a daylight-saving change', () => {
    const thursdays: string[] = [];
    for (let week = 0; week < 13; week += 1) thursdays.push(on(2026, 9, 3 + week * 7));
    expect(weekStreak(thursdays, at(2026, 11, 26)).weeks).toBe(13);
  });

  it('skips a date it cannot read', () => {
    expect(weekStreak(['not a date', on(2026, 9, 8)], THURSDAY).weeks).toBe(1);
  });
});

// MARK: - sessionReward

const exercise = (movementName: string, logged: (number | undefined)[]): ExerciseEntry => ({
  id: `ex-${movementName}`,
  movementName,
  sets: logged.map((weight, index) => ({
    id: `set-${index}`,
    targetWeight: weight ?? 60,
    targetReps: 5,
    loggedWeight: weight,
    loggedReps: weight === undefined ? undefined : 5,
  })),
});

const workout = (exercises: ExerciseEntry[]): Workout => ({
  id: 'w',
  clientId: 'c',
  name: 'Push A',
  date: THURSDAY.toISOString(),
  exercises,
  coachNote: '',
  status: 'inProgress',
  loggedBy: 'client',
});

const record = (movementName: string, weight: number): PersonalRecord => ({
  movementName,
  weight,
  reps: 5,
  date: on(2026, 9, 1),
});

const reward = (overrides: Partial<Parameters<typeof sessionReward>[0]> = {}) =>
  sessionReward({
    workout: workout([exercise('Bench Press', [80])]),
    priorRecords: [],
    priorCompletedDates: [on(2026, 9, 1), on(2026, 8, 25)],
    minutes: 42,
    now: THURSDAY,
    random: () => 0,
    ...overrides,
  });

describe('sessionReward', () => {
  // The solo header flag can finish a session with nothing logged.
  it('has nothing to celebrate when no sets were logged', () => {
    expect(reward({ workout: workout([exercise('Bench Press', [undefined, undefined])]) })).toBeNull();
  });

  it('reports sets and minutes', () => {
    const result = reward({ workout: workout([exercise('Bench Press', [80, 80, undefined])]) });
    expect(result?.sets).toBe(2);
    expect(result?.minutes).toBe(42);
  });

  it('counts beating an earlier record as a PR', () => {
    const result = reward({
      workout: workout([exercise('Bench Press', [80, 85])]),
      priorRecords: [record('Bench Press', 80)],
    });
    expect(result?.tier).toBe('pr');
    expect(result?.prs).toEqual([{ movementName: 'Bench Press', weight: 85, previousWeight: 80 }]);
  });

  // Otherwise every first session is a gold PR day with four records, and the
  // tier stops meaning anything.
  it('does not count a first-ever lift as a PR', () => {
    const result = reward({ workout: workout([exercise('Deadlift', [140])]), priorRecords: [] });
    expect(result?.prs).toEqual([]);
    expect(result?.tier).toBe('standard');
  });

  it('does not count a tie as a PR', () => {
    const result = reward({
      workout: workout([exercise('Bench Press', [80])]),
      priorRecords: [record('Bench Press', 80)],
    });
    expect(result?.prs).toEqual([]);
  });

  it('keeps a tie a tie for weights entered in pounds', () => {
    const stored = toCanonical(225, 'lb');
    const result = reward({
      workout: workout([exercise('Back Squat', [toCanonical(225, 'lb')])]),
      priorRecords: [record('Back Squat', stored)],
    });
    expect(result?.prs).toEqual([]);
  });

  it('takes the heaviest block when a movement is programmed twice', () => {
    const result = reward({
      workout: workout([exercise('Bench Press', [70]), exercise('Bench Press', [90])]),
      priorRecords: [record('Bench Press', 85)],
    });
    expect(result?.prs).toEqual([{ movementName: 'Bench Press', weight: 90, previousWeight: 85 }]);
  });

  it('marks the first session as a milestone', () => {
    const result = reward({ priorCompletedDates: [] });
    expect(result?.tier).toBe('milestone');
    expect(result?.milestone).toBe(1);
    expect(result?.headline).toBe(milestoneHeadline(1));
  });

  it('marks the fifth session, and still lists the PRs set in it', () => {
    const four = [on(2026, 9, 1), on(2026, 8, 25), on(2026, 8, 18), on(2026, 8, 11)];
    const result = reward({
      workout: workout([exercise('Bench Press', [90])]),
      priorRecords: [record('Bench Press', 85)],
      priorCompletedDates: four,
    });
    expect(result?.tier).toBe('milestone');
    expect(result?.milestone).toBe(5);
    expect(result?.prs).toHaveLength(1);
  });

  it('is an ordinary finish between milestones', () => {
    expect(reward({ priorCompletedDates: [on(2026, 9, 1), on(2026, 8, 25)] })?.milestone).toBeUndefined();
  });

  it('counts this session in the streak', () => {
    // Last two weeks trained, and now this week too.
    expect(reward()?.streak).toBe(3);
  });

  it('counts the session now even when the trainer dated it later in the week', () => {
    const later = { ...workout([exercise('Bench Press', [80])]), date: on(2026, 9, 25) };
    expect(reward({ workout: later, priorCompletedDates: [] })?.streak).toBe(1);
  });

  it('draws the headline from the pool for its tier', () => {
    expect(reward({ random: () => 0 })?.headline).toBe(HEADLINES.standard[0]);
    expect(reward({ random: () => 0.9999 })?.headline).toBe(
      HEADLINES.standard[HEADLINES.standard.length - 1]
    );
    const pr = reward({
      workout: workout([exercise('Bench Press', [90])]),
      priorRecords: [record('Bench Press', 85)],
      random: () => 0,
    });
    expect(pr?.headline).toBe(HEADLINES.pr[0]);
  });

  it('starts its milestones at the first session', () => {
    expect(MILESTONES[0]).toBe(1);
  });
});

describe('formatting', () => {
  it('writes ordinals, including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 25, 101, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '25th',
      '101st',
      '111th',
    ]);
  });

  it('names nearby days plainly', () => {
    expect(relativeDay(on(2026, 9, 10), THURSDAY)).toBe('Today');
    expect(relativeDay(on(2026, 9, 11), THURSDAY)).toBe('Tomorrow');
    expect(relativeDay(on(2026, 9, 14), THURSDAY)).toBe(
      at(2026, 9, 14).toLocaleDateString(undefined, { weekday: 'long' })
    );
  });
});
