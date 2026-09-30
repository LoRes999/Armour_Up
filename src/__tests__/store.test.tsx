import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { StoreProvider, isMissedSession, rosterSessions, useStore } from '../store';
import { WeightUnit, Workout, toCanonical, toDisplay } from '../models';

/**
 * Note on style: in @testing-library/react-native v14, `renderHook` and `act`
 * are both async — React 19 renders concurrently, so a synchronous call returns
 * a promise and `result` is never populated. Every one of these must be
 * awaited; forgetting one produces an "overlapping act() calls" warning and an
 * undefined result rather than a useful failure.
 */

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);

const mount = () => renderHook(() => useStore(), { wrapper });

type Store = Awaited<ReturnType<typeof mount>>['result'];

const daysAgo = (n: number) => {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString();
};

const inviteClient = async (result: Store, name = 'Test Client', unit: WeightUnit = 'kg') => {
  let id = '';
  let code = '';
  await act(() => {
    const created = result.current.invite(name, 'someone@example.com', unit);
    id = created.id;
    code = created.inviteCode;
  });
  return { id, code };
};

/** A completed session with one exercise, logged at the given weights. */
const completedSession = async (
  result: Store,
  clientId: string,
  movement: string,
  weights: number[],
  date: string
) => {
  let id = '';
  await act(() => {
    id = result.current.createWorkout(clientId);
  });
  await act(() => {
    result.current.setWorkoutDate(id, date);
    result.current.addExercise(id, movement);
  });
  for (let index = 0; index < weights.length; index += 1) {
    await act(() => {
      result.current.logSet(id, 0, index, weights[index], 5);
    });
  }
  // Finished on the day it was planned, as a session in the past would have been.
  await act(() => {
    result.current.finishWorkout(id, 45, new Date(date));
  });
  return id;
};

/**
 * What shows as today's session. Tapping "New workout" used to put an empty
 * draft on the coach's Today and the client's Today straight away, before
 * anything was in it or it had been sent. As Ryan decided (2026-09-13): the
 * coach sees any of today's sessions that has exercises, since they may run it
 * live without sending it; the client sees only what their coach has sent.
 */
/**
 * A session finished with nothing logged went into History as "0 sets", added
 * one to the session count, counted as a training week for the streak and used
 * up a milestone. The solo footer button already refused; the header flags on
 * both session screens did not, and the store never checked.
 */
/**
 * The builder had no way to remove an exercise once added: the only fix was
 * deleting the whole workout. Ryan chose a "Remove exercise" button in the
 * expanded card (2026-09-13); this is the store action behind it.
 */
/**
 * The builder saves every edit as it is made, so its Cancel button undid
 * nothing. Ryan chose a real undo (2026-09-13): the builder keeps a copy when it
 * opens and Cancel puts the workout back exactly as it was.
 */
/**
 * A session not finished on its day could never be logged afterwards: it fell
 * off Today, and its Program row opened the builder. Ryan decided (2026-09-13)
 * a past, unfinished session is marked "Missed" and can still be logged; this
 * is the rule for which sessions those are.
 */
describe('a missed session', () => {
  const sessionOn = async (result: Store, clientId: string, date: string) => {
    let id = '';
    await act(() => {
      id = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.setWorkoutDate(id, date);
      result.current.addExercise(id, 'Bench Press');
    });
    return result.current.workout(id);
  };

  it('is an unfinished coach session from before today', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const twoDaysAgo = await sessionOn(result, clientId, daysAgo(2));

    expect(twoDaysAgo && isMissedSession(twoDaysAgo)).toBe(true);
  });

  it("is not today's or a future one", async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const today = await sessionOn(result, clientId, daysAgo(0));
    const inTwoDays = await sessionOn(result, clientId, daysAgo(-2));

    expect(today && isMissedSession(today)).toBe(false);
    expect(inTwoDays && isMissedSession(inTwoDays)).toBe(false);
  });

  it('is not a finished one, or a solo session of the client’s own', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const finishedId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(3));
    const finished = result.current.workout(finishedId);
    const solo = finished && { ...finished, status: 'scheduled' as const, loggedBy: 'client' as const };

    expect(finished && isMissedSession(finished)).toBe(false);
    expect(solo && isMissedSession(solo)).toBe(false);
  });
});

