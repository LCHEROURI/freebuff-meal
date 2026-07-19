import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChefHat,
  RotateCcw,
  Share2,
  Timer,
  X,
} from 'lucide-react';

import { plansStore, type DemoMealPlan } from '@/utils/demoAdapter';
import { useAuth } from '@/features/auth/authContext';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { useToast } from '@/components/common/Toast';
import {
  VoiceCommandListener,
  type CookModeIntent,
} from '@/components/common/VoiceCommandListener';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';
import type { Recipe, RecipeStep } from '@/schemas/recipe';

/**
 * Hands-busy cook mode for `RecipeDetailPage`.
 *
 * Architecture (validated by /thinker-with-files-gemini):
 *
 * - **Step stream**: collapse `preparationSteps + cookingSteps` +
 *   presentation-suggestions into one linear "Step N of M" stream. The
 *   schema's `phase` divider is preserved as a chip badge on each step
 *   so the cook can still see "preparation" vs "cooking" vs
 *   "presentation" without breaking flow.
 * - **Per-step timer**: if `step.durationSeconds` exists (new optional
 *   field), a "Start the timer" button is rendered; otherwise a generic
 *   "Set a timer" button is offered for an arbitrary timer the cook can
 *   type a duration into. Either path can run in parallel and shows up
 *   in a chip-tray overlay.
 * - **Persistence**: `localStorage` keyed by recipe id, with a 12-hour
 *   TTL — long enough to resume after a chat-message interruption,
 *   short enough that opening an old recipe days later doesn't put you
 *   on Step 7.
 * - **Voice commands**: dedicated `<VoiceCommandListener>` (sibling of
 *   the text-input `VoiceInputButton`). Runs independently. Grammar:
 *   `next / back / done / repeat / start-timer / cancel-timer /
 *   stop-listening`. Client-side `includes`-matcher — no Cloud Function
 *   round-trip, near-zero latency for hands-busy.
 * - **TTS (opt-in)**: Web Speech Synthesis reads the step aloud when the
 *   user toggles "Read aloud" — defaults OFF (announced as annoying in
 *   kitchens where the cook is also listening to a podcast or a kid).
 * - **Auto-advance**: never. The cook always has to say/tap done.
 */

const PERSIST_TTL_MS = 12 * 60 * 60 * 1000;

const persistKey = (recipeId: string) => `freebuff:cook:${recipeId}`;

type StoredProgress = {
  stepIndex: number;
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  lastUpdatedAt: number;
};

