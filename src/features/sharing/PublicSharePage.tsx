import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { Card } from '@/components/common/Card';
import { AuthenticityBadge, DietaryBadge, AllergenBadge, Pill } from '@/components/common/AllergenBadge';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';

type Snapshot = {
  planName: string;
  summary: string;
  generatedAt?: string;
  recipes: EmbeddedRecipe[];
};

const SHARE_KEY = 'demo:share:';

const loadSnapshot = (shareId: string): Snapshot | null => {
  try {
    const raw = window.localStorage.getItem(`${SHARE_KEY}${shareId}`);
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
};

export const PublicSharePage = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!shareId) return;
    const data = loadSnapshot(shareId);
    if (!data) {
      setMissing(true);
      return;
    }
    setSnapshot(data);
  }, [shareId]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Shared plan</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {snapshot?.planName ?? (missing ? 'Plan unavailable' : 'Loading…')}
          </h1>
        </div>
        <Link to="/" className="text-sm text-sage-700 hover:underline">
          Plan your own →
        </Link>
      </header>

      {missing && (
        <Card>
          <p>
            This share link is invalid or has been revoked.{' '}
            <Link to="/" className="text-sage-700 hover:underline">
              Start your own plan
            </Link>
            .
          </p>
        </Card>
      )}

      {snapshot && (
        <>
          <p className="text-sm text-ink-500">{snapshot.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {snapshot.recipes.map((r) => (
              <Card key={r.id}>
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-ink-500">{r.cuisine} · {r.originCountry}</p>
                    <h2 className="text-lg font-semibold">{r.name}</h2>
                  </div>
                  <AuthenticityBadge label={r.authenticityLabel} />
                </header>
                <p className="mt-1 text-sm text-ink-700">{r.shortDescription}</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  <Pill>⏱ {r.totalTimeMinutes} min total</Pill>
                  <Pill>🍽 {r.servings} servings</Pill>
                  <Pill>👨‍🍳 {r.difficulty}</Pill>
                  {r.dietaryTags?.map((t) => (
                    <DietaryBadge key={t} label={t.replaceAll('_', ' ')} />
                  ))}
                  {r.allergenFlags.map((a) => (
                    <AllergenBadge key={a} label={a.replaceAll('_', ' ')} />
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-500">
                  <strong>Why:</strong> {r.whyItFits}
                </p>
              </Card>
            ))}
          </div>
        </>
      )}
    </main>
  );
};
