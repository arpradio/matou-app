import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { setupTestConfig, clearTestConfig, hasTestConfig } from './utils/mock-config';

/**
 * Setup Script: Create Admin and Organization
 *
 * Run this ONCE to create admin account and org for testing.
 * Only admin credentials are saved - users are created fresh each test.
 * Uses test config isolation (X-Test-Config header) to preserve dev config.
 *
 * Run: npx playwright test tests/e2e/setup-test-accounts.spec.ts --project=chromium
 */

const FRONTEND_URL = 'http://localhost:9002';
const ACCOUNTS_FILE = path.join(__dirname, 'test-accounts.json');

interface TestAccounts {
  note: string;
  admin: {
    mnemonic: string[];
    aid: string;
    name: string;
  } | null;
  createdAt: string | null;
}

function saveAccounts(accounts: TestAccounts): void {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  console.log(`[Setup] Saved accounts to ${ACCOUNTS_FILE}`);
}

function setupPageLogging(page: Page, prefix: string) {
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('OrgSetup') || text.includes('KERIClient') ||
        text.includes('Credential') || text.includes('Error') ||
        msg.type() === 'error') {
      console.log(`[${prefix}] ${text}`);
    }
  });
}

test.describe('Setup Test Accounts', () => {
  test('create admin and organization', async ({ browser, request }) => {
    test.setTimeout(300000); // 5 minutes for setup

    // Check if already set up
    const existingConfig = await hasTestConfig(request);
    const accountsExist = fs.existsSync(ACCOUNTS_FILE);

    if (existingConfig && accountsExist) {
      console.log('[Setup] Test config and accounts already exist - skipping setup');
      console.log('[Setup] To force re-setup, delete test-accounts.json or clear test config');
      return;
    }

    // === Step 1: Clear existing test config ===
    console.log('\n=== Step 1: Clear existing test config ===');
    await clearTestConfig(request);

    // === Step 2: Setup Admin Organization ===
    console.log('\n=== Step 2: Setup Admin Organization ===');

    // Create context with test config isolation
    const context = await browser.newContext();
    await setupTestConfig(context);
    const page = await context.newPage();
    setupPageLogging(page, 'Setup');

    await page.goto(FRONTEND_URL);
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${FRONTEND_URL}/#/setup`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /community setup/i })).toBeVisible({ timeout: 15000 });

    // Fill form
    await page.locator('input').first().fill('Test Community');
    await page.locator('input').nth(1).fill('Test Admin');

    // Submit and wait for KERI operations
    await page.getByRole('button', { name: /create organization/i }).click();
    console.log('[Setup] Creating admin identity (this takes 2-3 minutes)...');

    await expect(page).toHaveURL(/#\/$/, { timeout: 240000 });
    console.log('[Setup] Admin identity created');

    // Capture admin mnemonic
    await expect(page.getByRole('heading', { name: /identity created/i })).toBeVisible({ timeout: 10000 });
    const adminMnemonic: string[] = [];
    const wordCards = page.locator('.word-card');
    const wordCount = await wordCards.count();
    for (let i = 0; i < wordCount; i++) {
      const wordText = await wordCards.nth(i).locator('span.font-mono').textContent();
      if (wordText) adminMnemonic.push(wordText.trim());
    }
    console.log(`[Setup] Captured admin mnemonic (${adminMnemonic.length} words)`);

    // Get admin AID
    const adminAid = await page.evaluate(() => {
      const stored = localStorage.getItem('matou_current_aid');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.prefix || parsed.aid || '';
      }
      return '';
    });

    // Complete mnemonic verification
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByRole('heading', { name: /verify your recovery phrase/i })).toBeVisible({ timeout: 10000 });
    const wordLabels = page.locator('label:has-text("Word #")');
    const labelCount = await wordLabels.count();
    for (let i = 0; i < labelCount; i++) {
      const labelText = await wordLabels.nth(i).textContent();
      const match = labelText?.match(/word\s*#(\d+)/i);
      if (match) {
        const wordIndex = parseInt(match[1]) - 1;
        await page.locator(`#word-${i}`).fill(adminMnemonic[wordIndex]);
      }
    }
    await page.getByRole('button', { name: /verify/i }).click();

    // Wait for dashboard
    await Promise.race([
      expect(page.getByRole('heading', { name: /registration pending/i })).toBeVisible({ timeout: 30000 }),
      expect(page).toHaveURL(/#\/dashboard/, { timeout: 30000 }),
    ]);

    // Handle welcome overlay if present
    const welcomeOverlay = page.locator('.welcome-overlay');
    if (await welcomeOverlay.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /enter community/i }).click();
      await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10000 });
    }

    // Save admin account
    const accounts: TestAccounts = {
      note: 'Auto-generated by setup-test-accounts.spec.ts. Only admin/org is persisted.',
      admin: {
        mnemonic: adminMnemonic,
        aid: adminAid,
        name: 'Test Admin',
      },
      createdAt: new Date().toISOString(),
    };
    saveAccounts(accounts);

    console.log('\n=== Setup Complete ===');
    console.log(`Admin AID: ${adminAid}`);
    console.log(`Accounts saved to: ${ACCOUNTS_FILE}`);
    console.log('Test config persisted for registration-approval tests');

    await context.close();
  });
});
