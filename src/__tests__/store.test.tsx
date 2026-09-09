import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { StoreProvider, useStore } from '../store';
import { WeightUnit, toCanonical, toDisplay } from '../models';

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
  await act(() => {
    result.current.finishWorkout(id, 45);
  });
  return id;
};

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
