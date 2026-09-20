import type { CustomMovement } from './models';
import { photoName } from './photoStorage';

/**
 * Getting a coach's movement photos to their clients.
 *
 * What is still to send is worked out from the movements themselves: a photo's
 * name is written to `photos` only after its upload has succeeded, so anything
 * on this phone whose name is not in there has not gone up. No second queue to
 * keep in step, and nothing to lose if the app is closed mid-upload.
 */

export interface PendingUpload {
  movementId: string;
  /** The object's name in Cloud Storage, which is also its file name here. */
  name: string;
  /** Where to read it from on this phone. */
  uri: string;
}

export function pendingUploads(movements: readonly CustomMovement[]): PendingUpload[] {
  const pending: PendingUpload[] = [];
  for (const movement of movements) {
    const sent = new Set(movement.photos ?? []);
    for (const uri of movement.photoUris) {
      // No name means this phone never copied it: a browser's data URI, or a
      // picked photo whose copy failed and which is still in the picker cache.
      // Neither has anywhere to be stored under.
      const name = photoName(uri);
      if (!name || sent.has(name)) continue;
      pending.push({ movementId: movement.id, name, uri });
    }
  }
  return pending;
}
