/**
 * Test utilities for isolating test config from development config
 *
 * Uses Playwright's route interception to add X-Test-Config header
 * to all config server requests, making them use a separate test config file.
 */
import { Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { keriEndpoints } from './keri-testnet';

const CONFIG_SERVER_URL = keriEndpoints.configURL;

/**
 * Setup test config isolation for a page or context
 *
 * This intercepts all requests to the config server and adds the
 * X-Test-Config: true header, causing the server to use a separate
 * test config file (/data/test-org-config.json).
 *
 * @param target - Page or BrowserContext to setup
 */
export async function setupTestConfig(target: Page | BrowserContext) {
  // Intercept all config server requests and add the test header
  await target.route(`${CONFIG_SERVER_URL}/**`, async (route, request) => {
    const headers = {
      ...request.headers(),
      'X-Test-Config': 'true',
    };

    // Continue the request with the added header
    await route.continue({ headers });
  });
}

/**
 * Clear the test config via API request
 *
 * @param request - Playwright APIRequestContext
 */
export async function clearTestConfig(request: APIRequestContext) {
  try {
    await request.delete(`${CONFIG_SERVER_URL}/api/config`, {
      headers: { 'X-Test-Config': 'true' },
    });
    console.log('[TestConfig] Cleared test config');
  } catch {
    console.log('[TestConfig] No test config to clear');
  }
}

/**
 * Check if test config exists via API request
 *
 * @param request - Playwright APIRequestContext
 */
export async function hasTestConfig(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${CONFIG_SERVER_URL}/api/health`, {
      headers: { 'X-Test-Config': 'true' },
    });
    const data = await response.json();
    return data.configured === true;
  } catch {
    return false;
  }
}

/**
 * Get the test config via API request
 *
 * @param request - Playwright APIRequestContext
 */
export async function getTestConfig(request: APIRequestContext) {
  const response = await request.get(`${CONFIG_SERVER_URL}/api/config`, {
    headers: { 'X-Test-Config': 'true' },
  });
  if (response.ok()) {
    return await response.json();
  }
  return null;
}
