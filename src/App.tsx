import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/features/auth/authContext';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AppShell } from '@/layouts/AppShell';
import { ToastProvider } from '@/components/common/Toast';
import { FullPageSpinner } from '@/components/common/LoadingState';
import { LazyPageBoundary } from '@/components/common/LazyPageBoundary';

import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { PrivacyPage } from '@/pages/PrivacyPage';
import { TermsPage } from '@/pages/TermsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Routes that aren't above-the-fold and aren't tiny enough to bundle into the
// initial chunk get lazy-loaded into their own bundles. The Suspense fallback
// shows a full-page spinner so route transitions feel intentional, not broken.
const OnboardingPage = lazy(() =>
  import('@/features/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const VerifyEmailPage = lazy(() =>
  import('@/features/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const DashboardPage = lazy(() =>
  import('@/features/meal-plans/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const NewPlanPage = lazy(() =>
  import('@/features/meal-plans/NewPlanPage').then((m) => ({ default: m.NewPlanPage })),
);
const MealPlanPage = lazy(() =>
  import('@/features/meal-plans/MealPlanPage').then((m) => ({ default: m.MealPlanPage })),
);
const PlansListPage = lazy(() =>
  import('@/features/meal-plans/PlansListPage').then((m) => ({ default: m.PlansListPage })),
);
const RecipeDetailPage = lazy(() =>
  import('@/features/recipes/RecipeDetailPage').then((m) => ({ default: m.RecipeDetailPage })),
);
const CookModePage = lazy(() =>
  import('@/features/recipes/CookModePage').then((m) => ({ default: m.CookModePage })),
);
const ShoppingListPage = lazy(() =>
  import('@/features/shopping-list/ShoppingListPage').then((m) => ({ default: m.ShoppingListPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const PublicSharePage = lazy(() =>
  import('@/features/sharing/PublicSharePage').then((m) => ({ default: m.PublicSharePage })),
);

const RouteFallback = () => <FullPageSpinner label="Loading…" />;

/**
 * Eager routes are small enough to ship in the initial bundle, but they
 * still need focus restoration on every route entry — the boundary is the
 * source of truth for that behaviour, regardless of whether the route's
 * content is lazy-loaded or not.
 */
const Eager = ({ children }: { children: ReactNode }) => (
  <LazyPageBoundary>{children}</LazyPageBoundary>
);

/**
 * Lazy routes get a Suspense boundary for the chunk load AND the focus-
 * restoring boundary, so the spinner shows during load and focus snaps to
 * the destination's first heading once the chunk resolves.
 */
const Lazy = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<RouteFallback />}>
    <LazyPageBoundary>{children}</LazyPageBoundary>
  </Suspense>
);

export const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ToastProvider>          <Routes>
            <Route path="/" element={<Eager><LandingPage /></Eager>} />
            <Route path="/login" element={<Eager><LoginPage /></Eager>} />
            <Route path="/signup" element={<Eager><SignupPage /></Eager>} />
            <Route path="/forgot-password" element={<Eager><ForgotPasswordPage /></Eager>} />
            <Route path="/verify-email" element={<Lazy><VerifyEmailPage /></Lazy>} />
            <Route path="/privacy" element={<Eager><PrivacyPage /></Eager>} />
            <Route path="/terms" element={<Eager><TermsPage /></Eager>} />
            <Route path="/share/:shareId" element={<Lazy><PublicSharePage /></Lazy>} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<Lazy><DashboardPage /></Lazy>} />
              <Route path="onboarding" element={<Lazy><OnboardingPage /></Lazy>} />
              <Route path="new-plan" element={<Lazy><NewPlanPage /></Lazy>} />
              <Route path="plans" element={<Lazy><PlansListPage /></Lazy>} />
              <Route path="plans/:planId" element={<Lazy><MealPlanPage /></Lazy>} />
              <Route
                path="plans/:planId/recipes/:recipeId"
                element={<Lazy><RecipeDetailPage /></Lazy>}
              />
              <Route
                path="plans/:planId/recipes/:recipeId/cook"
                element={<Lazy><CookModePage /></Lazy>}
              />
              <Route
                path="plans/:planId/shopping-list"
                element={<Lazy><ShoppingListPage /></Lazy>}
              />
              <Route path="settings" element={<Lazy><SettingsPage /></Lazy>} />
            </Route>

            <Route path="*" element={<Eager><NotFoundPage /></Eager>} />
            <Route path="/app/*" element={<Navigate to="/" replace />} />
          </Routes>
      </ToastProvider>
    </AuthProvider>
  </BrowserRouter>
);
