import React from 'react';
import { Outlet, NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';
import { AdminDashboardPage } from './pages/AdminDashboardPage.js';
import { AdminCreateSessionPage } from './pages/AdminCreateSessionPage.js';
import { AdminSessionsListPage } from './pages/AdminSessionsListPage.js';
import { AdminSessionDetailPage } from './pages/AdminSessionDetailPage.js';
import { AdminExamLibraryPage } from './pages/AdminExamLibraryPage.js';

/**
 * AdminRoutes — mounted by App.tsx at `/admin/*`.
 *
 * AdminLayoutPage renders the shared chrome (top nav) and an <Outlet />.
 * Each nested route renders inside the outlet. Root `/admin` redirects to
 * `/admin/dashboard`.
 */
export const AdminRoutes: React.FC = () => (
  <Routes>
    <Route element={<AdminLayoutPage />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<AdminDashboardPage />} />
      <Route path="create" element={<AdminCreateSessionPage />} />
      <Route path="sessions" element={<AdminSessionsListPage />} />
      <Route path="sessions/:sessionId" element={<AdminSessionDetailPage />} />
      <Route path="exams" element={<AdminExamLibraryPage />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Route>
  </Routes>
);

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; testid: string }> = [
  { to: '/admin/dashboard', label: '仪表盘', testid: 'admin-nav-dashboard' },
  { to: '/admin/create', label: '创建评估', testid: 'admin-nav-create' },
  { to: '/admin/sessions', label: '查看评估', testid: 'admin-nav-sessions' },
  { to: '/admin/exams', label: '题库管理', testid: 'admin-nav-exams' },
];

const AdminLayoutPage: React.FC = () => (
  <div style={styles.container} data-testid="admin-layout">
    <header style={styles.header}>
      <div style={styles.brand}>CodeLens · Admin</div>
      <nav style={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={item.testid}
            style={({ isActive }) => ({
              ...styles.navLink,
              ...(isActive ? styles.navLinkActive : {}),
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
    <main style={styles.main}>
      <Outlet />
    </main>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.base,
    color: colors.text,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.md} ${spacing.xl}`,
    backgroundColor: colors.mantle,
    borderBottom: `1px solid ${colors.surface0}`,
    gap: spacing.xl,
    flexWrap: 'wrap',
  },
  brand: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  nav: {
    display: 'flex',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  navLink: {
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radii.sm,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textDecoration: 'none',
  },
  navLinkActive: {
    backgroundColor: colors.blue,
    color: colors.base,
  },
  main: {
    flex: 1,
    padding: `${spacing.xl} ${spacing.xl}`,
    maxWidth: 1200,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box',
  },
};
