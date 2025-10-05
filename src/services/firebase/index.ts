import { getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  inMemoryPersistence,
  initializeAuth,
  setPersistence
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { firebaseConfig } from './config';

let appInstance: ReturnType<typeof initializeApp> | null = null;
let authInstance: Auth | null = null;
let authEmulatorConfigured = false;
let firestoreInstance: ReturnType<typeof getFirestore> | null = null;
let firestoreEmulatorConfigured = false;
let functionsInstance: ReturnType<typeof getFunctions> | null = null;
let functionsEmulatorConfigured = false;

const readEnv = (key: string) => {
  const value = process.env[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
};

const expoFirebaseExtra = (() => {
  const expoConfig = Constants?.expoConfig ?? Constants?.manifest;
  const extra = (expoConfig?.extra ?? {}) as { firebase?: Record<string, unknown> };
  return (extra.firebase ?? {}) as Record<string, unknown>;
})();

const readExpoFirebaseExtra = (key: string) => {
  const value = expoFirebaseExtra[key];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
};

const readEmulatorSetting = (envKey: string, extraKey: string) =>
  readEnv(envKey) ?? readEnv(`EXPO_PUBLIC_${envKey}`) ?? readExpoFirebaseExtra(extraKey);

const parseHostAndPort = (value: string, defaultPort: number, source: string) => {
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`http://${value}`);
    return {
      host: url.hostname,
      port: Number(url.port || defaultPort)
    };
  } catch (error) {
    console.warn(`Invalid emulator host value for ${source}: "${value}"`, error);
    return null;
  }
};

export const getFirebaseApp = () => {
  if (!appInstance) {
    const existingApp = getApps()[0];
    appInstance = existingApp ?? initializeApp(firebaseConfig);
  }
  return appInstance;
};

const createAuthInstance = (app: ReturnType<typeof initializeApp>): Auth => {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    const nativePersistenceFactory = getReactNativePersistence;
    if (typeof nativePersistenceFactory !== 'function') {
      return initializeAuth(app);
    }
    return initializeAuth(app, {
      persistence: nativePersistenceFactory(AsyncStorage)
    });
  }

  const defaultAuth = getAuth(app);
  if (typeof window === 'undefined') {
    void setPersistence(defaultAuth, inMemoryPersistence);
  } else {
    void setPersistence(defaultAuth, browserLocalPersistence);
  }
  return defaultAuth;
};

export const getFirebaseAuth = () => {
  if (!authInstance) {
    authInstance = createAuthInstance(getFirebaseApp());
    const emulatorHost = readEmulatorSetting('FIREBASE_AUTH_EMULATOR_HOST', 'authEmulatorHost');
    if (emulatorHost && !authEmulatorConfigured) {
      const emulatorUrl = emulatorHost.startsWith('http') ? emulatorHost : `http://${emulatorHost}`;
      try {
        connectAuthEmulator(authInstance, emulatorUrl, { disableWarnings: true });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'auth/emulator-config-failed') {
          throw error;
        }
      }
      authEmulatorConfigured = true;
    }
  }
  return authInstance;
};

export const getFirestoreDb = () => {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getFirebaseApp());
  }
  if (!firestoreEmulatorConfigured) {
    const host = readEmulatorSetting('FIRESTORE_EMULATOR_HOST', 'firestoreEmulatorHost');
    if (host) {
      const parsed = parseHostAndPort(host, 8080, 'FIRESTORE_EMULATOR_HOST');
      if (parsed) {
        connectFirestoreEmulator(firestoreInstance, parsed.host, parsed.port);
      }
    }
    firestoreEmulatorConfigured = true;
  }
  return firestoreInstance;
};

export const getFirebaseFunctions = () => {
  if (!functionsInstance) {
    functionsInstance = getFunctions(getFirebaseApp());
    const emulatorHost = readEmulatorSetting('FIREBASE_FUNCTIONS_EMULATOR_HOST', 'functionsEmulatorHost');
    if (emulatorHost && !functionsEmulatorConfigured) {
      const parsed = parseHostAndPort(emulatorHost, 5001, 'FIREBASE_FUNCTIONS_EMULATOR_HOST');
      if (parsed) {
        connectFunctionsEmulator(functionsInstance, parsed.host, parsed.port);
      }
      functionsEmulatorConfigured = true;
    }
  }
  return functionsInstance;
};

export const __internal = {
  resetAuthInstance: () => {
    authInstance = null;
    authEmulatorConfigured = false;
    firestoreInstance = null;
    firestoreEmulatorConfigured = false;
    functionsInstance = null;
    functionsEmulatorConfigured = false;
  }
};
