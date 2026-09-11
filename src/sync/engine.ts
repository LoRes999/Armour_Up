import { acknowledge } from './outbox';
import { type Outbox, type OutboxEntry, type RemoteAdapter, RemoteWriteError, type SyncScope } from './types';

/**
 * Uploads the queue. Entries leave it only once the server has confirmed them,
 * so a dropped connection mid-upload loses nothing: the rest is still queued
 * and goes up next time.
 */

/** Firestore takes 500 writes per batch; this leaves room to spare. */
export const BATCH_LIMIT = 450;

export interface FlushDeps {
  adapter: RemoteAdapter;
  scope: SyncScope;
  /** The queue as it is right now — it may grow while an upload is in flight. */
  readOutbox: () => Outbox;
  updateOutbox: (change: (outbox: Outbox) => Outbox) => void;
}

export interface FlushResult {
  sent: number;
  /** Changes the server refused and that were dropped. */
  rejected: number;
  /** Stopped early because the server could not be reached. Try again later. */
  interrupted: boolean;
}

const retryable = (error: unknown) => !(error instanceof RemoteWriteError) || error.retryable;

export async function flushOutbox(deps: FlushDeps): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, rejected: 0, interrupted: false };

  const confirm = (entries: readonly OutboxEntry[]) =>
    deps.updateOutbox((outbox) => acknowledge(outbox, entries));

  for (;;) {
    const batch = deps.readOutbox().slice(0, BATCH_LIMIT);
    if (batch.length === 0) return result;

    try {
      await deps.adapter.write(deps.scope, batch);
      confirm(batch);
      result.sent += batch.length;
      continue;
    } catch (error) {
      if (retryable(error)) return { ...result, interrupted: true };
    }

    // The server refused something in the batch, and a batch fails as a whole.
    // Retry one at a time to find the change it will never accept, so that one
    // bad entry cannot hold every other change back for good.
    for (const entry of batch) {
      try {
        await deps.adapter.write(deps.scope, [entry]);
        result.sent += 1;
      } catch (error) {
        if (retryable(error)) return { ...result, interrupted: true };
        result.rejected += 1;
      }
      confirm([entry]);
    }
  }
}

/** Seconds before the next attempt after `failures` interrupted uploads: 2, 4, 8 … 60. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(1, failures));
}
