import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Photos on custom movements, kept where the operating system will not clear them.
 *
 * The image picker hands back a link into its own cache folder, and that link
 * used to be saved as-is. iOS and Android both empty caches when storage runs
 * low, so a movement's photos could turn into blank squares weeks later. Picked
 * photos are now copied into the app's documents folder, which is only removed
 * with the app.
 *
 * In a browser there is no such folder: the picker returns the image itself as
 * a data URI, and that is stored unchanged.
 */

const FOLDER = 'movement-photos';
const MARKER = `/${FOLDER}/`;

const enabled = Platform.OS !== 'web';

function folder(): Directory {
  return new Directory(Paths.document, FOLDER);
}

/** The file name of a photo this module copied, or null for any other uri. */
function copiedName(uri: string): string | null {
  const at = uri.lastIndexOf(MARKER);
  return at < 0 ? null : uri.slice(at + MARKER.length);
}

/**
 * Copies a picked photo into the documents folder and returns the uri to save.
 * If the copy fails, the original link is kept — a photo that might disappear
 * later is better than one that is refused now.
 */
export async function keepPhoto(pickedUri: string): Promise<string> {
  if (!enabled) return pickedUri;
  try {
    const dir = folder();
    dir.create({ intermediates: true, idempotent: true });
    const source = new File(pickedUri);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${source.extension || '.jpg'}`;
    const target = new File(dir, name);
    await source.copy(target);
    return target.uri;
  } catch {
    return pickedUri;
  }
}

/**
 * The uri to display for a saved photo.
 *
 * iOS moves the app's folders to a new path whenever the app is updated, so a
 * saved absolute uri into the documents folder points nowhere after an update.
 * Photos this module copied are found again by their file name instead.
 */
export function photoSource(savedUri: string): string {
  const name = enabled ? copiedName(savedUri) : null;
  if (!name) return savedUri;
  try {
    return new File(folder(), name).uri;
  } catch {
    return savedUri;
  }
}

/**
 * Deletes the copies behind these uris — photos taken off a movement, left in a
 * discarded form, or belonging to a deleted movement. Uris this module did not
 * copy are ignored.
 *
 * Deliberately told what to delete rather than sweeping for whatever no
 * movement mentions: a launch that could not read the saved store sees no
 * movements at all, and a sweep then would delete every photo.
 */
export function discardPhotos(uris: readonly string[]): void {
  if (!enabled) return;
  for (const uri of uris) {
    const name = copiedName(uri);
    if (!name) continue;
    try {
      const file = new File(folder(), name);
      if (file.exists) file.delete();
    } catch {
      // Housekeeping only; a stray file costs some storage, nothing more.
    }
  }
}

/** Deletes every copied photo. Account deletion has to leave nothing behind. */
export function clearPhotos(): void {
  if (!enabled) return;
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    // Nothing useful to report from here; see clearSnapshot in persistence.ts.
  }
}