// The roster picked the oldest unfinished session, so a miss from two weeks
// ago on a Tuesday read "Upper A · Tue", as though it were coming up.
describe('what the roster shows as coming up', () => {
  const now = new Date(2026, 8, 30, 12);
  const session = (name: string, day: number, exercises = 1): Workout => ({
    id: `w-${name}`,
    clientId: 'c',
    name,
    date: new Date(2026, 8, day, 9).toISOString(),
    exercises: Array.from({ length: exercises }, (_, i) => ({ id: `e${i}`, movementName: 'Bench Press', sets: [] })),
    coachNote: '',
    status: 'scheduled',
    loggedBy: 'trainer',
  });

  it('is the next one dated today or later, and the latest one missed', () => {
    const { next, lastMissed } = rosterSessions(
      [session('Upper A', 15), session('Lower A', 22), session('Upper B', 30), session('Lower B', 32)],
      now
    );
    expect(next?.name).toBe('Upper B');
    expect(lastMissed?.name).toBe('Lower A');
  });

  it('ignores an empty draft either way', () => {
    const { next, lastMissed } = rosterSessions([session('Draft', 20, 0), session('Draft 2', 31, 0)], now);
    expect(next).toBeUndefined();
    expect(lastMissed).toBeUndefined();
  });
});

describe('restoring a workout', () => {
  it('puts it back exactly as the copy had it', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    const original = result.current.workout(workoutId);

    await act(() => {
      result.current.renameWorkout(workoutId, 'Push Day B');
      result.current.addExercise(workoutId, 'Deadlift');
    });
    await act(() => {
      if (original) result.current.restoreWorkout(original);
    });

    expect(result.current.workout(workoutId)).toEqual(original);
  });

  // The client tapped "Got it" on another phone while the coach had the
  // builder open. Cancel put back the coach's copy whole, "seen" included,
  // and the "New from" card came back on the client's phone.
  it("keeps the client's \"Got it\" that arrived meanwhile", async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    const original = result.current.workout(workoutId);
    await act(() => {
      result.current.renameWorkout(workoutId, 'Push Day B');
      result.current.markSeenByClient(workoutId);
    });
    const seen = result.current.workout(workoutId)?.seenByClientAt;

    await act(() => {
      if (original) result.current.restoreWorkout(original);
    });

    expect(result.current.workout(workoutId)?.name).toBe(original?.name);
    expect(seen).toBeDefined();
    expect(result.current.workout(workoutId)?.seenByClientAt).toBe(seen);
  });
});

describe('removing an exercise', () => {
  it('takes out just that exercise and keeps the rest in order', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
      result.current.addExercise(workoutId, 'Back Squat');
      result.current.addExercise(workoutId, 'Deadlift');
    });

    await act(() => {
      result.current.removeExercise(workoutId, 1);
    });

    expect(result.current.workout(workoutId)?.exercises.map((e) => e.movementName)).toEqual([
      'Bench Press',
      'Deadlift',
    ]);
  });
});

describe('finishing a session with nothing logged', () => {
  it('refuses a session with nothing logged', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });

    await act(() => {
      result.current.finishWorkout(workoutId, 30);
    });

    expect(result.current.workout(workoutId)?.status).not.toBe('completed');
    expect(result.current.clients.find((c) => c.id === clientId)?.sessionsCompleted).toBe(0);
    expect(result.current.historyFor(clientId)).toEqual([]);
  });

  it('finishes one with a set logged', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const workoutId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(0));

    expect(result.current.workout(workoutId)?.status).toBe('completed');
    expect(result.current.clients.find((c) => c.id === clientId)?.sessionsCompleted).toBe(1);
  });
});

