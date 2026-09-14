import {
  CODE_ALPHABET,
  CODE_LENGTH,
  DEFAULT_UNIT,
  ExerciseEntry,
  SetEntry,
  UNITS,
  Workout,
  formatIn,
  formatWeight,
  initialsOf,
  loggedSets,
  makeInviteCode,
  normaliseCode,
  parseWeightInput,
  schemeSummary,
  toCanonical,
  toDisplay,
  topLoggedWeight,
  totalSets,
  trendVerb,
  unitIncrement,
  workoutProgress,
} from '../models';

const set = (over: Partial<SetEntry> = {}): SetEntry => ({
  id: 's',
  targetWeight: 60,
  targetReps: 8,
  ...over,
});

const exercise = (sets: SetEntry[]): ExerciseEntry => ({
  id: 'e',
  movementName: 'Bench Press',
  sets,
});

const workout = (exercises: ExerciseEntry[]): Workout => ({
  id: 'w',
  clientId: 'c',
  name: 'Push',
  date: new Date().toISOString(),
  exercises,
  coachNote: '',
  status: 'scheduled',
  loggedBy: 'trainer',
});

// MARK: - Weight units
//
// This block exists because of a real bug: `Client.unit` used to be a label and
// nothing else, so switching a client from kg to lb relabelled 100 kg as
// "100 lb" and put their entire history out by a factor of 2.2.

describe('unit conversion', () => {
  it('defaults to pounds, listed first', () => {
    expect(DEFAULT_UNIT).toBe('lb');
    expect(UNITS[0]).toBe('lb');
  });

  it('steps by the smallest plate pair people actually load', () => {
    expect(unitIncrement('lb')).toBe(5);
    expect(unitIncrement('kg')).toBe(2.5);
  });

  it('is the identity within kilograms', () => {
    for (const kg of [0, 12, 20, 47.5, 60, 100, 142.5]) {
      expect(toDisplay(kg, 'kg')).toBe(kg);
    }
  });

  it('shows 100 kg as 220 lb, not 220.462', () => {
    expect(toDisplay(100, 'lb')).toBe(220);
  });

  // The regression that shipped and had to be caught in the browser: an early
  // version snapped every converted value, which turned a seeded 12 kg cable
  // stack into 12.5 and a 14 kg dumbbell into 15. A number that is already
  // exact in the unit being shown is somebody's actual entry and must survive.
  it('never moves a value that is already exact in the unit shown', () => {
    expect(toDisplay(12, 'kg')).toBe(12);
    expect(toDisplay(14, 'kg')).toBe(14);
    expect(toDisplay(22.5, 'kg')).toBe(22.5);
  });

  it('round-trips a weight entered in pounds exactly', () => {
    for (const lb of [45, 95, 135, 185, 225, 275, 315, 345]) {
      expect(toDisplay(toCanonical(lb, 'lb'), 'lb')).toBe(lb);
    }
  });

  it('round-trips a weight entered in kilograms exactly', () => {
    for (const kg of [20, 47.5, 60, 100, 142.5]) {
      expect(toDisplay(toCanonical(kg, 'kg'), 'kg')).toBe(kg);
    }
  });

  // The invariant that makes switching units safe: the number on screen may
  // snap to something loadable, but storage is never rewritten, so switching
  // away and back is lossless.
  it('does not drift when a client switches units and switches back', () => {
    const stored = toCanonical(225, 'lb');
    expect(toDisplay(stored, 'kg')).toBe(102.5); // snapped for the bar
    expect(toDisplay(stored, 'lb')).toBe(225); // storage untouched
  });

  it('snaps a converted value onto a loadable increment', () => {
    expect(toDisplay(100, 'lb') % unitIncrement('lb')).toBe(0);
    expect(toDisplay(toCanonical(225, 'lb'), 'kg') % unitIncrement('kg')).toBe(0);
  });

  it('formats whole numbers without a decimal point', () => {
    expect(formatWeight(100)).toBe('100');
    expect(formatWeight(47.5)).toBe('47.5');
    expect(formatIn(100, 'lb')).toBe('220');
    expect(formatIn(47.5, 'kg')).toBe('47.5');
  });
});

// MARK: - Invite codes

