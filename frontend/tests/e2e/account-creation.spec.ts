import { test, expect } from '@playwright/test';

/**
 * E2E Test: Account Creation with Witness-backed AID
 *
 * This test bypasses the org config check and directly tests
 * creating a KERI identity with witness backing.
 *
 * Prerequisites:
 * - KERIA running: cd infrastructure/keri && docker compose up -d
 * - Frontend running: cd frontend && npm run dev
 *
 * Run: npx playwright test tests/e2e/account-creation.spec.ts
 */

const FRONTEND_URL = 'http://localhost:9002';

test.describe('Account Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Log console messages
    page.on('console', (msg) => {
      const text = msg.text();
      // Filter for relevant messages
      if (text.includes('[KERIClient]') || text.includes('[OrgSetup]') ||
          text.includes('[IdentityStore]') || text.includes('AID') ||
          text.includes('witness') || text.includes('Witness')) {
        console.log(`[Browser] ${text}`);
      }
    });

    // Log failed requests
    page.on('requestfailed', (request) => {
      console.log(`[FAILED] ${request.method()} ${request.url()}`);
    });
  });

  test('create witness-backed AID', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for witness operations

    // Step 1: Bypass config check by mocking the API response
    await page.route('**/api/config', async (route) => {
      // Return a mock "configured" response so the app doesn't redirect to setup
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organization: {
            aid: 'EMockOrgAID123456789012345678901234567890123',
            name: 'Test Org',
            oobi: 'http://localhost:3902/oobi/EMockOrgAID123456789012345678901234567890123',
          },
          admins: [
            {
              aid: 'EMockAdminAID12345678901234567890123456789012',
              name: 'Test Admin',
              oobi: 'http://localhost:3902/oobi/EMockAdminAID12345678901234567890123456789012',
            },
          ],
          registry: {
            id: 'EMockRegistry1234567890123456789012345678901234',
            name: 'test-registry',
          },
          generated: new Date().toISOString(),
        }),
      });
    });

    // Step 2: Clear any existing passcode
    await page.goto(FRONTEND_URL);
    await page.evaluate(() => {
      localStorage.removeItem('matou_passcode');
      localStorage.removeItem('matou_admin_aid');
      localStorage.removeItem('matou_org_aid');
    });
    await page.reload();

    // Step 3: Navigate to registration
    console.log('Navigating to registration...');
    await expect(page.getByRole('button', { name: /register/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /register/i }).click();

    // Continue through info screen
    await expect(page.getByRole('heading', { name: 'Join Matou' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 4: Fill profile form
    console.log('Filling profile form...');
    await expect(page.getByRole('heading', { name: 'Create Your Profile' })).toBeVisible({ timeout: 5000 });

    await page.getByPlaceholder('Your preferred name').fill('Witness_Test_User');
    const bioField = page.locator('textarea').first();
    await bioField.fill('Testing witness-backed AID creation');

    // Agree to terms
    const termsCheckbox = page.locator('input[type="checkbox"]').last();
    await termsCheckbox.check();

    // Step 5: Submit form - this triggers AID creation
    console.log('Submitting form to create witness-backed AID...');
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 6: Wait for AID creation
    console.log('Waiting for AID creation (this may take a while with witnesses)...');

    // Monitor for the loading overlay messages
    const loadingOverlay = page.locator('.loading-overlay');
    if (await loadingOverlay.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Loading overlay visible');

      // Log loading state changes
      const checkLoadingText = async () => {
        const textEl = page.locator('.loading-overlay .text-lg, .loading-overlay h3').first();
        if (await textEl.isVisible().catch(() => false)) {
          const text = await textEl.textContent();
          console.log(`Loading state: ${text}`);
        }
      };

      // Check periodically
      for (let i = 0; i < 60; i++) {
        await checkLoadingText();
        await page.waitForTimeout(5000);

        // Check if we've moved past loading
        if (!(await loadingOverlay.isVisible().catch(() => false))) {
          console.log('Loading overlay dismissed');
          break;
        }
      }
    }

    // Step 7: Verify success - should show "Identity Created Successfully"
    try {
      await expect(page.getByText(/identity created successfully/i)).toBeVisible({ timeout: 180000 });
      console.log('SUCCESS: Identity created with witness backing!');

      // Verify mnemonic is displayed
      const mnemonicWords = page.locator('.word-card');
      const wordCount = await mnemonicWords.count();
      console.log(`Mnemonic words displayed: ${wordCount}`);
      expect(wordCount).toBe(12);

      // Extract AID
      const aidSection = page.locator('.aid-section .font-mono');
      if (await aidSection.isVisible().catch(() => false)) {
        const aid = await aidSection.textContent();
        console.log(`Created AID: ${aid}`);
      }

      await page.screenshot({ path: 'tests/e2e/screenshots/account-creation-success.png' });

    } catch (error) {
      // Check for error state
      console.log('Checking for error state...');
      await page.screenshot({ path: 'tests/e2e/screenshots/account-creation-error.png' });

      const errorCard = page.locator('.error-card').first();
      if (await errorCard.isVisible().catch(() => false)) {
        const errorText = await errorCard.textContent();
        console.log(`ERROR: ${errorText}`);
      }

      throw error;
    }
  });

  test('create AID without witnesses (baseline)', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    // This test creates an AID without witnesses to establish a baseline
    // We need to temporarily modify the code or use a different approach

    // For now, skip this test - it's mainly for comparison
    test.skip();
  });
});
