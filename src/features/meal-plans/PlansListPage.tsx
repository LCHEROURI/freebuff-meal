import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { SectionCard } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/LoadingState';
import { Dialog } from '@/components/common/Dialog';
import { useToast } from '@/components/common/Toast';
import { plansStore } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import type { DemoMealPlan } from '@/utils/demoAdapter';

export const PlansListPage = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState<DemoMealPlan[]>([]);
  const [removing, setRemoving] = useState<DemoMealPlan | null>(null);

  useEffect(() => {
    if (!user) return;
    setPlans(plansStore.list(user.uid).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  }, [user]);

  const confirmRemove = () => {
    if (!removing || !user) return;
    const rest = plansStore.list(user.uid).filter((p) => p.id !== removing.id);
    plansStore.write(user.uid, rest);
    setPlans(rest);
    setRemoving(null);
    toast.push({ kind: 'success', title: 'Plan deleted' });
  };

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved plans</h1>
          <p className="mt-1 text-sm text-ink-500">
            Sorted by last update.
          </p>
        </div>
        <Button asChildLink to="/app/new-plan" variant="primary">
          New plan
        </Button>
      </header>

      <SectionCard title="Your plans">
        {plans.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Once you generate a plan, it shows up here for as long as you want."
            action={
              <Button asChildLink to="/app/new-plan" variant="primary">
                Create your first plan
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {plans.map((plan) => (
              <li key={plan.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <Link
                    to={`/app/plans/${plan.id}`}
                    className="font-medium text-ink-900 hover:underline"
                  >
                    {plan.name}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {plan.planLength} dinners · updated {new Date(plan.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRemoving(plan)} leftIcon={<Trash2 size={14} aria-hidden="true" />}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this plan?"
        description="This action cannot be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmRemove} leftIcon={<Trash2 size={14} aria-hidden="true" />}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          You're about to delete <strong>{removing?.name}</strong>.
        </p>
      </Dialog>
    </div>
  );
};
