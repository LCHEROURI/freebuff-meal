# freebuff-meal — AI-Powered Weeknight Meal Planner

> Built on the Google ecosystem: Firebase Auth, Cloud Firestore, Cloud Functions
> (second generation), Firebase Hosting, Vertex AI Gemini through Genkit 1.x.

This is an MVP for a web application that plans 3-, 5-, or 7-night weeknight
dinners based on household size, schedule, dietary needs, and the ingredients
already in your kitchen.

Dishes are **recognizable, named meals** (e.g. chicken piccata, oyakodon,
Greek lemon chicken) — never invented ingredients-and-a-name inventions.
Where the request requires modifying a canonical dish, the result is honestly
labeled `adapted_to_preferences`.

---

## Stack

- **Frontend**: React 18 + Vite + TypeScript (strict) + Tailwind CSS + React Router v6 + TanStack Query + Zustand-style context state + React Hook Form + Zod.
- **Auth + Data**: Firebase Auth (email/password + Google) and Cloud Firestore.
- **AI**: Vertex AI Gemini (`gemini-2.0-flash`, via `@genkit-ai/vertexai`'s `gemini20Flash` `ModelReference` constant), called from second-gen Cloud Functions via `onCallGenkit`.
- **Server hardening**: Firebase App Check (reCAPTCHA v3), auth checks, per-user rate limits, generation metadata logging.
- **Hosting**: Firebase Hosting with rewrites for SPA navigation.

---

## Routes

### Public
- `/` — landing page
- `/login`, `/signup`, `/forgot-password`
- `/share/:shareId` — read-only public snapshot of a shared plan
- `/privacy`, `/terms`

### Protected
- `/app` — dashboard
- `/app/onboarding` — first-run multi-step preferences
- `/app/new-plan` — structured meal-plan builder
- `/app/plans` — saved plans list
- `/app/plans/:planId` — plan view (cards + regenerate / lock / share / delete)
- `/app/plans/:planId/recipes/:recipeId` — printable recipe detail
- `/app/plans/:planId/shopping-list` — consolidated shopping list
- `/app/settings` — preferences / account / delete

---

## Quick start

```bash
# 1. Install dependencies
npm install
npm install --prefix functions

# 2. Copy envfile and fill in Firebase web config (or leave blank for demo)
cp .env.example .env

# 3. Start the frontend
npm run dev

# 4. Start the Firebase emulator suite (optional — required for rules tests)
npm run emulators

# 5. Build a production bundle
npm run build
```

### Demo mode

If `VITE_DEMO_MODE=true` (or no Firebase env vars are set), the client runs a
local-only loop backed by `localStorage` and a curated dish library — every
flow is walkable without a Firebase project.

---

## Architecture

### Frontend
- `src/schemas/` — Zod schemas shared between client and server.
- `src/features/auth/` — auth context, route guard, login/signup/forgot-password/onboarding.
- `src/features/meal-plans/` — dashboard, plan builder, plan view, AI service, dish library fallback.
- `src/features/shopping-list/` — deterministic consolidation, page.
- `src/features/recipes/` — printable recipe detail view.
- `src/features/sharing/` — public read-only share page.
- `src/features/settings/` — preferences + account deletion.
- `src/components/common/` — Button, Input, Card, Chip, Dialog, Toast, LoadingState, badges.
- `src/lib/firebase/` — Firebase client init with env-aware emulator wiring.
- `src/lib/query/` — TanStack Query client.
- `src/utils/normalize.ts` — name + unit normalization utilities.
- `src/utils/demoAdapter.ts` — localStorage-backed profile/plan/shopping persistence.

### Backend (`functions/`)
- `src/ai/flows/generateMealPlanFlow.ts` — Genkit flow, `onCallGenkit`, App Check enforced.
- `src/ai/flows/regenerateRecipeFlow.ts` — single-recipe regeneration flow.
- `src/ai/prompts/system.ts` — versioned authoritative system prompt (`meal-plan-system-v1`).
- `src/ai/schemas/index.ts` — re-exports the client's Zod schemas for input/output checks.
- `src/rate-limits/usage.ts` — per-user plan/recipe counters (Firestore-admin).
- `src/config/index.ts` — model name, prompt version, rate limits in one place.

### Firestore model
- `users/{uid}` — profile (auth owner only).
- `mealPlans/{planId}` + subcollections `recipes/{recipeId}` and `shoppingItems/{itemId}` (owner-only lists/writes).
- `publicShares/{shareId}` — read-only public snapshot, owner-only writes, no list, expired/revoked denied.
- `generationUsage/{uid}/periods/{periodId}` — server-only writes; client can read its own.

See `firestore.rules` for the full policy.

---

## Local Development vs Production

### Local
- Defaults to Firebase Local Emulator Suite if `VITE_USE_EMULATORS=true`.
- A visible blue chip in the app header shows when emulators are connected.
- An app-check debug token used as `VITE_APP_CHECK_SITE_KEY` is permitted in dev only and is gitignored.

### Production
- Set `VITE_DEMO_MODE=false` and provide real Firebase web config.
- Set `enforceAppCheck: true` on protected callable functions.
- Configure App Check enforcement in the Firebase console before launch.
- Configure budget alerts for Vertex AI usage.

---

## Rate limits & safety

Defaults (in `functions/src/config/index.ts`):
- 10 full-plan generations per day per user
- 30 single-recipe regenerations per day per user
- 15-second cooldown between full-plan requests
- max 7 recipes per plan
- max 2,000 characters of free-text notes
- max 40 pantry items
- max 40 excluded ingredients
- max 256 KB response size

App-side messages are friendly; server-side we throw `RATE_LIMIT_*` codes so
clients can localize them.

---

## Required Google Cloud setup before production

These actions cannot be performed without account credentials:

1. **Select a Firebase project** for production (separate from the dev project).
2. **Enable billing** on the production project (required for Vertex AI).
3. **Enable the Vertex AI API** (and the Cloud Functions, Firestore, App Check APIs).
4. **Configure Firebase Authentication providers** (Email/Password + Google).
5. **Register App Check** for your domain (reCAPTCHA v3 or Play Integrity).
6. **Set up Secret Manager** entries for `GOOGLE_API_KEY` referenced by the
   Cloud Function secrets config.
7. **Create production budget alerts** at 50%, 90%, and 100% of expected monthly spend.
8. **Connect your custom domain** if you have one.

---

## Tests

- Unit / Vitest: `npm test` — covers schemas, shopping-list consolidation, the
  deterministic fallback, and core UI components.
- Integration: Firebase Local Emulator Suite (`npm run emulators` + `npm run test:rules`).
- E2E (optional, requires Playwright): `npm run test:e2e`.

---

## Why no images?

Per spec: this MVP intentionally does **not** generate or render recipe photos
unless a Google-native image workflow is added explicitly. Recipe cards show
a food-themed placeholder area; the experience stays honest about provenance.

---

## Hard restrictions

- No Supabase, no `@supabase/*`, no Vercel/Netlify deployment, no OpenAI/Anthropic.
- No client-side direct AI calls — all generation happens behind `onCallGenkit`.
- No client-side mutation of `generationUsage` (rules deny).
- No public collection listing.

If you find yourself reaching for any of these, stop — the architecture has
explicit places for each job.

---

## Recent backend migration (genkit 1.x)

The backend (`functions/`) was migrated off the deprecated `googleCloudVertexAI`
factory to `@genkit-ai/vertexai` with a typed `ModelReference` (`gemini20Flash`).
Highlights:

- `firebase-functions/v2/identity` dropped its `onUserDeleted` post-event trigger
  in v2; the auth user-deletion handler was moved to `firebase-functions/v1`
  `auth.user().onDelete(...)` (still supported in v6 specifically for post-events).
- Firestore admin batches use `QueryDocumentSnapshot.ref` (the v1 property name
  in `@google-cloud/firestore@v7`); `reference` was used previously and is now
  gone.
- Zod schemas are inlined into `functions/src/ai/schemas/` rather than imported
  across the package boundary (NodeNext + `rootDir: "src"` blocks cross-package
  `.ts` imports). A portable sync/check pair keeps them in step:
  - `npm run sync-schemas` — `functions/scripts/sync-schemas.mjs` rewrites the
    inline copies from `src/schemas/` and adds NodeNext `.js` extensions.
  - `npm run check-schemas` — `functions/scripts/check-schemas.mjs` is wired
    into `prebuild` and fails the build if content drifts.

The frontend was not touched in this migration.

---

## License

[MIT](./LICENSE) — see file for full text.
