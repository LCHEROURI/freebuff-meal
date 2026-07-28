import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChefHat,
  Check,
  ChevronRight,
  Mic,
  MicOff,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';

import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { useToast } from '@/components/common/Toast';
import { useSpeechDictation, useSpeechSynthesis } from '@/lib/useSpeech';
import { useAuth } from '@/features/auth/authContext';
import { agentClient, type AgentRecipe, type StepView } from './agentClient';
import type { AgentIngredient, CookingSessionPhase } from './agentTypes';

/**
 * Voice-operated cooking-agent wizard.
 *
 * 5 stages (one URL path, internal state machine):
 *
 *   1. CAPTURE — voice / free-text ingredient list. Live transcript
 *      preview + "Add these" button. Backs the natural "I have
 *      chicken, tomatoes, garlic…" UX.
 *   2. CONFIRM — chip list of extracted ingredients with remove /
 *      edit. Adds/updates via the `update_available_ingredients`
 *      tool. Edit typically means "back to capture".
 *   3. REQUIREMENTS — servings, max time, equipment checkboxes.
 *      Drives `generate_recipe`.
 *   4. RECIPE_READY — show the title + summary, then "Cook With Me"
 *      advances to the guided session (calls
 *      `start_cooking_session` → `get_current_step`).
 *   5. COOK — first-class harness for the existing CookModePage
 *      primitives: step text large, prior/next/done, repeat via TTS,
 *      substitution dialog in-place, pause/resume persists across
 *      navigation. Each step speak-aloud is opt-in via "Read aloud".
 *
 * Demo mode (`agentClient.isDemoMode()`) falls through to a
 * localStorage-stub session — full UI walkable end-to-end without
 * any backend dependency.
 */
type Stage = 'CAPTURE' | 'CONFIRM' | 'REQUIREMENTS' | 'RECIPE_READY' | 'COOK' | 'COMPLETED';

