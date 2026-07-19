/**
 * Tiny localStorage adapter used when Firebase isn't configured (demo mode).
 * Mirrors the public shape of user profiles, meal plans, recipes, and
 * shopping items so the rest of the app doesn't have to branch.
 */
import type { UserProfile } from '@/schemas/auth';
import type { EmbeddedRecipe } from '@/schemas/mealPlan';
import type { ShoppingListItem } from '@/schemas/ingredient';
import { UserProfileSchema } from '@/schemas/auth';

const PROFILE_KEY = 'demo:profile';
const PLANS_KEY = 'demo:plans';
const SHOP_PREFIX = 'demo:shopping:';
const PANTRY_PREFIX = 'demo:pantry:';

export type DemoMealPlan = {
  id: string;
  ownerId: string;
  name: string;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'archived';
  planLength: number;
  servings: number;
  recipes: EmbeddedRecipe[];
  lockedRecipeIds: string[];
  promptVersion: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
};

const safeRead = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeWrite = (key: string, value: unknown): void => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — graceful degrade */
  }
};

export const profileStore = {
  read(uid: string): UserProfile | null {
    const all = safeRead<Record<string, UserProfile>>(PROFILE_KEY, {});
    return all[uid] ?? null;
  },
  write(uid: string, profile: UserProfile): void {
    const all = safeRead<Record<string, UserProfile>>(PROFILE_KEY, {});
    all[uid] = profile;
    safeWrite(PROFILE_KEY, all);
  },
};

export const plansStore = {
  list(uid: string): DemoMealPlan[] {
    const all = safeRead<Record<string, DemoMealPlan[]>>(PLANS_KEY, {});
    return all[uid] ?? [];
  },
  write(uid: string, plans: DemoMealPlan[]): void {
    const all = safeRead<Record<string, DemoMealPlan[]>>(PLANS_KEY, {});
    all[uid] = plans;
    safeWrite(PLANS_KEY, all);
  },
};

export const shoppingStore = {
  read(planId: string): ShoppingListItem[] {
    return safeRead<ShoppingListItem[]>(`${SHOP_PREFIX}${planId}`, []);
  },
  write(planId: string, items: ShoppingListItem[]): void {
    safeWrite(`${SHOP_PREFIX}${planId}`, items);
  },
};

const PANTRY_DEFAULTS = ['olive oil', 'salt', 'black pepper', 'rice', 'all-purpose flour'];

export const pantryStore = {
  read(uid: string): string[] {
    try {
      const raw = window.localStorage.getItem(`${PANTRY_PREFIX}${uid}`);
      if (raw) return JSON.parse(raw) as string[];
    } catch {
      /* fall through */
    }
    return PANTRY_DEFAULTS;
  },
  write(uid: string, value: string[]): void {
    try {
      window.localStorage.setItem(`${PANTRY_PREFIX}${uid}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};

export const ensureProfile = (uid: string): UserProfile => {
  const existing = profileStore.read(uid);
  if (existing) return existing;
  const defaultProfile = UserProfileSchema.parse({
    displayName: 'Demo Cook',
    householdSize: 2,
    defaultServings: 2,
    defaultPlanLength: 5,
    onboardingCompleted: false,
  });
  profileStore.write(uid, defaultProfile);
  return defaultProfile;
};
