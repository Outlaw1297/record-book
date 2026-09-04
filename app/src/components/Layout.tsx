import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from '../db/schema';
import { SyncBanner } from './SyncBanner';
import { BookTabs, isBookNavActive } from '../ui/BookTabs';
import {
  IconBook,
  IconHome,
  IconPlus,
  IconSearch,
  IconUser,
} from '../ui/icons';

function initials(name?: string) {
  const parts = (name || 'RB').trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'RB';
}

export function Layout() {
  const settings = useLiveQuery(() => getSettings());
  const { pathname } = useLocation();
  const bookActive = isBookNavActive(pathname);

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="brand">{settings?.ranchName || 'Record Book'}</p>
          <p className="brand-sub">works without signal</p>
        </div>
        <nav className="nav-desktop" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Home
          </NavLink>
          <NavLink
            to="/herd"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Herd
          </NavLink>
          <NavLink
            to="/cow-calf"
            className={() => (bookActive ? 'nav-link active' : 'nav-link')}
          >
            Book
          </NavLink>
          <NavLink
            to="/account"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Account
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Settings
          </NavLink>
        </nav>
        <NavLink to="/cow-calf/new" className="btn primary desktop-only">
          Log calf
        </NavLink>
      </header>
      <div className="main">
        <SyncBanner />
        <BookTabs />
        <Outlet />
      </div>
      <nav className="bottom-nav" aria-label="Mobile">
        <NavLink to="/" end>
          <IconHome />
          Home
        </NavLink>
        <NavLink
          to="/cow-calf/new"
          className={({ isActive }) => (isActive ? 'log-tab active' : 'log-tab')}
        >
          <IconPlus />
          Log
        </NavLink>
        <NavLink to="/herd">
          <IconSearch />
          Herd
        </NavLink>
        <NavLink
          to="/cow-calf"
          className={({ isActive }) =>
            bookActive || isActive ? 'active' : undefined
          }
        >
          <IconBook />
          Book
        </NavLink>
        <NavLink to="/account">
          <IconUser />
          {initials(settings?.operatorName || settings?.ranchName)}
        </NavLink>
      </nav>
    </div>
  );
}
