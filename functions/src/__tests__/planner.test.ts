import type { Client, Workout } from '../../../src/models';
import { weekStreak } from '../../../src/rewards';
import { daysBetween, formatTime, wallClock, weekStreakIn } from '../localTime';
import {
  DEFAULT_PREFS,
  type Recipient,
  type TrainerContext,
  assignedMessage,
  finishedMessage,
  planScheduled,
  recordsSet,
} from '../planner';

/**
 * Timing rules, tested with fixed clocks. September 2026: the 11th is a
 * Friday, the 13th a Sunday, the 14th a Monday.
 */

const NY = 'America/New_York';

let seq = 0;
const workout = (over: Partial<Workout> = {}): Workout => ({
  id: `w-${(seq += 1)}`,
  clientId: 'c-marcus',
  name: 'Push Day A',
  date: '2026-09-11T22:00:00.000Z',
  exercises: [
    {
      id: 'ex',
      movementName: 'Barbell Bench Press',
      sets: [
        { id: 's1', targetWeight: 80, targetReps: 8 },
        { id: 's2', targetWeight: 80, targetReps: 8 },
      ],
    },
  ],
  coachNote: '',
  status: 'scheduled',
  loggedBy: 'trainer',
  ...over,
});

const done = (date: string, weight = 80, over: Partial<Workout> = {}): Workout =>
  workout({
    date,
    status: 'completed',
    exercises: [
      {
        id: 'ex',
        movementName: 'Barbell Bench Press',
        sets: [{ id: 's1', targetWeight: weight, targetReps: 8, loggedWeight: weight, loggedReps: 8 }],
      },
    ],
    ...over,
  });

const client = (over: Partial<Client> = {}): Client => ({
  id: 'c-marcus',
  name: 'Marcus Webb',
  email: 'marcus@example.com',
  unit: 'kg',
  blockName: 'Hypertrophy',
  blockWeek: 4,
  blockLength: 6,
  adherence: 92,
  sessionsCompleted: 0,
  inviteCode: 'MW7K2Q',
  inviteAccepted: true,
  ...over,
});

const person = (uid: string, over: Partial<Recipient> = {}): Recipient => ({
  uid,
  timeZone: NY,
  prefs: DEFAULT_PREFS,
  ...over,
});

const coach = (clients: TrainerContext['clients'], account = person('u-ryan')): TrainerContext => ({
  name: 'Ryan Armour',
  account,
  clients,
});

/** 7:05 AM in New York on the given September day (EDT, UTC-4). */
const nyMorning = (day: number, hour = 7) =>
  new Date(Date.UTC(2026, 8, day, hour + 4, 5));

describe('local time', () => {
  it('reads the clock in the recipient’s zone, not the server’s', () => {
    const instant = new Date('2026-09-13T21:05:00Z');
    expect(wallClock(instant, NY)).toEqual({ date: '2026-09-13', hour: 17, minute: 5, weekday: 6 });
    expect(wallClock(instant, 'Asia/Tokyo')).toEqual({ date: '2026-09-14', hour: 6, minute: 5, weekday: 0 });
  });

  it('counts calendar days across a clock change', () => {
    expect(daysBetween('2026-10-31', '2026-11-07')).toBe(7);
  });

  it('writes times the way a phone would', () => {
    expect(formatTime('2026-09-11T22:00:00.000Z', NY)).toBe('6:00 PM');
  });

  it('counts the streak exactly like the app does', () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date('2026-09-16T12:00:00Z');
    const cases = [
      [],
      ['2026-09-15T12:00:00Z'],
      ['2026-09-08T12:00:00Z', '2026-09-01T12:00:00Z'],
      ['2026-09-15T12:00:00Z', '2026-09-08T12:00:00Z', '2026-08-25T12:00:00Z'],
      ['2026-09-22T12:00:00Z'],
    ];
    for (const dates of cases) {
      expect(weekStreakIn(dates, now, zone)).toEqual(weekStreak(dates, now));
    }
  });

  it('puts a late session in the week it was in for that person', () => {
    // 10 PM Sunday in New York is already Monday in London.
    const sundayNight = ['2026-09-14T02:00:00Z', '2026-09-02T12:00:00Z'];
    const mondayNoon = new Date('2026-09-14T16:00:00Z');
    expect(weekStreakIn(sundayNight, mondayNoon, NY)).toEqual({ weeks: 2, atRisk: true });
    expect(weekStreakIn(sundayNight, mondayNoon, 'Europe/London').atRisk).toBe(false);
  });
});

