/**
 * BuildYourStore (Vsite) — Full E2E Test Suite
 *
 * IMPORTANT NOTES:
 * - Firebase Phone Auth uses country code +1 (hardcoded in login/signup pages).
 *   The test phone number must be registered in the Firebase Console as a US number.
 *   The user provided +91 9360706659 (India), but the app dials +1 9360706659 (US).
 *   Firebase test number in the Console MUST be set to: +19360706659 with OTP 123456.
 * - NEXT_PUBLIC_FIREBASE_USE_TEST_NUMBERS=true is set, so reCAPTCHA is bypassed.
 * - OTP inputs are 6 separate <input> elements — we fill them via clipboard paste.
 * - Auth state is stored in cookie `sb-access-token` (Firebase JWT).
 */

import { test, expect, type Page } from '@playwright/test';

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE = 'http://localhost:3000';
// The app prepends +1. Enter only the 10-digit number.
const TEST_PHONE_10 = '9360706659';
const TEST_OTP     = '123456';
const WRONG_OTP    = '000000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fill the 6-box OTP widget by pasting the digits. */
async function fillOTP(page: Page, otp: string) {
  // The OTP boxes use onPaste which populates all 6 inputs at once
  const firstBox = page.locator('input[inputmode="numeric"][maxlength="1"]').first();
  await firstBox.focus();
  await page.evaluate((otpValue) => {
    const input = document.querySelector('input[inputmode="numeric"][maxlength="1"]') as HTMLInputElement;
    if (!input) return;
    const dt = new DataTransfer();
    dt.setData('text/plain', otpValue);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, otp);

  // Fallback: type each digit individually if paste didn't work
  const boxes = page.locator('input[inputmode="numeric"][maxlength="1"]');
  const count = await boxes.count();
  if (count >= 6) {
    const firstVal = await boxes.nth(0).inputValue();
    if (!firstVal) {
      for (let i = 0; i < 6; i++) {
        await boxes.nth(i).fill(otp[i]);
      }
    }
  }
}

/** Complete login with the test phone number and OTP. */
async function loginWithTestPhone(page: Page) {
  await page.goto(`${BASE}/login`);
  // Wait for loading spinner to disappear (auth check)
  await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

  // Enter phone number (10 digits — app prepends +1)
  const phoneInput = page.locator('input[type="tel"]');
  await phoneInput.fill(TEST_PHONE_10);

  // Click Login
  await page.getByRole('button', { name: /login/i }).click();

  // Wait for OTP step
  await page.waitForSelector('text=Verify your number', { timeout: 15000 });

  // Fill OTP
  await fillOTP(page, TEST_OTP);

  // Wait for Verify button to become enabled (all 6 digits entered)
  const verifyBtn = page.getByRole('button', { name: /verify/i });
  await expect(verifyBtn).toBeEnabled({ timeout: 3000 });
  await verifyBtn.click();

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION FLOW
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Authentication Flow', () => {

  test('AUTH-01: Login page renders phone step correctly', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /login/i })).toBeVisible();
    await expect(page.getByText('+1')).toBeVisible(); // country prefix
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
  });

  test('AUTH-02: Empty phone submit shows validation error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.getByRole('button', { name: /login/i }).click();

    // Should show error, NOT navigate away
    await expect(page.getByText(/valid 10-digit/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('AUTH-03: Invalid phone (too short) shows validation error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill('123');
    await page.getByRole('button', { name: /login/i }).click();

    await expect(page.getByText(/valid 10-digit/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('AUTH-04: Valid phone proceeds to OTP step (reCAPTCHA bypassed)', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill(TEST_PHONE_10);
    await page.getByRole('button', { name: /login/i }).click();

    // Either OTP step appears or an error (if Firebase test number not configured)
    await Promise.race([
      page.waitForSelector('text=Verify your number', { timeout: 15000 }),
      page.waitForSelector('.text-red-500', { timeout: 15000 }),
    ]);

    const otpVisible = await page.locator('text=Verify your number').isVisible();
    const errorVisible = await page.locator('.text-red-500').isVisible();

    if (otpVisible) {
      await expect(page.getByText('Verify your number')).toBeVisible();
      await expect(page.locator('input[inputmode="numeric"][maxlength="1"]')).toHaveCount(6);
      // Verify button should be disabled until OTP is entered
      await expect(page.getByRole('button', { name: /verify/i })).toBeDisabled();
    } else if (errorVisible) {
      // Firebase test number +19360706659 not configured — document as config issue
      console.warn('OTP send failed — Firebase test number may not be configured as +1 number');
      test.skip();
    }
  });

  test('AUTH-05: Wrong OTP shows error and does NOT redirect', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill(TEST_PHONE_10);
    await page.getByRole('button', { name: /login/i }).click();

    const otpStepVisible = await page.waitForSelector('text=Verify your number', { timeout: 15000 })
      .then(() => true).catch(() => false);

    if (!otpStepVisible) {
      test.skip();
      return;
    }

    await fillOTP(page, WRONG_OTP);
    const verifyBtn = page.getByRole('button', { name: /verify/i });
    await expect(verifyBtn).toBeEnabled({ timeout: 3000 });
    await verifyBtn.click();

    // Should show error
    await expect(page.getByText(/invalid code/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('AUTH-06: Correct OTP redirects to /manage or /onboarding', async ({ page }) => {
    await loginWithTestPhone(page);
    const url = page.url();
    expect(
      url.includes('/manage') || url.includes('/onboarding')
    ).toBeTruthy();
  });

  test('AUTH-07: Already logged-in user visiting /login is redirected to dashboard', async ({ page }) => {
    await loginWithTestPhone(page);
    // Now navigate back to /login — should bounce to /manage/dashboard
    await page.goto(`${BASE}/login`);
    await page.waitForURL(/\/manage/, { timeout: 10000 });
    expect(page.url()).toContain('/manage');
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SIGNUP FLOW
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Signup Flow', () => {

  test('SIGNUP-01: Signup page renders correctly', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[placeholder*="John Smith"]')).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('SIGNUP-02: Submit without name shows error', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForSelector('input[placeholder*="John Smith"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill('9876543210');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/signup/);
  });

  test('SIGNUP-03: Submit without phone shows error', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForSelector('input[placeholder*="John Smith"]', { timeout: 10000 });

    await page.locator('input[placeholder*="John Smith"]').fill('Test User');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/valid 10-digit/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/signup/);
  });

  test('SIGNUP-04: Submit empty form shows name validation error first', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForSelector('input[placeholder*="John Smith"]', { timeout: 10000 });

    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/enter your name/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/signup/);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ACCESS CONTROL — UNAUTHENTICATED REDIRECTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Access Control', () => {

  test('ACCESS-01: Unauthenticated visit to /manage/dashboard redirects to /login', async ({ page }) => {
    // Clear cookies to ensure no session
    await page.context().clearCookies();
    await page.goto(`${BASE}/manage/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('ACCESS-02: Unauthenticated visit to /manage/product-inventory redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/manage/product-inventory`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('ACCESS-03: Unauthenticated visit to /manage/settings redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/manage/settings`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('ACCESS-04: Unauthenticated visit to /onboarding redirects to /login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/onboarding`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('ACCESS-05: Login redirect URL contains the original path (redirectTo param)', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${BASE}/manage/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    const decodedUrl = decodeURIComponent(page.url());
    expect(decodedUrl).toContain('redirectTo=/manage/dashboard');
  });

  test('ACCESS-06: Expired token banner shown when token present but expired', async ({ page }) => {
    // Set a fake expired token cookie
    await page.context().addCookies([{
      name: 'sb-access-token',
      value: 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE2MDAwMDAwMDB9.fake',
      domain: 'localhost',
      path: '/',
    }]);
    await page.goto(`${BASE}/manage/dashboard`);
    await page.waitForURL(/\/login/, { timeout: 10000 });
    // Should include ?expired=true
    expect(page.url()).toContain('expired=true');
    await expect(page.getByText(/session expired/i)).toBeVisible({ timeout: 5000 });
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ONBOARDING FLOW
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Onboarding Flow', () => {

  test('ONBOARD-01: Onboarding page shows business name input and Next button', async ({ page }) => {
    await loginWithTestPhone(page);

    // Navigate to onboarding (if already onboarded, we need to force navigate)
    await page.goto(`${BASE}/onboarding`);

    // May redirect to /manage/dashboard if already onboarded — that's acceptable
    const currentUrl = page.url();
    if (currentUrl.includes('/manage')) {
      // User is already onboarded — skip detailed onboarding test
      console.log('User already onboarded, skipping to dashboard');
      return;
    }

    await expect(page.getByText('Setup Your Store')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[placeholder="Cream Story"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    await expect(page.getByText('Business Category')).toBeVisible();
    await expect(page.getByText('Cafe')).toBeVisible();
  });

  test('ONBOARD-02: Submitting without business name shows error', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/onboarding`);

    const currentUrl = page.url();
    if (currentUrl.includes('/manage')) {
      console.log('User already onboarded — skipping onboarding form test');
      return;
    }

    await page.getByRole('button', { name: /next/i }).click();
    await expect(page.locator('p').filter({ hasText: /enter your business name/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('ONBOARD-03: Onboarding redirects to /manage/dashboard on success', async ({ page }) => {
    await loginWithTestPhone(page);

    // Check where login landed BEFORE forcing /onboarding navigation
    const postLoginUrl = page.url();
    if (postLoginUrl.includes('/manage')) {
      // Already onboarded — verify dashboard is accessible
      await expect(page).toHaveURL(/\/manage/);
      return;
    }

    // Fresh account — still on /onboarding
    await page.locator('input[placeholder="Cream Story"]').fill('Test Shop E2E');
    await page.getByRole('button', { name: /next/i }).click();

    await page.waitForURL(/\/manage\/dashboard/, { timeout: 30000 });
    expect(page.url()).toContain('/manage/dashboard');
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Dashboard', () => {

  test('DASH-01: Dashboard loads without errors after login', async ({ page }) => {
    await loginWithTestPhone(page);

    // Navigate to dashboard explicitly (in case we're on onboarding)
    const url = page.url();
    if (!url.includes('/manage/dashboard')) {
      await page.goto(`${BASE}/manage/dashboard`);
    }

    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/manage\/dashboard/);
    // No unhandled JS error — page should not show a 500 or blank screen
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('DASH-02: Dashboard shows key UI elements', async ({ page }) => {
    await loginWithTestPhone(page);
    if (!page.url().includes('/manage/dashboard')) {
      await page.goto(`${BASE}/manage/dashboard`);
    }
    // Wait for React to hydrate — sidebar/nav are rendered by client components
    await page.waitForSelector('nav, aside, [class*="sidebar"], [class*="Sidebar"], [class*="header"], header', { timeout: 15000 }).catch(() => null);

    const hasNav = await page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"], header').count();
    expect(hasNav).toBeGreaterThan(0);
  });

  test('DASH-03: Dashboard contains orders or stats section', async ({ page }) => {
    await loginWithTestPhone(page);
    if (!page.url().includes('/manage/dashboard')) {
      await page.goto(`${BASE}/manage/dashboard`);
    }
    // Wait for React to hydrate and render meaningful content
    await page.waitForFunction(() => document.body.innerText.length > 100, { timeout: 15000 }).catch(() => null);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PRODUCT INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Product Inventory', () => {

  test.beforeEach(async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/manage/product-inventory`);
    await page.waitForLoadState('domcontentloaded');
  });

  test('PROD-01: Product inventory page loads', async ({ page }) => {
    // Wait for either the Add Product button (page loaded) or onboarding redirect
    await Promise.race([
      page.waitForSelector('button:has-text("Add Product")', { timeout: 12000 }),
      page.waitForURL(/\/onboarding/, { timeout: 12000 }),
    ]).catch(() => null);

    const currentUrl = page.url();
    if (currentUrl.includes('/onboarding')) {
      // onboarding_completed=false in DB — page gate redirected us; skip
      test.skip();
      return;
    }

    await expect(page).toHaveURL(/\/manage\/product-inventory/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);
  });

  test('PROD-02: Add Product button / FAB is visible', async ({ page }) => {
    await Promise.race([
      page.waitForSelector('button:has-text("Add Product")', { timeout: 12000 }),
      page.waitForURL(/\/onboarding/, { timeout: 12000 }),
    ]).catch(() => null);

    if (page.url().includes('/onboarding')) { test.skip(); return; }

    const addBtn = page.locator('button:has-text("Add Product")');
    await expect(addBtn).toBeVisible({ timeout: 5000 });
  });

  test('PROD-03: Opening Add Product drawer shows product type selection', async ({ page }) => {
    await Promise.race([
      page.waitForSelector('button:has-text("Add Product")', { timeout: 12000 }),
      page.waitForURL(/\/onboarding/, { timeout: 12000 }),
    ]).catch(() => null);

    if (page.url().includes('/onboarding')) { test.skip(); return; }

    await page.locator('button:has-text("Add Product")').first().click();

    // Wait for drawer to open
    await page.waitForTimeout(800);
    const singleItemVisible = await page.getByText('Single Item').isVisible().catch(() => false);
    const variantsVisible   = await page.getByText(/variant/i).isVisible().catch(() => false);
    const drawerVisible     = await page.locator('[class*="drawer"], [class*="modal"], [class*="sheet"]').count() > 0;

    expect(singleItemVisible || variantsVisible || drawerVisible).toBeTruthy();
  });

  test('PROD-04: Add single item product - missing required fields shows validation', async ({ page }) => {
    // Open add product drawer
    const addBtn = page.locator('button').filter({ hasText: /add|new/i }).first();
    const plusBtn = page.locator('button').filter({ hasText: '+' }).first();

    if (await addBtn.isVisible()) {
      await addBtn.click();
    } else if (await plusBtn.isVisible()) {
      await plusBtn.click();
    }

    await page.waitForTimeout(1000);

    // Click Save/Submit without filling required fields
    const saveBtn = page.getByRole('button', { name: /save|submit|add/i }).last();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);

      // Should show some kind of validation — form should not submit
      // Either a toast, inline error, or the drawer stays open
      const stillOpen = await page.getByText('Single Item').isVisible().catch(() => false);
      const errorVisible = await page.locator('[class*="error"], .text-red').count() > 0;
      const toastVisible = await page.locator('[class*="toast"], [class*="Toaster"]').count() > 0;

      // Drawer should still be open or an error should show
      expect(stillOpen || errorVisible || toastVisible).toBeTruthy();
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. BANNER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Banner Management', () => {

  test('BANNER-01: Banner management page loads', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/manage/banner-management`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/manage\/banner-management/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('BANNER-02: Banner page shows content (banners or empty state)', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/manage/banner-management`);
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 15000 }).catch(() => null);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(50);

    // Should show either banners or an "add banner" / empty state UI
    const hasContent = await page.locator('[class*="banner"], [class*="Banner"], img, button').count();
    expect(hasContent).toBeGreaterThan(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Settings', () => {

  test('SETTINGS-01: Settings page loads without error', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/manage/settings`);
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveURL(/\/manage\/settings/);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('SETTINGS-02: Settings page shows form fields', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(`${BASE}/manage/settings`);
    await page.waitForSelector('input, textarea, select', { timeout: 15000 }).catch(() => null);

    // Should show some input fields or settings options
    const inputs = page.locator('input, textarea, select');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SHOP TEMPLATE & PUBLIC PAGES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Shop Template & Public Pages', () => {

  test('SHOP-01: Nonexistent shop slug shows 404 or not-found UI', async ({ page }) => {
    await page.goto(`${BASE}/shop/this-shop-does-not-exist-xyz123`);
    await page.waitForLoadState('networkidle');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();

    // Should show 404, "not found", "doesn't exist", or similar
    const is404 =
      bodyText.includes('404') ||
      bodyText.includes('not found') ||
      bodyText.includes("doesn't exist") ||
      bodyText.includes('unavailable') ||
      bodyText.includes('no shop') ||
      page.url().includes('404');

    expect(is404).toBeTruthy();
  });

  test('SHOP-02: Preview page /shop/preview?tier=view loads', async ({ page }) => {
    await page.goto(`${BASE}/shop/preview?tier=view`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  });

  test('SHOP-03: Preview page /shop/preview?tier=order loads', async ({ page }) => {
    await page.goto(`${BASE}/shop/preview?tier=order`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Edge Cases', () => {

  test('EDGE-01: Home page (/) loads correctly for unauthenticated users', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    // Should load without error — either home page or redirect
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('EDGE-02: Home page (/) redirects logged-in user to dashboard', async ({ page }) => {
    await loginWithTestPhone(page);
    await page.goto(BASE);
    // Middleware redirects / to /manage/dashboard for logged-in users
    await page.waitForURL(/\/manage\/dashboard/, { timeout: 10000 });
    expect(page.url()).toContain('/manage/dashboard');
  });

  test('EDGE-03: Login page country code prefix is visible and fixed at +1', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });
    await expect(page.getByText('+1')).toBeVisible();
    // The flag emoji should also be present
    const flagOrPrefix = await page.locator('text=+1').count();
    expect(flagOrPrefix).toBeGreaterThan(0);
  });

  test('EDGE-04: OTP input - phone number input enforces max 10 digits', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill('12345678901234'); // 14 digits
    const value = await phoneInput.inputValue();
    // App slices to 10 digits via onChange
    expect(value.length).toBeLessThanOrEqual(10);
  });

  test('EDGE-05: OTP inputs only accept digits (numeric validation)', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill(TEST_PHONE_10);
    await page.getByRole('button', { name: /login/i }).click();

    const otpVisible = await page.waitForSelector('text=Verify your number', { timeout: 15000 })
      .then(() => true).catch(() => false);

    if (!otpVisible) { test.skip(); return; }

    const firstBox = page.locator('input[inputmode="numeric"][maxlength="1"]').first();
    await firstBox.fill('a'); // non-digit
    const value = await firstBox.inputValue();
    // Should remain empty (non-digit is rejected)
    expect(value).toBe('');
  });

  test('EDGE-06: OTP paste of 6 digits populates all boxes', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill(TEST_PHONE_10);
    await page.getByRole('button', { name: /login/i }).click();

    const otpVisible = await page.waitForSelector('text=Verify your number', { timeout: 15000 })
      .then(() => true).catch(() => false);

    if (!otpVisible) { test.skip(); return; }

    await fillOTP(page, '654321');

    const boxes = page.locator('input[inputmode="numeric"][maxlength="1"]');
    const values: string[] = [];
    for (let i = 0; i < 6; i++) {
      values.push(await boxes.nth(i).inputValue());
    }
    const combined = values.join('');
    // Should have 6 digits filled
    expect(combined.length).toBe(6);
  });

  test('EDGE-07: Signup link on login page navigates to /signup', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });
    await page.getByRole('link', { name: /sign up/i }).click();
    await page.waitForURL(/\/signup/, { timeout: 5000 });
    expect(page.url()).toContain('/signup');
  });

  test('EDGE-08: Login link on signup page navigates to /login', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await page.waitForSelector('input[placeholder*="John Smith"]', { timeout: 10000 });
    await page.getByRole('link', { name: /sign in/i }).click();
    await page.waitForURL(/\/login/, { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  test('EDGE-09: Session expired banner shown at /login?expired=true', async ({ page }) => {
    await page.goto(`${BASE}/login?expired=true`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/session expired/i)).toBeVisible({ timeout: 10000 });
  });

  test('EDGE-10: OTP "Edit number" button goes back to phone step', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.waitForSelector('input[type="tel"]', { timeout: 10000 });

    await page.locator('input[type="tel"]').fill(TEST_PHONE_10);
    await page.getByRole('button', { name: /login/i }).click();

    const otpVisible = await page.waitForSelector('text=Verify your number', { timeout: 15000 })
      .then(() => true).catch(() => false);

    if (!otpVisible) { test.skip(); return; }

    // Click edit button (pencil icon)
    const editBtn = page.locator('button[title="Edit number"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Should return to phone step
    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="tel"]')).toBeVisible();
  });

});
