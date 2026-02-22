import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';

import { useAuthStore } from '../../stores/authStore';
import styles from './Sidebar.module.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/story-studio', label: 'Story Studio' },
  { to: '/lorebook', label: 'Lorebook' },
  { to: '/gallery', label: 'Gallery' },
  { to: '/crossroads', label: 'Crossroads' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const signOutUser = useAuthStore((state) => state.signOutUser);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
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
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}

        <div className={styles.spacer} />

        <button className={`${styles.navItem} ${styles.actionButton}`} type="button" onClick={handleSignOut} disabled={signingOut}>
          <span className={styles.navLabel}>{signingOut ? 'Signing out...' : 'Sign out'}</span>
        </button>
      </nav>
    </aside>
  );
}
