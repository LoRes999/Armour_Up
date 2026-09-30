import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { type BulkWriter, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, type CallableRequest } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions/options';
import { isValidTimeZone } from './localTime';

/**
 * Shared set-up. Every function module imports this first, which is what
 * makes the global options apply: they are read as each function is defined.
 */
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export const auth = getAuth();

/** Who wrote a document, when it was the server rather than a person. */
export const SERVER = 'server';

export function requireUser(request: CallableRequest) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth;
}

export function requireTrainer(request: CallableRequest) {
  const user = requireUser(request);
  if (user.token.role !== 'trainer') {
    throw new HttpsError('permission-denied', 'Only a coach account can do this.');
  }
  return user;
}

/** A trimmed string of 1…max characters, or a clear refusal. */
export function text(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed.length > max) {
    throw new HttpsError('invalid-argument', `${field} must be between 1 and ${max} characters.`);
  }
  return trimmed;
}

/**
 * Several writes that must all land. A BulkWriter's close() resolves even when
 * some of its writes failed — each failure only rejects that write's own
 * promise — so a caller that just awaited close() reported success over
 * missing tombstones.
 */
export async function writeAll(queue: (writer: BulkWriter) => Promise<unknown>[]): Promise<void> {
  const writer = db.bulkWriter();
  const results = Promise.allSettled(queue(writer));
  await writer.close();
  const failed = (await results).filter((result) => result.status === 'rejected');
  if (failed.length > 0) {
    logger.error('writes failed', { count: failed.length, first: (failed[0] as PromiseRejectedResult).reason });
    throw new HttpsError('unavailable', "That didn't finish. Please try again.");
  }
}

export function timeZoneOr(value: unknown, fallback = 'UTC'): string {
  return typeof value === 'string' && isValidTimeZone(value) ? value : fallback;
}
