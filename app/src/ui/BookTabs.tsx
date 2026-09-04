import { NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { to: '/cow-calf', label: 'Cow–Calf' },
  { to: '/breeding', label: 'Breeding' },
  { to: '/pasture', label: 'Pasture' },
  { to: '/sales', label: 'Sales' },
  { to: '/gestation', label: 'Due dates' },
];

export function isBookPath(pathname: string): boolean {
  return TABS.some(
    (tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`),
  );
}

export function isBookNavActive(pathname: string): boolean {
  if (pathname.endsWith('/new')) return false;
  return isBookPath(pathname);
}

export function BookTabs() {
  const { pathname } = useLocation();
  if (!isBookPath(pathname)) return null;

  return (
    <nav className="book-tabs" aria-label="Book sections">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={() =>
            pathname === tab.to || pathname.startsWith(`${tab.to}/`) ? 'active' : undefined
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
