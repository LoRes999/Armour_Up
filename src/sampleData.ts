import {
  Client,
  DayType,
  ExerciseEntry,
  SetEntry,
  WeightUnit,
  Workout,
  makeId,
  toCanonical,
} from './models';

/**
 * The one trainer this build knows about. There is no trainer entity yet, so
 * every screen that greets a coach by name reads this rather than a literal.
 */
export const TRAINER_NAME = 'Ryan Armour';

/**
 * Sample data only. Every name, weight and date here is invented — delete this
 * file when a real backend arrives.
 */

function daysAgo(days: number, hour = 18): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const daysAhead = (days: number, hour = 18) => daysAgo(-days, hour);

/** Barbell loads move in 2.5 kg jumps; keep generated numbers plausible. */
const round25 = (value: number) => Math.round(value / 2.5) * 2.5;

/**
 * The store is canonical kilograms, but this file reads better if each client's
 * numbers are written in the unit that client actually trains in. The two lb
 * clients pass 'lb' and their literals below stay pound loads.
 */
function planned(
  name: string,
  weight: number,
  reps: number,
  sets: number,
  unit: WeightUnit = 'kg'
): ExerciseEntry {
  return {
    id: makeId('ex'),
    movementName: name,
    sets: Array.from({ length: sets }, () => ({
      id: makeId('set'),
      targetWeight: toCanonical(weight, unit),
      targetReps: reps,
    })),
  };
}

function logged(
  name: string,
  weights: number[],
  reps: number[],
  unit: WeightUnit = 'kg'
): ExerciseEntry {
  const sets: SetEntry[] = weights.map((weight, index) => ({
    id: makeId('set'),
    targetWeight: toCanonical(weight, unit),
    targetReps: reps[index],
    loggedWeight: toCanonical(weight, unit),
    loggedReps: reps[index],
  }));
  return { id: makeId('ex'), movementName: name, sets };
}

export const MOVEMENT_CATALOGUE = [
  'Barbell Bench Press',
  'Incline DB Press',
  'Cable Lateral Raise',
  'Overhead Triceps Ext.',
  'Back Squat',
  'Romanian Deadlift',
  'Leg Press',
  'Deadlift',
  'Barbell Row',
  'Lat Pulldown',
  'DB Curl',
  'Overhead Press',
];

/**
 * A starter split. Trainers rename, recolour and delete these — nothing here
 * assumes a push/pull system beyond giving the calendar something to show.
 */
export const SEED_DAY_TYPES: DayType[] = [
  { id: 'day-push', name: 'Push Day', shortLabel: 'PUSH', colorIndex: 0 },
  { id: 'day-pull', name: 'Pull Day', shortLabel: 'PULL', colorIndex: 3 },
  { id: 'day-lower', name: 'Lower Body', shortLabel: 'LOWER', colorIndex: 2 },
  { id: 'day-upper', name: 'Upper Body', shortLabel: 'UPPER', colorIndex: 4 },
  { id: 'day-full', name: 'Full Body', shortLabel: 'FULL', colorIndex: 6 },
  { id: 'day-deload', name: 'Deload', shortLabel: 'DELOAD', colorIndex: 1 },
];

/** Matches the sample workout names onto the seeded types. */
function dayTypeForName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.startsWith('deload')) return 'day-deload';
  if (lower.includes('push')) return 'day-push';
  if (lower.includes('pull')) return 'day-pull';
  if (lower.includes('lower')) return 'day-lower';
  if (lower.includes('upper')) return 'day-upper';
  if (lower.includes('full body')) return 'day-full';
  return undefined;
}

