/**
 * Expo's push service. One HTTPS call delivers through Firebase Cloud
 * Messaging on Android and Apple's push service on iPhone, using the
 * credentials uploaded to the Expo project — so this code never handles an
 * APNs key or an FCM service account.
 */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts up to 100 messages per request. */
const CHUNK = 100;

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
  message?: string;
  details?: { error?: string };
}

export interface PushResult {
  sent: number;
  failed: number;
  /** Tokens Expo says no longer reach a device: the app was deleted, or signed out. */
  deadTokens: string[];
}

export const isExpoPushToken = (token: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

export async function sendPush(messages: readonly PushMessage[], fetchImpl: Fetch = fetch): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, deadTokens: [] };
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
        return;
      }
      result.failed += 1;
      if (ticket?.details?.error === 'DeviceNotRegistered') result.deadTokens.push(message.to);
    });
  }
  return result;
}