describe('workout reminders', () => {
  const today = workout({ date: '2026-09-11T22:00:00.000Z' });
  const trainer = coach([{ client: client(), account: person('u-marcus'), workouts: [today] }]);

  it('reminds the client at 7 AM on a day with a session', () => {
    const [message] = planScheduled(nyMorning(11), trainer ? [trainer] : []).filter((m) => m.kind === 'reminder');
    expect(message).toMatchObject({
      uid: 'u-marcus',
      title: 'Push Day A today',
      body: '6:00 PM with Ryan. 1 exercise, 2 sets.',
      dedupeKey: 'reminder:2026-09-11',
    });
  });

  it('gives the coach the day at a glance', () => {
    const many = coach(
      ['Marcus Webb', 'Priya Nair', 'Dana Cole', 'Leo Park'].map((name, i) => ({
        client: client({ id: `c-${i}`, name }),
        account: person(`u-${i}`),
        workouts: [workout({ clientId: `c-${i}`, date: `2026-09-11T2${i}:00:00.000Z` })],
      }))
    );
    const [message] = planScheduled(nyMorning(11), [many]).filter((m) => m.kind === 'schedule');
    expect(message.title).toBe('4 sessions today');
    expect(message.body).toBe('Marcus 4:00 PM, Priya 5:00 PM, Dana 6:00 PM, and 1 more.');
  });

  it('stays quiet at any other hour, on a day without a session, or when switched off', () => {
    expect(planScheduled(nyMorning(11, 8), [trainer])).toEqual([]);
    expect(planScheduled(nyMorning(12), [trainer]).filter((m) => m.kind === 'reminder')).toEqual([]);
    const off = coach([
      { client: client(), account: person('u-marcus', { prefs: { ...DEFAULT_PREFS, reminders: false } }), workouts: [today] },
    ]);
    expect(planScheduled(nyMorning(11), [off]).filter((m) => m.kind === 'reminder')).toEqual([]);
  });

  it('gives a second run in the same hour the same key, so it is never sent twice', () => {
    const first = planScheduled(nyMorning(11), [trainer]);
    const again = planScheduled(new Date(nyMorning(11).getTime() + 15 * 60_000), [trainer]);
    expect(again.map((m) => m.dedupeKey)).toEqual(first.map((m) => m.dedupeKey));
  });

  it('never reminds a client who has not joined yet', () => {
    const pending = coach([{ client: client(), workouts: [today] }]);
    expect(planScheduled(nyMorning(11), [pending]).filter((m) => m.uid === 'u-marcus')).toEqual([]);
  });
});

describe('streak and motivation', () => {
  const sundayFivePm = new Date('2026-09-13T21:10:00Z');

  it('warns on Sunday evening when a streak of two weeks or more would break', () => {
    const history = [done('2026-09-02T12:00:00Z'), done('2026-08-26T12:00:00Z')];
    const trainer = coach([{ client: client(), account: person('u-marcus'), workouts: history }]);
    const [message] = planScheduled(sundayFivePm, [trainer]).filter((m) => m.kind === 'streak');
    expect(message).toMatchObject({ title: 'Your 2-week streak ends tonight', capKey: 'cap:2026-09-13' });
  });

  it('says nothing when this week already counts, or the streak is only a week', () => {
    const safe = [done('2026-09-10T12:00:00Z'), done('2026-09-02T12:00:00Z')];
    const short = [done('2026-09-02T12:00:00Z')];
    for (const workouts of [safe, short]) {
      const trainer = coach([{ client: client(), account: person('u-marcus'), workouts }]);
      expect(planScheduled(sundayFivePm, [trainer]).filter((m) => m.kind === 'streak')).toEqual([]);
    }
  });

  it('tells the coach on the day a client reaches a week without training, then weekly', () => {
    const lastSession = done('2026-09-04T14:00:00Z', 80, { name: 'Lower Body B' });
    const trainer = coach([{ client: client({ name: 'Priya Nair' }), account: person('u-priya'), workouts: [lastSession] }]);
    const at = (day: number) => planScheduled(nyMorning(day, 9), [trainer]).filter((m) => m.kind === 'inactive');

    expect(at(10)).toEqual([]);
    expect(at(11)[0]).toMatchObject({
      title: "Priya hasn't trained in 7 days",
      body: 'The last session was Lower Body B on Fri, Sep 4.',
    });
    expect(at(12)).toEqual([]);
    expect(at(18)[0].title).toBe("Priya hasn't trained in 14 days");
  });
});

