/**
 * Firebase's errors, as sentences a person can act on. Every message says
 * what went wrong and what to do next; none of them apologise or show a code.
 */

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': "That email address doesn't look right. Check it and try again.",
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/email-already-in-use': 'There is already an account with that email. Sign in instead.',
  'auth/weak-password': 'Use at least 8 characters for your password.',
  'auth/invalid-credential': "That email and password don't match. Check both, or reset your password.",
  'auth/wrong-password': "That email and password don't match. Check both, or reset your password.",
  'auth/user-not-found': "That email and password don't match. Check both, or reset your password.",
  'auth/user-disabled': 'This account has been closed. Ask your coach for a new invitation.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  'auth/network-request-failed': "You're offline. Signing in needs a connection.",
  'functions/unavailable': "You're offline. This needs a connection.",
  'functions/deadline-exceeded': 'That took too long. Check your connection and try again.',
};

const FALLBACK = 'Something went wrong. Check your connection and try again.';

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

export function friendlyAuthError(error: unknown): string {
  const code = codeOf(error);
  const known = AUTH_MESSAGES[code];
  if (known) return known;

  // Our Cloud Functions write their refusals for people already ("That code
  // doesn't match an invitation…"). Firebase's own internal errors do not.
  if (code.startsWith('functions/') && code !== 'functions/internal' && code !== 'functions/unknown') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() && !message.startsWith('functions/')) return message;
  }
  return FALLBACK;
}

/** The client-side check, before Firebase's own six-character minimum. */
export const MIN_PASSWORD_LENGTH = 8;
