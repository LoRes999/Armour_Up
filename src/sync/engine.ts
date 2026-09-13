import { acknowledge, markSent } from './outbox';
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
  /**
   * Fetches a fresh sign-in token. Given one, an upload the server refuses is
   * tried once more with it before anything is dropped: right after a coach
   * creates their account, the token on the phone is a moment older than the
   * role the server has just given them.
   */
  refreshToken?: () => Promise<void>;
  /**
   * Whether the account this upload started for is still the one signed in.
   * Checked before every write: after a sign-out the queue belongs to whoever
   * signs in next, and their changes must never go up under this account.
   */
  stillCurrent?: () => boolean;
}

export interface FlushResult {
  sent: number;
  /** Changes the server refused and that were dropped. */
  rejected: number;
  /** Stopped early because the server could not be reached. Try again later. */
  interrupted: boolean;
}

const retryable = (error: unknown) => !(error instanceof RemoteWriteError) || error.retryable;

/** The adapter names the server's refusal in the error's message. */
const deniedAccess = (error: unknown) => error instanceof RemoteWriteError && error.message === 'permission-denied';

export async function flushOutbox(deps: FlushDeps): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, rejected: 0, interrupted: false };

  const confirm = (entries: readonly OutboxEntry[]) =>
    deps.updateOutbox((outbox) => acknowledge(outbox, entries));

  let refreshed = false;
  for (;;) {
    const batch = deps.readOutbox().slice(0, BATCH_LIMIT);
    if (batch.length === 0) return result;
    if (deps.stillCurrent && !deps.stillCurrent()) return { ...result, interrupted: true };

    try {
      deps.updateOutbox((outbox) => markSent(outbox, batch));
      await deps.adapter.write(deps.scope, batch);
      confirm(batch);
      result.sent += batch.length;
      continue;
    } catch (error) {
      if (retryable(error)) return { ...result, interrupted: true };
      // Refused for a role the token may simply not carry yet: send the same
      // batch once more on a fresh token before giving any of it up. If the
      // token can't be refreshed now (offline), everything waits for later.
      if (deniedAccess(error) && deps.refreshToken && !refreshed) {
        refreshed = true;
        try {
          await deps.refreshToken();
        } catch {
          return { ...result, interrupted: true };
        }
        continue;
      }
    }

    // The server refused something in the batch, and a batch fails as a whole.
    // Retry one at a time to find the change it will never accept, so that one
    // bad entry cannot hold every other change back for good.
    for (const entry of batch) {
      if (deps.stillCurrent && !deps.stillCurrent()) return { ...result, interrupted: true };
      try {
        deps.updateOutbox((outbox) => markSent(outbox, [entry]));
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
