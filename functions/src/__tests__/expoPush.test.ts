import { type PushMessage, fetchReceipts, isExpoPushToken, sendPush } from '../expoPush';

const message = (to: string): PushMessage => ({
  to,
  title: 'Push Day A today',
  body: '6:00 PM with Ryan.',
  sound: 'default',
  data: { route: '/(client)', kind: 'reminder' },
});

function fakeExpo(reply: (batch: PushMessage[]) => unknown, ok = true) {
  const requests: PushMessage[][] = [];
  const fetchImpl = async (_url: string, init: { body: string }) => {
    const batch = JSON.parse(init.body) as PushMessage[];
    requests.push(batch);
    return { ok, json: async () => reply(batch) };
  };
  return { requests, fetchImpl };
}

/**
 * Most dead phones are reported only later, in a receipt fetched with the
 * ticket ids the send returned; the send itself usually just says "ok". With
 * neither kept, the token of a phone that had deleted the app stayed on the
 * account for good, and every send to it failed.
 */
describe('push receipts', () => {
  it('keeps the ticket id for each token it sent to', async () => {
    const { fetchImpl } = fakeExpo((batch) => ({
      data: batch.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })),
    }));

    const result = await sendPush([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')], fetchImpl);

    expect(result.tickets).toEqual([
      { id: 'ticket-0', token: 'ExponentPushToken[a]' },
      { id: 'ticket-1', token: 'ExponentPushToken[b]' },
    ]);
  });

  it("reads which tickets' phones no longer have the app", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          data: {
            'ticket-0': { status: 'ok' },
            'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } },
          },
        }),
      };
    };

    const result = await fetchReceipts(['ticket-0', 'ticket-1', 'ticket-2'], fetchImpl);

    expect(bodies).toEqual([{ ids: ['ticket-0', 'ticket-1', 'ticket-2'] }]);
    expect(result.dead).toEqual(['ticket-1']);
    // Answered, so done with. ticket-2 isn't ready yet and is asked about next time.
    expect(result.answered).toEqual(['ticket-0', 'ticket-1']);
  });

  it('asks again next time when the request fails', async () => {
    const fetchImpl = async () => ({ ok: false, json: async () => ({}) });

    expect(await fetchReceipts(['ticket-0'], fetchImpl)).toEqual({ answered: [], dead: [] });
  });
});

describe('sending through the Expo push service', () => {
  it('sends in batches of at most 100', async () => {
    const { requests, fetchImpl } = fakeExpo((batch) => ({ data: batch.map(() => ({ status: 'ok' })) }));
    const messages = Array.from({ length: 150 }, (_, i) => message(`ExponentPushToken[${i}]`));

    const result = await sendPush(messages, fetchImpl);
    expect(requests.map((batch) => batch.length)).toEqual([100, 50]);
    expect(result).toEqual({ sent: 150, failed: 0, deadTokens: [], tickets: [] });
  });

  it('reports the tokens of phones that no longer have the app', async () => {
    const { fetchImpl } = fakeExpo(() => ({
      data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
    }));
    const result = await sendPush([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')], fetchImpl);
    expect(result).toEqual({ sent: 1, failed: 1, deadTokens: ['ExponentPushToken[b]'], tickets: [] });
  });

  it('counts a refused request as failed instead of throwing', async () => {
    const { fetchImpl } = fakeExpo(() => ({}), false);
    expect(await sendPush([message('ExponentPushToken[a]')], fetchImpl)).toEqual({
      sent: 0,
      failed: 1,
      deadTokens: [],
      tickets: [],
    });
  });

  it('recognises an Expo push token', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('fcm-token-abc')).toBe(false);
  });
});
