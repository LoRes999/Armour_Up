import { pendingUploads } from '../photoUploads';
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
