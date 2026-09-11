import { HEADLINES, SessionReward, trainerHeadline } from '../rewards';

/**
 * The trainer's celebration card is about somebody else. It used to reuse the
 * client's lines, so a coach read "Your first session is done." about Marcus.
 */

const base: SessionReward = {
  tier: 'standard',
  sets: 5,
  minutes: 40,
  prs: [],
  streak: 3,
  headline: HEADLINES.standard[0],
};

const record = { movementName: 'Barbell Bench Press', weight: 90, previousWeight: 87.5 };

describe('trainerHeadline', () => {
  it('speaks about the client on their first session', () => {
    expect(trainerHeadline({ ...base, tier: 'milestone', milestone: 1 }, 'Marcus')).toBe(
      "Marcus's first session is in the books."
    );
  });

  it('names a later milestone', () => {
    expect(trainerHeadline({ ...base, tier: 'milestone', milestone: 10 }, 'Marcus')).toBe(
      "Marcus's 10th session."
    );
  });

  it('credits the client with a record', () => {
    expect(trainerHeadline({ ...base, tier: 'pr', prs: [record] }, 'Marcus')).toBe(
      'A new record for Marcus.'
    );
  });

  it('counts several records', () => {
    expect(trainerHeadline({ ...base, tier: 'pr', prs: [record, record] }, 'Marcus')).toBe(
      '2 new records for Marcus.'
    );
  });

  it('keeps an ordinary finish on the neutral line', () => {
    expect(trainerHeadline(base, 'Marcus')).toBe(HEADLINES.standard[0]);
  });

  // The whole point: whatever the tier, never the second person.
  it('never talks to the trainer as though they did the lifting', () => {
    const rewards: SessionReward[] = [
      { ...base, tier: 'milestone', milestone: 1 },
      { ...base, tier: 'milestone', milestone: 25 },
      { ...base, tier: 'pr', prs: [record] },
      ...HEADLINES.standard.map((headline) => ({ ...base, headline })),
    ];
    for (const reward of rewards) {
      expect(trainerHeadline(reward, 'Marcus')).not.toMatch(/\b(you|your)\b/i);
    }
  });
});
