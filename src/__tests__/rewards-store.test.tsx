import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { StoreProvider, useStore } from '../store';
import { flushSnapshot } from '../persistence';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);
const mount = () => renderHook(() => useStore(), { wrapper });
type Result = Awaited<ReturnType<typeof mount>>['result'];

const hydrated = async (result: { current: { hydrated: boolean } | null }) => {
  await waitFor(() => expect(result.current?.hydrated).toBe(true));
};

/** A client with one trainer-led workout, dated `daysAhead` from today. */
async function programme(result: Result, { exercises = 1, daysAhead = 1 } = {}) {
  let clientId = '';
  let workoutId = '';
  await act(() => {
    clientId = result.current.invite('Marcus Webb', 'marcus@example.com', 'kg').id;
  });
  await act(() => {
    workoutId = result.current.createWorkout(clientId);
  });
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  await act(() => {
    result.current.setWorkoutDate(workoutId, date.toISOString());
    for (let i = 0; i < exercises; i += 1) result.current.addExercise(workoutId, 'Bench Press');
  });
  return { clientId, workoutId };
}

describe('assigning a workout', () => {
  it('is a moment the first time, and quiet after that', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { workoutId } = await programme(result);

    let first = false;
    let second = true;
    await act(() => {
      first = result.current.assignWorkout(workoutId);
    });
    const stamped = result.current.workout(workoutId)?.assignedAt;
    await act(() => {
      second = result.current.assignWorkout(workoutId);
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(stamped).toBeDefined();
    // Re-assigning an edited session must not restamp it as new.
    expect(result.current.workout(workoutId)?.assignedAt).toBe(stamped);
  });

  it('never sends an empty workout', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { workoutId } = await programme(result, { exercises: 0 });

    let sent = true;
    await act(() => {
      sent = result.current.assignWorkout(workoutId);
    });
    expect(sent).toBe(false);
    expect(result.current.workout(workoutId)?.assignedAt).toBeUndefined();
  });
});

describe('new sessions from the coach', () => {
  it('shows an assigned session until the client has seen it', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await programme(result);

    expect(result.current.unseenFromCoach(clientId)).toHaveLength(0);

    await act(() => {
      result.current.assignWorkout(workoutId);
    });
    expect(result.current.unseenFromCoach(clientId).map((w) => w.id)).toEqual([workoutId]);

    await act(() => {
      result.current.markSeenByClient(workoutId);
    });
    expect(result.current.unseenFromCoach(clientId)).toHaveLength(0);
  });

  it('includes a session assigned for today', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await programme(result, { daysAhead: 0 });
    await act(() => {
      result.current.assignWorkout(workoutId);
    });
    expect(result.current.unseenFromCoach(clientId)).toHaveLength(1);
  });

  it('does not announce a session whose day has already passed', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await programme(result, { daysAhead: -2 });
    await act(() => {
      result.current.assignWorkout(workoutId);
    });
    expect(result.current.unseenFromCoach(clientId)).toHaveLength(0);
  });

  it('does not announce a session that is already done', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await programme(result, { daysAhead: 0 });
    await act(() => {
      result.current.assignWorkout(workoutId);
    });
    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
    });
    await act(() => {
      result.current.finishWorkout(workoutId, 40);
    });
    expect(result.current.unseenFromCoach(clientId)).toHaveLength(0);
  });

  // The card stays until "Got it", across launches — and "Got it" sticks.
  it('remembers across a relaunch, both unseen and seen', async () => {
    const first = await mount();
    await hydrated(first.result);
    const { clientId, workoutId } = await programme(first.result);
    await act(() => {
      first.result.current.assignWorkout(workoutId);
    });
    await flushSnapshot();
    await first.unmount();

    const second = await mount();
    await hydrated(second.result);
    expect(second.result.current.unseenFromCoach(clientId)).toHaveLength(1);

    await act(() => {
      second.result.current.markSeenByClient(workoutId);
    });
    await flushSnapshot();
    await second.unmount();

    const third = await mount();
    await hydrated(third.result);
    expect(third.result.current.unseenFromCoach(clientId)).toHaveLength(0);
  });
});

describe('the weekly streak', () => {
  it('reads from the client history', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await programme(result, { daysAhead: 0 });
    expect(result.current.weekStreak(clientId)).toEqual({ weeks: 0, atRisk: false });

    await act(() => {
      result.current.logSet(workoutId, 0, 0, 60, 5);
    });
    await act(() => {
      result.current.finishWorkout(workoutId, 40);
    });
    expect(result.current.weekStreak(clientId)).toEqual({ weeks: 1, atRisk: false });
  });
});