const loadStored = (recipeId: string): StoredProgress | null => {
  try {
    const raw = window.localStorage.getItem(persistKey(recipeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProgress;
    if (
      typeof parsed?.stepIndex !== 'number' ||
      typeof parsed?.lastUpdatedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.lastUpdatedAt > PERSIST_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveStored = (recipeId: string, progress: Omit<StoredProgress, 'lastUpdatedAt'>): void => {
  try {
    window.localStorage.setItem(
      persistKey(recipeId),
      JSON.stringify({ ...progress, lastUpdatedAt: Date.now() }),
    );
  } catch {
    // localStorage quota or disabled — best-effort only.
  }
};

const clearStored = (recipeId: string): void => {
  try {
    window.localStorage.removeItem(persistKey(recipeId));
  } catch {
    // best-effort only.
  }
};

type LinearStep = RecipeStep & { globalIndex: number; totalLabel: string };

const toLinearSteps = (recipe: Recipe): LinearStep[] => {
  const items: LinearStep[] = [];
  for (const step of recipe.preparationSteps) {
    items.push({
      ...step,
      phase: 'preparation',
      globalIndex: items.length,
      totalLabel: '',
    });
  }
  for (const step of recipe.cookingSteps) {
    items.push({
      ...step,
      phase: 'cooking',
      globalIndex: items.length,
      totalLabel: '',
    });
  }
  recipe.presentationSuggestions.forEach((text, i) => {
    items.push({
      order: i + 1,
      phase: 'presentation',
      text,
      globalIndex: items.length,
      totalLabel: '',
    });
  });
  return items;
};

type ActiveTimer = { stepGlobalIndex: number; startedAt: number; durationMs: number };

const fmtClock = (ms: number): string => {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const speak = (text: string) => {
  if (typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // TTS disabled at the OS level — silent.
  }
};

export const CookModePage = () => {
  const { recipeId, planId } = useParams<{ recipeId: string; planId: string }>();
  const { user } = useAuth();
  const toast = useToast();

  const [plan, setPlan] = useState<DemoMealPlan | null>(null);
  const [recipe, setRecipe] = useState<EmbeddedRecipe | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [manualDurationMin, setManualDurationMin] = useState<number>(5);
  const [showManualPicker, setShowManualPicker] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const tickRef = useRef<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  // 1. Load the recipe from the plan.
  useEffect(() => {
    if (!user || !planId) return;
    const found = plansStore.list(user.uid).find((p) => p.id === planId);
    if (!found) return;
    setPlan(found);
    const r = found.recipes.find((x) => x.id === recipeId);
    if (r) setRecipe(r);
  }, [user, planId, recipeId]);

  const steps = useMemo(() => (recipe ? toLinearSteps(recipe) : []), [recipe]);

  // 2. Resume from localStorage (with TTL check).
  useEffect(() => {
    if (!recipeId) return;
    const stored = loadStored(recipeId);
    if (!stored) return;
    setStepIndex(Math.min(stored.stepIndex, Math.max(0, steps.length - 1)));
    setVoiceEnabled(stored.voiceEnabled);
    setTtsEnabled(stored.ttsEnabled);
    setStatusMsg('Resumed where you left off.');
  }, [recipeId, steps.length]);

  // 3. Persist on state change.
  useEffect(() => {
    if (!recipeId) return;
    if (steps.length === 0) return;
    saveStored(recipeId, { stepIndex, voiceEnabled, ttsEnabled });
  }, [recipeId, stepIndex, voiceEnabled, ttsEnabled, steps.length]);

  // 4. Drive the timer countdown ticker.
  useEffect(() => {
    if (!activeTimer) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [activeTimer]);

  // 5. Fire "timer done" toast when an active timer hits zero.
  useEffect(() => {
    if (!activeTimer) return;
    const elapsed = now - activeTimer.startedAt;
    if (elapsed >= activeTimer.durationMs) {
      setActiveTimer(null);
      toast.push({
        kind: 'success',
        title: 'Timer done',
        description: 'Check the food before you advance.',
      });
      speak('Timer done.');
    }
  }, [now, activeTimer, toast]);

  // 6. TTS on step change (opt-in).
  useEffect(() => {
    if (!ttsEnabled) return;
    if (steps.length === 0) return;
    const step = steps[stepIndex];
    if (!step) return;
    speak(`Step ${stepIndex + 1}. ${step.text}`);
  }, [ttsEnabled, stepIndex, steps]);

  const cancelActiveTimer = useCallback(() => setActiveTimer(null), []);

  const startStepTimer = useCallback((stepGlobalIndex: number) => {
    const step = steps[stepGlobalIndex];
    if (!step?.durationSeconds) return;
    setActiveTimer({
      stepGlobalIndex,
      startedAt: Date.now(),
      durationMs: step.durationSeconds * 1000,
    });
  }, [steps]);

  const startManualTimer = useCallback(() => {
    setActiveTimer({
      stepGlobalIndex: stepIndex,
      startedAt: Date.now(),
      durationMs: Math.max(60_000, manualDurationMin * 60_000),
    });
    setShowManualPicker(false);
  }, [stepIndex, manualDurationMin]);

  const repeatCurrent = useCallback(() => {
    const step = steps[stepIndex];
    if (!step) return;
    speak(`Step ${stepIndex + 1}. ${step.text}`);
  }, [steps, stepIndex]);

  const handleIntent = useCallback(
    (intent: CookModeIntent) => {
      switch (intent) {
        case 'next':
        case 'done':
          setStepIndex((i) => Math.min(steps.length - 1, i + 1));
          setStatusMsg(intent === 'done' ? 'Marked done. Next step.' : 'Next step.');
          break;
        case 'back':
          setStepIndex((i) => Math.max(0, i - 1));
          setStatusMsg('Back one step.');
          break;
        case 'repeat':
          repeatCurrent();
          setStatusMsg('Reading the current step aloud.');
          break;
        case 'start-timer': {
          const step = steps[stepIndex];
          if (step?.durationSeconds) {
            startStepTimer(stepIndex);
            setStatusMsg(`Started the step timer for ${Math.round(step.durationSeconds / 60)} minutes.`);
          } else {
            setShowManualPicker(true);
            setStatusMsg('Pick a duration for the timer.');
          }
          break;
        }
        case 'cancel-timer':
          if (activeTimer) cancelActiveTimer();
          setStatusMsg('Cancelled the timer.');
          break;
        case 'stop-listening':
          setVoiceEnabled(false);
          setStatusMsg('Voice commands off.');
          break;
      }
    },
    [steps, stepIndex, repeatCurrent, startStepTimer, cancelActiveTimer, activeTimer],
  );

  // TTS cancel on unmount / route leave.
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // best-effort only.
      }
    };
  }, []);

  if (!plan || !recipe) {
    return (
      <p className="text-sm text-ink-500">
        Recipe not found.{' '}
        <Link to="/app/plans" className="text-sage-700 hover:underline">
          Back to plans
        </Link>
      </p>
    );
  }

  if (steps.length === 0) {
    return (
      <Card title="Nothing to cook">
        <p className="text-sm">This recipe has no steps yet.</p>
      </Card>
    );
  }

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;
  const phaseLabel =
    step.phase === 'preparation'
      ? 'Prep'
      : step.phase === 'cooking'
        ? 'Cook'
        : 'Serve';

  const remainingMs = activeTimer
    ? Math.max(0, activeTimer.durationMs - (now - activeTimer.startedAt))
    : 0;
  const isTimerForCurrentStep =
    activeTimer?.stepGlobalIndex === stepIndex;

  const handleFinish = () => {
    if (recipeId) clearStored(recipeId);
    setStatusMsg('Recipe complete.');
  };

  const handleShare = () => {
    const url = `${window.location.origin}/app/plans/${plan.id}/recipes/${recipe.id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    toast.push({ kind: 'success', title: 'Recipe link copied' });
  };

  return (
    <div className="pb-24 md:pb-6">
      <p className="text-xs text-ink-500">
        <Link to={`/app/plans/${plan.id}/recipes/${recipe.id}`} className="hover:underline">
          ← Back to recipe
        </Link>
      </p>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">
            <ChefHat size={12} className="mr-1 inline" aria-hidden="true" />
            Cook Mode · {recipe.cuisine}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
          <p className="mt-1 text-sm text-ink-700" role="status" aria-live="polite">
            {statusMsg || `Step ${stepIndex + 1} of ${steps.length} · ${phaseLabel}`}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => setTtsEnabled(e.target.checked)}
            />
            Read aloud
          </label>
          <VoiceCommandListener enabled={voiceEnabled} onIntent={handleIntent} />
          <Button
            size="sm"
            variant={voiceEnabled ? 'secondary' : 'ghost'}
            onClick={() => setVoiceEnabled((v) => !v)}
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled ? 'Voice: on' : 'Voice: off'}
          </Button>
        </div>
      </header>

      {/* Current step — big card, mobile-friendly, hands-busy first. */}
      <Card className="mt-4" key={stepIndex}>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-500">
          <span className="rounded-full bg-tomato-100 px-2 py-0.5 font-semibold text-tomato-700">
            Step {stepIndex + 1} / {steps.length}
          </span>
          <span className="rounded-full bg-basil-100 px-2 py-0.5 font-semibold text-basil-700">
            {phaseLabel}
          </span>
        </div>
        <p className="mt-4 text-2xl font-medium leading-snug tracking-tight">
          {step.text}
        </p>
        {step.durationSeconds && (
          <p className="mt-2 text-xs text-ink-500">
            Suggested: {Math.round(step.durationSeconds / 60)} min
          </p>
        )}

        <div className="no-print mt-5 flex flex-wrap gap-2">
          {step.durationSeconds ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => startStepTimer(stepIndex)}
              leftIcon={<Timer size={14} aria-hidden="true" />}
              disabled={isTimerForCurrentStep && remainingMs > 0}
            >
              Start {Math.round(step.durationSeconds / 60)}-min timer
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowManualPicker((s) => !s)}
              leftIcon={<Timer size={14} aria-hidden="true" />}
            >
              Set a timer
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={repeatCurrent}
            leftIcon={<RotateCcw size={14} aria-hidden="true" />}
            disabled={!ttsEnabled}
            title={ttsEnabled ? 'Read the current step again' : 'Enable “Read aloud” to use this'}
          >
            Repeat
          </Button>
          {activeTimer && isTimerForCurrentStep && (
            <Button
              size="sm"
              variant="danger"
              onClick={cancelActiveTimer}
              leftIcon={<X size={14} aria-hidden="true" />}
            >
              Cancel timer
            </Button>
          )}
        </div>

        {showManualPicker && (
          <div className="no-print mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-butter-300 bg-butter-50 p-3">
            <label className="text-xs text-ink-700" htmlFor="manual-duration">
              Minutes
            </label>
            <input
              id="manual-duration"
              type="number"
              min={1}
              max={120}
              value={manualDurationMin}
              onChange={(e) =>
                setManualDurationMin(Math.max(1, Number(e.target.value) || 1))
              }
              className="input-base w-20"
            />
            <Button size="sm" variant="primary" onClick={startManualTimer}>
              Start
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowManualPicker(false)}>
              Cancel
            </Button>
          </div>
        )}
      </Card>

      {/* Timer chip-tray overlay — active timer floating badge. */}
      {activeTimer && (
        <div
          role="status"
          aria-live="polite"
          className="no-print pointer-events-none fixed left-1/2 top-4 z-30 -translate-x-1/2"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-pepper-700 px-4 py-2 text-white shadow-warm">
            <Timer size={14} aria-hidden="true" />
            <span className="font-display text-lg tabular-nums">
              {fmtClock(remainingMs)}
            </span>
            <button
              type="button"
              aria-label="Dismiss timer"
              className="rounded-full p-1 hover:bg-white/15"
              onClick={cancelActiveTimer}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Big-tap nav — mobile pinned-bottom, desktop row. */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-butter-200 bg-flour-50 p-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
        <div className="flex items-center justify-between gap-2 md:mt-6">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            leftIcon={<ArrowLeft size={18} aria-hidden="true" />}
            className="flex-1 md:flex-none md:w-40"
          >
            Back
          </Button>
          {isLast ? (
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleFinish}
              leftIcon={<Check size={18} aria-hidden="true" />}
              className="flex-1 md:flex-none md:w-40"
            >
              Finish
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
              rightIcon={<ArrowRight size={18} aria-hidden="true" />}
              className="flex-1 md:flex-none md:w-40"
            >
              Done · Next
            </Button>
          )}
        </div>
      </nav>

      <p className="mt-6 text-xs text-ink-500">
        Voice commands: try saying{' '}
        <em>“next”</em>, <em>“back”</em>, <em>“done”</em>, <em>“repeat”</em>, <em>“start timer”</em>, <em>“stop timer”</em>, <em>“stop listening”</em>.
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        leftIcon={<Share2 size={14} aria-hidden="true" />}
        className="no-print mt-4"
      >
        Copy recipe link
      </Button>
    </div>
  );
};

export default CookModePage;
