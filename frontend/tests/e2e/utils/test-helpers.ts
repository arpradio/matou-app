/**
 * Shared test helpers for E2E tests.
 *
 * Extracts common patterns from individual test files to reduce duplication:
 * - Page logging setup
 * - Mnemonic capture and verification
 * - Profile form filling
 * - Full registration flow
 * - Admin login via mnemonic recovery
 * - Test account persistence
 */
import { expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { keriEndpoints } from './keri-testnet';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Uses Playwright baseURL from playwright.config.ts (test server on port 9003) */
export const FRONTEND_URL = '';

/** Backend API base URL (test server runs on port 9080) */
export const BACKEND_URL = 'http://localhost:9080';

/** Config server URL from KERI test network */
export const CONFIG_SERVER_URL = keriEndpoints.configURL;

/** Timeouts for individual operations */
export const TIMEOUT = {
  short: 10_000,       // 10s - quick UI operations
  medium: 20_000,      // 20s - simple KERI operations, polling
  long: 30_000,        // 30s - credential delivery
  aidCreation: 60_000,  // 1 min - witness-backed AID creation
  orgSetup: 120_000,   // 2 min - full org setup
} as const;

// ---------------------------------------------------------------------------
// Test account persistence
// ---------------------------------------------------------------------------

const ACCOUNTS_FILE = path.join(__dirname, '..', 'test-accounts.json');

export interface TestAccounts {
  note: string;
  admin: {
    mnemonic: string[];
    aid: string;
    name: string;
  } | null;
  createdAt: string | null;
}

export function loadAccounts(): TestAccounts {
  const data = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
  return JSON.parse(data);
}

export function saveAccounts(accounts: TestAccounts): void {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  console.log(`[Helpers] Saved accounts to ${ACCOUNTS_FILE}`);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Generate a unique suffix for test usernames to avoid stale registration conflicts */
export function uniqueSuffix(): string {
  return Date.now().toString(36).slice(-6);
}

// ---------------------------------------------------------------------------
// Page logging
// ---------------------------------------------------------------------------

/**
 * Attach filtered console + network logging to a page.
 * Filters for KERI, registration, credential, and error messages.
 */
export function setupPageLogging(page: Page, prefix: string): void {
  page.on('console', (msg) => {
    const text = msg.text();
    if (
      text.includes('Registration') || text.includes('Admin') ||
      text.includes('Credential') || text.includes('IPEX') ||
      text.includes('KERIClient') || text.includes('Polling') ||
      text.includes('OrgSetup') || text.includes('Config') ||
      text.includes('Error') || msg.type() === 'error'
    ) {
      console.log(`[${prefix}] ${text}`);
    }
  });

  page.on('requestfailed', (request) => {
    console.log(`[${prefix} FAILED] ${request.method()} ${request.url()}`);
  });
}

// ---------------------------------------------------------------------------
// Mnemonic helpers
// ---------------------------------------------------------------------------

/**
 * Extract all 12 mnemonic words from `.word-card` elements on the
 * profile-confirmation screen.
 */
export async function captureMnemonicWords(page: Page): Promise<string[]> {
  const words: string[] = [];
  const wordCards = page.locator('.word-card');
  const count = await wordCards.count();
  for (let i = 0; i < count; i++) {
    const wordText = await wordCards.nth(i).locator('span.font-mono').textContent();
    if (wordText) words.push(wordText.trim());
  }
  return words;
}

/**
 * Complete the mnemonic verification step.
 *
 * Fills in the "Word #N" inputs with the correct words from `mnemonic`,
 * then clicks the verify button.
 *
 * @param buttonName - regex for the verify button label (default: /verify/i)
 */
export async function completeMnemonicVerification(
  page: Page,
  mnemonic: string[],
  buttonName: RegExp = /verify/i,
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /verify your recovery phrase/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });

  const wordLabels = page.locator('.word-input-group label, label:has-text("Word #")');
  const labelCount = await wordLabels.count();

  for (let i = 0; i < labelCount; i++) {
    const labelText = await wordLabels.nth(i).textContent();
    const match = labelText?.match(/word\s*#(\d+)/i);
    if (match) {
      const wordIndex = parseInt(match[1], 10) - 1;
      await page.locator(`#word-${i}`).fill(mnemonic[wordIndex]);
    }
  }

  const verifyBtn = page.getByRole('button', { name: buttonName });
  await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
  await verifyBtn.click();
}

// ---------------------------------------------------------------------------
// Profile form helpers
// ---------------------------------------------------------------------------

/**
 * Fill the "Create Your Profile" form fields.
 */
export async function fillProfileForm(
  page: Page,
  name: string,
  bio?: string,
): Promise<void> {
  await page.getByPlaceholder('Your preferred name').fill(name);

  const bioField = page.locator('textarea').first();
  await bioField.fill(bio ?? `E2E test user: ${name}`);

  // Select an interest if available
  const interest = page.locator('label').filter({ hasText: 'Governance' }).first();
  if (await interest.isVisible()) await interest.click();

  // Agree to terms
  await page.locator('input[type="checkbox"]').last().check();
}

/**
 * Navigate from splash screen to the profile form:
 * Splash -> Register -> Join Matou -> Profile form.
 */
export async function navigateToProfileForm(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: /register/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });
  await page.getByRole('button', { name: /register/i }).click();

  await expect(
    page.getByRole('heading', { name: /join matou/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });
  await page.getByRole('button', { name: /continue/i }).click();

  await expect(
    page.getByRole('heading', { name: /create your profile/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });
}

// ---------------------------------------------------------------------------
// Composite flows
// ---------------------------------------------------------------------------

/**
 * Full user registration flow: navigate -> fill form -> submit -> capture
 * mnemonic -> verify -> land on pending screen.
 *
 * Returns the captured mnemonic words.
 */
export async function registerUser(
  page: Page,
  userName: string,
): Promise<{ mnemonic: string[] }> {
  await page.goto(FRONTEND_URL);
  await navigateToProfileForm(page);
  await fillProfileForm(page, userName);

  // Submit - creates AID (witness-backed AIDs can take up to 3 minutes)
  await page.getByRole('button', { name: /continue/i }).click();
  console.log(`[${userName}] Creating identity...`);
  await expect(
    page.getByText(/identity created successfully/i),
  ).toBeVisible({ timeout: TIMEOUT.aidCreation });

  // Capture mnemonic
  const mnemonic = await captureMnemonicWords(page);

  // Confirm and proceed to verification
  await page.locator('.confirm-box input[type="checkbox"]').check();
  await page.getByRole('button', { name: /continue to verification/i }).click();

  // Complete verification
  await completeMnemonicVerification(page, mnemonic, /verify and continue/i);

  // Wait for pending screen
  await expect(
    page.getByText(/application.*review|pending|under review/i).first(),
  ).toBeVisible({ timeout: TIMEOUT.medium });
  console.log(`[${userName}] Registration submitted, on pending screen`);

  return { mnemonic };
}

/**
 * Log in as an existing user by recovering identity from mnemonic.
 * Ends on the dashboard.
 */
export async function loginWithMnemonic(
  page: Page,
  mnemonic: string[],
): Promise<void> {
  await page.goto(FRONTEND_URL);
  await expect(
    page.getByRole('button', { name: /register/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });

  await page.getByText(/recover identity/i).click();
  await expect(
    page.getByRole('heading', { name: /recover your identity/i }),
  ).toBeVisible({ timeout: TIMEOUT.short });

  for (let i = 0; i < mnemonic.length; i++) {
    await page.locator(`#word-${i}`).fill(mnemonic[i]);
  }

  await page.getByRole('button', { name: /recover identity/i }).click();
  await expect(
    page.getByText(/identity recovered/i),
  ).toBeVisible({ timeout: TIMEOUT.long });

  await page.getByRole('button', { name: /continue to dashboard/i }).click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: TIMEOUT.short });
}
