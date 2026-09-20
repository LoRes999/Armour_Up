import { pillFor } from '../components/SyncPill';
import type { SyncStatus } from '../sync/types';

/**
 * What the sync pill decides to say. The component is three lines of layout
 * around this function; the rules about when to stay quiet are the part worth
 * pinning.
 */

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  online: true,
  pending: 0,
  lastSyncedAt: null,
  rejected: 0,
  ...over,
});

describe('the sync pill', () => {
  it('says nothing with accounts switched off', () => {
    expect(pillFor(status({ online: false, pending: 3 }), false, true)).toBeNull();
  });

  it('says nothing when everything has reached the cloud', () => {
    expect(pillFor(status(), true, false)).toBeNull();
  });

  it('holds its tongue while an upload is merely in flight', () => {
    expect(pillFor(status({ pending: 1 }), true, false)).toBeNull();
  });

  it('speaks up once an upload is slow', () => {
    expect(pillFor(status({ pending: 1 }), true, true)).toEqual({
      tone: 'waiting',
      label: 'Saving · 1 change waiting',
    });
  });

  it('counts what is waiting while offline, without waiting to be sure', () => {
    expect(pillFor(status({ online: false, pending: 2 }), true, false)).toEqual({
      tone: 'waiting',
      label: 'Offline · 2 changes waiting',
    });
  });

  /**
   * A change the server refused is gone: it is not queued, not uploaded, and
   * not coming back. It used to be dropped in silence — the coach's edit was
   * on screen and nowhere else. Unlike everything above it is not a passing
   * state, so it is not hidden behind the slow-upload timer and it does not
   * clear itself when the queue empties.
   */
  it('says so when the server has refused a change', () => {
    expect(pillFor(status({ rejected: 1 }), true, false)).toEqual({
      tone: 'refused',
      label: "1 change couldn't be saved",
    });
  });

  it('counts refusals, and says it over anything else', () => {
    expect(pillFor(status({ online: false, pending: 4, rejected: 2 }), true, true)).toEqual({
      tone: 'refused',
      label: "2 changes couldn't be saved",
    });
  });
});
