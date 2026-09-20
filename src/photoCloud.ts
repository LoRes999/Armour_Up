import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { firebase } from './firebase';

/**
 * Movement photos in Cloud Storage, so a coach's clients can see them.
 *
 * Only the object's *name* is stored on the movement (see models.ts, `photos`).
 * The full path is built from the coach and the movement, which both sides
 * already know, and the URL is fetched at render time.
 *
 * Deliberately not a download URL. The token in one bypasses storage.rules
 * entirely: anyone the link reached could read the photo for ever, whether or
 * not they are still the coach's client. Asking for the URL each time keeps
 * the rules in force on every fetch, and keeps the Firestore document small —
 * a photo inlined as text would count against its 1 MB limit.
 */

const folder = (trainerId: string, movementId: string) =>
  `trainers/${trainerId}/movements/${movementId}`;

const pathFor = (trainerId: string, movementId: string, name: string) =>
  `${folder(trainerId, movementId)}/${name}`;

/**
 * Resolved URLs, for the life of the app. A URL is good for as long as the
 * object is, and a movement's photos are looked at repeatedly — once from the
 * library, again from the session that programs it.
 */
const urls = new Map<string, Promise<string>>();

/** Uploads one photo. Rejects if it cannot, so the caller can try again later. */
export async function uploadMovementPhoto(
  trainerId: string,
  movementId: string,
  name: string,
  localUri: string
): Promise<void> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const target = ref(firebase().storage, pathFor(trainerId, movementId, name));
  await uploadBytes(target, blob, { contentType: blob.type || 'image/jpeg' });
}

/** Where to load a photo from, or null when it cannot be reached. */
export async function movementPhotoUrl(
  trainerId: string,
  movementId: string,
  name: string
): Promise<string | null> {
  const path = pathFor(trainerId, movementId, name);
  let pending = urls.get(path);
  if (!pending) {
    pending = getDownloadURL(ref(firebase().storage, path));
    urls.set(path, pending);
  }
  try {
    return await pending;
  } catch {
    // Not uploaded yet, or no connection. Forgotten so the next look tries
    // again rather than remembering the failure for the rest of the session.
    urls.delete(path);
    return null;
  }
}

/**
 * Removes photos a coach has taken off a movement. Best effort: the trigger in
 * functions/src/triggers.ts clears a whole movement's folder when it is
 * deleted, which covers a phone that was offline or a delete from elsewhere.
 */
export async function deleteMovementPhotos(
  trainerId: string,
  movementId: string,
  names: readonly string[]
): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      const path = pathFor(trainerId, movementId, name);
      urls.delete(path);
      await deleteObject(ref(firebase().storage, path)).catch(() => undefined);
    })
  );
}
