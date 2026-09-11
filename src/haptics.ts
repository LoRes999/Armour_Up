import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * The part of a celebration you feel rather than see. On a phone in a gym the
 * screen is often face-down on a bench; the buzz is what lands.
 *
 *   success — an ordinary finish, or a session sent
 *   big     — a PR or a milestone: a heavy thud, then the success pattern
 *   light   — news, not an achievement: a new session from the coach
 */
export type HapticKind = 'success' | 'big' | 'light';

/**
 * Haptics are a nicety, never a reason to fail. Some Android devices have no
 * motor, and a rejected promise here would surface as an unhandled rejection
 * in the middle of the celebration it was meant to accompany.
 */
const quietly = (promise: Promise<unknown>) => {
  promise.catch(() => {});
};

export function playHaptic(kind: HapticKind): void {
  // Safari has no vibration API at all.
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'light') {
      quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
    } else if (kind === 'big') {
      quietly(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      setTimeout(() => quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)), 150);
    } else {
      quietly(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }
  } catch {
    // The native module is missing, e.g. an older dev client. Carry on silently.
  }
}
