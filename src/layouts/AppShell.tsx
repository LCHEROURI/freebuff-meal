import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { ChefHat, LogOut, Menu, X, ChevronRight, Sparkles } from 'lucide-react';
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
    <div className="min-h-screen bg-flour-50 text-pepper-700">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-30 bg-gradient-spice text-white shadow-warm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <button
            type="button"
            className="rounded-md p-2 text-white/90 hover:bg-white/15 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((s) => !s)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Link to="/app" className="brand-mark text-white">
            <ChefHat size={22} aria-hidden="true" className="text-turmeric-300" />
            <span className="font-display text-xl font-semibold tracking-tight">Weeknight</span>
          </Link>
          <nav aria-label="Primary" className="ml-4 hidden gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white shadow-sm'
                      : 'text-white/95 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {env.useEmulators && (
              <span className="hidden items-center gap-1.5 rounded-full bg-butter-100/95 px-2.5 py-1 text-xs font-medium text-turmeric-700 sm:inline-flex">
                <Sparkles size={12} aria-hidden="true" />
                Emulators connected
              </span>
            )}
            {isDemo && (
              <span className="hidden items-center gap-1.5 rounded-full bg-butter-100/95 px-2.5 py-1 text-xs font-medium text-turmeric-700 sm:inline-flex">
                <Sparkles size={12} aria-hidden="true" />
                Demo mode
              </span>
            )}
            <span className="hidden text-sm text-white/85 sm:inline">
              {user?.displayName ?? user?.email ?? 'Signed in'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSignOut}
              leftIcon={<LogOut size={14} />}
              className="text-white hover:bg-white/15"
            >
              Sign out
            </Button>
          </div>
        </div>
        {open && (
          <nav
            aria-label="Primary mobile"
            className="border-t border-white/15 bg-tomato-700/95 px-4 py-2 text-white lg:hidden"
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
                          ? 'bg-white/20 text-white'
                          : 'text-white/95 hover:bg-white/10'
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