describe("today's session", () => {
  it('leaves an empty draft off both Today screens', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await act(() => {
      result.current.createWorkout(clientId);
    });

    expect(result.current.todayWorkoutFor(clientId)).toBeUndefined();
    expect(result.current.clientsWithSessionToday()).toHaveLength(0);
    expect(result.current.sentWorkoutFor(clientId)).toBeUndefined();
  });

  it("shows a built session to the coach, and to the client only once it's sent", async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });

    expect(result.current.todayWorkoutFor(clientId)?.id).toBe(workoutId);
    expect(result.current.clientsWithSessionToday().map((c) => c.id)).toEqual([clientId]);
    expect(result.current.sentWorkoutFor(clientId)).toBeUndefined();

    await act(() => {
      result.current.assignWorkout(workoutId);
    });

    expect(result.current.sentWorkoutFor(clientId)?.id).toBe(workoutId);
  });

  it("keeps the sample client's session on their Today", async () => {
    const { result } = await mount();
    await act(() => {
      result.current.loadSampleData();
    });
    const marcus = result.current.clients.find((c) => c.name === 'Marcus Webb');

    expect(marcus && result.current.sentWorkoutFor(marcus.id)?.name).toBe('Push Day A');
  });
});

describe('a fresh store', () => {
  it('starts with no clients and no workouts', async () => {
    const { result } = await mount();
    expect(result.current.clients).toEqual([]);
    expect(result.current.workouts).toEqual([]);
    expect(result.current.hasSampleData).toBe(false);
  });

  // Day types are a starter split, not somebody's training history.
  it('keeps the seeded day types', async () => {
    const { result } = await mount();
    expect(result.current.dayTypes.length).toBeGreaterThan(0);
  });

  it('lets nobody into either app', async () => {
    const { result } = await mount();
    expect(result.current.canUseTrainerApp()).toBe(false);
    expect(result.current.canUseClientApp()).toBe(false);
  });
});

describe('invites', () => {
  it('creates a pending client with a unique code', async () => {
    const { result } = await mount();
    const a = await inviteClient(result, 'Marcus Webb');
    const b = await inviteClient(result, 'Priya Shah');

    expect(result.current.clients).toHaveLength(2);
    expect(a.code).not.toBe(b.code);
    expect(result.current.client(a.id)?.inviteAccepted).toBe(false);
    expect(result.current.client(a.id)?.sessionsCompleted).toBe(0);
  });

  // The bug this guards: currentClient() used to fall back to clients[0], so
  // every invited client resolved to the first one on the roster.
  it('signs in the client whose code was entered, not the first on the roster', async () => {
    const { result } = await mount();
    await inviteClient(result, 'Marcus Webb');
    const second = await inviteClient(result, 'Priya Shah');

    await act(() => {
      result.current.redeemInviteCode(second.code);
    });

    expect(result.current.signedInClientId).toBe(second.id);
    expect(result.current.currentClient()?.name).toBe('Priya Shah');
    expect(result.current.canUseClientApp()).toBe(true);
    expect(result.current.client(second.id)?.inviteAccepted).toBe(true);
  });

  it('accepts a code typed with lowercase and a hyphen', async () => {
    const { result } = await mount();
    const { id, code } = await inviteClient(result);
    const messy = code.slice(0, 3).toLowerCase() + '-' + code.slice(3).toLowerCase();

    await act(() => {
      result.current.redeemInviteCode(messy);
    });
    expect(result.current.signedInClientId).toBe(id);
  });

  it('refuses an unknown code and signs nobody in', async () => {
    const { result } = await mount();
    await inviteClient(result);
    let redeemed;
    await act(() => {
      redeemed = result.current.redeemInviteCode('ZZZZZZ');
    });
    expect(redeemed).toBeUndefined();
    expect(result.current.signedInClientId).toBeNull();
  });

  it('invalidates a leaked code when it is regenerated', async () => {
    const { result } = await mount();
    const { id, code } = await inviteClient(result);
    let next = '';
    await act(() => {
      next = result.current.regenerateInviteCode(id);
    });

    expect(next).not.toBe(code);
    expect(result.current.clientByCode(code)).toBeUndefined();
    expect(result.current.clientByCode(next)?.id).toBe(id);
    expect(result.current.client(id)?.inviteAccepted).toBe(false);
  });

  it('takes a removed client off the roster with their workouts and code', async () => {
    const { result } = await mount();
    const { id, code } = await inviteClient(result);
    const { id: otherId } = await inviteClient(result);
    let kept = '';
    await act(() => {
      result.current.createWorkout(id);
      kept = result.current.createWorkout(otherId);
    });
    await act(() => {
      result.current.removeClient(id);
    });

    expect(result.current.client(id)).toBeUndefined();
    expect(result.current.clientByCode(code)).toBeUndefined();
    expect(result.current.workouts.filter((w) => w.clientId === id)).toEqual([]);
    expect(result.current.workouts.map((w) => w.id)).toContain(kept);
  });
});

