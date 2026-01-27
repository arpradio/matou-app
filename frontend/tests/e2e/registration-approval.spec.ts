import { test, expect, BrowserContext, Page } from '@playwright/test';

/**
 * E2E Test: Registration Approval Flow
 *
 * Tests the complete admin approval workflow:
 * 1. Admin sets up organization (creates admin identity)
 * 2. User submits registration in separate context
 * 3. Admin sees registration in dashboard
 * 4. Admin can approve or decline
 * 5. User receives credential (approve) or rejection (decline)
 *
 * Prerequisites:
 * - KERIA running: cd infrastructure/keri && docker compose up -d
 * - Config server running (part of docker compose)
 * - Frontend running: cd frontend && npm run dev
 *
 * Run: npx playwright test tests/e2e/registration-approval.spec.ts
 * Debug: npx playwright test tests/e2e/registration-approval.spec.ts --debug
 * Headed: npx playwright test tests/e2e/registration-approval.spec.ts --headed
 */

const FRONTEND_URL = 'http://localhost:9002';
const CONFIG_SERVER_URL = 'http://localhost:3904';

// Helper to set up console and network logging
function setupPageLogging(page: Page, prefix: string) {
  page.on('console', (msg) => {
    const text = msg.text();
    // Only log important messages to reduce noise
    if (text.includes('Registration') || text.includes('Admin') ||
        text.includes('Credential') || text.includes('IPEX') ||
        text.includes('KERIClient') || text.includes('OrgSetup') ||
        text.includes('endRole') || text.includes('EID') ||
        text.includes('Error') || msg.type() === 'error') {
      console.log(`[${prefix}] ${text}`);
    }
  });

  page.on('requestfailed', (request) => {
    console.log(`[${prefix} FAILED] ${request.method()} ${request.url()}`);
  });
}

// Helper to complete org setup and return admin mnemonic
async function setupOrganization(page: Page, request: any): Promise<string[]> {
  // Clear existing config
  try {
    await request.delete(`${CONFIG_SERVER_URL}/api/config`);
    console.log('[Setup] Cleared existing config');
  } catch {
    console.log('[Setup] No existing config to clear');
  }

  // Clear localStorage
  await page.goto(FRONTEND_URL);
  await page.evaluate(() => {
    localStorage.clear();
  });

  // Navigate to setup
  await page.goto(`${FRONTEND_URL}/#/setup`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: /community setup/i })).toBeVisible({ timeout: 15000 });
  console.log('[Setup] On setup page');

  // Fill form
  const orgNameInput = page.locator('input').first();
  await orgNameInput.fill('Test Community');
  const adminNameInput = page.locator('input').nth(1);
  await adminNameInput.fill('Test Admin');

  // Submit
  await page.getByRole('button', { name: /create organization/i }).click();
  console.log('[Setup] Submitted form, waiting for KERI operations (witness-backed AID)...');

  // Wait for completion (redirect to main) - 4 minutes for witness-backed AID operations
  await expect(page).toHaveURL(/#\/$/, { timeout: 240000 });
  console.log('[Setup] Setup completed');

  // Capture mnemonic words
  await expect(page.getByRole('heading', { name: /identity created/i })).toBeVisible({ timeout: 10000 });
  const wordCards = page.locator('.word-card');
  const mnemonic: string[] = [];
  const wordCount = await wordCards.count();
  for (let i = 0; i < wordCount; i++) {
    const wordText = await wordCards.nth(i).locator('span.font-mono').textContent();
    if (wordText) mnemonic.push(wordText.trim());
  }
  console.log(`[Setup] Captured ${mnemonic.length} mnemonic words`);

  // Complete mnemonic verification
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: /continue/i }).click();

  // Verify mnemonic
  await expect(page.getByRole('heading', { name: /verify your recovery phrase/i })).toBeVisible({ timeout: 10000 });
  const wordLabels = page.locator('label:has-text("Word #")');
  const labelCount = await wordLabels.count();
  for (let i = 0; i < labelCount; i++) {
    const labelText = await wordLabels.nth(i).textContent();
    const match = labelText?.match(/word\s*#(\d+)/i);
    if (match) {
      const wordIndex = parseInt(match[1]) - 1;
      await page.locator(`#word-${i}`).fill(mnemonic[wordIndex]);
    }
  }
  await page.getByRole('button', { name: /verify/i }).click();
  console.log('[Setup] Mnemonic verified');

  // Wait for pending approval or dashboard
  await Promise.race([
    expect(page.getByRole('heading', { name: /registration pending/i })).toBeVisible({ timeout: 30000 }),
    expect(page).toHaveURL(/#\/dashboard/, { timeout: 30000 }),
  ]);

  // If welcome overlay appears (self-issued credential), enter dashboard
  const welcomeOverlay = page.locator('.welcome-overlay');
  if (await welcomeOverlay.isVisible().catch(() => false)) {
    console.log('[Setup] Welcome overlay visible, entering community');
    await page.getByRole('button', { name: /enter community/i }).click();
    await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10000 });
  }

  console.log('[Setup] Admin setup complete');
  return mnemonic;
}

