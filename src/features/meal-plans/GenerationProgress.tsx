import { useEffect, useState } from 'react';

const PHASES = [
  'Reviewing your preferences',
  'Selecting recognizable dishes',
  'Balancing ingredients across the week',
  'Building your shopping list',
  'Checking the recipes',
];

export const GenerationProgress = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % PHASES.length), 1200);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-full max-w-md items-center justify-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-card"
    >
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sage-600 border-t-transparent"
        aria-hidden="true"
      />
      <span>{PHASES[idx]}</span>
    </div>
  );
};
