import { keepPhoto, photoName } from '../photoStorage';

/**
 * Keeping a picked photo. This module had no tests and now decides how big a
 * photo leaves the phone: the picker's own `quality` recompresses but never
 * resizes, so a 12 MP camera photo stayed 12 MP — one to four megabytes,
 * uploaded over a client's mobile data.
 */

const copy = jest.fn();
const manipulate = jest.fn();

/** Enough of expo-file-system to join paths and record the copy. */
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts.map((part) => (part && typeof part === 'object' ? (part as { uri: string }).uri : String(part))).join('/');
  return {
    Directory: class {
      uri: string;
      constructor(...parts: unknown[]) {
        this.uri = join(parts);
      }
      create() {}
    },
    File: class {
      uri: string;
      extension = '.jpg';
      constructor(...parts: unknown[]) {
        this.uri = join(parts);
      }
      copy(target: { uri: string }) {
        return mockCopy(this.uri, target.uri);
      }
    },
    Paths: { document: 'file:///documents' },
  };
});

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

function mockCopy(from: string, to: string) {
  return copy(from, to);
}
function mockManipulate(...args: unknown[]) {
  return manipulate(...args);
}

beforeEach(() => {
  copy.mockReset().mockResolvedValue(undefined);
  manipulate.mockReset().mockResolvedValue({ uri: 'file:///cache/resized.jpg' });
});

describe('keeping a picked photo', () => {
  it('resizes it before copying it out of the picker cache', async () => {
    await keepPhoto('file:///cache/huge.jpg');

    expect(manipulate).toHaveBeenCalledWith(
      'file:///cache/huge.jpg',
      [{ resize: { width: 1600 } }],
      expect.objectContaining({ compress: 0.7, format: 'jpeg' })
    );
    expect(copy).toHaveBeenCalledWith('file:///cache/resized.jpg', expect.any(String));
  });

  it('keeps the original when resizing fails', async () => {
    manipulate.mockRejectedValue(new Error('no decoder for this'));

    await keepPhoto('file:///cache/odd.heic');

    // A photo that is merely large beats one the coach cannot add at all.
    expect(copy).toHaveBeenCalledWith('file:///cache/odd.heic', expect.any(String));
  });

  it('gives back a uri the photo can be found by later', async () => {
    const uri = await keepPhoto('file:///cache/huge.jpg');

    expect(uri).toContain('/movement-photos/');
    expect(photoName(uri)).not.toBe(null);
  });

  it('knows a uri it did not copy', () => {
    expect(photoName('file:///cache/somewhere-else.jpg')).toBe(null);
  });
});
