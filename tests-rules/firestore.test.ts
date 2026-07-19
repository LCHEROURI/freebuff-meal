/**
 * Firestore security-rules suite.
 *
 * Runs against the actual `firestore.rules` file via
 * `@firebase/rules-unit-testing`. v5 of that library evaluates rules
 * against a real Firestore client SDK connected to a running Firebase
 * Emulator Suite (the in-process rules evaluator was removed in v5) —
 * so this file is invoked through `npm run test:rules`, which boots the
 * Firestore emulator via `firebase emulators:exec`, then runs here.
 *
 * To skip the suite on plain `npm test` (where no emulator is
 * available), the file is excluded from the default vitest pattern.
 *
 * The assertions match the spec §9 contract line-for-line:
 *   - User A cannot read User B's profile / plan / recipes.
 *   - A client cannot update User B's recipes or shopping items.
 *   - A client cannot change a plan's `ownerId`, `promptVersion`, or
 *     `modelName` between create and update.
 *   - Unauthenticated users cannot list the `publicShares` collection.
 *   - A revoked share (`isActive: false` or `revokedAt != null` or
 *     `expiresAt <= request.time`) cannot be read.
 *   - A client cannot bump its own `generationUsage/{uid}/periods/*`
 *     counter (only callable Cloud Functions may write).
 *   - Invalid planLength / status values are rejected on create.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIRESTORE_RULES_PATH = resolve(__dirname, '../../firestore.rules');

/**
 * `firebase emulators:exec` exports `FIRESTORE_EMULATOR_HOST` into the
 * child process. Plain `npm test` has no emulator, so we swap `describe`
 * for `describe.skip` so the beforeAll/afterAll/beforeEach hooks inside
 * the suite also skip — that's the whole reason everything is nested
 * under the same `describeRules` block.
 */
