import { test, expect, Page, BrowserContext } from '@playwright/test';
import { setupTestConfig, hasTestConfig } from './utils/mock-config';
import {
  FRONTEND_URL,
  TIMEOUT,
  setupPageLogging,
  registerUser,
  loginWithMnemonic,
  uniqueSuffix,
  loadAccounts,
  TestAccounts,
} from './utils/test-helpers';

/**
 * E2E: Registration Approval Flow
 *
 * Tests admin approval, decline, and messaging workflows.
 * Depends on e2e-org-setup having created the admin account + org config.
 *
 * Run: npx playwright test --project=registration
 */

test.describe.serial('Registration Approval Flow', () => {
  let accounts: TestAccounts;
  let adminContext: BrowserContext;
  let adminPage: Page;

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
  // Test 1: Admin approves user registration
  // ------------------------------------------------------------------
  test('admin approves user registration', async ({ browser }) => {
    const userContext = await browser.newContext();
    await setupTestConfig(userContext);
    const userPage = await userContext.newPage();
    setupPageLogging(userPage, 'User-Approve');

    const userName = `Approve_${uniqueSuffix()}`;

    try {
      // User registers
      await registerUser(userPage, userName);

      // Wait for admin to see registration card
      console.log('[Test] Waiting for registration to appear on admin dashboard...');
      const adminSection = adminPage.locator('.admin-section');
      await expect(adminSection).toBeVisible({ timeout: TIMEOUT.medium });

      const registrationCard = adminPage.locator('.registration-card').filter({ hasText: userName });
      await expect(registrationCard).toBeVisible({ timeout: TIMEOUT.long });
      console.log('[Test] Registration card visible');

      // Admin approves
      console.log('[Test] Admin clicking approve...');
      await registrationCard.getByRole('button', { name: /approve/i }).click();

      // User receives credential (welcome overlay)
      console.log('[Test] Waiting for user to receive credential...');
      await expect(userPage.locator('.welcome-overlay')).toBeVisible({ timeout: TIMEOUT.long });
      console.log('[Test] User received credential!');

      // User enters community and lands on dashboard
      await userPage.getByRole('button', { name: /enter community/i }).click();
      await expect(userPage).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.short });
      console.log('[Test] PASS - User approved and on dashboard');
    } finally {
      await userContext.close();
    }
  });

  // ------------------------------------------------------------------
  // Test 2: Admin declines user registration
  // ------------------------------------------------------------------
  test('admin declines user registration', async ({ browser }) => {
    const userContext = await browser.newContext();
    await setupTestConfig(userContext);
    const userPage = await userContext.newPage();
    setupPageLogging(userPage, 'User-Decline');

    const userName = `Decline_${uniqueSuffix()}`;

    try {
      // User registers
      await registerUser(userPage, userName);

      // Wait for admin to see registration card
      const adminSection = adminPage.locator('.admin-section');
      await expect(adminSection).toBeVisible({ timeout: TIMEOUT.medium });

      const registrationCard = adminPage.locator('.registration-card').filter({ hasText: userName });
      await expect(registrationCard).toBeVisible({ timeout: TIMEOUT.long });

      // Admin declines
      console.log('[Test] Admin clicking decline...');
      const declineBtn = registrationCard.locator('button').last();
      await declineBtn.click();

      // Handle decline modal if present
      const modal = adminPage.locator('.modal-content');
      if (await modal.isVisible({ timeout: TIMEOUT.short }).catch(() => false)) {
        const reasonField = modal.locator('textarea');
        if (await reasonField.isVisible().catch(() => false)) {
          await reasonField.fill('Declined for testing');
        }
        await modal.getByRole('button', { name: /confirm|decline/i }).click();
      }

      // User sees rejection
      console.log('[Test] Waiting for user to see rejection...');
      await expect(
        userPage.getByText(/declined|rejected/i).first(),
      ).toBeVisible({ timeout: TIMEOUT.long });
      console.log('[Test] PASS - User sees rejection');
    } finally {
      await userContext.close();
    }
  });

  // ------------------------------------------------------------------
  // Test 3: Admin sends message to pending applicant
  // ------------------------------------------------------------------
  test('admin sends message to pending applicant', async ({ browser }) => {
    const userContext = await browser.newContext();
    await setupTestConfig(userContext);
    const userPage = await userContext.newPage();
    setupPageLogging(userPage, 'User-Message');

    const userName = `Message_${uniqueSuffix()}`;

    try {
      // User registers (stays pending)
      await registerUser(userPage, userName);

      // Wait for admin to see registration card
      const adminSection = adminPage.locator('.admin-section');
      await expect(adminSection).toBeVisible({ timeout: TIMEOUT.medium });

      const registrationCard = adminPage.locator('.registration-card').filter({ hasText: userName });
      await expect(registrationCard).toBeVisible({ timeout: TIMEOUT.long });

      // Admin clicks message button
      console.log('[Test] Admin clicking message...');
      const messageBtn = registrationCard.getByRole('button', { name: /message/i });
      await expect(messageBtn).toBeVisible({ timeout: TIMEOUT.short });
      await messageBtn.click();

      // Fill and send message
      const modal = adminPage.locator('.modal-content');
      await expect(modal).toBeVisible({ timeout: TIMEOUT.short });
      await modal.locator('textarea').fill('Please provide more details about your background.');
      await modal.getByRole('button', { name: /send/i }).click();
      console.log('[Test] Admin sent message');

      // User receives message
      console.log('[Test] Waiting for user to receive message...');
      await expect(
        userPage.getByText(/please provide more details/i),
      ).toBeVisible({ timeout: TIMEOUT.long });
      console.log('[Test] PASS - User received message');
    } finally {
      await userContext.close();
    }
  });
});
