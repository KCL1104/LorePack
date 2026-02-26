import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';

import { listPublicLorebooks } from '../../api';
import { useAppStore } from '../../stores/appStore';
import { useAuthStore } from '../../stores/authStore';
import { LOCALE_LABELS as _LOCALE_LABELS, useI18n } from '../../i18n';
import styles from './Sidebar.module.css';

interface NavItem {
  to: string;
  label: string;
  badgeKey?: 'crossroads';
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/story-studio', label: 'Story Studio' },
  { to: '/lorebook', label: 'Lorebook' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/crossroads', label: 'Crossroads', badgeKey: 'crossroads' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const signOutUser = useAuthStore((state) => state.signOutUser);
  const { toggleLocale: _toggleLocale, t } = useI18n();
  const [signingOut, setSigningOut] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [publicCount, setPublicCount] = useState(0);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidebarDimmed = useAppStore((state) => state.sidebarDimmed);

  useEffect(() => {
    let cancelled = false;
    listPublicLorebooks()
      .then((items) => {
        if (!cancelled) setPublicCount(items.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleMouseEnter = () => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setExpanded(true);
  };

  const handleMouseLeave = () => {
    collapseTimerRef.current = setTimeout(() => setExpanded(false), 120);
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await signOutUser();
      navigate('/auth', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const sidebarClass = [
    styles.sidebar,
    expanded ? styles.sidebarExpanded : '',
    sidebarDimmed ? styles.sidebarDimmed : '',
  ].filter(Boolean).join(' ');

  return (
    <aside
      className={sidebarClass}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.logo}>
        <span className={styles.logoIcon}>✦</span>
        <span className={styles.logoText}>LOREPACK</span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `${styles.navItem}${isActive ? ` ${styles.active}` : ''}`
            }
          >
            <span className={styles.navLabel}>{t(item.label)}</span>
            {item.badgeKey === 'crossroads' && publicCount > 0 ? (
              <span className={styles.badge} aria-label={t('{count} public worlds', { count: publicCount })} />
            ) : null}
          </NavLink>
        ))}

        <div className={styles.spacer} />

        {/* Language switcher hidden; i18n kept for future use */}

        <button className={`${styles.navItem} ${styles.actionButton}`} type="button" onClick={handleSignOut} disabled={signingOut}>
          <span className={styles.navLabel}>{signingOut ? t('Signing out...') : t('Sign out')}</span>
        </button>
      </nav>
    </aside>
  );
}
