import { type PushMessage, isExpoPushToken, sendPush } from '../expoPush';

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

describe('sending through the Expo push service', () => {
  it('sends in batches of at most 100', async () => {
    const { requests, fetchImpl } = fakeExpo((batch) => ({ data: batch.map(() => ({ status: 'ok' })) }));
    const messages = Array.from({ length: 150 }, (_, i) => message(`ExponentPushToken[${i}]`));

    const result = await sendPush(messages, fetchImpl);
    expect(requests.map((batch) => batch.length)).toEqual([100, 50]);
    expect(result).toEqual({ sent: 150, failed: 0, deadTokens: [] });
  });

  it('reports the tokens of phones that no longer have the app', async () => {
    const { fetchImpl } = fakeExpo(() => ({
      data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }],
    }));
    const result = await sendPush([message('ExponentPushToken[a]'), message('ExponentPushToken[b]')], fetchImpl);
    expect(result).toEqual({ sent: 1, failed: 1, deadTokens: ['ExponentPushToken[b]'] });
  });

  it('counts a refused request as failed instead of throwing', async () => {
    const { fetchImpl } = fakeExpo(() => ({}), false);
    expect(await sendPush([message('ExponentPushToken[a]')], fetchImpl)).toEqual({
      sent: 0,
      failed: 1,
      deadTokens: [],
    });
  });

  it('recognises an Expo push token', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc]')).toBe(true);
    expect(isExpoPushToken('fcm-token-abc')).toBe(false);
  });
});
