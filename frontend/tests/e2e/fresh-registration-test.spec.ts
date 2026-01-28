import { test, expect, Page, BrowserContext } from '@playwright/test';
import { setupTestConfig, clearTestConfig } from './utils/mock-config';

/**
 * Fresh Registration Test - No Persisted State
 *
 * This test creates everything from scratch:
 * 1. Clears any existing TEST config (dev config is preserved)
 * 2. Creates a new admin/org
 * 3. Creates a new user
 * 4. User sends registration
 * 5. Checks if admin receives it
 *
 * Uses X-Test-Config header to isolate test data from development config.
 *
 * Run: npx playwright test tests/e2e/fresh-registration-test.spec.ts --project=chromium --headed
 */

const FRONTEND_URL = 'http://localhost:9002';

// 5 minute timeout for the whole test
test.setTimeout(300000);

function setupPageLogging(page: Page, prefix: string) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Registration') || text.includes('Admin') ||
        text.includes('Credential') || text.includes('IPEX') ||
        text.includes('KERIClient') || text.includes('Polling') ||
        text.includes('Error') || text.includes('Notification') ||
        msg.type() === 'error') {
      console.log(`[${prefix}] ${text}`);
    }
  });
}

test('fresh registration flow - no persisted state', async ({ browser, request }) => {
  // === Step 1: Clear existing TEST config (dev config preserved) ===
  console.log('\n=== Step 1: Clear existing test config ===');
  await clearTestConfig(request);

  // === Step 2: Create Admin and Organization ===
  console.log('\n=== Step 2: Create Admin and Organization ===');

  const adminContext = await browser.newContext();
  // Setup test config isolation - all config requests use test config file
  await setupTestConfig(adminContext);
  const adminPage = await adminContext.newPage();
  setupPageLogging(adminPage, 'Admin');

  await adminPage.goto(FRONTEND_URL);
  await adminPage.evaluate(() => localStorage.clear());

  await adminPage.goto(`${FRONTEND_URL}/#/setup`);
  await adminPage.waitForLoadState('networkidle');
  await expect(adminPage.getByRole('heading', { name: /community setup/i })).toBeVisible({ timeout: 15000 });

  // Fill form
  await adminPage.locator('input').first().fill('Fresh Test Community');
  await adminPage.locator('input').nth(1).fill('Fresh Admin');

  // Submit and wait for KERI operations
  await adminPage.getByRole('button', { name: /create organization/i }).click();
  console.log('[Test] Creating admin identity (this takes 2-3 minutes)...');

  await expect(adminPage).toHaveURL(/#\/$/, { timeout: 240000 });
  console.log('[Test] Admin identity created');

  // Capture admin mnemonic
  await expect(adminPage.getByRole('heading', { name: /identity created/i })).toBeVisible({ timeout: 10000 });
  const adminMnemonic: string[] = [];
  const wordCards = adminPage.locator('.word-card');
  const wordCount = await wordCards.count();
  for (let i = 0; i < wordCount; i++) {
    const wordText = await wordCards.nth(i).locator('span.font-mono').textContent();
    if (wordText) adminMnemonic.push(wordText.trim());
  }
  console.log(`[Test] Captured admin mnemonic (${adminMnemonic.length} words)`);

  // Complete mnemonic verification
  await adminPage.getByRole('checkbox').click();
  await adminPage.getByRole('button', { name: /continue/i }).click();

  await expect(adminPage.getByRole('heading', { name: /verify your recovery phrase/i })).toBeVisible({ timeout: 10000 });
  const wordLabels = adminPage.locator('label:has-text("Word #")');
  const labelCount = await wordLabels.count();
  for (let i = 0; i < labelCount; i++) {
    const labelText = await wordLabels.nth(i).textContent();
    const match = labelText?.match(/word\s*#(\d+)/i);
    if (match) {
      const wordIndex = parseInt(match[1]) - 1;
      await adminPage.locator(`#word-${i}`).fill(adminMnemonic[wordIndex]);
    }
  }
  await adminPage.getByRole('button', { name: /verify/i }).click();

  // Wait for dashboard
  await Promise.race([
    expect(adminPage.getByRole('heading', { name: /registration pending/i })).toBeVisible({ timeout: 30000 }),
    expect(adminPage).toHaveURL(/#\/dashboard/, { timeout: 30000 }),
  ]);

  // Handle welcome overlay if present
  const welcomeOverlay = adminPage.locator('.welcome-overlay');
  if (await welcomeOverlay.isVisible().catch(() => false)) {
    await adminPage.getByRole('button', { name: /enter community/i }).click();
    await expect(adminPage).toHaveURL(/#\/dashboard/, { timeout: 10000 });
  }

  console.log('[Test] Admin on dashboard');

  // Check if admin section is visible (proves admin has admin credential)
  const adminSection = adminPage.locator('.admin-section');
  const hasAdminSection = await adminSection.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`[Test] Admin section visible: ${hasAdminSection}`);

  // === Step 3: Create User and Register ===
  console.log('\n=== Step 3: Create User and Register ===');

  const userContext = await browser.newContext();
  // Setup test config isolation for user context too
  await setupTestConfig(userContext);
  const userPage = await userContext.newPage();
  setupPageLogging(userPage, 'User');

  const userName = `FreshUser_${Date.now().toString(36).slice(-6)}`;

  await userPage.goto(FRONTEND_URL);
  await expect(userPage.getByRole('button', { name: /register/i })).toBeVisible({ timeout: 15000 });

  // Start registration
  await userPage.getByRole('button', { name: /register/i }).click();
  await expect(userPage.getByRole('heading', { name: /join matou/i })).toBeVisible({ timeout: 10000 });
  await userPage.getByRole('button', { name: /continue/i }).click();

  // Fill profile
  await userPage.getByPlaceholder('Your preferred name').fill(userName);
  await userPage.locator('textarea').first().fill(`Fresh test user: ${userName}`);
  const interest = userPage.locator('label').filter({ hasText: 'Governance' }).first();
  if (await interest.isVisible()) await interest.click();
  await userPage.locator('input[type="checkbox"]').last().check();

  // Submit - creates AID
  await userPage.getByRole('button', { name: /continue/i }).click();
  console.log(`[Test] Creating user identity for ${userName}...`);
  await expect(userPage.getByText(/identity created successfully/i)).toBeVisible({ timeout: 180000 });
  console.log('[Test] User identity created');

  // Capture user mnemonic
  const userMnemonic: string[] = [];
  const userWordCards = userPage.locator('.word-card');
  const userWordCount = await userWordCards.count();
  for (let i = 0; i < userWordCount; i++) {
    const wordText = await userWordCards.nth(i).locator('span.font-mono').textContent();
    if (wordText) userMnemonic.push(wordText.trim());
  }

  // Complete verification
  await userPage.locator('.confirm-box input[type="checkbox"]').check();
  await userPage.getByRole('button', { name: /continue to verification/i }).click();

  await expect(userPage.getByRole('heading', { name: /verify your recovery phrase/i })).toBeVisible({ timeout: 10000 });
  const userWordLabels = userPage.locator('.word-input-group label');
  const userLabelCount = await userWordLabels.count();
  for (let i = 0; i < userLabelCount; i++) {
    const labelText = await userWordLabels.nth(i).textContent();
    const match = labelText?.match(/Word #(\d+)/);
    if (match) {
      const wordIndex = parseInt(match[1], 10) - 1;
      await userPage.locator(`#word-${i}`).fill(userMnemonic[wordIndex]);
    }
  }

  await userPage.getByRole('button', { name: /verify and continue/i }).click();
  await expect(userPage.getByText(/application.*review|pending|under review/i).first()).toBeVisible({ timeout: 60000 });
  console.log('[Test] User registration submitted, on pending screen');

  // === Step 4: Wait for admin to see registration ===
  console.log('\n=== Step 4: Check if admin sees registration ===');

  // Give some time for the message to be delivered
  console.log('[Test] Waiting 30 seconds for registration to propagate...');
  await adminPage.waitForTimeout(30000);

  // Check admin's notification count
  const adminSectionAfter = adminPage.locator('.admin-section');
  const isAdminSectionVisible = await adminSectionAfter.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`[Test] Admin section visible after wait: ${isAdminSectionVisible}`);

  // Look for any registration card
  const registrationCards = adminPage.locator('.registration-card');
  const cardCount = await registrationCards.count();
  console.log(`[Test] Registration cards found: ${cardCount}`);

  // Look specifically for the new user's registration
  const newUserCard = adminPage.locator('.registration-card').filter({ hasText: userName });
  const newUserVisible = await newUserCard.isVisible({ timeout: 5000 }).catch(() => false);
  console.log(`[Test] New user (${userName}) registration visible: ${newUserVisible}`);

  // List all card names for debugging
  for (let i = 0; i < cardCount; i++) {
    const card = registrationCards.nth(i);
    const cardText = await card.textContent();
    console.log(`[Test] Card ${i}: ${cardText?.substring(0, 100)}...`);
  }

  // === Step 5: Report results ===
  console.log('\n=== Results ===');
  if (newUserVisible) {
    console.log('[Test] SUCCESS: Admin can see the new user registration!');

    // Try to approve
    console.log('[Test] Attempting to approve...');
    await newUserCard.getByRole('button', { name: /approve/i }).click();

    // Wait for user to receive credential
    await expect(userPage.locator('.welcome-overlay')).toBeVisible({ timeout: 60000 });
    console.log('[Test] User received credential!');

    // Mark test as passed
    expect(newUserVisible).toBe(true);
  } else {
    console.log('[Test] FAILURE: Admin cannot see the new user registration');
    console.log('[Test] This indicates messages are not being delivered between agents');

    // Take screenshots for debugging
    await adminPage.screenshot({ path: 'test-results/fresh-test-admin.png' });
    await userPage.screenshot({ path: 'test-results/fresh-test-user.png' });

    // Fail the test with descriptive message
    expect(newUserVisible, `Registration from ${userName} should be visible to admin`).toBe(true);
  }

  // Cleanup
  await adminContext.close();
  await userContext.close();
});
