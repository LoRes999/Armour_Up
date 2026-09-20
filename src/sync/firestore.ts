import {
  type DocumentData,
  type Firestore,
  type Query,
  type DocumentReference,
  Timestamp,
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  type CollectionName,
  type Fields,
  type RemoteAdapter,
  type RemoteChange,
  RemoteWriteError,
  type SyncScope,
} from './types';

/**
 * The sync engine's adapter for Cloud Firestore. Everything Firestore-shaped
 * lives here: paths, timestamps, soft deletes and error codes.
 *
 * Layout: trainers/{trainerId}/{clients|workouts|dayTypes|movements}/{id}.
 */

/**
 * Worth trying again later. Anything else — a permission the rules deny, a
 * document too large — will fail the same way every time.
 */
const RETRYABLE = new Set([
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'aborted',
  'internal',
  'unknown',
  'cancelled',
  // A sign-in token that expired mid-upload refreshes itself.
  'unauthenticated',
]);

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'unknown';
}

function millisOf(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

export function firestoreAdapter(db: Firestore): RemoteAdapter {
  const ref = (scope: SyncScope, name: CollectionName, id: string) =>
    doc(db, 'trainers', scope.trainerId, name, id);

  return {
    async write(scope, entries) {
      const batch = writeBatch(db);
      for (const entry of entries) {
        const stamp = { updatedAt: serverTimestamp(), updatedBy: scope.uid };
        if (entry.op === 'delete') {
          // Soft: a phone that was offline when this happened still needs to
          // hear about it, and only an update can reach a listener asking for
          // changes since its last sync.
          batch.set(ref(scope, entry.collection, entry.id), { deleted: true, ...stamp }, { merge: true });
          continue;
        }
        const fields: DocumentData = {};
        for (const [key, value] of Object.entries(entry.fields)) {
          fields[key] = value === null ? deleteField() : value;
        }
        // Never `deleted: false`. A document with no `deleted` field reads as
        // live everywhere, and leaving it out means an edit from a phone that
        // was offline when the document was deleted elsewhere cannot bring it
        // back: the delete wins, as it does in merge.ts.
        batch.set(ref(scope, entry.collection, entry.id), { ...fields, ...stamp }, { merge: true });
      }
      try {
        await batch.commit();
      } catch (error) {
        const code = codeOf(error);
        throw new RemoteWriteError(code, RETRYABLE.has(code));
      }
    },

    subscribe(scope, since, onChanges, onError) {
      // Inclusive: a document written in the same millisecond as the last one
      // seen must not be skipped. Seeing one twice is harmless.
      const after = where('updatedAt', '>=', Timestamp.fromMillis(since));
      const base = (name: CollectionName) => collection(db, 'trainers', scope.trainerId, name);

      const targets: { name: CollectionName; source: Query | DocumentReference }[] =
        scope.role === 'trainer'
          ? (['clients', 'dayTypes', 'movements', 'workouts'] as const).map((name) => ({
              name,
              source: query(base(name), after),
            }))
          : [
              { name: 'clients', source: ref(scope, 'clients', scope.clientId) },
              { name: 'dayTypes', source: query(base('dayTypes'), after) },
              { name: 'movements', source: query(base('movements'), after) },
              {
                name: 'workouts',
                source: query(base('workouts'), where('clientId', '==', scope.clientId), after),
              },
            ];

      const stops = targets.map(({ name, source }) => {
        const deliver = (changes: RemoteChange[], serverTime: number) => onChanges(changes, serverTime);

        if (source.type === 'document') {
          return onSnapshot(
            source as DocumentReference,
            (snapshot) => {
              // Our own write, before the server has confirmed it: it is
              // already on screen, and it comes back confirmed shortly.
              if (snapshot.metadata.hasPendingWrites) return;
              const data = snapshot.exists() ? (snapshot.data() as Fields) : null;
              deliver([{ collection: name, id: snapshot.id, data }], millisOf(data?.updatedAt));
            },
            onError
          );
        }

        return onSnapshot(
          source as Query,
          (snapshot) => {
            let newest = 0;
            const changes: RemoteChange[] = [];
            for (const change of snapshot.docChanges()) {
              // Our own write, before the server has confirmed it.
              if (change.doc.metadata.hasPendingWrites) continue;
              // A `removed` here means the document left this query's results,
              // which is not the same as being deleted — and in this app it is
              // never a deletion. Deletes are soft (see write() above): the
              // document stays, gains `deleted: true`, and arrives as an
              // ordinary change that merge.ts already understands.
              //
              // What `removed` really meant was the flicker Ryan reported on
              // 2026-09-20. The filter below is `updatedAt >= since`, and a
              // write stamps updatedAt with a server timestamp that is
              // unresolved on this phone until the server answers. For that
              // second the document fails its own filter, Firestore reports it
              // as removed, and reading that as a deletion took the session
              // off the screen mid-edit — and discarded the queued upload with
              // it, so the edit could be lost for good.
              //
              // The one other way a document could leave: a client's workout
              // query also filters on clientId, so moving a workout to another
              // client would look like this. Nothing changes clientId after a
              // workout is created. Anything that starts to must send a
              // tombstone as well.
              if (change.type === 'removed') continue;
              const data = change.doc.data() as Fields;
              newest = Math.max(newest, millisOf(data?.updatedAt));
              changes.push({ collection: name, id: change.doc.id, data });
            }
            deliver(changes, newest);
          },
          onError
        );
      });

      return () => stops.forEach((stop) => stop());
    },
  };
}
