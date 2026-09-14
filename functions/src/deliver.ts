import { FieldValue, type Firestore, Timestamp } from 'firebase-admin/firestore';
import { type PushMessage, fetchReceipts, isExpoPushToken, sendPush } from './expoPush';
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

/** Expo's receipt for a message is ready about a quarter of an hour after it is sent… */
const RECEIPT_WAIT_MS = 15 * 60_000;
/** …and kept for a day. A TTL policy on pushReceipts.expireAt clears any never read. */
const RECEIPT_KEEP_MS = 86_400_000;

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
    // Every account a token is on: a phone two people have signed in on is
    // listed under both, and a dead one has to come off both.
    const owners = new Map<string, Set<string>>();

    for (const message of messages.slice(start, start + batchSize)) {
      if (!(await claim(db, message))) {
        skipped += 1;
        continue;
      }
      const tokens = await db.collection('users').doc(message.uid).collection('pushTokens').get();
      for (const token of tokens.docs) {
        if (!isExpoPushToken(token.id)) continue;
        owners.set(token.id, (owners.get(token.id) ?? new Set<string>()).add(message.uid));
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

    const now = Date.now();
    const writer = db.bulkWriter();
    // Kept until its receipt is read: that is where Expo reports most dead phones.
    const tickets = new Map((result.tickets ?? []).map((ticket) => [ticket.id, ticket]));
    for (const ticket of tickets.values()) {
      writer.set(db.collection('pushReceipts').doc(ticket.id), {
        token: ticket.token,
        uids: [...(owners.get(ticket.token) ?? [])],
        checkAfter: Timestamp.fromMillis(now + RECEIPT_WAIT_MS),
        expireAt: Timestamp.fromMillis(now + RECEIPT_KEEP_MS),
      });
    }
    // A token for a phone that deleted the app will fail forever; stop trying.
    for (const token of result.deadTokens) {
      for (const uid of owners.get(token) ?? []) {
        writer.delete(db.collection('users').doc(uid).collection('pushTokens').doc(token));
      }
    }
    await writer.close();
  }
  return { sent, skipped };
}

/**
 * Reads the receipts that are due and takes phones that no longer have the
 * app off every account they are on. Answered tickets are done with; one with
 * no receipt yet is asked about on a later run.
 */
export async function checkReceipts(
  db: Firestore,
  fetchImpl?: Parameters<typeof fetchReceipts>[1]
): Promise<{ checked: number; removed: number }> {
  const due = await db.collection('pushReceipts').where('checkAfter', '<=', Timestamp.now()).limit(1000).get();
  if (due.empty) return { checked: 0, removed: 0 };

  const { answered, dead } = await fetchReceipts(
    due.docs.map((doc) => doc.id),
    fetchImpl
  );
  const byId = new Map(due.docs.map((doc) => [doc.id, doc]));
  let removed = 0;

  const writer = db.bulkWriter();
  for (const id of dead) {
    const receipt = byId.get(id);
    const token = receipt?.get('token');
    const uids = receipt?.get('uids');
    if (typeof token !== 'string' || !Array.isArray(uids)) continue;
    for (const uid of uids) {
      if (typeof uid !== 'string') continue;
      writer.delete(db.collection('users').doc(uid).collection('pushTokens').doc(token));
      removed += 1;
    }
  }
  for (const id of answered) writer.delete(db.collection('pushReceipts').doc(id));
  await writer.close();

  return { checked: answered.length, removed };
}
