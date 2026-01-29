/**
 * Test utilities for isolating test config from development config
 *
 * Uses Playwright's route interception to add X-Test-Config header
 * to all config server requests, making them use a separate test config file.
 */
import { Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { keriEndpoints } from './keri-testnet';

// The app hardcodes http://localhost:3904 in config.ts, so browser route
// interception must target that port. Direct API calls (hasTestConfig, etc.)
// use the test infrastructure port from keriEndpoints.
const APP_CONFIG_URL = 'http://localhost:3904';
const TEST_CONFIG_URL = keriEndpoints.configURL;

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
  // Intercept all config server requests from the app (port 3904) and redirect
  // them to the test infrastructure (port 4904) with the X-Test-Config header.
  await target.route(`${APP_CONFIG_URL}/**`, async (route, request) => {
    const testUrl = request.url().replace(APP_CONFIG_URL, TEST_CONFIG_URL);
    const headers = {
      ...request.headers(),
      'X-Test-Config': 'true',
    };

    // Fetch from the test config server and fulfill the response
    try {
      const response = await route.fetch({
        url: testUrl,
        headers,
        method: request.method(),
        postData: request.postData() ?? undefined,
      });
      await route.fulfill({ response });
    } catch {
      // If test server is unreachable, let the request fail naturally
      await route.continue({ headers });
    }
  });
}

/**
 * Clear the test config via API request
 *
 * @param request - Playwright APIRequestContext
 */
export async function clearTestConfig(request: APIRequestContext) {
  try {
    await request.delete(`${TEST_CONFIG_URL}/api/config`, {
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
    const response = await request.get(`${TEST_CONFIG_URL}/api/health`, {
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
  const response = await request.get(`${TEST_CONFIG_URL}/api/config`, {
    headers: { 'X-Test-Config': 'true' },
  });
  if (response.ok()) {
    return await response.json();
  }
  return null;
}
