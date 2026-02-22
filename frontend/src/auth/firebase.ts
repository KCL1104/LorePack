import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  type Auth,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
};

const missingConfig = ['apiKey', 'authDomain', 'projectId', 'appId'].filter(
  (key) => !firebaseConfig[key as keyof typeof firebaseConfig],
);

const firebaseConfigError = missingConfig.length
  ? `Missing Firebase env vars: ${missingConfig.join(', ')}`
  : null;

let authInstance: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (!firebaseConfigError) {
  const app = initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  void setPersistence(authInstance, browserLocalPersistence);

  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} else {
  console.warn(firebaseConfigError);
}

export function isFirebaseConfigured(): boolean {
  return !firebaseConfigError;
}

export function getFirebaseConfigError(): string | null {
  return firebaseConfigError;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    throw new Error(firebaseConfigError || 'Firebase Auth is not configured.');
  }
  return authInstance;
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!googleProvider) {
    throw new Error(firebaseConfigError || 'Google provider is not configured.');
  }
  return googleProvider;
}
