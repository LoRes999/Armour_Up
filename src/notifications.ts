import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';

/**
 * The phone's side of push notifications: permission, the push token, and
 * what a tap opens.
 *
 * Expo Go cannot receive remote push, and a simulator has no push token, so
 * both skip all of this quietly. expo-notifications is loaded only once it is
 * known to be usable: in Expo Go on Android, merely importing it logs an error.
 */

type NotificationsModule = typeof import('expo-notifications');

let module: NotificationsModule | null = null;
function notifications(): NotificationsModule {
  if (!module) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-notifications') as NotificationsModule;
    // Show notifications while the app is open too: a coach mid-session still
    // wants to hear that a client joined. Sound is saved for the lock screen.
    module.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  return module;
}

/** A build that can receive push: a real device, not Expo Go, not the web. */
export function canUsePush(): boolean {
  return (
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  );
}

/** Set by `eas init`, which ties this app to its Expo project and push credentials. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export type PushRegistration = 'registered' | 'denied' | 'unavailable';

/**
 * Asks for permission if it has not been answered yet, then hands the push
 * token to `save`. Call it at a moment that explains itself — after sign-in,
 * not on first launch — because iOS asks only once.
 */
export async function registerForPush(
  save: (token: string, platform: 'ios' | 'android') => Promise<void>
): Promise<PushRegistration> {
  const id = projectId();
  if (!canUsePush() || !id) return 'unavailable';
  const Notifications = notifications();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Training updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  await save(token, Platform.OS === 'ios' ? 'ios' : 'android');
  return 'registered';
}

const routeOf = (data: unknown): string | null => {
  const route = (data as { route?: unknown } | undefined)?.route;
  return typeof route === 'string' && route.startsWith('/') ? route : null;
};

/**
 * Opens the screen a notification points at when it is tapped — including the
 * tap that launched the app from cold.
 */
export function watchNotificationTaps(open: (route: string) => void): () => void {
  if (!canUsePush()) return () => {};
  const Notifications = notifications();

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const route = routeOf(response?.notification.request.content.data);
    if (route) open(route);
  });
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const route = routeOf(response.notification.request.content.data);
    if (route) open(route);
  });
  return () => subscription.remove();
}
