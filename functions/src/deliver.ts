import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { type PushMessage, isExpoPushToken, sendPush } from './expoPush';
import type { Message } from './planner';

/**
 * Sends planned messages, each at most once.
 *
 * Before sending, a message claims its de-duplication key (and its daily cap
 * key, if it has one) in notificationLog inside a transaction. A retried
 * function run, or two overlapping scheduler runs, find the key already taken
 * and send nothing. Claiming before sending means a crash in between loses a
 * notification rather than sending it twice — the better failure for something
 * people can switch off — and going a batch at a time keeps that loss to the
 * batch in hand.
 */

/** Log entries are only needed while a repeat is possible. A TTL policy on expireAt removes them. */
const LOG_KEEP_MS = 30 * 86_400_000;

function logId(uid: string, key: string) {
  return `${uid}_${key}`.replace(/\//g, '_');
}

async function claim(db: Firestore, message: Message): Promise<boolean> {
  const log = db.collection('notificationLog');
  const keys = [message.dedupeKey, ...(message.capKey ? [message.capKey] : [])].map((key) =>
    log.doc(logId(message.uid, key))
  );
  return db.runTransaction(async (tx) => {
    const existing = await Promise.all(keys.map((ref) => tx.get(ref)));
    if (existing.some((snapshot) => snapshot.exists)) return false;
    const expireAt = Timestamp.fromMillis(Date.now() + LOG_KEEP_MS);
    for (const ref of keys) {
      tx.create(ref, { uid: message.uid, kind: message.kind, sentAt: FieldValue.serverTimestamp(), expireAt });
    }
    return true;
  });
}

/** Messages claimed and sent together. Expo takes up to 100 per request. */
const BATCH = 100;

export async function deliver(
  db: Firestore,
  messages: readonly Message[],
  send: typeof sendPush = sendPush,
  batchSize = BATCH
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  // A batch at a time: claimed, sent, then the next. Claiming every message
  // first meant a run that ran out of time before sending lost everything it
  // had claimed, and its retry skipped the lot as already sent.
  for (let start = 0; start < messages.length; start += batchSize) {
    const outgoing: PushMessage[] = [];
    const owners = new Map<string, string>();

    for (const message of messages.slice(start, start + batchSize)) {
      if (!(await claim(db, message))) {
        skipped += 1;
        continue;
      }
      const tokens = await db.collection('users').doc(message.uid).collection('pushTokens').get();
      for (const token of tokens.docs) {
        if (!isExpoPushToken(token.id)) continue;
        owners.set(token.id, message.uid);
        outgoing.push({
          to: token.id,
          title: message.title,
          body: message.body,
          sound: 'default',
          data: { route: message.route, kind: message.kind },
        });
      }
    }

    if (outgoing.length === 0) continue;
    const result = await send(outgoing);
    sent += result.sent;

    // A token for a phone that deleted the app will fail forever; stop trying.
    await Promise.all(
      result.deadTokens.map((token) => {
        const uid = owners.get(token);
        return uid ? db.collection('users').doc(uid).collection('pushTokens').doc(token).delete() : null;
      })
    );
  }
  return { sent, skipped };
}
