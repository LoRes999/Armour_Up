import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { deleteMovementPhotos, uploadMovementPhoto } from '../photoCloud';
import { photoSource } from '../photoStorage';
import { pendingUploads, uploadPending } from '../photoUploads';
import { useStore } from '../store';
import { useCloud } from '../sync/context';

/**
 * Sends a coach's movement photos to Cloud Storage, so their clients can see
 * them. Renders nothing.
 *
 * Saving a movement does not wait for this: the coach's work is already safe
 * on their phone, and blocking Save on a slow connection makes a working app
 * feel broken. A photo picked with no signal goes up the next time the app
 * comes to the front.
 *
 * A name is written to the movement only once its upload has succeeded, which
 * is what makes the work list derivable (see photoUploads.ts) and means a
 * client is never pointed at an object that is not there.
 */
export function PhotoBridge() {
  const store = useStore();
  const session = useCloud();
  const scope = session?.scope ?? null;
  const trainerId = scope?.role === 'trainer' ? scope.trainerId : null;

  // The store rebuilds its functions as data changes; the sweep reads through
  // refs so it is not redefined on every set logged.
  const latest = useRef({ movements: store.customMovements, update: store.updateCustomMovement });
  latest.current = { movements: store.customMovements, update: store.updateCustomMovement };

  const running = useRef(false);

  const sweep = useCallback(async () => {
    if (!trainerId || running.current) return;
    running.current = true;
    try {
      // What happens to each photo, and why, is in uploadPending.
      await uploadPending({
        pending: pendingUploads(latest.current.movements),
        upload: ({ movementId, name, uri }) =>
          uploadMovementPhoto(trainerId, movementId, name, photoSource(uri)),
        current: (movementId) => latest.current.movements.find((m) => m.id === movementId),
        record: (movementId, photos) => latest.current.update(movementId, { photos }),
        orphan: ({ movementId, name }) => void deleteMovementPhotos(trainerId, movementId, [name]),
      });
    } finally {
      running.current = false;
    }
  }, [trainerId]);

  // Whenever the movements change — which includes the moment one is saved.
  useEffect(() => {
    void sweep();
  }, [sweep, store.customMovements]);

  // And on the way back in, for a photo picked with no signal.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sweep();
    });
    return () => listener.remove();
  }, [sweep]);

  return null;
}