describe('finishing a session', () => {
  // Both the header flag and the footer button reach finishWorkout, and neither
  // unmounts fast enough to stop a second tap counting the same session twice.
  // Nothing anywhere decrements sessionsCompleted, so a double count is permanent.
  it('counts a session once however many times finish is tapped', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    // A set logged, so there is a session to finish at all.
    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
    });

    await act(() => {
      result.current.finishWorkout(workoutId, 45);
    });
    await act(() => {
      result.current.finishWorkout(workoutId, 45);
    });
    await act(() => {
      result.current.finishWorkout(workoutId, 45);
    });

    expect(result.current.client(clientId)?.sessionsCompleted).toBe(1);
    expect(result.current.historyFor(clientId)).toHaveLength(1);
  });

  // A set logged wrong in a live session was permanent (Ryan's call, 2026-09-30).
  it('lets the coach take back a set before the session is finished', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
      result.current.logSet(workoutId, 0, 1, 600, 5);
    });

    await act(() => {
      result.current.unlogSet(workoutId, 0, 1);
    });
    const sets = result.current.workout(workoutId)?.exercises[0].sets;
    expect(sets?.[0].loggedWeight).toBe(60);
    expect(sets?.[1].loggedWeight).toBeUndefined();
    expect(sets?.[1].loggedReps).toBeUndefined();

    await act(() => {
      result.current.finishWorkout(workoutId, 45);
    });
    await act(() => {
      result.current.unlogSet(workoutId, 0, 0);
    });
    expect(result.current.workout(workoutId)?.exercises[0].sets[0].loggedWeight).toBe(60);
  });

  it('records no time for a session that was not timed', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
    });
    await act(() => {
      result.current.finishWorkout(workoutId, undefined);
    });
    expect(result.current.workout(workoutId)?.status).toBe('completed');
    expect(result.current.workout(workoutId)?.durationMinutes).toBeUndefined();
  });

  it('records the duration and moves the session into history', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const workoutId = await completedSession(result, clientId, 'Back Squat', [100], daysAgo(1));

    expect(result.current.workout(workoutId)?.status).toBe('completed');
    expect(result.current.workout(workoutId)?.durationMinutes).toBe(45);
    expect(result.current.upcomingFor(clientId)).toHaveLength(0);
  });

  // The elapsed clock is derived from this rather than counted from mount, so
  // leaving a session and coming back does not record 40 minutes as one.
  it('stamps a start time on the first logged set and never moves it', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    expect(result.current.workout(workoutId)?.startedAt).toBeUndefined();

    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
    });
    const stamped = result.current.workout(workoutId)?.startedAt;
    expect(stamped).toBeDefined();
    expect(result.current.workout(workoutId)?.status).toBe('inProgress');

    await act(() => {
      result.current.logSet(workoutId, 0, 1, 65, 5);
    });
    expect(result.current.workout(workoutId)?.startedAt).toBe(stamped);
  });
});

