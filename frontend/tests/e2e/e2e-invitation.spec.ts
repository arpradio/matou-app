import { test, expect, Page, BrowserContext } from '@playwright/test';
import { setupTestConfig, hasTestConfig, getTestConfig } from './utils/mock-config';
import {
  FRONTEND_URL,
  TIMEOUT,
  setupPageLogging,
  loginWithMnemonic,
  captureMnemonicWords,
  completeMnemonicVerification,
  loadAccounts,
  TestAccounts,
} from './utils/test-helpers';

/**
 * E2E: Pre-Created Identity Invitation Flow
 *
 * Tests the full invitation lifecycle:
 * 1. Admin creates a pre-configured invitation from the dashboard
 * 2. Invitee opens the claim link and claims their identity
 * 3. Invitee completes mnemonic verification and reaches the dashboard
 *
 * Depends on e2e-org-setup having created the admin account + org config.
 *
 * Run: npx playwright test --project=invitation
 */

test.describe.serial('Pre-Created Identity Invitation', () => {
  let accounts: TestAccounts;
  let adminContext: BrowserContext;
  let adminPage: Page;
  let claimUrl: string;

  test.beforeAll(async ({ browser, request }) => {
    // Load admin credentials saved by org-setup
    accounts = loadAccounts();
    if (!accounts.admin) {
      throw new Error(
        'Admin account not found. Run org-setup first:\n' +
        'npx playwright test --project=org-setup',
      );
    }
    console.log(`[Test] Using admin account created at: ${accounts.createdAt}`);

    // Verify test config exists
    const configExists = await hasTestConfig(request);
    if (!configExists) {
      throw new Error(
        'Test config not found. Run org-setup first:\n' +
        'npx playwright test --project=org-setup',
      );
    }

    // Verify config has registry (needed for credential issuance)
    const config = await getTestConfig(request);
    if (!config?.registry?.id) {
      throw new Error(
        'Org config missing registry. Run org-setup first:\n' +
        'npx playwright test --project=org-setup',
      );
    }

    // Create persistent admin context with test config isolation
    adminContext = await browser.newContext();
    await setupTestConfig(adminContext);
    adminPage = await adminContext.newPage();
    setupPageLogging(adminPage, 'Admin');

    // Login admin once via mnemonic recovery
    console.log('[Test] Admin logging in...');
    await loginWithMnemonic(adminPage, accounts.admin.mnemonic);
    console.log('[Test] Admin logged in and on dashboard');
  });

  test.afterAll(async () => {
    await adminContext?.close();
  });

  // ------------------------------------------------------------------
  // Test 1: Admin creates invitation from dashboard
  // ------------------------------------------------------------------
  test('admin creates invitation', async () => {
    test.setTimeout(TIMEOUT.orgSetup); // 2 min — credential issuance + OOBI resolution

    // Verify admin is on dashboard and is recognized as admin
    await expect(adminPage).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.short });

    // Wait for admin section to be visible (proves admin status)
    const adminSection = adminPage.locator('.admin-area');
    await expect(adminSection).toBeVisible({ timeout: TIMEOUT.medium });

    // Click "Invite Member" button
    console.log('[Test] Clicking Invite Member...');
    const inviteBtn = adminPage.locator('.invite-btn');
    await expect(inviteBtn).toBeVisible({ timeout: TIMEOUT.short });
    await inviteBtn.click();

    // Fill invite form in modal
    const modal = adminPage.locator('.invite-modal');
    await expect(modal).toBeVisible({ timeout: TIMEOUT.short });

    await modal.locator('input[type="text"]').fill('Test Invitee');
    // Leave role as default "Member"

    // Submit and wait for invitation creation
    console.log('[Test] Creating invitation (this involves KERI operations)...');
    await modal.getByRole('button', { name: /create invitation/i }).click();

    // Wait for progress to appear, then for claim URL to appear
    await expect(modal.locator('.progress-box')).toBeVisible({ timeout: TIMEOUT.short });

    // Wait for success — claim URL input appears
    const claimUrlInput = modal.locator('input[readonly]');
    await expect(claimUrlInput).toBeVisible({ timeout: TIMEOUT.orgSetup });

    // Extract claim URL
    claimUrl = await claimUrlInput.inputValue();
    console.log(`[Test] Claim URL generated: ${claimUrl}`);
    expect(claimUrl).toContain('/#/claim/');

    // Verify invitee AID is shown
    const aidInfo = modal.locator('.aid-info code');
    await expect(aidInfo).toBeVisible({ timeout: TIMEOUT.short });
    const aidText = await aidInfo.textContent();
    expect(aidText).toBeTruthy();
    console.log(`[Test] Invitee AID: ${aidText}`);

    // Close modal
    await modal.getByRole('button', { name: /done/i }).click();
    await expect(modal).not.toBeVisible({ timeout: TIMEOUT.short });
    console.log('[Test] PASS - Invitation created successfully');
  });

  // ------------------------------------------------------------------
  // Test 2: Invitee claims identity via claim link
  // ------------------------------------------------------------------
  test('invitee claims identity via claim link', async ({ browser }) => {
    test.setTimeout(TIMEOUT.orgSetup); // 2 min — key rotation + passcode rotation

    expect(claimUrl, 'Claim URL must exist from previous test').toBeTruthy();

    // Extract the hash path from the claim URL
    const hashPath = new URL(claimUrl).hash; // e.g., #/claim/ABCDEFGHIJKLMNOPQRSTU
    console.log(`[Test] Opening claim link: ${hashPath}`);

    // Create fresh browser context for the invitee (no existing session)
    const inviteeContext = await browser.newContext();
    await setupTestConfig(inviteeContext);
    const inviteePage = await inviteeContext.newPage();
    setupPageLogging(inviteePage, 'Invitee');

    try {
      // Clear any existing session
      await inviteePage.goto(FRONTEND_URL);
      await inviteePage.evaluate(() => localStorage.clear());

      // Navigate to claim URL
      await inviteePage.goto(`${FRONTEND_URL}/${hashPath}`);
      await inviteePage.waitForLoadState('networkidle');

      // --- Claim Welcome Screen ---
      console.log('[Test] Waiting for claim welcome screen...');

      // Wait for validation to complete (loading spinner disappears, content appears)
      await expect(
        inviteePage.getByRole('heading', { name: /your identity is ready/i }),
      ).toBeVisible({ timeout: TIMEOUT.long });

      // Verify identity preview is shown
      const identityCard = inviteePage.locator('.identity-card');
      await expect(identityCard).toBeVisible({ timeout: TIMEOUT.short });
      console.log('[Test] Claim welcome screen loaded with identity preview');

      // Click "Claim My Identity"
      await inviteePage.getByRole('button', { name: /claim my identity/i }).click();

      // --- Claim Processing Screen ---
      console.log('[Test] Claim processing started...');

      // Wait for processing to complete — "Identity Claimed!" success box
      await expect(
        inviteePage.getByText(/identity claimed/i),
      ).toBeVisible({ timeout: TIMEOUT.orgSetup });
      console.log('[Test] Identity claimed successfully');

      // Click "Continue to Recovery Phrase"
      await inviteePage.getByRole('button', { name: /continue to recovery phrase/i }).click();

      // --- Profile Confirmation Screen (mnemonic display) ---
      console.log('[Test] Capturing recovery phrase...');
      await expect(
        inviteePage.getByRole('heading', { name: /identity created/i }),
      ).toBeVisible({ timeout: TIMEOUT.short });

      // Capture mnemonic
      const inviteeMnemonic = await captureMnemonicWords(inviteePage);
      console.log(`[Test] Captured invitee mnemonic (${inviteeMnemonic.length} words)`);
      expect(inviteeMnemonic).toHaveLength(12);

      // Confirm and proceed to verification
      await inviteePage.locator('.confirm-box input[type="checkbox"]').check();
      await inviteePage.getByRole('button', { name: /continue to verification/i }).click();

      // --- Mnemonic Verification Screen ---
      console.log('[Test] Completing mnemonic verification...');
      await completeMnemonicVerification(inviteePage, inviteeMnemonic, /verify and continue/i);

      // --- Should navigate to dashboard ---
      console.log('[Test] Waiting for dashboard...');
      await expect(inviteePage).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.long });
      console.log('[Test] PASS - Invitee on dashboard after claiming identity');

      // --- Verify session persisted ---
      const hasPasscode = await inviteePage.evaluate(() => {
        return !!localStorage.getItem('matou_passcode');
      });
      expect(hasPasscode, 'Passcode should be persisted in localStorage').toBe(true);
    } finally {
      await inviteeContext.close();
    }
  });

  // ------------------------------------------------------------------
  // Test 3: Old claim link no longer works after claiming
  // ------------------------------------------------------------------
  test('claimed link is invalid after use', async ({ browser }) => {
    test.setTimeout(TIMEOUT.long);

    expect(claimUrl, 'Claim URL must exist from previous test').toBeTruthy();

    const hashPath = new URL(claimUrl).hash;

    // Open claim link in a fresh context
    const freshContext = await browser.newContext();
    await setupTestConfig(freshContext);
    const freshPage = await freshContext.newPage();
    setupPageLogging(freshPage, 'Reuse');

    try {
      await freshPage.goto(FRONTEND_URL);
      await freshPage.evaluate(() => localStorage.clear());
      await freshPage.goto(`${FRONTEND_URL}/${hashPath}`);
      await freshPage.waitForLoadState('networkidle');

      // Should show error — the passcode was rotated so the old one won't connect
      console.log('[Test] Waiting for invalid claim link error...');
      await expect(
        freshPage.getByText(/invalid|already been used|failed/i).first(),
      ).toBeVisible({ timeout: TIMEOUT.long });
      console.log('[Test] PASS - Old claim link correctly rejected');
    } finally {
      await freshContext.close();
    }
  });
});
