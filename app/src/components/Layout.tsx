import { NavLink, Outlet } from 'react-router-dom';
import { SyncBanner } from './SyncBanner';
import './layout.css';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/cow-calf', label: 'Cow–Calf' },
  { to: '/breeding', label: 'Breeding' },
  { to: '/pasture', label: 'Pasture' },
  { to: '/sales', label: 'Sales' },
  { to: '/gestation', label: 'Gestation' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="brand">Record Book</p>
          <p className="brand-sub">Herd records · offline first</p>
        </div>
        <nav className="nav" aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <SyncBanner />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
