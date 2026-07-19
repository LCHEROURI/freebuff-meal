import { Link } from 'react-router-dom';
import { Sparkles, ShoppingCart, Printer, Share2 } from 'lucide-react';

import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Pill } from '@/components/common/AllergenBadge';
import { isFirebaseConfigured } from '@/lib/env';
import { DISH_LIBRARY } from '@/features/meal-plans/dishLibrary';

export const LandingPage = () => {
  const ctaSignup = !isFirebaseConfigured() ? '/login' : '/signup';
  return (
    <div className="bg-cream-50">
      <header className="border-b border-border bg-cream-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span aria-hidden="true" className="text-sage-700">🍽</span>
            <span className="font-semibold tracking-tight">Weeknight</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/login" className="text-ink-900 hover:underline">Sign in</Link>
            <Button asChildLink to={ctaSignup} variant="primary" size="sm">
              Create my meal plan
            </Button>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sage-700">
              Weeknight meal planner
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">
              Plan real weeknight dinners—not random AI recipes.
            </h1>
            <p className="mt-4 max-w-prose text-ink-700">
              Create a practical three-, five-, or seven-night dinner plan based
              on your schedule, household, dietary preferences, and ingredients
              already in your kitchen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChildLink to={ctaSignup} variant="primary" size="lg" leftIcon={<Sparkles size={16} aria-hidden="true" />}>
                Create my meal plan
              </Button>
              <Button asChildLink to="/login" variant="secondary" size="lg">
                Sign in
              </Button>
            </div>
            <p className="mt-3 text-xs text-ink-500">
              Always review AI-generated recipes against your personal
              allergies and dietary needs.
            </p>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl2 border border-border bg-white p-5 shadow-card">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Sample plan preview
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Five dinners for two · under 45 minutes · Italian, Greek, North African
              </p>
              <ul className="mt-3 space-y-2">
                {DISH_LIBRARY.slice(0, 3).map((d) => (
                  <li key={d.id} className="rounded-md border border-border p-3">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-ink-500">
                      {d.cuisine} · {d.totalTimeMinutes} min total · serves {d.servings}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Feature icon={<Sparkles size={18} />} title="Recognizable dishes" body="Named, real meals — never ingredient mash-ups." />
              <Feature icon={<ShoppingCart size={18} />} title="One shopping list" body="Consolidated, grouped, and easy to share." />
              <Feature icon={<Share2 size={18} />} title="Share read-only" body="Send the plan to a partner without exposing your inputs." />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-cream-100">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-12 sm:grid-cols-3">
          <Card title="Trust & safety">
            <p className="text-sm">
              All recipes are validated against your allergens, equipment, and
              time budget. We do not generate unverified medical or nutrition
              claims.
            </p>
          </Card>
          <Card title="Your data">
            <p className="text-sm">
              We only store what's needed to power the planner. You can delete
              your account at any time.
            </p>
            <Link to="/privacy" className="mt-2 inline-block text-sm text-sage-700 hover:underline">
              Read the privacy summary →
            </Link>
          </Card>
          <Card title="Print & share">
            <p className="text-sm">
              Every plan has a printable shopping list and a read-only share
              link for partners or roommates.
            </p>
            <Pill className="mt-2">
              <Printer size={14} className="mr-1" /> print-friendly & included
            </Pill>
          </Card>
        </div>
      </section>

      <footer className="border-t border-border bg-cream-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-ink-500">
          <span>© Weeknight · MVP build</span>
          <nav className="flex gap-3">
            <Link to="/privacy" className="hover:underline">Privacy</Link>
            <Link to="/terms" className="hover:underline">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

const Feature = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <div className="rounded-xl2 border border-border bg-white p-4 shadow-card">
    <span className="text-sage-700">{icon}</span>
    <p className="mt-2 text-sm font-semibold">{title}</p>
    <p className="mt-1 text-xs text-ink-500">{body}</p>
  </div>
);
