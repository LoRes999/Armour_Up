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

const hasFile = (movement: CustomMovement, name: string) =>
  movement.photoUris.some((uri) => photoName(uri) === name);

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

/**
 * Sends each pending photo and records its name on the movement.
 *
 * - A photo that fails is skipped, not the end of the sweep. One the server
 *   always refuses used to stop every photo after it, for good; the next
 *   sweep tries the failures again.
 * - A photo taken off the movement while it was on its way up is not
 *   recorded — that put a photo the coach had removed back in front of their
 *   clients — and its object is handed to `orphan` to clear away.
 * - Names recorded earlier in the same sweep are carried along. The movement
 *   read after an await can still be the one from before them, and writing
 *   from it replaced the name just recorded.
 */
export async function uploadPending(deps: {
  pending: readonly PendingUpload[];
  upload: (item: PendingUpload) => Promise<void>;
  /** The movement as it is now. */
  current: (movementId: string) => CustomMovement | undefined;
  record: (movementId: string, photos: string[]) => void;
  orphan: (item: PendingUpload) => void;
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const recorded = new Map<string, string[]>();
  for (const item of deps.pending) {
    try {
      await deps.upload(item);
    } catch {
      failed += 1;
      continue;
    }
    const movement = deps.current(item.movementId);
    // Deleted while the upload was in flight: the trigger clears its folder.
    if (!movement) continue;
    if (!hasFile(movement, item.name)) {
      deps.orphan(item);
      continue;
    }
    const names = [...(movement.photos ?? [])];
    for (const name of [...(recorded.get(item.movementId) ?? []), item.name]) {
      if (!names.includes(name)) names.push(name);
    }
    recorded.set(item.movementId, names);
    deps.record(item.movementId, names);
    sent += 1;
  }
  return { sent, failed };
}

/** A movement's photos that are in the cloud but not on this phone. */
export function remoteOnly(names: readonly string[], localUris: readonly string[]): string[] {
  const here = new Set(localUris.map(photoName));
  return names.filter((name) => !here.has(name));
}

/**
 * The movement's photo names after an edit, and the ones taken off.
 *
 * Only what the form actually removed goes: a photo kept on this phone, or a
 * cloud-only photo still showing in the form, stays. The form used to know
 * only this phone's files, so on a second phone every name looked removed.
 */
export function photosAfterEdit(
  names: readonly string[],
  keptLocalUris: readonly string[],
  keptRemote: readonly string[]
): { photos: string[]; gone: string[] } {
  const kept = new Set([...keptLocalUris.map(photoName), ...keptRemote]);
  return {
    photos: names.filter((name) => kept.has(name)),
    gone: names.filter((name) => !kept.has(name)),
  };
}
