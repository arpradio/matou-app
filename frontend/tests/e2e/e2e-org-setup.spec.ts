import { test, expect } from '@playwright/test';
import { keriEndpoints, requireKERINetwork, checkServiceHealth } from './utils/keri-testnet';
import { setupTestConfig, clearTestConfig } from './utils/mock-config';
import {
  FRONTEND_URL,
  BACKEND_URL,
  CONFIG_SERVER_URL,
  TIMEOUT,
  setupPageLogging,
  captureMnemonicWords,
  completeMnemonicVerification,
  saveAccounts,
  TestAccounts,
} from './utils/test-helpers';

/**
 * E2E: Organization Setup
 *
 * Creates and persists admin + org accounts + community space.
 * Saves admin credentials to test-accounts.json for use by registration tests.
 *
 * Run: npx playwright test --project=org-setup
 */

test.describe.serial('Organization Setup', () => {
  test.beforeAll(() => {
    requireKERINetwork();
  });

  test.beforeEach(async ({ page }) => {
    setupPageLogging(page, 'OrgSetup');
  });

  // ------------------------------------------------------------------
  // Test 1: Health checks
  // ------------------------------------------------------------------
  test('all services are reachable', async () => {
    const health = await checkServiceHealth();
    console.log('Service health:', health);

    const keriServices = ['keria', 'boot', 'config', 'schema'] as const;
    const keriDown = keriServices.filter(s => !health[s]);
    if (keriDown.length > 0) {
      throw new Error(
        `KERI services not reachable: ${keriDown.join(', ')}\n` +
        'Start the KERI test infrastructure:\n' +
        '  cd infrastructure/keri-test && make up',
      );
    }

    if (!health.backend) {
      throw new Error(
        'Backend API not reachable at http://localhost:9080\n' +
        'Start the backend in test mode:\n' +
        '  cd backend && make run-test',
      );
    }
  });

  // ------------------------------------------------------------------
  // Test 2: Browser can access KERIA (CORS)
  // ------------------------------------------------------------------
  test('browser can access KERIA (CORS)', async ({ page }) => {
    test.setTimeout(TIMEOUT.medium);

    await page.goto(FRONTEND_URL);

    const corsResult = await page.evaluate(async ({ adminUrl, bootUrl }) => {
      const urls = [`${adminUrl}/`, `${bootUrl}/boot`];
      const results: Array<{ url: string; status?: number; ok?: boolean; error?: string }> = [];

      for (const url of urls) {
        try {
          const response = await fetch(url, { method: 'GET' });
          results.push({ url, status: response.status, ok: response.ok });
        } catch (error) {
          results.push({ url, error: String(error) });
        }
      }
      return results;
    }, { adminUrl: keriEndpoints.adminURL, bootUrl: keriEndpoints.bootURL });

    console.log('CORS test results:');
    for (const result of corsResult) {
      console.log(`  ${result.url}: ${result.error || `${result.status}`}`);
    }

    const hasCorsError = corsResult.some(r => r.error?.includes('NetworkError'));
    expect(hasCorsError, 'Browser should be able to reach KERIA (no CORS block)').toBe(false);
  });

  // ------------------------------------------------------------------
  // Test 3: Admin creates organization
  // ------------------------------------------------------------------
  test('admin creates organization', async ({ browser, request }) => {
    test.setTimeout(TIMEOUT.orgSetup);

    // --- Clear test config ---
    await clearTestConfig(request);

    // --- Setup browser context with test config isolation ---
    const context = await browser.newContext();
    await setupTestConfig(context);
    const page = await context.newPage();
    setupPageLogging(page, 'Admin');

    try {
      // Clear localStorage
      await page.goto(FRONTEND_URL);
      await page.evaluate(() => localStorage.clear());

      // Navigate to setup page
      await page.goto(`${FRONTEND_URL}/#/setup`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /community setup/i })).toBeVisible({ timeout: TIMEOUT.short });

      // Fill form
      await page.locator('input').first().fill('Matou Community');
      await page.locator('input').nth(1).fill('Admin User');

      // Submit and wait for KERI operations
      await page.getByRole('button', { name: /create organization/i }).click();
      console.log('[Test] Creating admin identity...');

      await expect(page).toHaveURL(/#\/$/, { timeout: TIMEOUT.orgSetup });
      console.log('[Test] Admin identity created, redirected');

      // --- Mnemonic capture ---
      await expect(page.getByRole('heading', { name: /identity created/i })).toBeVisible({ timeout: TIMEOUT.short });
      const adminMnemonic = await captureMnemonicWords(page);
      console.log(`[Test] Captured admin mnemonic (${adminMnemonic.length} words)`);
      expect(adminMnemonic).toHaveLength(12);

      // Get admin AID from localStorage
      const adminAid = await page.evaluate(() => {
        const stored = localStorage.getItem('matou_current_aid');
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed.prefix || parsed.aid || '';
        }
        return '';
      });

      // --- Complete mnemonic verification ---
      await page.getByRole('checkbox').click();
      await page.getByRole('button', { name: /continue/i }).click();
      await completeMnemonicVerification(page, adminMnemonic);

      // Wait for dashboard or pending
      await Promise.race([
        expect(page.getByRole('heading', { name: /registration pending/i })).toBeVisible({ timeout: TIMEOUT.long }),
        expect(page).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.long }),
      ]);

      // Handle welcome overlay if present
      const welcomeOverlay = page.locator('.welcome-overlay');
      if (await welcomeOverlay.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: /enter community/i }).click();
        await expect(page).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.short });
      }

      console.log('[Test] Admin on dashboard');

      // --- Verify config saved to server ---
      // Use X-Test-Config header so we read the test config file, not dev config
      const configResponse = await request.get(`${CONFIG_SERVER_URL}/api/config`, {
        headers: { 'X-Test-Config': 'true' },
      });
      expect(configResponse.ok()).toBe(true);

      const config = await configResponse.json();
      expect(config.organization).toBeDefined();
      expect(config.organization.aid).toBeTruthy();
      expect(config.organization.name).toBe('Matou Community');
      expect(config.admin).toBeDefined();
      expect(config.admin.aid).toBeTruthy();
      expect(config.registry).toBeDefined();
      expect(config.registry.id).toBeTruthy();
      console.log('[Test] Config verified on server');

      // --- Save admin account for registration tests ---
      const accounts: TestAccounts = {
        note: 'Auto-generated by e2e-org-setup.spec.ts. Only admin/org is persisted.',
        admin: {
          mnemonic: adminMnemonic,
          aid: adminAid,
          name: 'Admin User',
        },
        createdAt: new Date().toISOString(),
      };
      saveAccounts(accounts);
      console.log(`[Test] Admin AID: ${adminAid}`);
    } finally {
      await context.close();
    }
  });

  // ------------------------------------------------------------------
  // Test 4: Community space created
  // ------------------------------------------------------------------
  test('community space created', async ({ request }) => {
    test.setTimeout(TIMEOUT.long);

    // Verify org config exists (use test config header)
    const configResponse = await request.get(`${CONFIG_SERVER_URL}/api/config`, {
      headers: { 'X-Test-Config': 'true' },
    });
    expect(configResponse.ok(), 'Org config must exist (admin creates organization must pass first)').toBe(true);

    const config = await configResponse.json();
    expect(config.organization).toBeDefined();
    expect(config.organization.aid).toBeTruthy();

    // Backend must be reachable (already verified in health check, but confirm)
    const healthResponse = await request.get(`${BACKEND_URL}/health`);
    expect(healthResponse.ok(), 'Backend must be reachable for space creation').toBe(true);

    // Create community space — must succeed
    const communityResponse = await request.post(`${BACKEND_URL}/api/v1/spaces/community`, {
      data: {
        orgAid: config.organization.aid,
        orgName: config.organization.name || 'Matou Community',
      },
    });
    expect(communityResponse.ok(), `Community space creation failed: ${communityResponse.status()}`).toBe(true);

    const communityBody = await communityResponse.json();
    expect(communityBody.spaceId).toBeTruthy();
    expect(communityBody.success).toBe(true);
    console.log('Community space created:', communityBody.spaceId);

    // Create admin private space — must succeed
    const adminAid = config.admin?.aid || config.admins?.[0]?.aid;
    expect(adminAid, 'Admin AID must exist in config').toBeTruthy();

    const privateResponse = await request.post(`${BACKEND_URL}/api/v1/spaces/private`, {
      data: { userAid: adminAid },
    });
    expect(privateResponse.ok(), `Admin private space creation failed: ${privateResponse.status()}`).toBe(true);

    const privateBody = await privateResponse.json();
    expect(privateBody.spaceId).toBeTruthy();
    expect(privateBody.success).toBe(true);
    console.log('Admin private space created:', privateBody.spaceId);
  });
});
