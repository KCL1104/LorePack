import { create } from 'zustand';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  linkWithCredential,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type OAuthCredential,
  type User,
} from 'firebase/auth';

import { getFirebaseAuth, getGoogleProvider } from '../auth/firebase';
import { setAuthTokenProvider, setUnauthorizedHandler } from '../api/client';

interface AuthState {
  initialized: boolean;
  authReady: boolean;
  loading: boolean;
  user: User | null;
  idToken: string | null;
  pendingGoogleLinkEmail: string | null;
  initializeAuth: () => void;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resolveGoogleLinkWithPassword: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

let unsubscribeAuth: (() => void) | null = null;
let pendingGoogleCredential: OAuthCredential | null = null;

function mapAuthError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error('Authentication failed.');
}

async function tryLinkGoogleCredential(user: User): Promise<void> {
  if (!pendingGoogleCredential) return;

  try {
    await linkWithCredential(user, pendingGoogleCredential);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'auth/provider-already-linked' && code !== 'auth/credential-already-in-use') {
      throw err;
    }
  } finally {
    pendingGoogleCredential = null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  initialized: false,
  authReady: false,
  loading: false,
  user: null,
  idToken: null,
  pendingGoogleLinkEmail: null,

  initializeAuth: () => {
    if (get().initialized) return;

    set({ initialized: true, loading: true });

    let auth: ReturnType<typeof getFirebaseAuth>;
    try {
      auth = getFirebaseAuth();
    } catch {
      set({ authReady: true, loading: false });
      return;
    }

    setAuthTokenProvider(async () => {
      if (!auth.currentUser) return null;
      return auth.currentUser.getIdToken();
    });

    setUnauthorizedHandler(() => {
      pendingGoogleCredential = null;
      set({ user: null, idToken: null, pendingGoogleLinkEmail: null });
      void signOut(auth).catch(() => undefined);
    });

    unsubscribeAuth = onIdTokenChanged(auth, async (user) => {
      let idToken: string | null = null;
      if (user) {
        try {
          idToken = await user.getIdToken();
        } catch {
          idToken = null;
        }
      }

      set({
        user,
        idToken,
        authReady: true,
        loading: false,
      });
    });

    if (unsubscribeAuth) {
      const cleanup = unsubscribeAuth;
      window.addEventListener('beforeunload', () => {
        cleanup();
      }, { once: true });
    }
  },

  signUpWithEmail: async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Please provide an email.');
    }

    const auth = getFirebaseAuth();
    set({ loading: true });

    try {
      await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      set({ pendingGoogleLinkEmail: null });
    } catch (err) {
      const code = (err as { code?: string })?.code;

      if (code === 'auth/email-already-in-use') {
        const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);

        if (methods.includes(GoogleAuthProvider.PROVIDER_ID)) {
          const result = await signInWithPopup(auth, getGoogleProvider());
          const emailCredential = EmailAuthProvider.credential(normalizedEmail, password);
          try {
            await linkWithCredential(result.user, emailCredential);
          } catch (linkErr) {
            const linkCode = (linkErr as { code?: string })?.code;
            if (linkCode !== 'auth/provider-already-linked') {
              throw linkErr;
            }
          }

          set({ pendingGoogleLinkEmail: null });
          return;
        }

        throw new Error('This email is already in use. Please sign in instead.');
      }

      throw mapAuthError(err);
    } finally {
      set({ loading: false });
    }
  },

  signInWithEmail: async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Please provide an email.');
    }

    const auth = getFirebaseAuth();
    set({ loading: true });

    try {
      const result = await signInWithEmailAndPassword(auth, normalizedEmail, password);

      const pendingEmail = get().pendingGoogleLinkEmail;
      if (pendingGoogleCredential && pendingEmail && pendingEmail === normalizedEmail) {
        await tryLinkGoogleCredential(result.user);
        set({ pendingGoogleLinkEmail: null });
      }
    } catch (err) {
      throw mapAuthError(err);
    } finally {
      set({ loading: false });
    }
  },

  signInWithGoogle: async () => {
    const auth = getFirebaseAuth();
    set({ loading: true, pendingGoogleLinkEmail: null });
    pendingGoogleCredential = null;

    try {
      await signInWithPopup(auth, getGoogleProvider());
    } catch (err) {
      const code = (err as { code?: string })?.code;

      if (code === 'auth/account-exists-with-different-credential') {
        const email = (err as { customData?: { email?: string } })?.customData?.email;
        const pendingCredential = GoogleAuthProvider.credentialFromError(err as never);

        if (email && pendingCredential) {
          const normalizedEmail = email.trim().toLowerCase();
          const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);

          if (methods.includes(EmailAuthProvider.PROVIDER_ID)) {
            pendingGoogleCredential = pendingCredential;
            set({ pendingGoogleLinkEmail: normalizedEmail });
            throw new Error('This email already has a password account. Sign in once with password to auto-link Google.');
          }
        }

        throw new Error('This email is registered with a different provider. Use the existing method first.');
      }

      throw mapAuthError(err);
    } finally {
      set({ loading: false });
    }
  },

  resolveGoogleLinkWithPassword: async (email: string, password: string) => {
    await get().signInWithEmail(email, password);
  },

  signOutUser: async () => {
    const auth = getFirebaseAuth();
    set({ loading: true });

    try {
      pendingGoogleCredential = null;
      await signOut(auth);
      set({ pendingGoogleLinkEmail: null });
    } finally {
      set({ loading: false });
    }
  },
}));
