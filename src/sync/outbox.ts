import type { CollectionName, Fields, Outbox, OutboxEntry } from './types';

/**
 * The queue of changes waiting for a connection. It is saved in the same
 * write as the data it describes (persistence.ts), so after a crash the two
 * can never disagree about what has and has not been sent.
 */

const sameDoc = (a: { collection: CollectionName; id: string }, b: typeof a) =>
  a.collection === b.collection && a.id === b.id;

/**
 * Adds changes, folding each into any entry already waiting for the same
 * document. Logging eight sets offline is one upload, not eight, and the
 * queue can never hold two versions of one document to apply out of order.
 */
export function enqueue(outbox: Outbox, incoming: readonly OutboxEntry[]): Outbox {
  if (incoming.length === 0) return outbox;
  const next = [...outbox];
  for (const change of incoming) {
    const index = next.findIndex((entry) => sameDoc(entry, change));
    if (index < 0) {
      next.push({ ...change, rev: 0 });
      continue;
    }
    const waiting = next[index];
    if (change.op === 'delete' && waiting.created && !waiting.sent) {
      // Created and deleted before the server ever saw it: nothing to send.
      next.splice(index, 1);
    } else if (change.op === 'delete') {
      next[index] = { collection: waiting.collection, id: waiting.id, op: 'delete', fields: {}, rev: waiting.rev + 1 };
    } else if (waiting.op === 'delete') {
      // Recreated under the same id before the delete went up: the new
      // version is all that matters, and the comparison sent every field.
      next[index] = { ...change, rev: waiting.rev + 1 };
    } else {
      next[index] = {
        ...waiting,
        fields: { ...waiting.fields, ...change.fields },
        rev: waiting.rev + 1,
      };
    }
  }
  return next;
}

/**
 * Removes what the server has confirmed. An entry that changed while its
 * upload was in flight has a newer rev and stays, to be sent again.
 */
export function acknowledge(outbox: Outbox, sent: readonly OutboxEntry[]): Outbox {
  if (sent.length === 0) return outbox;
  return outbox.filter(
    (entry) => !sent.some((done) => sameDoc(done, entry) && done.rev === entry.rev)
  );
}

/**
 * Marks entries as handed to the server, just before they are written. A new
 * document deleted after this is still deleted there: its creation may
 * already have landed.
 */
export function markSent(outbox: Outbox, sending: readonly OutboxEntry[]): Outbox {
  if (sending.length === 0) return outbox;
  return outbox.map((entry) =>
    !entry.sent && sending.some((item) => sameDoc(item, entry)) ? { ...entry, sent: true } : entry
  );
}

/** The change still waiting for one document, if any. */
export function pendingFor(
  outbox: Outbox,
  collection: CollectionName,
  id: string
): { op: 'upsert' | 'delete'; fields: Fields } | undefined {
  return outbox.find((entry) => entry.collection === collection && entry.id === id);
}

/** Drops everything queued for one document — used when the server deletes it. */
export function discard(outbox: Outbox, collection: CollectionName, id: string): Outbox {
  const next = outbox.filter((entry) => !(entry.collection === collection && entry.id === id));
  return next.length === outbox.length ? outbox : next;
}
