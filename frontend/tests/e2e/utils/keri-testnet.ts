/**
 * KERI Test Network utilities for frontend E2E tests.
 *
 * Manages the KERI infrastructure lifecycle (KERIA, witnesses, schema server,
 * config server) via the infrastructure/keri-test/ Docker Compose setup.
 *
 * This is the TypeScript equivalent of the Go testnet packages:
 *   - backend/internal/keri/testnet/testnet.go
 *   - backend/internal/anysync/testnet/testnet.go
 *
 * Usage in Playwright globalSetup:
 *   import { setupKERINetwork, teardownKERINetwork } from './utils/keri-testnet';
 *
 * Usage in test files:
 *   import { keriEndpoints, isKERIHealthy } from './utils/keri-testnet';
 */

import { execSync, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/** KERI infrastructure endpoint URLs (test network, +1000 port offset) */
export const keriEndpoints = {
  /** KERIA Admin API (requires auth) */
  adminURL: 'http://localhost:4901',
  /** KERIA CESR/OOBI API */
  cesrURL: 'http://localhost:4902',
  /** KERIA Boot API (agent creation) */
  bootURL: 'http://localhost:4903',
  /** Config server (org config management) */
  configURL: 'http://localhost:4904',
  /** Schema server */
  schemaURL: 'http://localhost:8723',
  /** Witness endpoints */
  witnesses: [
    'http://localhost:6643',
    'http://localhost:6645',
    'http://localhost:6647',
  ],
} as const;

/** Witness AIDs from the witness-demo image */
export const witnessAIDs = {
  wan: 'BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha',
  wil: 'BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM',
  wes: 'BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX',
} as const;

/**
 * Resolve the absolute path to the infrastructure/keri-test/ directory.
 * Works regardless of the working directory by resolving relative to this file.
 */
function getInfraPath(): string {
  // This file: frontend/tests/e2e/utils/keri-testnet.ts
  // Target:    infrastructure/keri-test/
  const infraPath = path.resolve(__dirname, '..', '..', '..', '..', 'infrastructure', 'keri-test');

  if (!fs.existsSync(infraPath)) {
    throw new Error(`KERI infrastructure not found at ${infraPath}`);
  }

  return infraPath;
}

/**
 * Run a make target in the infrastructure/keri-test/ directory.
 */
function runMake(target: string, options?: { silent?: boolean; timeout?: number }): string {
  const infraPath = getInfraPath();
  const silent = options?.silent ? '-s' : '';
  const timeout = options?.timeout ?? 120_000;

  try {
    const result = execSync(`make ${silent} ${target}`.trim(), {
      cwd: infraPath,
      timeout,
      encoding: 'utf-8',
      stdio: options?.silent ? 'pipe' : 'inherit',
    });
    return typeof result === 'string' ? result.trim() : '';
  } catch (err) {
    if (options?.silent) {
      return '';
    }
    throw err;
  }
}

/**
 * Check if the KERI infrastructure is already running.
 */
export function isKERIRunning(): boolean {
  try {
    const output = runMake('is-running', { silent: true, timeout: 10_000 });
    return output === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if the KERI infrastructure is healthy (all services ready).
 */
export function isKERIHealthy(): boolean {
  try {
    const output = runMake('ready', { silent: true, timeout: 15_000 });
    return output === 'ready';
  } catch {
    return false;
  }
}

/**
 * Check individual service health via HTTP.
 * Returns a map of service name to reachability status.
 */
export async function checkServiceHealth(): Promise<Record<string, boolean>> {
  const checks: Record<string, { url: string; expectStatus: number[] }> = {
    keria: { url: `${keriEndpoints.adminURL}/`, expectStatus: [401] },
    boot: { url: `${keriEndpoints.bootURL}/`, expectStatus: [200, 404, 405] },
    schema: { url: `${keriEndpoints.schemaURL}/`, expectStatus: [200] },
    config: { url: `${keriEndpoints.configURL}/api/health`, expectStatus: [200] },
    backend: { url: 'http://localhost:9080/health', expectStatus: [200] },
  };

  const results: Record<string, boolean> = {};

  for (const [name, check] of Object.entries(checks)) {
    try {
      const resp = await fetch(check.url, { signal: AbortSignal.timeout(5000) });
      results[name] = check.expectStatus.includes(resp.status);
    } catch {
      results[name] = false;
    }
  }

  return results;
}

/** State tracking for setup/teardown */
let weStartedNetwork = false;

/**
 * Start the KERI test infrastructure.
 *
 * - If already running, does nothing (and teardown will not stop it).
 * - Respects KEEP_KERIA_NETWORK=1 to keep running after tests.
 *
 * Call from Playwright globalSetup or test.beforeAll.
 */
export function setupKERINetwork(options?: { verbose?: boolean }): void {
  const verbose = options?.verbose ?? process.env.TEST_VERBOSE === '1';

  if (isKERIRunning()) {
    if (verbose) {
      console.log('[keri-testnet] KERI infrastructure already running');
    }
    weStartedNetwork = false;
    return;
  }

  if (verbose) {
    console.log('[keri-testnet] Starting KERI infrastructure...');
  }

  runMake('start-and-wait', { timeout: 180_000 });
  weStartedNetwork = true;

  if (verbose) {
    console.log('[keri-testnet] KERI infrastructure ready');
  }
}

/**
 * Stop the KERI test infrastructure.
 *
 * Only stops if we started it AND KEEP_KERIA_NETWORK is not set.
 *
 * Call from Playwright globalTeardown or test.afterAll.
 */
export function teardownKERINetwork(options?: { verbose?: boolean }): void {
  const verbose = options?.verbose ?? process.env.TEST_VERBOSE === '1';

  if (!weStartedNetwork) {
    if (verbose) {
      console.log('[keri-testnet] We did not start the network, skipping teardown');
    }
    return;
  }

  if (process.env.KEEP_KERIA_NETWORK === '1') {
    if (verbose) {
      console.log('[keri-testnet] Keeping KERI infrastructure running (KEEP_KERIA_NETWORK=1)');
    }
    return;
  }

  if (verbose) {
    console.log('[keri-testnet] Stopping KERI infrastructure...');
  }

  try {
    runMake('down', { timeout: 60_000 });
  } catch (err) {
    console.warn('[keri-testnet] Warning: failed to stop KERI infrastructure:', err);
  }

  weStartedNetwork = false;
}

/**
 * Require the KERI network to be healthy. Throws if not.
 * Use at the start of test suites that need KERIA.
 */
export function requireKERINetwork(): void {
  if (!isKERIHealthy()) {
    throw new Error(
      'KERI test infrastructure is not running or not healthy.\n' +
      'This usually means the Docker containers are stopped.\n\n' +
      'Start the KERI test network:\n' +
      '  cd infrastructure/keri-test && make up\n\n' +
      'Then wait for services to be ready:\n' +
      '  make ready'
    );
  }
}
