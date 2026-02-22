import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { ToastStack } from '../ui';
import styles from './AppLayout.module.css';

export function AppLayout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
      <ToastStack />
    </div>
  );
}