describe('repeating a session', () => {
  it('creates a client-owned copy targeting what was actually lifted', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const sourceId = await completedSession(
      result,
      clientId,
      'Bench Press',
      [60, 65, 70],
      daysAgo(3)
    );

    let soloId: string | undefined;
    await act(() => {
      soloId = result.current.repeatWorkout(sourceId);
    });

    const solo = result.current.workout(soloId as string);
    expect(solo?.loggedBy).toBe('client');
    expect(solo?.status).toBe('scheduled');
    // Targets come from the logged values, not the original prescription.
    expect(solo?.exercises[0].sets.map((s) => s.targetWeight)).toEqual([60, 65, 70]);
    // Nothing is carried over as already done.
    expect(solo?.exercises[0].sets.every((s) => s.loggedWeight === undefined)).toBe(true);
  });

  // The note was written for that day; carrying it forward puts words in the
  // trainer's mouth about a session they were not at.
  it('does not carry the coach note forward', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const sourceId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(3));
    await act(() => {
      result.current.renameWorkout(sourceId, 'Push A');
    });

    let soloId: string | undefined;
    await act(() => {
      soloId = result.current.repeatWorkout(sourceId);
    });
    expect(result.current.workout(soloId as string)?.coachNote).toBe('');
    expect(result.current.workout(soloId as string)?.name).toBe('Push A');
  });

  it('reuses the open solo session rather than littering the calendar', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const sourceId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(3));

    let first: string | undefined;
    let second: string | undefined;
    await act(() => {
      first = result.current.repeatWorkout(sourceId);
    });
    await act(() => {
      second = result.current.repeatWorkout(sourceId);
    });

    expect(second).toBe(first);
    const solo = result.current.workoutsFor(clientId).filter((w) => w.loggedBy === 'client');
    expect(solo).toHaveLength(1);
  });

  // The permission axis. A solo session is the client's own; the trainer's
  // live-logging screen must not be able to write to it.
  it('will not let the trainer log into a client-owned session', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const sourceId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(3));
    let soloId: string | undefined;
    await act(() => {
      soloId = result.current.repeatWorkout(sourceId);
    });

    await act(() => {
      result.current.logSet(soloId as string, 0, 0, 999, 1);
    });
    const set = result.current.workout(soloId as string)?.exercises[0].sets[0];
    expect(set?.loggedWeight).toBeUndefined();
  });

  // Repeating a different session used to open the unfinished one instead,
  // without a word. Now the client picks; "start instead" swaps them.
  it('can replace an open solo session with a different one', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const pull = await completedSession(result, clientId, 'Barbell Row', [60], daysAgo(5));
    const push = await completedSession(result, clientId, 'Bench Press', [70], daysAgo(3));

    let first: string | undefined;
    let second: string | undefined;
    await act(() => {
      first = result.current.repeatWorkout(pull);
    });
    await act(() => {
      second = result.current.repeatWorkout(push, { replace: true });
    });

    expect(second).not.toBe(first);
    expect(result.current.workout(first as string)).toBeUndefined();
    const open = result.current.activeSoloFor(clientId);
    expect(open?.id).toBe(second);
    expect(open?.exercises[0].movementName).toBe('Bench Press');
  });

  it('keeps a solo session off the trainer today screen', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    const sourceId = await completedSession(result, clientId, 'Bench Press', [60], daysAgo(3));
    await act(() => {
      result.current.repeatWorkout(sourceId);
    });

    expect(result.current.todayWorkoutFor(clientId)).toBeUndefined();
    expect(result.current.clientsWithSessionToday()).toHaveLength(0);
    expect(result.current.activeSoloFor(clientId)).toBeDefined();
  });
});

// Renaming used to leave old sessions on the old name, splitting one lift's
// records and chart in two. A rename carries history along (Ryan's call,
// 2026-09-13).
/**
 * The client page's boxes were stale: ADHERENCE was never worked out (every new
 * client showed 100% for ever), SESSIONS was a counter that could disagree with
 * History, and WEEK SETS counted a rolling seven days while the streak counts
 * from Monday. Ryan chose (2026-09-13) to work them out properly.
 */
