import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { type Auth, connectAuthEmulator, getAuth, initializeAuth } from 'firebase/auth';
import {
  type Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { type Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { type FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { cloudConfig } from './config';

/**
 * The one place the app sets Firebase up. Imported only when cloud sync is
 * switched on, so the tests and the phone-only app never load it.
 */

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  /** Movement photos, and nothing else. See storage.rules. */
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

export function firebase(): FirebaseServices {
  if (services) return services;

  const app = getApps().length > 0 ? getApp() : initializeApp(cloudConfig.firebase);

  // Sign-in has to survive a relaunch. On a phone that means AsyncStorage; the
  // helper for it exists only in firebase/auth's React Native build, whose
  // types are the browser's, hence the cast. A browser keeps its own.
  let auth: Auth;
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    const { getReactNativePersistence } = FirebaseAuth as unknown as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
    };
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  }

  // Memory cache on purpose. Firestore's own offline store needs IndexedDB,
  // which phones don't have, and our queue (src/sync) is the durable one.
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache(),
    ignoreUndefinedProperties: true,
  });

  const functions = getFunctions(app);
  const storage = getStorage(app);

  const host = cloudConfig.emulatorHost;
  if (host) {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectStorageEmulator(storage, host, 9199);
  }

  services = { app, auth, db, functions, storage };
  return services;
}
