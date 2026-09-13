import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firebase } from './firebase';

/**
 * Where the server finds a person's phones: users/{uid}/pushTokens/{token},
 * one document per device. The Cloud Functions send to every token listed and
 * delete the ones Expo reports as gone.
 */

/**
 * The token this phone registered, and for whom. Kept so signing out can take
 * it off the account without asking Expo for it again — which needs a
 * connection, and so left the token behind whenever the phone was offline.
 */
const TOKEN_KEY = 'strength-coach/push-token';

/** Long enough for a delete to reach the server on a poor signal; sign-out never waits longer. */
const RELEASE_LIMIT_MS = 3000;

export async function savePushToken(uid: string, token: string, platform: 'ios' | 'android') {
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ uid, token })).catch(() => undefined);
  await setDoc(doc(firebase().db, 'users', uid, 'pushTokens', token), {
    platform,
    updatedAt: serverTimestamp(),
  });
}

/**
 * On sign-out, so the next person on this phone doesn't get the last one's
 * notifications. Waits a few seconds at most: offline the delete never gets an
 * answer, and signing out must not hang on it.
 */
export async function releasePushToken(uid: string) {
  let saved: { uid?: string; token?: string } | null = null;
  try {
    saved = JSON.parse((await AsyncStorage.getItem(TOKEN_KEY)) ?? 'null');
  } catch {
    saved = null;
  }
  await forgetPushToken();
  if (!saved?.token || saved.uid !== uid) return;

  const removal = deleteDoc(doc(firebase().db, 'users', uid, 'pushTokens', saved.token)).catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, RELEASE_LIMIT_MS);
  });
  await Promise.race([removal, limit]);
  if (timer) clearTimeout(timer);
}

/** Forgets this phone's token without touching the server — the account it belonged to is gone. */
export async function forgetPushToken() {
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

/** Reminders go out at 7 AM where the person is, so the server needs to know where that is. */
export async function saveTimeZone(uid: string) {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Keep UTC.
  }
  await updateDoc(doc(firebase().db, 'users', uid), { timezone, updatedAt: serverTimestamp() }).catch(
    () => undefined
  );
}