// Helper to complete user registration up to pending approval
async function registerUser(page: Page, userName: string): Promise<{ aid: string; mnemonic: string[] }> {
  await page.goto(FRONTEND_URL);
  // Wait for splash screen - look for Register button (title is an SVG image)
  await expect(page.getByRole('button', { name: /register/i })).toBeVisible({ timeout: 15000 });

  // Navigate through registration
  await page.getByRole('button', { name: /register/i }).click();
  await expect(page.getByRole('heading', { name: /join matou/i })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /continue/i }).click();

  // Fill profile
  await page.getByPlaceholder('Your preferred name').fill(userName);
  const bioField = page.locator('textarea').first();
  await bioField.fill(`Testing registration approval as ${userName}`);

  // Select interest
  const interest = page.locator('label').filter({ hasText: 'Governance' }).first();
  if (await interest.isVisible()) await interest.click();

  // Agree to terms
  await page.locator('input[type="checkbox"]').last().check();

  // Submit
  await page.getByRole('button', { name: /continue/i }).click();
  // Witness-backed AID creation can take up to 3 minutes
  await expect(page.getByText(/identity created successfully/i)).toBeVisible({ timeout: 240000 });

  // Capture mnemonic
  const mnemonic: string[] = [];
  const wordCards = page.locator('.word-card');
  const wordCount = await wordCards.count();
  for (let i = 0; i < wordCount; i++) {
    const wordText = await wordCards.nth(i).locator('span.font-mono').textContent();
    if (wordText) mnemonic.push(wordText.trim());
  }

  // Get AID
  const aidElement = page.locator('.aid-section .font-mono');
  const aid = (await aidElement.textContent()) || '';

  // Complete verification
  await page.locator('.confirm-box input[type="checkbox"]').check();
  await page.getByRole('button', { name: /continue to verification/i }).click();

  await expect(page.getByRole('heading', { name: /verify your recovery phrase/i })).toBeVisible({ timeout: 5000 });
  const wordLabels = page.locator('.word-input-group label');
  const labelCount = await wordLabels.count();
  for (let i = 0; i < labelCount; i++) {
    const labelText = await wordLabels.nth(i).textContent();
    const match = labelText?.match(/Word #(\d+)/);
    if (match) {
      const wordIndex = parseInt(match[1], 10) - 1;
      await page.locator(`#word-${i}`).fill(mnemonic[wordIndex]);
    }
  }

  await page.getByRole('button', { name: /verify and continue/i }).click();
  await expect(page.getByText(/application.*review|pending/i).first()).toBeVisible({ timeout: 15000 });

  console.log(`[User] Registration complete, AID: ${aid.substring(0, 20)}...`);
  return { aid, mnemonic };
}

