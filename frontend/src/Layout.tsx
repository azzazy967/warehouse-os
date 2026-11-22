import { useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownToLine,
  Boxes,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Package,
  Sun,
  Truck,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from './auth';
import { useTheme } from './theme';
import type { AuthUser } from './api';
import { Loader } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Array<'ADMIN' | 'MANAGER' | 'PICKER'>;
}

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/products', label: 'Products', icon: Package, roles: ['ADMIN', 'MANAGER'] },
  { to: '/locations', label: 'Locations', icon: MapPin, roles: ['ADMIN', 'MANAGER'] },
  { to: '/receiving', label: 'Receiving', icon: ArrowDownToLine, roles: ['ADMIN', 'MANAGER'] },
  { to: '/picking', label: 'Picking', icon: ListChecks },
  { to: '/shipping', label: 'Shipping', icon: Truck, roles: ['ADMIN', 'MANAGER'] },
  { to: '/movements', label: 'Movements', icon: Activity },
  { to: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="full-loader">
        <Loader />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/** Blocks direct URL access to screens the current role cannot use. */
export function RoleRoute({
  allow,
  children,
}: {
  allow: AuthUser['role'][];
  children: ReactNode;
}) {
  const { user, can } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!can(...allow)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { user, can } = useAuth();
  const visible = navItems.filter((item) => !item.roles || can(...item.roles));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Warehouse size={22} strokeWidth={2.2} />
        </span>
        <span className="brand-text">
          <strong>Warehouse OS</strong>
          <small>Operations console</small>
        </span>
      </div>

      <nav className="side-nav">
        <span className="nav-caption">Workspace</span>
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}
          >
            <item.icon size={18} strokeWidth={1.9} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        <div className="avatar">{user?.name?.slice(0, 1).toUpperCase()}</div>
        <div className="side-user">
          <strong>{user?.name}</strong>
          <small>{user?.role}</small>
        </div>
      </div>
    </aside>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const current = navItems.find((item) => item.to === location.pathname);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)}>
          <aside className="sidebar mobile-sidebar" onClick={(event) => event.stopPropagation()}>
            <button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="desktop-sidebar">
        <Sidebar onNavigate={() => undefined} />
      </div>

      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>Warehouse</span>
            <ChevronRight size={14} />
            <strong>{current?.label || 'Warehouse OS'}</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-btn"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className="role-chip">{user?.role}</span>
            <span className="topbar-name">{user?.name}</span>
            <button className="icon-btn" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
