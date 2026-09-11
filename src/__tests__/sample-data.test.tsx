import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { StoreProvider, useStore } from '../store';

/**
 * "Remove sample data" used to delete real clients. Sample clients were
 * recognised by an id starting `client-`, which is also how invited clients are
 * named — so one real invite made the whole roster look like sample data.
 */

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);
const mount = () => renderHook(() => useStore(), { wrapper });
type Result = Awaited<ReturnType<typeof mount>>['result'];

const hydrated = async (result: { current: { hydrated: boolean } | null }) => {
  await waitFor(() => expect(result.current?.hydrated).toBe(true));
};

/** A real client with one session of their own. */
async function realClient(result: Result) {
  let clientId = '';
  let workoutId = '';
  await act(() => {
    clientId = result.current.invite('Jordan Real', 'jordan@example.com', 'lb').id;
  });
  await act(() => {
    workoutId = result.current.createWorkout(clientId);
  });
  return { clientId, workoutId };
}

describe('sample data and real clients', () => {
  it('does not mistake an invited client for sample data', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId } = await realClient(result);

    // The prefix that used to fool it.
    expect(clientId.startsWith('client-')).toBe(true);
    expect(result.current.hasSampleData).toBe(false);
  });

  it('adds the sample roster alongside real clients', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await realClient(result);

    await act(() => {
      result.current.loadSampleData();
    });

    expect(result.current.hasSampleData).toBe(true);
    expect(result.current.client(clientId)).toBeDefined();
    expect(result.current.workout(workoutId)).toBeDefined();
    expect(result.current.clients.length).toBeGreaterThan(1);
  });

  it('removes only the sample clients and their sessions', async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId, workoutId } = await realClient(result);
    await act(() => {
      result.current.loadSampleData();
    });

    await act(() => {
      result.current.clearSampleData();
    });

    expect(result.current.clients.map((c) => c.id)).toEqual([clientId]);
    expect(result.current.workouts.map((w) => w.id)).toEqual([workoutId]);
    expect(result.current.hasSampleData).toBe(false);
  });

  it('adds nothing the second time it is loaded', async () => {
    const { result } = await mount();
    await hydrated(result);
    await act(() => {
      result.current.loadSampleData();
    });
    const clients = result.current.clients.length;
    const workouts = result.current.workouts.length;

    await act(() => {
      result.current.loadSampleData();
    });

    expect(result.current.clients).toHaveLength(clients);
    expect(result.current.workouts).toHaveLength(workouts);
  });

  it("keeps the trainer's own day types through a load and a remove", async () => {
    const { result } = await mount();
    await hydrated(result);
    let dayTypeId = '';
    await act(() => {
      dayTypeId = result.current.addDayType('Olympic Lifts', 'OLY', 3);
    });

    await act(() => {
      result.current.loadSampleData();
    });
    await act(() => {
      result.current.clearSampleData();
    });

    expect(result.current.dayType(dayTypeId)?.name).toBe('Olympic Lifts');
  });

  it("hands back a sample client's code, never a real client's", async () => {
    const { result } = await mount();
    await hydrated(result);
    const { clientId } = await realClient(result);

    let code = '';
    await act(() => {
      code = result.current.loadSampleData();
    });

    const match = result.current.clientByCode(code);
    expect(match).toBeDefined();
    expect(match?.id).not.toBe(clientId);
  });

  it('hands back the same code when the sample is already loaded', async () => {
    const { result } = await mount();
    await hydrated(result);
    let first = '';
    let second = '';
    await act(() => {
      first = result.current.loadSampleData();
    });
    await act(() => {
      second = result.current.loadSampleData();
    });
    expect(second).toBe(first);
  });
});
