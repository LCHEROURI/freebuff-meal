import { Link } from 'react-router-dom';
import {
  Sparkles,
  ShoppingCart,
  Printer,
  Share2,
  ChefHat,
  UtensilsCrossed,
  Salad,
  Flame,
} from 'lucide-react';

import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Pill } from '@/components/common/AllergenBadge';
import { isFirebaseConfigured } from '@/lib/env';
import { DISH_LIBRARY } from '@/features/meal-plans/dishLibrary';

export const LandingPage = () => {
  const ctaSignup = !isFirebaseConfigured() ? '/login' : '/signup';
  return (
    <div className="bg-flour-50">
      <header className="bg-gradient-spice text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="brand-mark text-white">
            <ChefHat size={22} aria-hidden="true" className="text-turmeric-300" />
            <span className="font-display text-xl font-semibold tracking-tight">Weeknight</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/login" className="rounded-full px-3 py-1.5 text-white/90 hover:bg-white/10">
              Sign in
            </Link>
            <Button asChildLink to={ctaSignup} variant="secondary" size="sm" className="!bg-white !text-tomato-700 hover:!bg-butter-100">
              Create my meal plan
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-spice text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-herbs" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-5 lg:items-center">
            <div className="lg:col-span-3">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-turmeric-100 backdrop-blur-sm">
                <Flame size={14} aria-hidden="true" /> Weeknight meal planner
              </p>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
                Plan real weeknight dinners —{' '}
                <span className="text-turmeric-200">not random AI recipes.</span>
              </h1>
              <p className="mt-5 max-w-prose text-lg text-white/90">
                Three, five, or seven nights of practical dinners based on your schedule,
                household, dietary preferences, and ingredients already in your kitchen.
                Spicy tomato energy, fresh basil practicality, warm turmeric soul.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChildLink
                  to={ctaSignup}
                  variant="secondary"
                  size="lg"
                  className="!bg-white !text-tomato-700 hover:!bg-butter-100"
                  leftIcon={<Sparkles size={16} aria-hidden="true" />}
                >
                  Create my meal plan
                </Button>
                <Button
                  asChildLink
                  to="/login"
                  variant="ghost"
                  size="lg"
                  className="!text-white hover:!bg-white/15"
                >
                  Sign in
                </Button>
              </div>
              <p className="mt-4 text-xs text-white/75">
                Always review AI-generated recipes against your personal allergies and dietary needs.
              </p>
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-plate border-4 border-white/30 bg-flour-50 p-5 text-pepper-700 shadow-plate animate-fade-up">
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-tomato-100 px-2.5 py-1 text-xs font-semibold text-tomato-700">
                    <UtensilsCrossed size={12} aria-hidden="true" /> Sample plan
                  </span>
                  <span className="text-xs text-pepper-400">5 nights · 2 servings</span>
                </div>
                <p className="text-sm text-pepper-500">Under 45 min · Italian, Greek, North African</p>
                <ul className="mt-3 space-y-2">
                  {DISH_LIBRARY.slice(0, 3).map((d, idx) => {
                    const stripes = ['bg-tomato-500', 'bg-basil-500', 'bg-turmeric-500'];
                    return (
                      <li
                        key={d.id}
                        className="overflow-hidden rounded-lg border border-butter-200 bg-white"
                      >
                        <div className={`h-1 w-full ${stripes[idx % stripes.length]}`} />
                        <div className="px-3 py-2.5">
                          <p className="font-medium">{d.name}</p>
                          <p className="text-xs text-pepper-400">
                            {d.cuisine} · {d.totalTimeMinutes} min total · serves {d.servings}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-soft py-14">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:grid-cols-3">
          <Feature
            tone="spice"
            icon={<Sparkles size={20} aria-hidden="true" />}
            title="Recognizable dishes"
            body="Named, real meals — never ingredient mash-ups. Each plan is anchored in dishes you actually know."
          />
          <Feature
            tone="fresh"
            icon={<ShoppingCart size={20} aria-hidden="true" />}
            title="One shopping list"
            body="Consolidated, grouped, and easy to share. Pantry items and allergens respected on every merge."
          />
          <Feature
            tone="warm"
            icon={<Share2 size={20} aria-hidden="true" />}
            title="Share read-only"
            body="Send the plan to a partner or roommate without exposing your inputs. Revoke any time."
          />
        </div>
      </section>

      <section className="border-t border-butter-200 bg-flour-50">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-12 sm:grid-cols-3">
          <Card title="Trust & safety">
            <p className="text-sm">
              All recipes are validated against your allergens, equipment, and time budget.
              We do not generate unverified medical or nutrition claims.
            </p>
          </Card>
          <Card title="Your data">
            <p className="text-sm">
              We only store what's needed to power the planner. You can delete your account at
              any time — everything you uploaded goes with it.
            </p>
            <Link to="/privacy" className="mt-2 inline-block text-sm font-medium text-basil-700 hover:text-basil-800 hover:underline">
              Read the privacy summary →
            </Link>
          </Card>
          <Card title="Print & share">
            <p className="text-sm">
              Every plan has a printable shopping list and a read-only share link for partners
              or roommates.
            </p>
            <Pill className="mt-2">
              <Printer size={14} className="mr-1" aria-hidden="true" /> print-friendly & included
            </Pill>
          </Card>
        </div>
      </section>

      <section className="bg-butter-100">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-basil-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-basil-700">
              <Salad size={14} aria-hidden="true" /> From the pantry to the plate
            </span>
            <p className="max-w-2xl text-lg text-pepper-700">
              Curated dishes, a consolidated shopping list, and a print-ready recipe card —
              every plan lands as a complete weeknight kit, not a half-baked idea.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-butter-200 bg-flour-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-pepper-500">
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

const Feature = ({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: 'spice' | 'fresh' | 'warm';
}) => {
  const toneClass = {
    spice: 'bg-tomato-50 border-tomato-200 text-tomato-700',
    fresh: 'bg-basil-50 border-basil-200 text-basil-700',
    warm: 'bg-turmeric-100 border-turmeric-300 text-turmeric-700',
  }[tone];
  return (
    <div
      className={`group relative overflow-hidden rounded-xl2 border p-5 shadow-card transition-transform hover:-translate-y-0.5 ${toneClass}`}
    >
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/40 blur-xl" aria-hidden="true" />
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-3 font-display text-xl font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-pepper-700/85">{body}</p>
    </div>
  );
};
