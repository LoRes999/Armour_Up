import { friendlyAuthError } from '../authErrors';

const failure = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('sign-in errors, in words', () => {
  it('explains the common failures and what to do', () => {
    expect(friendlyAuthError(failure('auth/email-already-in-use'))).toBe(
      'There is already an account with that email. Sign in instead.'
    );
    expect(friendlyAuthError(failure('auth/network-request-failed'))).toBe(
      "You're offline. Signing in needs a connection."
    );
  });

  // Firebase now answers a wrong password and an unknown email the same way,
  // so the message cannot be used to find out who has an account.
  it('never says which of email or password was wrong', () => {
    const messages = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].map((code) =>
      friendlyAuthError(failure(code))
    );
    expect(new Set(messages).size).toBe(1);
  });

  it("passes on our own functions' refusals, which are already written for people", () => {
    expect(
      friendlyAuthError(failure('functions/not-found', "That code doesn't match an invitation. Check it with your coach."))
    ).toBe("That code doesn't match an invitation. Check it with your coach.");
  });

  it('hides internal errors and anything unrecognised', () => {
    const fallback = 'Something went wrong. Check your connection and try again.';
    expect(friendlyAuthError(failure('functions/internal', 'INTERNAL'))).toBe(fallback);
    expect(friendlyAuthError(new Error('boom'))).toBe(fallback);
    expect(friendlyAuthError(undefined)).toBe(fallback);
  });
});