export const CookingAgentPage = (): ReactNode => {
  // `user` lookup is reserved for future personalization (e.g. dietary
  // profile autofill) — the wizard currently operates on user-stated
  // ingredients, but the auth context still gates the route so it's
  // imported here for the day we want to merge the two.
  useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // ============ STAGE / SESSION STATE ============
  const [stage, setStage] = useState<Stage>('CAPTURE');
  const [speakerEnabled, setSpeakerEnabled] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<AgentRecipe | null>(null);
  const [step, setStep] = useState<StepView | null>(null);
  const [totalSteps, setTotalSteps] = useState<number>(0);
  const [sessionPhase, setSessionPhase] = useState<CookingSessionPhase | null>(null);

  // ============ CAPTURE STATE ============
  const dictation = useSpeechDictation();
  const [draftUtterance, setDraftUtterance] = useState<string>('');
  const draftUtteranceRef = useRef<string>('');
  useEffect(() => {
    draftUtteranceRef.current = draftUtterance;
  }, [draftUtterance]);
  useEffect(() => {
    setDraftUtterance((prev) => `${prev} ${dictation.finalTranscript}`.trim());
  }, [dictation.finalTranscript]);

  const [ingredients, setIngredients] = useState<AgentIngredient[]>([]);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isAdvancingStep, setIsAdvancingStep] = useState<boolean>(false);

  const speak = useSpeechSynthesis();

  // ============ REQUIREMENTS ============
  const [servings, setServings] = useState<number>(2);
  const [maxMinutes, setMaxMinutes] = useState<number>(45);
  const [equipment, setEquipment] = useState<string[]>(['stove']);

  // ============ SUBSTITUTION DIALOG ============
  const [subOpen, setSubOpen] = useState<boolean>(false);
  const [subTarget, setSubTarget] = useState<string>('');
  const [subReplacement, setSubReplacement] = useState<string>('');

  // ----------- Handlers ------------

  const handleExtract = useCallback(async () => {
    const utt = draftUtteranceRef.current.trim();
    if (!utt) {
      toast.push({ kind: 'error', title: 'Say or type what you have first.' });
      return;
    }
    setIsExtracting(true);
    try {
      // Real Firebase or demo — the agentClient routes automatically.
      const res = await agentClient.extractIngredientsFromSpeech(utt);
      if (!sessionId) {
        const saved = await agentClient.saveAvailableIngredients(res.ingredients);
        setSessionId(saved.sessionId);
        setIngredients(res.ingredients);
      } else {
        const updated = await agentClient.updateAvailableIngredients({
          sessionId,
          add: res.ingredients,
        });
        setIngredients(updated.ingredients);
      }
      if (res.warnings.length > 0) {
        toast.push({ kind: 'info', title: 'Heads-up', description: res.warnings.join(' ') });
      }
      setDraftUtterance('');
      dictation.reset();
      setStage('CONFIRM');
      if (speakerEnabled) speak.speak('Great. Let me show you what I heard.');
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not extract ingredients',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    } finally {
      setIsExtracting(false);
    }
  }, [dictation, sessionId, speak, speakerEnabled, toast]);

  const handleConfirmIngredients = useCallback(async () => {
    if (ingredients.length === 0 || !sessionId) return;
    setStage('REQUIREMENTS');
  }, [ingredients.length, sessionId]);

  const handleGenerate = useCallback(async () => {
    if (!sessionId) return;
    setIsGenerating(true);
    try {
      const res = await agentClient.generateRecipe({
        sessionId,
        ingredients,
        servings,
        maximumMinutes: maxMinutes,
        equipment,
        mealType: 'dinner',
      });
      setRecipe(res.recipe);
      setStage('RECIPE_READY');
      if (speakerEnabled) {
        speak.speak(
          `I made ${res.recipe.name}. It serves ${res.recipe.servings}. ${res.recipe.shortDescription}`,
        );
      }
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not generate a recipe',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [equipment, ingredients, maxMinutes, sessionId, servings, speak, speakerEnabled, toast]);

  const handleStartCooking = useCallback(async () => {
    if (!sessionId || !recipe) return;
    try {
      const res = await agentClient.startCookingSession({ sessionId });
      setSessionPhase(res.session.phase);
      const stepRes = await agentClient.getCurrentStep({ sessionId });
      setStep(stepRes.step);
      setTotalSteps(stepRes.totalSteps);
      setStage('COOK');
      if (speakerEnabled) speak.speak(`Let's cook. Step 1. ${stepRes.step.spokenText}`);
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not start cooking',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    }
  }, [recipe, sessionId, speak, speakerEnabled, toast]);

  const handleStepNext = useCallback(async () => {
    if (!sessionId) return;
    setIsAdvancingStep(true);
    try {
      const res = await agentClient.completeCurrentStep({ sessionId });
      setSessionPhase(res.session.phase);
      if (res.step === null) {
        // Done with the recipe.
        setStage('COMPLETED');
        if (speakerEnabled) speak.speak('You are done. Enjoy your meal.');
        toast.push({ kind: 'success', title: 'Recipe complete', description: 'Nicely done.' });
      } else {
        setStep(res.step);
        if (speakerEnabled) speak.speak(`Step ${res.step.stepNumber}. ${res.step.spokenText}`);
      }
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not advance',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    } finally {
      setIsAdvancingStep(false);
    }
  }, [sessionId, speak, speakerEnabled, toast]);

  const handleStepPrev = useCallback(async () => {
    if (!sessionId) return;
    setIsAdvancingStep(true);
    try {
      const res = await agentClient.previousStep({ sessionId });
      setSessionPhase(res.session.phase);
      if (res.step) {
        setStep(res.step);
        if (speakerEnabled) speak.speak(`Step ${res.step.stepNumber}. ${res.step.spokenText}`);
      }
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not go back',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    } finally {
      setIsAdvancingStep(false);
    }
  }, [sessionId, speak, speakerEnabled, toast]);

  const handleRepeat = useCallback(() => {
    if (!step) return;
    speak.speak(`Step ${step.stepNumber}. ${step.spokenText}`);
  }, [speak, step]);

  const handleStopListening = useCallback(() => {
    dictation.stop();
  }, [dictation]);

  // Substitution dialog
  const openSubstitution = useCallback((ingredient: string) => {
    setSubTarget(ingredient);
    setSubReplacement('');
    setSubOpen(true);
    if (speakerEnabled) speak.speak(`Substituting ${ingredient}. What do you have instead?`);
  }, [speak, speakerEnabled]);

  const handleSubstitutionConfirm = useCallback(async () => {
    if (!sessionId || !subTarget || !subReplacement.trim()) return;
    try {
      await agentClient.replaceIngredient({
        sessionId,
        originalIngredient: subTarget,
        replacement: subReplacement.trim(),
      });
      setSubOpen(false);
      toast.push({
        kind: 'success',
        title: `Replaced ${subTarget}`,
        description: `Now using ${subReplacement.trim()}.`,
      });
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not substitute',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    }
  }, [sessionId, subReplacement, subTarget, toast]);

  const handleRemoveIngredient = useCallback(async (index: number) => {
    if (!sessionId) {
      // Local-only stale chip during capture; drop in-place.
      setIngredients((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    try {
      const updated = await agentClient.updateAvailableIngredients({
        sessionId,
        removeIndexes: [index],
      });
      setIngredients(updated.ingredients);
    } catch (err) {
      toast.push({
        kind: 'error',
        title: 'Could not remove ingredient',
        description: err instanceof Error ? err.message : 'Try again.',
      });
    }
  }, [sessionId, toast]);

  // --------- RENDER (per stage) ----------

  const renderHeader = (subtitle: string) => (
    <header className="mt-1">
      <p className="text-xs uppercase tracking-wider text-ink-500">
        <ChefHat size={12} className="mr-1 inline" aria-hidden="true" />
        Cooking Agent
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cook with me</h1>
      <p className="mt-1 text-sm text-ink-700">{subtitle}</p>
    </header>
  );

  const renderSpeakerToggle = () => (
    <div className="no-print my-2 flex items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={speakerEnabled}
          onChange={(e) => setSpeakerEnabled(e.target.checked)}
        />
        Read aloud
      </label>
    </div>
  );

  // --------------- STAGE: CAPTURE ---------------

  const renderCapture = () => (
    <Card>
      <p className="text-sm text-ink-700">
        Tell me everything you have on hand. You can speak or type — list as much or as little as you like.
      </p>
      <textarea
        value={draftUtterance}
        onChange={(e) => setDraftUtterance(e.target.value)}
        placeholder="Example: “I have three chicken breasts, two tomatoes, half an onion, garlic, rice, olive oil, paprika, and frozen peas.”"
        className="input-base mt-3 h-32 w-full resize-y"
        aria-label="Your available ingredients"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {dictation.supported && (
          <>
            <button
              type="button"
              aria-label={dictation.listening ? 'Stop dictation' : 'Start dictation'}
              aria-pressed={dictation.listening}
              onClick={() => dictation.toggle()}
              className={[
                'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm transition-colors',
                dictation.listening
                  ? 'bg-tomato-100 text-tomato-700 ring-2 ring-tomato-500 listening-pulse'
                  : 'bg-butter-100 text-pepper-700 hover:bg-turmeric-100 hover:text-turmeric-700',
              ].join(' ')}
            >
              {dictation.listening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              {dictation.listening ? 'Listening…' : 'Speak'}
            </button>
            {dictation.listening && (
              <button
                type="button"
                onClick={handleStopListening}
                className="rounded-full px-3 py-2 text-xs text-pepper-500 hover:bg-butter-100"
              >
                Stop
              </button>
            )}
          </>
        )}
        {dictation.error && (
          <span className="text-xs text-tomato-600">{dictation.error}</span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/app')}
          leftIcon={<X size={14} aria-hidden="true" />}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleExtract}
          loading={isExtracting}
          rightIcon={<ChevronRight size={14} aria-hidden="true" />}
        >
          Add these
        </Button>
      </div>
    </Card>
  );

  // --------------- STAGE: CONFIRM ---------------

  const renderConfirm = () => (
    <Card>
      <p className="text-sm text-ink-700">
        I heard these. Tap <span className="font-medium">Continue</span> if it looks right, remove anything wrong, or speak/type more below.
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {ingredients.map((ing, i) => (
          <li
            key={`${ing.name}-${i}`}
            className="flex items-center gap-1 rounded-full bg-basil-100 px-3 py-1 text-sm text-basil-700"
          >
            <span>
              {ing.quantity ? `${ing.quantity} ` : ''}
              {ing.unit ? `${ing.unit} ` : ''}
              {ing.name}
            </span>
            <button
              type="button"
              aria-label={`Remove ${ing.name}`}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-basil-700 hover:bg-basil-200"
              onClick={() => handleRemoveIngredient(i)}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </li>
        ))}
        {ingredients.length === 0 && (
          <li className="text-sm text-ink-500">No ingredients yet.</li>
        )}
      </ul>
      <textarea
        value={draftUtterance}
        onChange={(e) => setDraftUtterance(e.target.value)}
        placeholder="Say or type more — “I also have butter”, “add cheddar”, etc."
        className="input-base mt-4 h-20 w-full resize-y"
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setStage('CAPTURE')}>
          ← Back
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirmIngredients}
          disabled={ingredients.length === 0}
          rightIcon={<ChevronRight size={14} aria-hidden="true" />}
        >
          Continue
        </Button>
      </div>
    </Card>
  );

  // --------------- STAGE: REQUIREMENTS ---------------

  const renderRequirements = () => (
    <Card title="A few quick questions">
      <p className="text-sm text-ink-700">
        Just the essentials — I won't grill you with a long form.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-ink-500">Servings</span>
          <input
            type="number"
            min={1}
            max={12}
            value={servings}
            onChange={(e) => setServings(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            className="input-base w-24"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wider text-ink-500">Max time (min)</span>
          <input
            type="number"
            min={15}
            max={180}
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(Math.max(15, Math.min(180, Number(e.target.value) || 45)))}
            className="input-base w-24"
          />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-xs uppercase tracking-wider text-ink-500">Equipment</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['stove', 'oven', 'air_fryer', 'slow_cooker', 'instant_pot', 'microwave'] as const).map((eq) => {
            const on = equipment.includes(eq);
            return (
              <button
                key={eq}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setEquipment((prev) =>
                    on ? prev.filter((e) => e !== eq) : [...prev, eq],
                  )
                }
                className={[
                  'rounded-full px-3 py-1.5 text-sm transition-colors',
                  on
                    ? 'bg-tomato-700 text-flour-50'
                    : 'bg-butter-100 text-pepper-700 hover:bg-turmeric-100 hover:text-turmeric-700',
                ].join(' ')}
              >
                {on && <Check size={12} className="mr-1 inline" aria-hidden="true" />}
                {eq.replace('_', ' ')}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => setStage('CONFIRM')}>
          ← Back
        </Button>
        <Button
          variant="primary"
          onClick={handleGenerate}
          loading={isGenerating}
          leftIcon={<Sparkles size={14} aria-hidden="true" />}
        >
          Generate recipe
        </Button>
      </div>
      {recipe && (
        <p className="mt-3 text-xs text-ink-500">
          Last generated: <em>{recipe.name}</em>. Tap <strong>Generate recipe</strong> to refresh.
        </p>
      )}
    </Card>
  );

  // --------------- STAGE: RECIPE_READY ---------------

  const renderRecipeReady = () =>
    recipe ? (
      <Card>
        <p className="text-xs uppercase tracking-wider text-ink-500">{recipe.cuisine}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">{recipe.name}</h2>
        <p className="mt-2 text-sm text-ink-700">{recipe.shortDescription}</p>
        <ul className="mt-3 grid gap-1 text-xs text-ink-500 sm:grid-cols-3">
          <li>Serves {recipe.servings}</li>
          <li>Prep {recipe.prepMinutes} min</li>
          <li>Cook {recipe.cookMinutes} min</li>
        </ul>
        <div className="mt-4 rounded-lg border border-butter-200 bg-butter-50 p-3 text-xs">
          <p className="font-semibold uppercase tracking-wider text-butter-700">Ingredients</p>
          <ul className="mt-2 space-y-1">
            {recipe.ingredients.map((ing, i) => (
              <li key={`${ing.name}-${i}`}>
                {ing.quantity ? `${ing.quantity} ` : ''}
                {ing.unit ? `${ing.unit} ` : ''}
                {ing.name}
              </li>
            ))}
          </ul>
          {recipe.safety.minimumInternalTemperatureF && (
            <p className="mt-3 font-medium text-tomato-700">
              Cook meat to {recipe.safety.minimumInternalTemperatureF}°F internal temperature.
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStage('REQUIREMENTS')}>
            ← Back
          </Button>
          <Button
            variant="primary"
            onClick={handleStartCooking}
            leftIcon={<Play size={14} aria-hidden="true" />}
          >
            Cook with me
          </Button>
        </div>
      </Card>
    ) : (
      <Card>
        <p className="text-sm">Generating your recipe…</p>
      </Card>
    );

  // --------------- STAGE: COOK ---------------

  const renderCook = () => {
    if (!step || !recipe) {
      return (
        <Card>
          <p className="text-sm">Loading next step…</p>
        </Card>
      );
    }
    const phaseLabel =
      step.phase === 'preparation'
        ? 'Prep'
        : step.phase === 'cooking'
          ? 'Cook'
          : 'Serve';
    const safetyNote = step.safetyCritical
      ? recipe.safety.minimumInternalTemperatureF
        ? `Cook to ${recipe.safety.minimumInternalTemperatureF}°F internal temperature.`
        : 'Use a food thermometer to confirm doneness.'
      : null;

    return (
      <div>
        <header className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500">{recipe.name}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{phaseLabel}</h2>
          </div>
          <p className="text-xs text-ink-500" aria-live="polite">
            Step {step.stepNumber} of {totalSteps}
          </p>
        </header>
        <Card className="mt-3">
          <p className="text-xl font-medium leading-snug">{step.text}</p>
          {safetyNote && (
            <p className="mt-2 rounded-md bg-tomato-50 px-3 py-2 text-xs text-tomato-700">
              <strong>Safety:</strong> {safetyNote}
            </p>
          )}
          {step.timerSeconds && (
            <p className="mt-2 text-xs text-ink-500">
              Suggested timer: <strong>{Math.round(step.timerSeconds / 60)} min</strong>
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRepeat}
              leftIcon={<RotateCcw size={14} aria-hidden="true" />}
              disabled={!speakerEnabled}
              title={speakerEnabled ? 'Read the current step again' : 'Enable “Read aloud”'}
            >
              Repeat
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openSubstitution(step.ingredientsUsed[0] ?? 'an ingredient')}
              leftIcon={<Plus size={14} aria-hidden="true" />}
            >
              Substitute
            </Button>
          </div>
        </Card>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-butter-200 bg-flour-50 p-3 md:static md:z-auto md:border-0 md:bg-transparent md:p-0">
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={handleStepPrev}
              disabled={step.stepNumber === 1}
              leftIcon={<X size={18} aria-hidden="true" />}
              className="flex-1 md:flex-none md:w-32"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleStepNext}
              loading={isAdvancingStep}
              rightIcon={<ChevronRight size={18} aria-hidden="true" />}
              className="flex-1 md:flex-none md:w-40"
            >
              {step.stepNumber === totalSteps ? 'Finish' : 'Done · Next'}
            </Button>
          </div>
        </nav>
      </div>
    );
  };

  // --------------- STAGE: COMPLETED ---------------

  const renderCompleted = () => (
    <Card>
      <div className="text-center">
        <Sparkles size={32} aria-hidden="true" className="mx-auto text-turmeric-500" />
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Nicely done.</h2>
        <p className="mt-2 text-sm text-ink-700">
          {recipe ? `“${recipe.name}” is on the table.` : 'Your recipe is on the table.'}
        </p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/app')}>
          Back to dashboard
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setStage('CAPTURE');
            setSessionId(null);
            setIngredients([]);
            setRecipe(null);
            setStep(null);
            setDraftUtterance('');
            dictation.reset();
          }}
          leftIcon={<Plus size={14} aria-hidden="true" />}
        >
          Cook something else
        </Button>
      </div>
    </Card>
  );

  const subtitle = useMemo(() => {
    switch (stage) {
      case 'CAPTURE':
        return 'Step 1 of 5 — tell me what you have.';
      case 'CONFIRM':
        return 'Step 2 of 5 — confirm what I heard.';
      case 'REQUIREMENTS':
        return 'Step 3 of 5 — a few quick questions.';
      case 'RECIPE_READY':
        return 'Step 4 of 5 — review your recipe.';
      case 'COOK':
        return 'Step 5 of 5 — hands-busy cooking.';
      case 'COMPLETED':
        return 'Nicely done.';
    }
  }, [stage]);

  return (
    <div className="pb-24 md:pb-6">
      {renderHeader(subtitle)}
      {renderSpeakerToggle()}
      <div className="mt-3">
        {stage === 'CAPTURE' && renderCapture()}
        {stage === 'CONFIRM' && renderConfirm()}
        {stage === 'REQUIREMENTS' && renderRequirements()}
        {stage === 'RECIPE_READY' && renderRecipeReady()}
        {stage === 'COOK' && renderCook()}
        {stage === 'COMPLETED' && renderCompleted()}
      </div>

      <p className="mt-6 text-xs text-ink-500">
        <Link to="/app" className="hover:underline">
          ← Back to dashboard
        </Link>
        {agentClient.isDemoMode() && (
          <span className="ml-2 rounded-full bg-basil-100 px-2 py-0.5 text-basil-700">
            Demo mode — heuristic agent
          </span>
        )}
        {sessionPhase && sessionPhase !== 'PREP_GUIDANCE' && sessionPhase !== 'COOKING_GUIDANCE' && (
          <span className="ml-2 rounded-full bg-butter-100 px-2 py-0.5 text-butter-700">
            Phase: {sessionPhase}
          </span>
        )}
      </p>

      {/* Substitution dialog (modal-free; inline dialog). */}
      {subOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Substitute ingredient"
          className="fixed inset-0 z-40 flex items-end justify-center bg-pepper-900/50 p-4 md:items-center"
          onClick={() => setSubOpen(false)}
        >
          <div
            className="card-base w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Substitute {subTarget}</h3>
            <p className="mt-1 text-sm text-ink-700">
              What do you have instead? I'll match quantities the fairest I can.
            </p>
            <input
              type="text"
              value={subReplacement}
              onChange={(e) => setSubReplacement(e.target.value)}
              placeholder="e.g. parsley, dried basil"
              className="input-base mt-3 w-full"
              autoFocus
            />
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSubOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubstitutionConfirm}
                disabled={!subReplacement.trim()}
              >
                Confirm substitution
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer between next/prev buttons and bottom (mobile). */}
      <div className="h-20 md:hidden" aria-hidden="true" />
    </div>
  );
};

export default CookingAgentPage;
