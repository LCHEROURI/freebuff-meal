import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { LogOut, Menu, X, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/features/auth/authContext';
import { Button } from '@/components/common/Button';
import { env } from '@/lib/env';

const NAV = [
  { to: '/app', label: 'Dashboard', end: true },
  { to: '/app/new-plan', label: 'New Meal Plan' },
  { to: '/app/plans', label: 'Saved Plans' },
  { to: '/app/settings', label: 'Settings' },
];

export const AppShell = () => {
  const { user, signOut, isDemo } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, []);

  const onSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-cream-50 text-ink-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            className="rounded-md p-2 text-ink-900 hover:bg-cream-200 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((s) => !s)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link to="/app" className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sage-700">
              🍽
            </span>
            <span className="font-semibold tracking-tight">Weeknight</span>
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive
                      ? 'bg-sage-100 text-sage-800'
                      : 'text-ink-700 hover:bg-cream-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {env.useEmulators && (
              <span className="hidden rounded-md border border-gold-200 bg-gold-50 px-2 py-1 text-xs font-medium text-gold-500 sm:inline">
                Emulators connected
              </span>
            )}
            {isDemo && (
              <span className="hidden rounded-md border border-gold-200 bg-gold-50 px-2 py-1 text-xs font-medium text-gold-500 sm:inline">
                Demo mode
              </span>
            )}
            <span className="hidden text-sm text-ink-700 sm:inline">
              {user?.displayName ?? user?.email ?? 'Signed in'}
            </span>
            <Button variant="ghost" size="sm" onClick={onSignOut} leftIcon={<LogOut size={14} />}>
              Sign out
            </Button>
          </div>
        </div>
        {open && (
          <nav
            aria-label="Primary mobile"
            className="border-t border-border bg-cream-100 px-4 py-2 lg:hidden"
          >
            <ul className="flex flex-col gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                        isActive
                          ? 'bg-sage-100 text-sage-800'
                          : 'text-ink-700 hover:bg-cream-200'
                      }`
                    }
                  >
                    <span>{item.label}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main id="main-content" className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <Outlet />
      </main>
    </div>
  );
};
