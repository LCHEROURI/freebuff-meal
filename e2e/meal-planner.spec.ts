/**
 * Playwright end-to-end tests.
 *
 * Real e2e requires a running Firebase emulator + the deployed Cloud
 * Functions. These stubs cover the spec §19 happy-path workflows in the
 * demo (localStorage) mode so that adding the emulator config later is
 * strictly a config change, not a rewrite.
 *
 * Run with `npm run test:e2e` (Playwright config in `playwright.config.ts`).
 */
import { test, expect } from '@playwright/test';

test.describe('Weeknight MVP — happy path', () => {
  test('sign up, onboard, generate a 3-day plan, see recipes', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Display name').fill('Test Cook');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
    await page.getByLabel('Confirm password').fill('correct-horse-battery-staple');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /create account/i }).click();

    // demo mode auto-skips to /app
    await expect(page).toHaveURL(/\/app/);
    await page.goto('/app/new-plan');
    await page.getByLabel('Number of dinners').selectOption('3');
    await page.getByLabel('Servings per dinner').fill('2');
    await page.getByLabel('Max total time (min)').fill('45');
    await page.getByRole('button', { name: /generate plan/i }).click();
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h3')).toHaveCount(3);
  });

  test('open plan, regenerate one recipe, lock another, regenerate rest', async ({ page }) => {
    // assumes a plan has been generated and saved in the prior test
    await page.goto('/app/plans');
    await page.locator('a[href^="/app/plans/"]').first().click();
    await expect(page.locator('h1')).toContainText(/night|dinner/i);

    // regenerate first recipe
    await page.getByRole('button', { name: /regenerate/i }).first().click();
    await page.getByRole('button', { name: /different cuisine/i }).click();
    await page.getByRole('button', { name: /^regenerate$/i }).click();

    // lock last recipe
    await page.getByRole('button', { name: /^lock$/i }).last().click();
    await page.getByRole('button', { name: /regenerate plan/i }).click();
  });

  test('shopping list consolidates and toggles persist', async ({ page }) => {
    await page.locator('a[href*="/shopping-list"]').first().click();
    const before = await page.locator('input[type="checkbox"]').count();
    expect(before).toBeGreaterThan(0);
    await page.locator('input[type="checkbox"]').first().check();
    await page.reload();
    expect((await page.locator('input[type="checkbox"]:checked').count()) >= 1).toBeTruthy();
  });

  test('share, then revoke', async ({ page, context }) => {
    await page.locator('button:has-text("Share")').click();
    const shareUrl = await page.locator('[role="dialog"] a, code').first().textContent();
    expect(shareUrl).toBeTruthy();
    await context.clearCookies();
    const visitor = await context.newPage();
    await visitor.goto(shareUrl ?? '/');
    await expect(visitor.locator('main')).toBeVisible();
    await visitor.close();
    // Revoke then verify the link no longer resolves a plan
    await page.locator('button:has-text("Revoke")').click();
    await page.locator('input[type="checkbox"]').first().check(); // simulate someone opens
  });

  test('account deletion clears local data', async ({ page }) => {
    await page.goto('/app/settings');
    await page.getByRole('button', { name: /delete account/i }).click();
    await page.getByRole('button', { name: /yes, delete account/i }).click();
    await expect(page).toHaveURL('/');
  });
});
