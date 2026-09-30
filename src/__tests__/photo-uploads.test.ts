import { type PendingUpload, pendingUploads, photosAfterEdit, remoteOnly, uploadPending } from '../photoUploads';
import type { CustomMovement } from '../models';

/**
 * Which photos still have to go up. Derived from the movement itself rather
 * than kept in a queue of its own: a name is added to `photos` only once its
 * upload has succeeded, so "on this phone but not in photos" already is the
 * list, and it cannot drift out of step with the movement it belongs to.
 */

const movement = (over: Partial<CustomMovement> = {}): CustomMovement => ({
  id: 'mv-1',
  name: 'Landmine Press',
  description: '',
  cues: [],
  muscles: [],
  photoUris: [],
  ...over,
});

const kept = (name: string) => `file:///documents/movement-photos/${name}`;

describe('photos still to upload', () => {
  it('finds one this phone has and the cloud does not', () => {
    const one = movement({ photoUris: [kept('a.jpg')] });

    expect(pendingUploads([one])).toEqual([
      { movementId: 'mv-1', name: 'a.jpg', uri: kept('a.jpg') },
    ]);
  });

  it('leaves alone one that has already gone up', () => {
    const done = movement({ photoUris: [kept('a.jpg')], photos: ['a.jpg'] });

    expect(pendingUploads([done])).toEqual([]);
  });

  it('takes only what is missing when some have gone up', () => {
    const half = movement({ photoUris: [kept('a.jpg'), kept('b.jpg')], photos: ['a.jpg'] });

    expect(pendingUploads([half]).map((p) => p.name)).toEqual(['b.jpg']);
  });

  /**
   * A browser photo is a data URI with no file name, and a picked photo whose
   * copy failed is still in the picker's cache. Neither has a name to be
   * stored under, and web is not a platform this ships on.
   */
  it('ignores a photo that was never copied into the app', () => {
    const odd = movement({ photoUris: ['data:image/jpeg;base64,abc', 'file:///cache/raw.jpg'] });

    expect(pendingUploads([odd])).toEqual([]);
  });

  it('gathers them across every movement', () => {
    const first = movement({ id: 'mv-1', photoUris: [kept('a.jpg')] });
    const second = movement({ id: 'mv-2', photoUris: [kept('b.jpg')] });

    expect(pendingUploads([first, second]).map((p) => p.movementId)).toEqual(['mv-1', 'mv-2']);
  });
});

describe('sending them', () => {
  const item = (name: string, movementId = 'mv-1'): PendingUpload => ({ movementId, name, uri: kept(name) });

  /** A sweep against movements that change only when `record` says so. */
  function sweep(movements: CustomMovement[], failing: string[] = []) {
    const recorded: { movementId: string; photos: string[] }[] = [];
    const orphaned: string[] = [];
    const run = uploadPending({
      pending: pendingUploads(movements),
      upload: async ({ name }) => {
        if (failing.includes(name)) throw new Error('storage/unauthorized');
      },
      current: (id) => movements.find((m) => m.id === id),
      record: (movementId, photos) => recorded.push({ movementId, photos }),
      orphan: ({ name }) => orphaned.push(name),
    });
    return { run, recorded, orphaned };
  }

  // One photo the server always refuses — over 2 MB because resizing failed,
  // say — stopped the sweep there, so no photo after it ever went up.
  it('carries on past one it cannot send', async () => {
    const one = movement({ photoUris: [kept('bad.jpg'), kept('good.jpg')] });
    const { run, recorded } = sweep([one], ['bad.jpg']);

    await expect(run).resolves.toEqual({ sent: 1, failed: 1 });
    expect(recorded).toEqual([{ movementId: 'mv-1', photos: ['good.jpg'] }]);
  });

  // The movement read after the first upload was the one from before it was
  // recorded, so the second photo's write replaced the first photo's name.
  it('keeps every name when one movement sends several at once', async () => {
    const one = movement({ photoUris: [kept('a.jpg'), kept('b.jpg')] });
    const { run, recorded } = sweep([one]);

    await run;
    expect(recorded[recorded.length - 1]).toEqual({ movementId: 'mv-1', photos: ['a.jpg', 'b.jpg'] });
  });

  // Removed in the form while it was on its way up. Recording its name put a
  // photo the coach had taken off back in front of their clients.
  it('never records one taken off the movement meanwhile, and clears it away', async () => {
    const one = movement({ photoUris: [kept('a.jpg')] });
    const pending = pendingUploads([one]);
    const recorded: string[][] = [];
    const orphaned: PendingUpload[] = [];

    await uploadPending({
      pending,
      upload: async () => undefined,
      current: () => ({ ...one, photoUris: [] }),
      record: (_id, photos) => recorded.push(photos),
      orphan: (gone) => orphaned.push(gone),
    });

    expect(recorded).toEqual([]);
    expect(orphaned).toEqual([item('a.jpg')]);
  });

  it('does nothing for a movement deleted meanwhile', async () => {
    const recorded: string[][] = [];
    await uploadPending({
      pending: [item('a.jpg')],
      upload: async () => undefined,
      current: () => undefined,
      record: (_id, photos) => recorded.push(photos),
      orphan: () => undefined,
    });
    expect(recorded).toEqual([]);
  });
});

/**
 * Editing on a phone that never had the files. The form knew only this
 * phone's copies, so every name on the movement looked removed: a coach who
 * fixed a typo on a new phone deleted every photo from the cloud for good.
 */
describe('editing the photos', () => {
  it('finds the ones only in the cloud', () => {
    expect(remoteOnly(['a.jpg', 'b.jpg'], [kept('a.jpg')])).toEqual(['b.jpg']);
  });

  it('keeps a photo this phone has never had', () => {
    expect(photosAfterEdit(['a.jpg', 'b.jpg'], [], ['a.jpg', 'b.jpg'])).toEqual({
      photos: ['a.jpg', 'b.jpg'],
      gone: [],
    });
  });

  it('removes only what was taken off in the form', () => {
    expect(photosAfterEdit(['a.jpg', 'b.jpg', 'c.jpg'], [kept('a.jpg')], ['c.jpg'])).toEqual({
      photos: ['a.jpg', 'c.jpg'],
      gone: ['b.jpg'],
    });
  });
});
