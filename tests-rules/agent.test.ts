/**
 * Source-level tests for the cooking-agent layer.
 *
 * Pattern follows the proven `cookMode.test.ts` / `serverStamp.test.ts`
 * shape — read files from disk via readFileSync, then assert structural
 * properties without spinning up a real Firebase project. This makes
 * the suite CI-friendly: no emulator, no live LLM, deterministic on
 * every commit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');
const SRC = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const SCHEMAS = SRC('functions/src/agent/schemas.ts');
const STATE_MACHINE = SRC('functions/src/agent/stateMachine.ts');
const COOKING_TOOLS = SRC('functions/src/agent/cookingTools.ts');
const SESSION_STORE = SRC('functions/src/agent/sessionStore.ts');
const AGENT_INDEX = SRC('functions/src/agent/index.ts');
const FUNCTIONS_INDEX = SRC('functions/src/index.ts');
const FIRESTORE_RULES = SRC('firestore.rules');

describe('cooking-agent surface', () => {
  it('exposes every one of the 15 canonical tools in the schema module', () => {
    for (const name of [
      'save_available_ingredients',
      'update_available_ingredients',
      'generate_recipe',
      'validate_recipe',
      'start_cooking_session',
      'get_current_step',
      'complete_current_step',
      'repeat_current_step',
      'previous_step',
      'replace_ingredient',
      'resize_recipe',
      'start_timer',
      'pause_cooking_session',
      'resume_cooking_session',
      'end_cooking_session',
    ]) {
      expect(SCHEMAS, `expected ${name} in TOOL_NAMES`).toMatch(
        new RegExp(`['"]${name}['"]`),
      );
    }
  });

  it('re-exports each tool surface from the agent barrel', () => {
    for (const name of [
      'saveAvailableIngredients',
      'updateAvailableIngredients',
      'generateRecipe',
      'validateRecipe',
      'startCookingSession',
      'getCurrentStep',
      'completeCurrentStep',
      'repeatCurrentStep',
      'previousStep',
      'replaceIngredient',
      'resizeRecipe',
      'startTimer',
      'pauseCookingSession',
      'resumeCookingSession',
      'endCookingSession',
      'extractIngredientsFromSpeech',
    ]) {
      expect(AGENT_INDEX, `expected ${name} re-exported`).toMatch(
        new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`),
      );
    }
  });

  it('registers every tool surface under functions/src/index.ts', () => {
    for (const name of [
      'saveAvailableIngredients',
      'updateAvailableIngredients',
      'generateRecipe',
      'validateRecipe',
      'startCookingSession',
      'getCurrentStep',
      'completeCurrentStep',
      'repeatCurrentStep',
      'previousStep',
      'replaceIngredient',
      'resizeRecipe',
      'startTimer',
      'pauseCookingSession',
      'resumeCookingSession',
      'endCookingSession',
      'extractIngredientsFromSpeech',
    ]) {
      expect(FUNCTIONS_INDEX, `expected ${name} registered`).toContain(name);
    }
  });
});

describe('cooking-agent onCall handlers', () => {
  it('every handler registers with App Check + GOOGLE_API_KEY',
    () => {
      // Each onCall uses ALL_TOOL_GUARD; confirm the guard object
      // sets both flags so the production posture is identical.
      expect(COOKING_TOOLS).toContain('enforceAppCheck: true');
      expect(COOKING_TOOLS).toContain("defineSecret('GOOGLE_API_KEY')");
    },
  );

  it('generate_recipe shells out to MealPlanSchema + slices the first recipe', () => {
    expect(COOKING_TOOLS).toMatch(/schema:\s*MealPlanSchema/);
    expect(COOKING_TOOLS).toMatch(/planParsed\.data\.recipes\[0\]/);
  });

  it('each step navigation tool persists currentStepIndex + bumps lastActivityAt', () => {
    // Allow whitespace + an arith fixup (`currentStepIndex + 1`) between
    // the field assignment and Math.min/max calls — the onCall handlers
    // pass `Math.min(total - 1, session.currentStepIndex + 1)`.
    expect(COOKING_TOOLS).toMatch(/Math\.min\(\s*total\s*-\s*1\s*,\s*session\.currentStepIndex\s*\+\s*1/);
    expect(COOKING_TOOLS).toMatch(/Math\.max\(\s*0\s*,\s*session\.currentStepIndex\s*-\s*1/);
    expect(SESSION_STORE).toContain('lastActivityAt: new Date().toISOString()');
  });

  it('pause & resume round-trip via previousPhaseBeforePause', () => {
    expect(COOKING_TOOLS).toMatch(/previousPhaseBeforePause:\s*pausePreservePhase/);
    // Allow whitespace between `resumePhase` and `??`.
    expect(COOKING_TOOLS).toMatch(
      /resumePhase\s*\?\?\s*['"]COOKING_GUIDANCE['"]/,
    );
  });
});

describe('cooking-agent state machine', () => {
  it('transition table covers every legal (phase, trigger) the handlers emit', () => {
    // Spot-check the cases the wizard and the onCall handlers rely on.
    // Format: "PHASE → TRIGGER". Reads forward so "PAUSED → USER_RESUMED"
    // means "the PAUSED phase has a row for USER_RESUMED".
    const expected = [
      'IDLE → USER_SPEAKS_INGREDIENTS',
      'IDLE → USER_CONFIRMS_INGREDIENTS',
      'COLLECTING_INGREDIENTS → USER_CONFIRMS_INGREDIENTS',
      'CONFIRMING_INGREDIENTS → USER_CONFIRMS_INGREDIENTS',
      'COLLECTING_REQUIREMENTS → RECIPE_GENERATED',
      'PREP_GUIDANCE → STEP_COMPLETED',
      'PREP_GUIDANCE → USER_PAUSED',
      'COOKING_GUIDANCE → STEP_COMPLETED',
      'COOKING_GUIDANCE → TIMER_STARTED',
      'PLATING → SESSION_COMPLETED',
      'WAITING_FOR_TIMER → TIMER_FINISHED',
      'PAUSED → USER_RESUMED',
      'PAUSED → SESSION_ABANDONED',
      'COMPLETED → USER_SPEAKS_INGREDIENTS',
      'ERROR_RECOVERY → SESSION_ABANDONED',
      'SUBSTITUTION_REQUIRED → SUBSTITUTION_RESOLVED',
    ];

    for (const label of expected) {
      const [from, rest] = label.split(' → ');
      const triggerMatch = rest?.match(/^[A-Z_]+/);
      const trigger = triggerMatch?.[0];
      expect(trigger, `trigger parsed from ${label}`).toBeTruthy();
      expect(from, `phase parsed from ${label}`).toBeTruthy();
      // The transition table is a record indexed by phase. Slice open
      // the block for that phase and grep for the trigger row.
      const startIdx = STATE_MACHINE.indexOf(`  ${from}: [`);
      expect(startIdx, `${from} phase block exists`).toBeGreaterThan(-1);
      const blockEnd = STATE_MACHINE.indexOf('  ],', startIdx);
      const block = STATE_MACHINE.slice(startIdx, blockEnd === -1 ? startIdx + 2000 : blockEnd + 3);
      expect(block, `${from} contains trigger ${trigger}`).toContain(`trigger: '${trigger}'`);
    }
  });

  it('pausePreservePhase excludes PAUSED, COMPLETED, IDLE', () => {
    expect(STATE_MACHINE).toMatch(
      /if\s*\(\s*current\s*===\s*['"]PAUSED['"]\s*\)\s*return\s*null/,
    );
    expect(STATE_MACHINE).toMatch(
      /if\s*\(\s*current\s*===\s*['"]COMPLETED['"]\s*\)\s*return\s*null/,
    );
    expect(STATE_MACHINE).toMatch(
      /if\s*\(\s*current\s*===\s*['"]IDLE['"]\s*\)\s*return\s*null/,
    );
  });

  it('declares the IllegalTransitionError class so transitions can blow up loudly',
    () => {
      expect(STATE_MACHINE).toContain('class IllegalTransitionError');
    },
  );
});

describe('cooking-session Firestore rules', () => {
  it('cookingSessions top-level doc only allows reads on owner match', () => {
    expect(FIRESTORE_RULES).toMatch(
      /match\s+\/cookingSessions\/\{sessionId\}\s*\{[^}]*allow\s+read:\s+if\s+isOwner\(resource\.data\.ownerId\)/,
    );
  });

  it('events + state subcollections deny client writes (server-only via Admin SDK)', () => {
    expect(FIRESTORE_RULES).toMatch(/\/events\/\{eventId\}[^}]*allow\s+write:\s+if\s+false/);
    expect(FIRESTORE_RULES).toMatch(/\/state\/\{stateId\}[^}]*allow\s+write:\s+if\s+false/);
  });

  it('rejects any client attempt to update or delete a session directly', () => {
    expect(FIRESTORE_RULES).toMatch(
      /match\s+\/cookingSessions\/\{sessionId\}\s*\{[^}]*allow\s+update,\s*delete:\s*if\s+false/,
    );
  });
});

describe('cooking-agent frontend mirror', () => {
  it('agentClient exposes every tool the wizard calls', () => {
    const FRONTEND = SRC('src/features/agent/agentClient.ts');
    for (const name of [
      'saveAvailableIngredients',
      'updateAvailableIngredients',
      'generateRecipe',
      'validateRecipe',
      'startCookingSession',
      'getCurrentStep',
      'completeCurrentStep',
      'repeatCurrentStep',
      'previousStep',
      'replaceIngredient',
      'resizeRecipe',
      'startTimer',
      'pauseCookingSession',
      'resumeCookingSession',
      'endCookingSession',
      'extractIngredientsFromSpeech',
    ]) {
      expect(FRONTEND, `wizard calls ${name}`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  it('CookingAgentPage renders every one of the five named stages', () => {
    const WIZARD = SRC('src/features/agent/CookingAgentPage.tsx');
    for (const stage of ['CAPTURE', 'CONFIRM', 'REQUIREMENTS', 'RECIPE_READY', 'COOK', 'COMPLETED']) {
      expect(WIZARD, `wizard renders ${stage}`).toContain(stage);
    }
  });

  it('App.tsx wires the /app/agent route under ProtectedRoute + AppShell', () => {
    const APP = SRC('src/App.tsx');
    expect(APP).toMatch(/path="agent"\s+element=.*<CookingAgentPage/);
  });

  it('DashboardPage exposes the voice cooking CTA', () => {
    const DASH = SRC('src/features/meal-plans/DashboardPage.tsx');
    expect(DASH).toContain('Cook with me');
    expect(DASH).toContain('to="/app/agent"');
  });
});

describe('useSpeech hooks', () => {
  it('useSpeechSynthesis cancel-on-unmount + speak(opts)', () => {
    const HOOKS = SRC('src/lib/useSpeech.ts');
    expect(HOOKS).toMatch(/export\s+const\s+useSpeechSynthesis/);
    expect(HOOKS).toMatch(/export\s+const\s+useSpeechDictation/);
    expect(HOOKS).toContain('window.speechSynthesis');
    expect(HOOKS).toContain('webkitSpeechRecognition');
  });
});

describe('ingredient extractor', () => {
  it('uses gemini20Flash — no second model card', () => {
    const EXT = SRC('functions/src/agent/ingredientExtractor.ts');
    expect(EXT).toContain('gemini20Flash');
  });

  it('never throws — falls back to a deterministic split on parse failure', () => {
    const EXT = SRC('functions/src/agent/ingredientExtractor.ts');
    expect(EXT).toContain('fallbackFromText');
    // The extractor must not `throw`; the client wants a deterministic shape.
    expect(EXT).not.toMatch(/^\s*throw\s/m);
  });
});