describe('client stats', () => {
  // Wednesday 2 September 2026, midday. Monday was 31 August.
  const now = new Date(2026, 8, 2, 12);
  const on = (month: number, day: number) => new Date(2026, month, day, 9).toISOString();

  const coachSession = async (result: Store, clientId: string, date: string, send: boolean) => {
    let id = '';
    await act(() => {
      id = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.setWorkoutDate(id, date);
      result.current.addExercise(id, 'Bench Press');
    });
    if (send) {
      await act(() => {
        result.current.assignWorkout(id);
      });
    }
    return id;
  };

  it('counts sessions from History, not a counter', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await completedSession(result, clientId, 'Bench Press', [60], on(7, 20));
    const second = await completedSession(result, clientId, 'Bench Press', [60], on(7, 25));
    await act(() => {
      result.current.removeWorkout(second);
    });
    expect(result.current.clientStats(clientId, now).sessions).toBe(1);
  });

  it('counts week sets from Monday, like the streak', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await completedSession(result, clientId, 'Bench Press', [60, 60, 60], on(7, 30)); // Sunday
    await completedSession(result, clientId, 'Bench Press', [60, 60], on(7, 31)); // Monday
    expect(result.current.clientStats(clientId, now).weekSets).toBe(2);
  });

  // A session is counted for the day it was done, not the day it was planned.
  // Last Friday's missed session logged on Monday counted for last week, so
  // this week read "at risk" and the Sunday push told someone who had trained
  // that their streak ended tonight.
  it('counts a missed session for the week it was actually done', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let id = '';
    await act(() => {
      id = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.setWorkoutDate(id, on(7, 28)); // last Friday
      result.current.addExercise(id, 'Bench Press');
    });
    await act(() => {
      result.current.logSet(id, 0, 0, 60, 5);
    });
    await act(() => {
      result.current.finishWorkout(id, 45, new Date(2026, 8, 1, 18)); // this Tuesday
    });

    expect(result.current.clientStats(clientId, now).weekSets).toBe(1);
    expect(result.current.weekStreak(clientId, now)).toEqual({ weeks: 1, atRisk: false });
    // History still shows it on the day it was planned (Ryan's call, B9).
    expect(result.current.workout(id)?.date).toBe(on(7, 28));
  });

  it('works out adherence from the last four weeks of coach sessions', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    // Run live and finished: due and done.
    await completedSession(result, clientId, 'Bench Press', [60], on(7, 25));
    // Sent and never done: due, missed.
    await coachSession(result, clientId, on(7, 26), true);
    // A draft never sent, and a miss from July: neither counts.
    await coachSession(result, clientId, on(7, 27), false);
    await coachSession(result, clientId, on(6, 1), true);
    expect(result.current.clientStats(clientId, now).adherence).toBe(50);
  });

  it('has no adherence until a session is due', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    // Sent, but for tomorrow.
    await coachSession(result, clientId, on(8, 3), true);
    expect(result.current.clientStats(clientId, now).adherence).toBeUndefined();
  });
});

// Clients see a note from their coach on a workout, but nothing could write
// one. The builder gets a note box (Ryan's call, 2026-09-13).
describe('the coach note', () => {
  it('is written on the workout', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.setCoachNote(workoutId, 'Pause every rep.');
    });
    expect(result.current.workout(workoutId)?.coachNote).toBe('Pause every rep.');
  });
});

// The rep stepper had no top, so a stuck tap could send 500 reps into records.
describe('rep limits', () => {
  it('caps target and logged reps at 100', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let workoutId = '';
    await act(() => {
      workoutId = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.addExercise(workoutId, 'Bench Press');
    });
    await act(() => {
      result.current.setTargetReps(workoutId, 0, 0, 500);
    });
    expect(result.current.workout(workoutId)?.exercises[0].sets[0].targetReps).toBe(100);

    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 500);
    });
    expect(result.current.workout(workoutId)?.exercises[0].sets[0].loggedReps).toBe(100);
  });
});

