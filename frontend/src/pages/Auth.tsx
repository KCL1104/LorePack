import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';

import { getFirebaseConfigError, isFirebaseConfigured } from '../auth/firebase';
import { LOCALE_LABELS, useI18n } from '../i18n';
import { useAuthStore } from '../stores/authStore';
import styles from './Auth.module.css';

type AuthMode = 'signin' | 'signup';

interface LocationState {
  from?: {
    pathname?: string;
  };
}

export default function AuthPage() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const authReady = useAuthStore((state) => state.authReady);
  const loading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const pendingGoogleLinkEmail = useAuthStore((state) => state.pendingGoogleLinkEmail);
  const signUpWithEmail = useAuthStore((state) => state.signUpWithEmail);
  const signInWithEmail = useAuthStore((state) => state.signInWithEmail);
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle);
  const resolveGoogleLinkWithPassword = useAuthStore((state) => state.resolveGoogleLinkWithPassword);

  const location = useLocation();
  const { locale, toggleLocale, t } = useI18n();
  const locationState = (location.state as LocationState | null) || null;
  const redirectTo = locationState?.from?.pathname || '/dashboard';

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const firebaseConfigError = useMemo(() => getFirebaseConfigError(), []);
  const activeMode: AuthMode = pendingGoogleLinkEmail ? 'signin' : mode;
  const effectiveEmail = pendingGoogleLinkEmail || email;

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const submitLabel = activeMode === 'signup' ? t('Create account') : t('Sign in');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!effectiveEmail.trim()) {
      setError(t('Please enter your email.'));
      return;
    }

    if (!password) {
      setError(t('Please enter your password.'));
      return;
    }

    if (activeMode === 'signup') {
      if (password.length < 8) {
        setError(t('Password must be at least 8 characters.'));
        return;
      }
      if (password !== confirmPassword) {
        setError(t('Passwords do not match.'));
        return;
      }
    }

    const normalizedEmail = effectiveEmail.trim().toLowerCase();

    try {
      if (activeMode === 'signup') {
        await signUpWithEmail(normalizedEmail, password);
      } else if (pendingGoogleLinkEmail && pendingGoogleLinkEmail === normalizedEmail) {
        await resolveGoogleLinkWithPassword(normalizedEmail, password);
      } else {
        await signInWithEmail(normalizedEmail, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Authentication failed.'));
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Google sign-in failed.'));
    }
  };

  if (authReady && user) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <button className={styles.switchMode} type="button" onClick={toggleLocale}>
          {t('Language')}: {LOCALE_LABELS[locale]}
        </button>
        <h1 className={styles.title}>LorePack</h1>
        <p className={styles.subtitle}>{t('Enter the codex and continue your worldbuilding journey.')}</p>

        {!isFirebaseConfigured() ? (
          <p className={styles.error}>{firebaseConfigError || t('Firebase is not configured.')}</p>
        ) : (
          <>
            {pendingGoogleLinkEmail && (
              <div className={styles.notice}>
                {t('This email already uses password login. Sign in once with password and Google will be linked automatically.')}
              </div>
            )}

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="auth-email">
                {t('Email')}
              </label>
              <input
                id="auth-email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={effectiveEmail}
                onChange={(event) => setEmail(event.target.value)}
                disabled={loading || Boolean(pendingGoogleLinkEmail)}
              />

              <label className={styles.label} htmlFor="auth-password">
                {t('Password')}
              </label>
              <input
                id="auth-password"
                className={styles.input}
                type="password"
                autoComplete={activeMode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={loading}
              />

              {activeMode === 'signup' && (
                <>
                  <label className={styles.label} htmlFor="auth-confirm-password">
                    {t('Confirm password')}
                  </label>
                  <input
                    id="auth-confirm-password"
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    disabled={loading}
                  />
                </>
              )}

              {error && <p className={styles.error}>{error}</p>}

              <button className={styles.primaryButton} type="submit" disabled={loading}>
                {loading ? t('Working...') : submitLabel}
              </button>
            </form>

            <button className={styles.googleButton} type="button" onClick={handleGoogleSignIn} disabled={loading}>
              {t('Continue with Google')}
            </button>

            <button
              className={styles.switchMode}
              type="button"
              onClick={() => {
                setError(null);
                setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
              }}
              disabled={loading || Boolean(pendingGoogleLinkEmail)}
            >
              {activeMode === 'signin' ? t('Need an account? Sign up') : t('Already have an account? Sign in')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
