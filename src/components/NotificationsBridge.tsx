import { useEffect } from 'react';
import { type Href, useRouter } from 'expo-router';
import { useAuth } from '../auth';
import { registerForPush, watchNotificationTaps } from '../notifications';
import { savePushToken, saveTimeZone } from '../pushTokens';

/**
 * Keeps this phone reachable. Once the account has a side, it records the
 * phone's time zone (reminders go out at 7 AM there) and registers for push —
 * which is when iOS asks for permission, straight after signing in or joining,
 * so the question arrives with its reason. Tapping a notification opens the
 * screen it is about.
 */
export function NotificationsBridge() {
  const router = useRouter();
  const { scope } = useAuth();
  const uid = scope?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    void saveTimeZone(uid);
    void registerForPush((token, platform) => savePushToken(uid, token, platform)).catch(() => undefined);
  }, [uid]);

  useEffect(() => watchNotificationTaps((route) => router.push(route as Href)), [router]);

  return null;
}
