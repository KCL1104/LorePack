import { useEffect } from 'react';

import type { Toast as ToastState } from '../../api/types';
import { useI18n } from '../../i18n';
import styles from './Toast.module.css';

interface ToastProps {
  toast: ToastState;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(toast.id);
    }, 3600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [onDismiss, toast.id]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.variant]}`}
      role="status"
      aria-live="polite"
    >
      <p className={styles.message}>{toast.message}</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label={t('Dismiss notification')}
      >
        ×
      </button>
    </div>
  );
}