describe('invite codes', () => {
  it('excludes the characters people confuse when reading aloud', () => {
    for (const confusable of ['O', '0', 'I', '1']) {
      expect(CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it('generates codes of the right length from the alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeInviteCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code.split('').every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('never hands back a code that is already taken', () => {
    const taken: string[] = [];
    for (let i = 0; i < 100; i += 1) taken.push(makeInviteCode(taken));
    expect(new Set(taken).size).toBe(taken.length);
  });

  // Handing back a duplicate would sign two people into one account, so the
  // generator fails loudly instead.
  it('throws rather than returning a duplicate it cannot avoid', () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const only = makeInviteCode();
      expect(() => makeInviteCode([only])).toThrow(/unique invite code/i);
    } finally {
      random.mockRestore();
    }
  });

  it('forgives spaces, hyphens and lowercase', () => {
    expect(normaliseCode('mw7-k2q')).toBe('MW7K2Q');
    expect(normaliseCode(' MW7 K2Q ')).toBe('MW7K2Q');
  });

  // The join screen counts typed characters rather than surviving ones, because
  // normalising silently deletes an O typed for a Q — which used to leave a
  // full-looking field with no match and no error at all.
  it('drops confusable characters instead of guessing at them', () => {
    expect(normaliseCode('MW7K2O')).toBe('MW7K2');
    expect(normaliseCode('0I1')).toBe('');
  });
});

// MARK: - Derived workout helpers

// The weight keypad took "1e4" as 10,000 and "1,000" as 1, with no top.
describe('parseWeightInput', () => {
  it('reads whole and decimal numbers, with a point or a comma', () => {
    expect(parseWeightInput('102.5', 'kg')).toBe(102.5);
    expect(parseWeightInput('102,5', 'kg')).toBe(102.5);
    expect(parseWeightInput(' 80 ', 'lb')).toBe(80);
  });

  it('refuses what is not a weight', () => {
    ['', '1e4', '1,000', '-5', 'abc', '.', '1.2.3'].forEach((text) =>
      expect(parseWeightInput(text, 'kg')).toBeUndefined()
    );
  });

  it('refuses more than the limit, in the unit shown', () => {
    expect(parseWeightInput('1001', 'kg')).toBeUndefined();
    expect(parseWeightInput('1001', 'lb')).toBe(1001);
    expect(parseWeightInput('2300', 'lb')).toBeUndefined();
  });
});

// An emoji is two UTF-16 units; taking the first alone put a broken
// character in the avatar.
describe('initialsOf', () => {
  it('keeps an emoji whole', () => {
    expect(initialsOf('🔥 Sam Lee')).toBe('🔥S');
  });

  it('ignores extra spaces', () => {
    expect(initialsOf('  Sam   Lee ')).toBe('SL');
  });
});

// The chart's screen-reader summary said "rising to" whatever the trend did.
describe('trendVerb', () => {
  it('says rising when the last top set is heavier', () => {
    expect(trendVerb(80, 90)).toBe('rising to');
  });

  it('says falling when the last top set is lighter', () => {
    expect(trendVerb(90, 80)).toBe('falling to');
  });

  it('says holding when nothing moved', () => {
    expect(trendVerb(80, 80)).toBe('holding at');
  });
});

describe('workout helpers', () => {
  it('summarises an even scheme as sets x reps', () => {
    expect(schemeSummary(exercise([set(), set(), set()]))).toBe('3 × 8');
  });

  it('falls back to a count when the reps vary', () => {
    expect(schemeSummary(exercise([set(), set({ targetReps: 6 })]))).toBe('2 sets');
  });

  it('reports no sets for an empty exercise', () => {
    expect(schemeSummary(exercise([]))).toBe('No sets');
  });

  it('counts progress over logged sets', () => {
    const w = workout([exercise([set({ loggedWeight: 60, loggedReps: 8 }), set()])]);
    expect(totalSets(w)).toBe(2);
    expect(loggedSets(w)).toBe(1);
    expect(workoutProgress(w)).toBe(0.5);
  });

  it('treats an empty workout as zero progress rather than dividing by zero', () => {
    expect(workoutProgress(workout([]))).toBe(0);
  });

  it('takes the heaviest logged set, not the last', () => {
    const e = exercise([
      set({ loggedWeight: 60 }),
      set({ loggedWeight: 80 }),
      set({ loggedWeight: 70 }),
    ]);
    expect(topLoggedWeight(e)).toBe(80);
  });

  it('has no top logged weight before anything is logged', () => {
    expect(topLoggedWeight(exercise([set(), set()]))).toBeUndefined();
  });
});