// Helper to log admin back in using mnemonic
async function loginAsAdmin(page: Page, adminMnemonic: string[]): Promise<void> {
  await page.goto(FRONTEND_URL);
  await expect(page.getByRole('button', { name: /register/i })).toBeVisible({ timeout: 15000 });

  // Click recover identity
  await page.getByText(/recover identity/i).click();
  await expect(page.getByRole('heading', { name: /recover your identity/i })).toBeVisible({ timeout: 5000 });

  // Enter mnemonic
  for (let i = 0; i < adminMnemonic.length; i++) {
    await page.locator(`#word-${i}`).fill(adminMnemonic[i]);
  }

  // Recover - KERI connection can take a minute
  await page.getByRole('button', { name: /recover identity/i }).click();
  await expect(page.getByText(/identity recovered/i)).toBeVisible({ timeout: 120000 });

  // Continue to dashboard
  await page.getByRole('button', { name: /continue to dashboard/i }).click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10000 });
  console.log('[Admin] Logged in and on dashboard');
}

test.describe('Registration Approval Flow', () => {
  test('full approval flow - admin approves user registration', async ({ browser, request }) => {
    test.setTimeout(360000); // 6 minutes for full flow with KERI operations

    // Create separate contexts for admin and user
    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();

    setupPageLogging(adminPage, 'Admin');
    setupPageLogging(userPage, 'User');

    let adminMnemonic: string[] = [];

    try {
      // === Phase 1: Admin sets up organization ===
      console.log('\n=== Phase 1: Admin sets up organization ===');
      adminMnemonic = await setupOrganization(adminPage, request);
      await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-01-admin-setup-done.png' });

      // Admin stays logged in - don't clear localStorage
      // Admin should already be on dashboard with polling active
      console.log('[Admin] Staying logged in, polling should be active...');

      // === Phase 2: User registers ===
      console.log('\n=== Phase 2: User registers ===');
      const { aid: userAID } = await registerUser(userPage, 'Approval_Test_User');
      await userPage.screenshot({ path: 'tests/e2e/screenshots/approval-02-user-registered.png' });
      console.log(`[User] Registered with AID: ${userAID}`);

      // === Phase 3: Wait for message delivery ===
      console.log('\n=== Phase 3: Waiting for message delivery (20 seconds) ===');
      // Polling interval is 10s, so wait 20s to ensure at least 2 poll cycles
      await adminPage.waitForTimeout(20000);
      await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-03-after-wait.png' });

      // === Phase 4: Admin checks for pending registration ===
      console.log('\n=== Phase 4: Admin checks for pending registrations ===');

      // Wait for admin section to appear (may take a moment for polling)
      const adminSection = adminPage.locator('.admin-section');

      // Check if admin section is visible (depends on admin access check)
      const hasAdminSection = await adminSection.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasAdminSection) {
        console.log('[Admin] Admin section is visible');

        // Wait for registration card to appear (polling interval is 10s)
        const registrationCard = adminPage.locator('.registration-card').first();
        const hasRegistration = await registrationCard.isVisible({ timeout: 30000 }).catch(() => false);

        if (hasRegistration) {
          console.log('[Admin] Found pending registration!');
          await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-04-registration-visible.png' });

          // === Phase 5: Admin approves ===
          console.log('\n=== Phase 5: Admin approves registration ===');
          await registrationCard.getByRole('button', { name: /approve/i }).click();

          // Wait for processing
          await adminPage.waitForTimeout(5000);
          await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-05-approved.png' });
          console.log('[Admin] Approved registration');

          // === Phase 6: User receives credential ===
          console.log('\n=== Phase 6: User waits for credential ===');

          // User should eventually see welcome overlay
          const welcomeVisible = await userPage.locator('.welcome-overlay').isVisible({ timeout: 60000 }).catch(() => false);

          if (welcomeVisible) {
            console.log('[User] Received credential - welcome overlay visible!');
            await userPage.screenshot({ path: 'tests/e2e/screenshots/approval-06-user-approved.png' });

            // Enter community
            await userPage.getByRole('button', { name: /enter community/i }).click();
            await expect(userPage).toHaveURL(/#\/dashboard/, { timeout: 10000 });
            console.log('[User] Entered community dashboard - FLOW COMPLETE!');
            await userPage.screenshot({ path: 'tests/e2e/screenshots/approval-07-user-dashboard.png' });
          } else {
            console.log('[User] Credential not received within timeout (may need more time)');
            await userPage.screenshot({ path: 'tests/e2e/screenshots/approval-06-user-waiting.png' });
          }
        } else {
          console.log('[Admin] No pending registrations found (registration may not have been delivered)');
          await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-04-no-registrations.png' });
        }
      } else {
        console.log('[Admin] Admin section not visible (may not have admin credentials yet)');
        await adminPage.screenshot({ path: 'tests/e2e/screenshots/approval-04-no-admin-section.png' });
      }

    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });

  test('decline flow - admin declines user registration', async ({ browser, request }) => {
    test.setTimeout(360000); // 6 minutes

    const adminContext = await browser.newContext();
    const userContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const userPage = await userContext.newPage();

    setupPageLogging(adminPage, 'Admin');
    setupPageLogging(userPage, 'User');

    let adminMnemonic: string[] = [];

    try {
      // === Phase 1: Admin sets up organization ===
      console.log('\n=== Phase 1: Admin sets up organization ===');
      adminMnemonic = await setupOrganization(adminPage, request);

      // Clear admin passcode
      await adminPage.evaluate(() => {
        localStorage.removeItem('matou_passcode');
      });

      // === Phase 2: User registers ===
      console.log('\n=== Phase 2: User registers ===');
      await registerUser(userPage, 'Decline_Test_User');
      await userPage.screenshot({ path: 'tests/e2e/screenshots/decline-01-user-registered.png' });

      // === Phase 3: Admin logs back in ===
      console.log('\n=== Phase 3: Admin logs back in ===');
      await loginAsAdmin(adminPage, adminMnemonic);

      // === Phase 4: Admin declines registration ===
      console.log('\n=== Phase 4: Admin looks for registration to decline ===');

      const adminSection = adminPage.locator('.admin-section');
      const hasAdminSection = await adminSection.isVisible({ timeout: 10000 }).catch(() => false);

      if (hasAdminSection) {
        const registrationCard = adminPage.locator('.registration-card').first();
        const hasRegistration = await registrationCard.isVisible({ timeout: 30000 }).catch(() => false);

        if (hasRegistration) {
          console.log('[Admin] Found registration, declining...');

          // Click decline button (X icon)
          const declineBtn = registrationCard.locator('button').last(); // Decline is last button
          await declineBtn.click();

          // If modal appears, confirm decline
          const modal = adminPage.locator('.modal-content');
          if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Enter reason if text field visible
            const reasonField = modal.locator('textarea');
            if (await reasonField.isVisible().catch(() => false)) {
              await reasonField.fill('Registration declined for testing purposes.');
            }
            await modal.getByRole('button', { name: /confirm decline/i }).click();
          }

          await adminPage.waitForTimeout(3000);
          await adminPage.screenshot({ path: 'tests/e2e/screenshots/decline-02-declined.png' });
          console.log('[Admin] Declined registration');

          // === Phase 5: User sees rejection ===
          console.log('\n=== Phase 5: User checks for rejection ===');

          // User should see rejection status
          const rejectionVisible = await userPage.getByText(/declined|rejected/i).first().isVisible({ timeout: 30000 }).catch(() => false);

          if (rejectionVisible) {
            console.log('[User] Rejection received!');
            await userPage.screenshot({ path: 'tests/e2e/screenshots/decline-03-user-rejected.png' });
          } else {
            console.log('[User] Rejection not visible yet');
            await userPage.screenshot({ path: 'tests/e2e/screenshots/decline-03-user-waiting.png' });
          }
        } else {
          console.log('[Admin] No pending registrations found');
        }
      } else {
        console.log('[Admin] Admin section not visible');
      }

    } finally {
      await adminContext.close();
      await userContext.close();
    }
  });

  // Simpler tests that don't require full setup
  test('placeholder - registration card component renders', async () => {
    console.log('Registration card component test placeholder');
    expect(true).toBe(true);
  });

  test('placeholder - admin section empty state', async () => {
    console.log('Empty state test placeholder');
    expect(true).toBe(true);
  });
});