describe('weekly recap', () => {
  const mondayEight = nyMorning(14, 8);

  it('sums up last week for the client, records included', () => {
    const history = [
      done('2026-08-31T12:00:00Z', 80),
      done('2026-09-08T12:00:00Z', 85),
      done('2026-09-10T12:00:00Z', 82.5),
    ];
    const trainer = coach([{ client: client(), account: person('u-marcus'), workouts: history }]);
    const [message] = planScheduled(mondayEight, [trainer]).filter((m) => m.uid === 'u-marcus');
    expect(message).toMatchObject({
      kind: 'recap',
      title: 'Your week: 2 sessions, 2 sets',
      body: '1 new record, and your streak is 2 weeks.',
      dedupeKey: 'recap:2026-09-07',
    });
  });

  it('tells the coach who trained and who did not', () => {
    const trainer = coach([
      { client: client(), account: person('u-marcus'), workouts: [done('2026-09-09T12:00:00Z')] },
      { client: client({ id: 'c-priya', name: 'Priya Nair' }), account: person('u-priya'), workouts: [] },
    ]);
    const [message] = planScheduled(mondayEight, [trainer]).filter((m) => m.uid === 'u-ryan');
    expect(message).toMatchObject({ title: 'Last week: 1 session coached', body: "0 new client records. Priya didn't train." });
  });

  it('skips a client with nothing to recap', () => {
    const trainer = coach([{ client: client(), account: person('u-marcus'), workouts: [] }]);
    expect(planScheduled(mondayEight, [trainer]).filter((m) => m.uid === 'u-marcus')).toEqual([]);
  });
});

describe('instant alerts', () => {
  it('tells the client about a new session, but not in the middle of the night', () => {
    const sent = workout({ name: 'Lower Body B', date: '2026-09-13T22:00:00.000Z' });
    const input = { recipient: person('u-marcus'), workout: sent, trainerName: 'Ryan Armour' };

    expect(assignedMessage({ ...input, now: nyMorning(11, 10) })).toMatchObject({
      title: 'New workout from Ryan',
      body: 'Lower Body B, Sun, Sep 13. Tap to see it.',
    });
    expect(assignedMessage({ ...input, now: nyMorning(12, 10) })?.body).toBe('Lower Body B, tomorrow. Tap to see it.');
    expect(assignedMessage({ ...input, now: nyMorning(11, 22) })).toBeNull();
  });

  it('tells the coach what a client did on their own, in the client’s unit', () => {
    const earlier = done('2026-09-04T12:00:00Z', 85);
    const session = { ...done('2026-09-11T12:00:00Z', 90), durationMinutes: 52 };
    const records = recordsSet(session, [earlier]);
    const message = finishedMessage({
      recipient: person('u-ryan'),
      clientName: 'Marcus Webb',
      workout: session,
      records,
      unit: 'kg',
      now: nyMorning(11, 10),
    });
    expect(message).toMatchObject({
      title: 'Marcus finished Push Day A',
      body: '1 set in 52 minutes, and a new Barbell Bench Press record: 90 kg.',
      route: `/(trainer)/clients/session/${session.id}`,
    });
  });

  it('does not count a first attempt at a movement as a record', () => {
    expect(recordsSet(done('2026-09-11T12:00:00Z', 90), [])).toEqual([]);
  });
});
