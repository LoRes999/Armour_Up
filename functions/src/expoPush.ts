/**
 * Expo's push service. One HTTPS call delivers through Firebase Cloud
 * Messaging on Android and Apple's push service on iPhone, using the
 * credentials uploaded to the Expo project — so this code never handles an
 * APNs key or an FCM service account.
 */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo accepts up to 100 messages per request. */
const CHUNK = 100;
/** …and up to 1,000 receipt ids per request. */
const RECEIPT_CHUNK = 1000;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  /** Read by the app when the notification is tapped. */
  data: Record<string, string>;
}

interface PushTicket {
  status: 'ok' | 'error';
  /** On an accepted message: the id its receipt is fetched with later. */
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens Expo says no longer reach a device: the app was deleted, or signed out. */
  deadTokens: string[];
  /**
   * Accepted messages, by ticket id. Most dead phones are reported only later,
   * in the receipt for that id (fetchReceipts), not in the send's own answer.
   */
  tickets: { id: string; token: string }[];
}

export const isExpoPushToken = (token: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export async function sendPush(messages: readonly PushMessage[], fetchImpl: Fetch = fetch): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, deadTokens: [], tickets: [] };
  for (let start = 0; start < messages.length; start += CHUNK) {
    const chunk = messages.slice(start, start + CHUNK);
    let tickets: PushTicket[];
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!response.ok) throw new Error('Expo push service refused the request');
      tickets = ((await response.json()) as { data?: PushTicket[] }).data ?? [];
    } catch {
      // A missed notification is not worth failing the whole run over; the
      // next one will arrive, and the log already stops a repeat of this one.
      result.failed += chunk.length;
      continue;
    }
    chunk.forEach((message, index) => {
      const ticket = tickets[index];
      if (ticket?.status === 'ok') {
        result.sent += 1;
        if (ticket.id) result.tickets.push({ id: ticket.id, token: message.to });
        return;
      }
      result.failed += 1;
      if (ticket?.details?.error === 'DeviceNotRegistered') result.deadTokens.push(message.to);
    });
  }
  return result;
}

interface PushReceipt {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/**
 * Asks Expo what became of messages it accepted. A receipt is ready about a
 * quarter of an hour after the send and kept for a day; an id with no receipt
 * yet is left out of `answered`, to be asked about on a later run. `dead` are
 * the tickets whose phone no longer has the app.
 */
export async function fetchReceipts(
  ids: readonly string[],
  fetchImpl: Fetch = fetch
): Promise<{ answered: string[]; dead: string[] }> {
  const answered: string[] = [];
  const dead: string[] = [];
  for (let start = 0; start < ids.length; start += RECEIPT_CHUNK) {
    const chunk = ids.slice(start, start + RECEIPT_CHUNK);
    let receipts: Record<string, PushReceipt>;
    try {
      const response = await fetchImpl(RECEIPTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      });
      if (!response.ok) throw new Error('Expo push service refused the request');
      receipts = ((await response.json()) as { data?: Record<string, PushReceipt> }).data ?? {};
    } catch {
      // Nothing answered this time; the same ids are asked about next run.
      continue;
    }
    for (const id of chunk) {
      const receipt = receipts[id];
      if (!receipt) continue;
      answered.push(id);
      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') dead.push(id);
    }
  }
  return { answered, dead };
}