export function buildSeed(): { clients: Client[]; workouts: Workout[]; dayTypes: DayType[] } {
  const marcus: Client = {
    id: 'client-marcus',
    name: 'Marcus Webb',
    email: 'marcus@example.com',
    unit: 'kg',
    blockName: 'Hypertrophy',
    blockWeek: 4,
    blockLength: 6,
    adherence: 92,
    sessionsCompleted: 38,
    inviteCode: 'MW7K2Q',
    inviteAccepted: true,
  };
  const priya: Client = {
    id: 'client-priya',
    name: 'Priya Nair',
    email: 'priya@example.com',
    unit: 'kg',
    blockName: 'Strength',
    blockWeek: 2,
    blockLength: 8,
    adherence: 88,
    sessionsCompleted: 24,
    inviteCode: 'PN4XB9',
    inviteAccepted: true,
  };
  const dara: Client = {
    id: 'client-dara',
    name: 'Dara Okonkwo',
    email: 'dara@example.com',
    unit: 'lb',
    blockName: 'Base',
    blockWeek: 1,
    blockLength: 6,
    adherence: 95,
    sessionsCompleted: 12,
    inviteCode: 'DK3TJ7',
    inviteAccepted: true,
  };
  const sofia: Client = {
    id: 'client-sofia',
    name: 'Sofia Lindqvist',
    email: 'sofia@example.com',
    unit: 'lb',
    blockName: 'Deload',
    blockWeek: 6,
    blockLength: 6,
    adherence: 90,
    sessionsCompleted: 51,
    inviteCode: 'SL8FR2',
    inviteAccepted: true,
  };
  const tom: Client = {
    id: 'client-tom',
    name: 'Tom Brennan',
    email: 'tom@example.com',
    unit: 'kg',
    blockName: 'Paused',
    blockWeek: 3,
    blockLength: 6,
    adherence: 54,
    sessionsCompleted: 19,
    inviteCode: 'TB5NC4',
    inviteAccepted: true,
  };
  const amara: Client = {
    id: 'client-amara',
    name: 'Amara Kone',
    email: 'amara@example.com',
    unit: 'kg',
    blockName: 'Full Body',
    blockWeek: 2,
    blockLength: 4,
    adherence: 97,
    sessionsCompleted: 8,
    inviteCode: 'AK9HD6',
    inviteAccepted: true,
  };

  const clients = [marcus, priya, dara, sofia, tom, amara];
  const workouts: Workout[] = [];

  // Everything seeded is trainer-led unless it says otherwise, so the required
  // loggedBy field does not have to be repeated at thirteen call sites.
  // Trainer-led sessions count as sent and already seen: the client's Today
  // shows only what the coach has sent, and a "new from your coach" card on
  // every upcoming session is not the demo anybody expects.
  const sentLongAgo = daysAgo(120);
  const push = (workout: Omit<Workout, 'loggedBy'> & { loggedBy?: Workout['loggedBy'] }) =>
    workouts.push({
      loggedBy: 'trainer',
      ...((workout.loggedBy ?? 'trainer') === 'trainer'
        ? { assignedAt: sentLongAgo, seenByClientAt: sentLongAgo }
        : {}),
      ...workout,
    });

  // 13 weeks of history for Marcus, Mon / Wed / Fri / Sat.
  for (let back = 91; back >= 1; back -= 1) {
    const iso = daysAgo(back);
    const weekday = new Date(iso).getDay(); // 0 Sun .. 6 Sat
    if (![1, 3, 5, 6].includes(weekday)) continue;
    // A missed week, so adherence and the calendar have gaps to show.
    if (back >= 26 && back <= 32 && weekday !== 3) continue;

    const progression = 13 - Math.floor(back / 7);

    if (weekday === 1 || weekday === 5) {
      const top = round25(70 + progression * 1.25);
      push({
        id: makeId('w'),
        clientId: marcus.id,
        name: 'Push Day A',
        date: iso,
        coachNote: 'Solid bench work.',
        status: 'completed',
        durationMinutes: 48,
        exercises: [
          logged('Barbell Bench Press', [top - 5, top - 2.5, top], [8, 6, 6]),
          logged('Incline DB Press', [30, 30, 30], [10, 10, 9]),
          logged('Cable Lateral Raise', [12, 12, 12, 12], [15, 15, 14, 14]),
          logged('Overhead Triceps Ext.', [22.5, 22.5, 22.5], [12, 12, 11]),
        ],
      });
    } else if (weekday === 3) {
      const top = round25(100 + progression * 2);
      push({
        id: makeId('w'),
        clientId: marcus.id,
        name: 'Lower Body B',
        date: iso,
        coachNote: 'Bar speed held on all three.',
        status: 'completed',
        durationMinutes: 52,
        exercises: [
          logged('Back Squat', [top - 20, top - 10, top], [5, 3, 3]),
          logged('Romanian Deadlift', [100, 100, 100], [8, 8, 7]),
          logged('Leg Press', [180, 180, 180, 180], [12, 12, 11, 10]),
        ],
      });
    } else {
      const top = round25(125 + progression * 2.5);
      push({
        id: makeId('w'),
        clientId: marcus.id,
        name: 'Pull Day A',
        date: iso,
        coachNote: '',
        status: 'completed',
        durationMinutes: 55,
        exercises: [
          logged('Deadlift', [top - 25, top - 10, top], [5, 3, 2]),
          logged('Barbell Row', [70, 70, 70], [8, 8, 8]),
          logged('Lat Pulldown', [60, 60, 60], [10, 10, 9]),
          logged('DB Curl', [14, 14, 14], [12, 12, 10]),
        ],
      });
    }
  }

  // One session Marcus ran on his own, so the SOLO badge, the hollow calendar
  // bar and the trainer's tap-through have something to show on first launch.
  push({
    id: 'workout-solo-demo',
    clientId: marcus.id,
    name: 'Push Day A',
    date: daysAgo(5, 7),
    status: 'completed',
    loggedBy: 'client',
    coachNote: '',
    durationMinutes: 34,
    exercises: [
      logged('Barbell Bench Press', [80, 80, 82.5], [8, 8, 6]),
      logged('Incline DB Press', [30, 30, 30], [10, 9, 9]),
      logged('Cable Lateral Raise', [12, 12, 12], [15, 14, 12]),
    ],
  });

  // Today, mid-session: two exercises done, two to go.
  push({
    id: 'workout-today',
    clientId: marcus.id,
    name: 'Push Day A',
    date: daysAgo(0),
    status: 'inProgress',
    coachNote:
      'Keep bench heavy but clean today — we are building to a triple next week. Do not chase the last rep.',
    exercises: [
      logged('Barbell Bench Press', [80, 85, 85], [8, 6, 6]),
      logged('Incline DB Press', [30, 30, 30], [10, 10, 9]),
      planned('Cable Lateral Raise', 12, 15, 4),
      planned('Overhead Triceps Ext.', 22.5, 12, 4),
    ],
  });

  // Marcus, upcoming.
  push({
    id: makeId('w'),
    clientId: marcus.id,
    name: 'Lower Body B',
    date: daysAhead(2),
    status: 'scheduled',
    coachNote: '',
    exercises: [
      planned('Back Squat', 120, 3, 3),
      planned('Romanian Deadlift', 100, 8, 3),
      planned('Leg Press', 180, 12, 4),
    ],
  });
  push({
    id: makeId('w'),
    clientId: marcus.id,
    name: 'Pull Day A',
    date: daysAhead(4, 9),
    status: 'scheduled',
    coachNote: '',
    exercises: [
      planned('Deadlift', 155, 2, 3),
      planned('Barbell Row', 70, 8, 3),
      planned('Lat Pulldown', 60, 10, 3),
    ],
  });

  // Other clients — enough to make the roster filters mean something.
  push({
    id: makeId('w'),
    clientId: priya.id,
    name: 'Lower Body B',
    date: daysAgo(0, 19),
    status: 'scheduled',
    coachNote: '',
    exercises: [planned('Back Squat', 80, 5, 3), planned('Romanian Deadlift', 70, 8, 3)],
  });
  push({
    id: makeId('w'),
    clientId: priya.id,
    name: 'Upper A',
    date: daysAgo(3),
    status: 'completed',
    durationMinutes: 44,
    coachNote: '',
    exercises: [logged('Barbell Bench Press', [45, 47.5, 47.5], [8, 6, 6])],
  });
  push({
    id: makeId('w'),
    clientId: dara.id,
    name: 'Pull Day A',
    date: daysAhead(1),
    status: 'scheduled',
    coachNote: '',
    exercises: [planned('Barbell Row', 135, 8, 3, 'lb')],
  });
  push({
    id: makeId('w'),
    clientId: dara.id,
    name: 'Full Body A',
    date: daysAgo(2),
    status: 'completed',
    durationMinutes: 50,
    coachNote: '',
    exercises: [logged('Overhead Press', [95, 100, 100], [6, 5, 5], 'lb')],
  });
  push({
    id: makeId('w'),
    clientId: sofia.id,
    name: 'Deload Upper',
    date: daysAgo(1),
    status: 'completed',
    durationMinutes: 38,
    coachNote: '',
    exercises: [logged('Barbell Bench Press', [155, 160, 165], [5, 5, 4], 'lb')],
  });
  push({
    id: makeId('w'),
    clientId: amara.id,
    name: 'Full Body C',
    date: daysAhead(3),
    status: 'scheduled',
    coachNote: '',
    exercises: [planned('Back Squat', 60, 8, 3)],
  });
  // Tom has not trained in a fortnight, so he reads as lapsed.
  push({
    id: makeId('w'),
    clientId: tom.id,
    name: 'Push Day A',
    date: daysAgo(14),
    status: 'completed',
    durationMinutes: 41,
    coachNote: '',
    exercises: [logged('Barbell Bench Press', [60, 62.5, 62.5], [8, 6, 6])],
  });

  workouts.forEach((workout) => {
    workout.dayTypeId = dayTypeForName(workout.name);
  });

  return { clients, workouts, dayTypes: SEED_DAY_TYPES };
}

/**
 * The seed roster's ids, which are fixed above. Sample clients are recognised
 * by these exact ids and never by a prefix: invited clients get `client-…` ids
 * too, so "starts with client-" counted every real client as sample data — and
 * "Remove sample data" deleted them along with it. Cloud sync uses the same set
 * to keep sample data on the phone.
 */
export const SAMPLE_CLIENT_IDS: ReadonlySet<string> = new Set(buildSeed().clients.map((c) => c.id));
