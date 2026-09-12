import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { type PushMessage, isExpoPushToken, sendPush } from './expoPush';
import type { Message } from './planner';

/**
 * Sends planned messages, each at most once.
 *
 * Before sending, a message claims its de-duplication key (and its daily cap
 * key, if it has one) in notificationLog inside a transaction. A retried
 * function run, or two overlapping scheduler runs, find the key already taken
 * and send nothing. Claiming first means a crash between claim and send loses
 * one notification rather than sending it twice — the better failure for
 * something people can switch off.
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

export async function deliver(
  db: Firestore,
  messages: readonly Message[],
  send: typeof sendPush = sendPush
): Promise<{ sent: number; skipped: number }> {
  const outgoing: PushMessage[] = [];
  const owners = new Map<string, string>();
  let skipped = 0;

  for (const message of messages) {
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

  if (outgoing.length === 0) return { sent: 0, skipped };
  const result = await send(outgoing);

  // A token for a phone that deleted the app will fail forever; stop trying.
  await Promise.all(
    result.deadTokens.map((token) => {
      const uid = owners.get(token);
      return uid ? db.collection('users').doc(uid).collection('pushTokens').doc(token).delete() : null;
    })
  );
  return { sent: result.sent, skipped };
}
