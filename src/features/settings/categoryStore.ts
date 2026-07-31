/**
 * Tiny Zustand store wiring custom categories across screens.
 *
 * The user profile IS the system of record — custom categories round-trip
 * through `users/{uid}/customFavoriteCuisines` + `users/{uid}/customEquipment`
 * in Firestore, and through `profileStore.write(...)` in demo mode. This
 * store is just a per-uid cache that lets *other* screens (future cuisine
 * filter chips, dashboard quick toggles, etc.) re-render the moment a
 * SettingsScreen edit lands — without waiting for a Firestore round-trip.
 *
 * TODO (v2): if/when a second screen reads customs, thread real selectors
 * through this. Until then it sits behind `useCategoryStore()` and tolerates
 * the unused-export lint rule.
 */
import { create } from 'zustand';
import type { UserProfile } from '@/schemas/auth';
import {
  type CategoryKind,
  canAddCustom,
  findDuplicate,
  mergeWithDefaults,
  normalizeCategoryName,
  readCategoryFields,
} from './categories';

const KEY = 'freebuff:custom-categories:v1';

type CustomBucket = Readonly<{
  customFavoriteCuisines: string[];
  customEquipment: string[];
}>;

type Persisted = Readonly<{
  byUid: Record<string, CustomBucket>;
}>;

type State = {
  byUid: Record<string, CustomBucket>;
  hydrate: (uid: string, profile: Pick<UserProfile, 'customFavoriteCuisines' | 'customEquipment'>) => void;
  addCustom: (uid: string, kind: CategoryKind, raw: string) =>
    | { ok: true; value: string }
    | { ok: false; reason: 'empty' | 'duplicate' | 'cap' };
  removeCustom: (uid: string, kind: CategoryKind, value: string) => void;
  availableForUid: (uid: string, kind: CategoryKind) => string[];
};

const loadPersisted = (): Persisted => {
  if (typeof window === 'undefined') return { byUid: {} };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { byUid: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'byUid' in parsed) {
      const { byUid } = parsed as { byUid: Record<string, Partial<CustomBucket>> };
      const sanitised: Record<string, CustomBucket> = {};
      for (const [uid, bucket] of Object.entries(byUid ?? {})) {
        if (!bucket || typeof bucket !== 'object') continue;
        sanitised[uid] = {
          customFavoriteCuisines: Array.isArray(bucket.customFavoriteCuisines)
            ? bucket.customFavoriteCuisines.filter((s): s is string => typeof s === 'string')
            : [],
          customEquipment: Array.isArray(bucket.customEquipment)
            ? bucket.customEquipment.filter((s): s is string => typeof s === 'string')
            : [],
        };
      }
      return { byUid: sanitised };
    }
    return { byUid: {} };
  } catch {
    return { byUid: {} };
  }
};

const savePersisted = (state: Persisted): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota — graceful degrade */
  }
};

const initialState = loadPersisted();

export const useCategoryStore = create<State>((set, get) => ({
  byUid: initialState.byUid,

  hydrate: (uid, profile) => {
    const prev = get().byUid[uid];
    if (prev) return; // already hydrated — caller owns subsequent writes
    const next: CustomBucket = {
      customFavoriteCuisines: profile.customFavoriteCuisines ?? [],
      customEquipment: profile.customEquipment ?? [],
    };
    const byUid = { ...get().byUid, [uid]: next };
    set({ byUid });
    savePersisted({ byUid });
  },

  addCustom: (uid, kind, raw) => {
    const normalised = normalizeCategoryName(raw);
    if (!normalised) return { ok: false, reason: 'empty' };

    const bucket = get().byUid[uid] ?? {
      customFavoriteCuisines: [],
      customEquipment: [],
    };
    const customs = readCategoryFields(
      {
        customFavoriteCuisines: bucket.customFavoriteCuisines,
        customEquipment: bucket.customEquipment,
      },
      kind,
    );

    if (!canAddCustom(customs)) return { ok: false, reason: 'cap' };

    if (findDuplicate(normalised, customs)) {
      return { ok: false, reason: 'duplicate' };
    }

    const nextCustoms = [...customs, normalised];
    const nextBucket: CustomBucket =
      kind === 'favoriteCuisines'
        ? { ...bucket, customFavoriteCuisines: nextCustoms }
        : { ...bucket, customEquipment: nextCustoms };

    const byUid = { ...get().byUid, [uid]: nextBucket };
    set({ byUid });
    savePersisted({ byUid });
    return { ok: true, value: normalised };
  },

  removeCustom: (uid, kind, value) => {
    const bucket = get().byUid[uid];
    if (!bucket) return;
    const customs = readCategoryFields(
      {
        customFavoriteCuisines: bucket.customFavoriteCuisines,
        customEquipment: bucket.customEquipment,
      },
      kind,
    );
    const nextCustoms = customs.filter((c) => c !== value);
    if (nextCustoms.length === customs.length) return;
    const nextBucket: CustomBucket =
      kind === 'favoriteCuisines'
        ? { ...bucket, customFavoriteCuisines: nextCustoms }
        : { ...bucket, customEquipment: nextCustoms };
    const byUid = { ...get().byUid, [uid]: nextBucket };
    set({ byUid });
    savePersisted({ byUid });
  },

  availableForUid: (uid, kind) => {
    const bucket = get().byUid[uid];
    if (!bucket) return [];
    const customs = readCategoryFields(
      {
        customFavoriteCuisines: bucket.customFavoriteCuisines,
        customEquipment: bucket.customEquipment,
      },
      kind,
    );
    // Caller injects defaults at render time; here we just return customs.
    return customs;
  },
}));

/**
 * Pure helper (exported for tests) — recomputes the canonical merged list,
 * given defaults + raw custom bucket, returning a pruning hint when a
 * user-saved custom has been shadowed by a re-shipped default.
 */
export const reconcileCustoms = (
  defaults: readonly string[],
  customs: readonly string[],
): { available: string[]; droppedFromCustoms: string[] } =>
  mergeWithDefaults(defaults, customs);
