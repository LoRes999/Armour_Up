import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { firebase } from './firebase';

/**
 * Where the server finds a person's phones: users/{uid}/pushTokens/{token},
 * one document per device. The Cloud Functions send to every token listed and
 * delete the ones Expo reports as gone.
 */

export async function savePushToken(uid: string, token: string, platform: 'ios' | 'android') {
  await setDoc(doc(firebase().db, 'users', uid, 'pushTokens', token), {
    platform,
    updatedAt: serverTimestamp(),
  });
}

/** On sign-out, so the next person on this phone doesn't get the last one's reminders. */
export async function removePushToken(uid: string, token: string) {
  await deleteDoc(doc(firebase().db, 'users', uid, 'pushTokens', token)).catch(() => undefined);
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
