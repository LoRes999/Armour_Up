import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

/**
 * Removing movement photos from Cloud Storage.
 *
 * Always housekeeping, never the point of the call: a photo left behind costs
 * a little storage and is unreachable anyway, because whatever pointed at it
 * has gone. So this never throws, and — the part that matters — it can never
 * hang the caller. Deleting an account must not be held up by a bucket that
 * is slow, misconfigured or, as in the emulator, not really there at all.
 */

const CLEANUP_TIMEOUT_MS = 10_000;

function timeout(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    // unref so a pending timer cannot keep the process alive once the real
    // work has finished.
    setTimeout(() => reject(new Error('storage cleanup timed out')), ms).unref?.();
  });
}

/** Deletes everything under `prefix`. Reports a failure and carries on. */
export async function removeStoredPhotos(
  prefix: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    await Promise.race([getStorage().bucket().deleteFiles({ prefix }), timeout(CLEANUP_TIMEOUT_MS)]);
  } catch (error) {
    logger.warn('movement photos not removed', { prefix, ...context, error });
  }
}

/** Where one movement's photos live. Mirrors photoCloud.ts on the phone. */
export const movementPhotoPrefix = (trainerId: string, movementId: string) =>
  `trainers/${trainerId}/movements/${movementId}/`;

/** Every movement photo a coach has. */
export const trainerPhotoPrefix = (trainerId: string) => `trainers/${trainerId}/movements/`;