describe('renaming a custom movement', () => {
  it('moves past sessions, records and the chart to the new name', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await act(() => {
      result.current.addCustomMovement({
        name: 'DB Press',
        description: '',
        cues: [],
        muscles: [],
        photoUris: [],
      });
    });
    await completedSession(result, clientId, 'db press', [30], daysAgo(6));
    await completedSession(result, clientId, 'DB Press', [32.5], daysAgo(3));
    await completedSession(result, clientId, 'Bench Press', [70], daysAgo(2));
    const movementId = result.current.customMovements[0].id;

    await act(() => {
      result.current.updateCustomMovement(movementId, { name: 'Dumbbell Press' });
    });

    expect(result.current.trainedMovements(clientId).sort()).toEqual(['Bench Press', 'Dumbbell Press']);
    expect(result.current.topSetSeries(clientId, 'Dumbbell Press')).toHaveLength(2);
    const record = result.current
      .personalRecords(clientId)
      .find((r) => r.movementName === 'Dumbbell Press');
    expect(record?.weight).toBe(32.5);
  });
});

describe('personal records', () => {
  // A warm-up set in the same session used to become the "previous" record:
  // [45, 47.5, 47.5] rendered as "47.5 — was 45", as though 45 were a best that
  // had just been beaten. A previous record has to come from a previous workout.
  it('never takes the previous weight from a warm-up in the same session', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await completedSession(result, clientId, 'Bench Press', [45, 47.5, 47.5], daysAgo(7));

    const [record] = result.current.personalRecords(clientId);
    expect(record.movementName).toBe('Bench Press');
    expect(record.weight).toBe(47.5);
    expect(record.previousWeight).toBeUndefined();
  });

  it('takes the previous weight from the session before', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await completedSession(result, clientId, 'Bench Press', [45, 47.5], daysAgo(14));
    await completedSession(result, clientId, 'Bench Press', [47.5, 50], daysAgo(7));

    const [record] = result.current.personalRecords(clientId);
    expect(record.weight).toBe(50);
    expect(record.previousWeight).toBe(47.5);
  });

  it('does not treat a repeat of the same weight as a new record', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    await completedSession(result, clientId, 'Back Squat', [100], daysAgo(14));
    await completedSession(result, clientId, 'Back Squat', [100], daysAgo(7));

    const [record] = result.current.personalRecords(clientId);
    expect(record.weight).toBe(100);
    expect(record.previousWeight).toBeUndefined();
  });

  it('charts every block of a movement, not just the first', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result);
    let id = '';
    await act(() => {
      id = result.current.createWorkout(clientId);
    });
    await act(() => {
      result.current.setWorkoutDate(id, daysAgo(2));
      // The same movement programmed twice in one session — a heavy block and a
      // back-off block. trainedMovements counted both; the chart used .find and
      // silently read only the first, so the two disagreed.
      result.current.addExercise(id, 'Bench Press');
      result.current.addExercise(id, 'Bench Press');
    });
    await act(() => {
      result.current.logSet(id, 0, 0, 60, 5);
      result.current.logSet(id, 1, 0, 80, 3);
    });
    await act(() => {
      result.current.finishWorkout(id, 50);
    });

    const series = result.current.topSetSeries(clientId, 'Bench Press');
    expect(series[series.length - 1].weight).toBe(80);
    expect(result.current.personalRecords(clientId)[0].weight).toBe(80);
  });
});

describe('lapsed clients', () => {
  // A client invited thirty seconds ago is new, not lapsed. Badging them LAPSED
  // was the first thing a trainer used to see on an empty roster.
  it('does not badge someone who has never trained', async () => {
    const { result } = await mount();
    await inviteClient(result, 'Brand New');
    expect(result.current.lapsedClients()).toHaveLength(0);
  });

  it('badges someone whose last session is over ten days old', async () => {
    const { result } = await mount();
    const { id } = await inviteClient(result, 'Gone Quiet');
    await completedSession(result, id, 'Back Squat', [100], daysAgo(21));
    expect(result.current.lapsedClients().map((c) => c.id)).toEqual([id]);
  });

  it('leaves someone who trained this week alone', async () => {
    const { result } = await mount();
    const { id } = await inviteClient(result, 'Still Here');
    await completedSession(result, id, 'Back Squat', [100], daysAgo(2));
    expect(result.current.lapsedClients()).toHaveLength(0);
  });
});

