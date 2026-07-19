import { Link } from 'react-router-dom';
import { Plus, History, Sparkles } from 'lucide-react';

import { Button } from '@/components/common/Button';
import { Card, SectionCard } from '@/components/common/Card';
import { useAuth } from '@/features/auth/authContext';
import { EmptyState } from '@/components/common/LoadingState';
import { ensureProfile, plansStore } from '@/utils/demoAdapter';
import { useEffect, useState } from 'react';

export const DashboardPage = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<ReturnType<typeof plansStore.list>>([]);
  const profile = user ? ensureProfile(user.uid) : null;

  useEffect(() => {
    if (!user) return;
    setPlans(plansStore.list(user.uid));
  }, [user, plans.length]);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile?.displayName
              ? `Hi, ${profile.displayName.split(' ')[0]} — ready to plan?`
              : 'Ready to plan?'}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Pick a featured dish or generate a fresh plan for the week.
          </p>
        </div>
        <Button asChildLink to="/app/new-plan" variant="primary" leftIcon={<Plus size={16} aria-hidden="true" />}>
          New meal plan
        </Button>
      </header>

      <SectionCard
        title="Your saved plans"
        description="Quickly reopen a plan, share it, or rotate its recipes."
      >
        {plans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Generate your first 3-, 5-, or 7-night plan in under a minute."
            action={
              <Button asChildLink to="/app/new-plan" variant="primary">
                Create my first plan
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="flex flex-col">
                  <Link to={`/app/plans/${plan.id}`} className="font-medium text-ink-900 hover:underline">
                    {plan.name}
                  </Link>
                  <span className="text-xs text-ink-500">
                    {plan.planLength} dinners · {plan.recipes.length} recipes
                  </span>
                </span>
                <span className="ml-auto text-xs text-ink-400">
                  {new Date(plan.updatedAt).toLocaleDateString()}
                </span>
                <Button asChildLink to={`/app/plans/${plan.id}`} variant="ghost" size="sm">
                  <History size={14} aria-hidden="true" className="mr-1" />
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Recognizable dishes" description="A glance at what's in our kitchen.">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: 'Chicken Piccata', cuisine: 'Italian', time: '30 min' },
            { name: 'Greek Lemon Chicken', cuisine: 'Greek', time: '45 min' },
            { name: 'Oyakodon', cuisine: 'Japanese', time: '20 min' },
            { name: 'Chana Masala', cuisine: 'Indian', time: '35 min' },
          ].map((dish) => (
            <Card key={dish.name}>
              <h3 className="font-semibold">{dish.name}</h3>
              <p className="text-xs text-ink-500">
                {dish.cuisine} · {dish.time}
              </p>
              <p className="mt-2 text-sm text-ink-700">
                A named, well-known dish — never a random ingredient mash-up.
              </p>
            </Card>
          ))}
        </div>
      </SectionCard>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-gold-200 bg-gold-50 p-4 text-sm text-gold-500">
        <Sparkles size={18} aria-hidden="true" className="mt-0.5" />
        <div>
          <p className="font-medium">Heads-up on safety</p>
          <p className="mt-0.5">
            AI-generated recipes are for inspiration. Always cross-check against
            your personal allergies and any dietary requirements from your
            healthcare provider.
          </p>
        </div>
      </div>
    </div>
  );
};