const describeRules = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeRules('firestore rules — spec §9 contract', () => {
  /**
   * `env` is nullish until `beforeAll` populates it. We use the definite-
   * assignment assertion `!` so TypeScript treats the binding as
   * `RulesTestEnvironment` throughout the file — the `beforeAll` initialiser
   * runs before any hook or `it`, and vitest guarantees that ordering. The
   * `assertEnv(env)` runtime check remains in a few call sites as a guard
   * against a hypothetical failed initialiser.
   */
  let env!: RulesTestEnvironment;

  function assertEnv(
    env: RulesTestEnvironment | undefined,
  ): asserts env is RulesTestEnvironment {
    if (!env) {
      throw new Error(
        'RulesTestEnvironment must be initialized by beforeAll before any hook or test runs.',
      );
    }
  }

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'weeknight-rules-test',
      firestore: {
        rules: readFileSync(FIRESTORE_RULES_PATH, 'utf8'),
      },
    });
  });

  afterAll(async () => {
    assertEnv(env);
    await env.cleanup();
  });

  /** Reset between tests so seeds from one test don't leak into another. */
  beforeEach(async () => {
    assertEnv(env);
    await env.clearFirestore();
  });

  /**
   * Bypass rules once and write a seed document.
   *
   * Paths in this suite are always document paths (no collection-only
   * roots), so we use `firestore().doc(path)` directly.
   */
  const seed = async (
    path: string,
    data: Record<string, unknown>,
  ): Promise<void> => {
    assertEnv(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(path).set(data);
    });
  };
  describe('users collection — owner-only access', () => {
    beforeEach(async () => {
      await seed('users/alice', { displayName: 'Alice', householdSize: 2 });
      await seed('users/bob', { displayName: 'Bob', householdSize: 4 });
    });

    it('owner can read their own profile', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(ctx.firestore().doc('users/alice').get());
    });

    it('alice cannot read bob\'s profile', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(ctx.firestore().doc('users/bob').get());
    });

    it('unauthenticated user cannot read any profile', async () => {
      const ctx = env.unauthenticatedContext();
      await assertFails(ctx.firestore().doc('users/alice').get());
    });

    it('alice cannot write to fields outside the update allow-list (e.g. secretField)', async () => {
      // The `update` rule uses `.changedKeys().hasOnly([...])` — any field
      // not in the allow-list fails the rule, even if the request is
      // otherwise well-formed. `secretField` is hypothetical and not
      // part of the profile schema.
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('users/alice').update({
          // Cast to bypass TS schema validation; we are testing the rule's
          // denial of this field at the rules-engine layer.
          secretField: 'pwned',
        } as Record<string, unknown>),
      );
    });

    it('alice can update fields that ARE in the allow-list', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(
        ctx.firestore().doc('users/alice').update({ displayName: 'Alicia' }),
      );
    });
  });

  describe('mealPlans collection — owner-only read, immutable AI metadata', () => {
    beforeEach(async () => {
      await seed('mealPlans/plan-alice-1', {
        ownerId: 'alice',
        status: 'ready',
        planLength: 5,
        promptVersion: 'meal-plan-system-v1',
        modelName: 'gemini-3.5-flash',
      });
      await seed('mealPlans/plan-bob-1', {
        ownerId: 'bob',
        status: 'ready',
        planLength: 3,
        promptVersion: 'meal-plan-system-v1',
        modelName: 'gemini-3.5-flash',
      });
    });

    it('owner can read their own plan', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(ctx.firestore().doc('mealPlans/plan-alice-1').get());
    });

    it('alice cannot read bob\'s plan', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(ctx.firestore().doc('mealPlans/plan-bob-1').get());
    });

    it('alice cannot create a plan with ownerId set to bob', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/impostor').set({
          ownerId: 'bob',
          status: 'ready',
          planLength: 5,
          promptVersion: 'meal-plan-system-v1',
          modelName: 'gemini-3.5-flash',
        }),
      );
    });

    it('alice cannot change ownerId on update', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/plan-alice-1').update({ ownerId: 'bob' }),
      );
    });

    it('alice cannot change promptVersion on update (immutable AI metadata)', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/plan-alice-1').update({
          promptVersion: 'meal-plan-system-evil',
        }),
      );
    });

    it('alice cannot change modelName on update (immutable AI metadata)', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/plan-alice-1').update({
          modelName: 'gpt-4',
        }),
      );
    });

    it('rejects planLength above 7 on create', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/too-long').set({
          ownerId: 'alice',
          status: 'ready',
          planLength: 50,
          promptVersion: 'meal-plan-system-v1',
          modelName: 'gemini-3.5-flash',
        }),
      );
    });

    it('rejects planLength of 0 on create (must be positive int)', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/zero-length').set({
          ownerId: 'alice',
          status: 'ready',
          planLength: 0,
          promptVersion: 'meal-plan-system-v1',
          modelName: 'gemini-3.5-flash',
        }),
      );
    });

    it('rejects unknown status strings on create', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('mealPlans/bad-status').set({
          ownerId: 'alice',
          status: 'refrigerated',
          planLength: 5,
          promptVersion: 'meal-plan-system-v1',
          modelName: 'gemini-3.5-flash',
        }),
      );
    });

    it('accepts each canonical status on create', async () => {
      // Hoist alice's context outside the loop — each call to
      // authenticatedContext creates a new Firebase SDK instance and the
      // five iterations were leaking timers and obscuring real failures.
      const ctx = env.authenticatedContext('alice');
      for (const status of ['draft', 'generating', 'ready', 'failed', 'archived'] as const) {
        await assertSucceeds(
          ctx.firestore().doc(`mealPlans/accept-${status}`).set({
            ownerId: 'alice',
            status,
            planLength: 5,
            promptVersion: 'meal-plan-system-v1',
            modelName: 'gemini-3.5-flash',
          }),
        );
      }
    });
  });

  describe('recipes subcollection — owner-only via get() of parent plan', () => {
    beforeEach(async () => {
      await seed('mealPlans/plan-alice-1', {
        ownerId: 'alice',
        status: 'ready',
        planLength: 5,
        promptVersion: 'meal-plan-system-v1',
        modelName: 'gemini-3.5-flash',
      });
      await seed('mealPlans/plan-alice-1/recipes/r1', {
        ownerId: 'alice',
        order: 1,
        name: 'Pasta',
      });
    });

    it('plan owner can read a recipe', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(
        ctx.firestore().doc('mealPlans/plan-alice-1/recipes/r1').get(),
      );
    });

    it('non-owner cannot read a recipe', async () => {
      const ctx = env.authenticatedContext('bob');
      await assertFails(
        ctx.firestore().doc('mealPlans/plan-alice-1/recipes/r1').get(),
      );
    });

    it('non-owner cannot write to a recipe', async () => {
      const ctx = env.authenticatedContext('bob');
      await assertFails(
        ctx
          .firestore()
          .doc('mealPlans/plan-alice-1/recipes/r1')
          .update({ name: 'pwned' }),
      );
    });
  });

  describe('shoppingItems subcollection — owner-only', () => {
    beforeEach(async () => {
      await seed('mealPlans/plan-alice-1', {
        ownerId: 'alice',
        status: 'ready',
        planLength: 5,
        promptVersion: 'meal-plan-system-v1',
        modelName: 'gemini-3.5-flash',
      });
      await seed('mealPlans/plan-alice-1/shoppingItems/i1', {
        name: 'Milk',
        isChecked: false,
      });
    });

    it('owner can read a shopping item', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(
        ctx.firestore().doc('mealPlans/plan-alice-1/shoppingItems/i1').get(),
      );
    });

    it('non-owner cannot tick a shopping item', async () => {
      const ctx = env.authenticatedContext('bob');
      await assertFails(
        ctx
          .firestore()
          .doc('mealPlans/plan-alice-1/shoppingItems/i1')
          .update({ isChecked: true }),
      );
    });
  });

  describe('publicShares — single-get only, no list, denials on revoked/expired', () => {
    beforeEach(async () => {
      // Hard-coded distant timestamps rather than `Date.now() ± offset` —
      // the rule's `request.time` comparison must not depend on wall-clock
      // skew, CI clock drift, or any future mock-time Firestore flag.
      const future = '2100-01-01T00:00:00.000Z';
      const past = '2000-01-01T00:00:00.000Z';
      await seed('publicShares/active', {
        ownerId: 'alice',
        planId: 'plan-alice-1',
        isActive: true,
        expiresAt: future,
        revokedAt: null,
        publicPlanSnapshot: { planName: 'Active plan' },
      });
      await seed('publicShares/revoked', {
        ownerId: 'alice',
        planId: 'plan-alice-1',
        isActive: false,
        // Both timestamps are hardcoded to distant fixed values to match
        // the sibling publicShares seeds even though the rule here
        // short-circuits via `isActive == true` and never inspects the
        // dates. Keeps the suite robust if a future rule adds a
        // `revokedAt > request.time` clause (and the falsy `isActive` keeps
        // the test independent of wall-clock skew on either value).
        expiresAt: future,
        revokedAt: past,
        publicPlanSnapshot: { planName: 'Revoked plan' },
      });
      await seed('publicShares/expired', {
        ownerId: 'alice',
        planId: 'plan-alice-1',
        isActive: true,
        expiresAt: past,
        revokedAt: null,
        publicPlanSnapshot: { planName: 'Expired plan' },
      });
    });

    it('any user (including unauthed) can read an active share by id', async () => {
      const ctx = env.unauthenticatedContext();
      await assertSucceeds(ctx.firestore().doc('publicShares/active').get());
    });

    it('unauthenticated user cannot list the publicShares collection', async () => {
      const ctx = env.unauthenticatedContext();
      await assertFails(ctx.firestore().collection('publicShares').get());
    });

    it('authenticated user cannot list the publicShares collection', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(ctx.firestore().collection('publicShares').get());
    });

    it('revoked share (isActive=false) cannot be read', async () => {
      const ctx = env.unauthenticatedContext();
      await assertFails(ctx.firestore().doc('publicShares/revoked').get());
    });

    it('expired share (expiresAt <= now) cannot be read', async () => {
      const ctx = env.unauthenticatedContext();
      await assertFails(ctx.firestore().doc('publicShares/expired').get());
    });

    it('only the owner may create a share', async () => {
      const ctx = env.authenticatedContext('bob');
      await assertFails(
        ctx.firestore().doc('publicShares/bobs-share').set({
          ownerId: 'alice', // claiming to be the owner
          planId: 'plan-alice-1',
          isActive: true,
          expiresAt: '2100-01-01T00:00:00.000Z',
          revokedAt: null,
          publicPlanSnapshot: { planName: 'x' },
        }),
      );
    });
  });

  describe('generationUsage counters — server-managed, client cannot tamper', () => {
    beforeEach(async () => {
      await seed('generationUsage/alice/periods/2026-01-01-plan', {
        count: 0,
        lastAt: 0,
      });
    });

    it('owner can read their own usage counter (for display)', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertSucceeds(
        ctx
          .firestore()
          .doc('generationUsage/alice/periods/2026-01-01-plan')
          .get(),
      );
    });

    it('alice cannot bump her own usage counter (only callable functions may)', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx
          .firestore()
          .doc('generationUsage/alice/periods/2026-01-01-plan')
          .update({ count: 999 }),
      );
      await assertFails(
        ctx
          .firestore()
          .doc('generationUsage/alice/periods/2026-01-01-plan')
          .set({ count: 999 }),
      );
    });

    it('bob cannot read alice\'s usage counter', async () => {
      const ctx = env.authenticatedContext('bob');
      await assertFails(
        ctx
          .firestore()
          .doc('generationUsage/alice/periods/2026-01-01-plan')
          .get(),
      );
    });
  });

  describe('catch-all deny — unknown paths are inaccessible', () => {
    it('unauthenticated user cannot read any unknown path', async () => {
      const ctx = env.unauthenticatedContext();
      await assertFails(ctx.firestore().doc('totallyUnknown/doc').get());
    });

    it('authenticated user cannot write to an unknown path', async () => {
      const ctx = env.authenticatedContext('alice');
      await assertFails(
        ctx.firestore().doc('totallyUnknown/doc').set({ anything: 1 }),
      );
    });
  });
});