describe('switching weight units', () => {
  // The most serious data bug the app has had: Client.unit was a label and
  // nothing more, so a client benching 100 kg who switched to Pounds saw
  // "100 lb" — their whole history out by 2.2x. Storage is canonical kg now,
  // and the unit is a display preference that must never rewrite a number.
  it('does not touch a single stored weight', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result, 'Priya Shah', 'kg');
    await completedSession(result, clientId, 'Bench Press', [47.5], daysAgo(4));

    const before = JSON.stringify(result.current.workouts);
    await act(() => {
      result.current.setClientUnit(clientId, 'lb');
    });

    expect(result.current.client(clientId)?.unit).toBe('lb');
    expect(JSON.stringify(result.current.workouts)).toBe(before);
  });

  it('re-reads the same stored weight in the new unit', async () => {
    const { result } = await mount();
    const { id: clientId } = await inviteClient(result, 'Priya Shah', 'kg');
    await completedSession(
      result,
      clientId,
      'Bench Press',
      [toCanonical(47.5, 'kg')],
      daysAgo(4)
    );

    const stored = result.current.personalRecords(clientId)[0].weight;
    expect(toDisplay(stored, 'kg')).toBe(47.5);
    expect(toDisplay(stored, 'lb')).toBe(105);
  });
});

describe('deleting an account', () => {
  // Apple 5.1.1(v). This used to read signedInClientId alone, so a trainer
  // typed DELETE, confirmed, and nothing at all was removed.
  it('clears the whole roster for a trainer', async () => {
    const { result } = await mount();
    const { id } = await inviteClient(result);
    await completedSession(result, id, 'Back Squat', [100], daysAgo(3));
    await act(() => {
      result.current.signInAsTrainer();
    });

    await act(() => {
      result.current.deleteAccount();
    });

    expect(result.current.clients).toEqual([]);
    expect(result.current.workouts).toEqual([]);
    expect(result.current.role).toBeNull();
  });

  it('removes only the signed-in client, leaving the rest of the roster', async () => {
    const { result } = await mount();
    const leaving = await inviteClient(result, 'Leaving Client');
    const staying = await inviteClient(result, 'Staying Client');
    await completedSession(result, leaving.id, 'Back Squat', [100], daysAgo(3));
    await completedSession(result, staying.id, 'Back Squat', [120], daysAgo(3));

    await act(() => {
      result.current.redeemInviteCode(leaving.code);
    });
    await act(() => {
      result.current.deleteAccount();
    });

    expect(result.current.clients.map((c) => c.id)).toEqual([staying.id]);
    expect(result.current.workouts.every((w) => w.clientId === staying.id)).toBe(true);
    expect(result.current.signedInClientId).toBeNull();
  });
});

describe('sample data', () => {
  it('loads a populated roster and hands back a code to sign in with', async () => {
    const { result } = await mount();
    let code = '';
    await act(() => {
      code = result.current.loadSampleData();
    });

    expect(code).toHaveLength(6);
    expect(result.current.hasSampleData).toBe(true);
    expect(result.current.clientByCode(code)).toBeDefined();
    expect(result.current.workouts.length).toBeGreaterThan(0);
  });

  it('clears back to a genuine first-run state', async () => {
    const { result } = await mount();
    await act(() => {
      result.current.loadSampleData();
    });
    await act(() => {
      result.current.clearSampleData();
    });

    expect(result.current.clients).toEqual([]);
    expect(result.current.workouts).toEqual([]);
    expect(result.current.hasSampleData).toBe(false);
  });
});
