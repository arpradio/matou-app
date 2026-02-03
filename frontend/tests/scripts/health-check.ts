#!/usr/bin/env tsx
/**
 * Health check script to verify all services are running.
 * Usage:
 *   npm run health        # Check dev services
 *   npm run health:test   # Check test services
 */

import * as net from 'net';

const isTestMode = process.env.TEST_MODE === 'true';

const config = isTestMode
  ? {
      name: 'TEST',
      frontend: { url: 'http://localhost:9003', name: 'Frontend' },
      backend: { url: 'http://localhost:9080/health', name: 'Backend' },
      keriaAdmin: { url: 'http://localhost:4901/health', name: 'KERIA Admin' },
      keriaBoot: { url: 'http://localhost:4903/health', name: 'KERIA Boot' },
      configServer: { url: 'http://localhost:4904/health', name: 'Config Server' },
      anysync: {
        coordinator: { host: '127.0.0.1', port: 2004, name: 'any-sync Coordinator' },
        filenode: { host: '127.0.0.1', port: 2005, name: 'any-sync Filenode' },
        consensus: { host: '127.0.0.1', port: 2006, name: 'any-sync Consensus' },
      },
    }
  : {
      name: 'DEV',
      frontend: { url: 'http://localhost:9000', name: 'Frontend' },
      backend: { url: 'http://localhost:8080/health', name: 'Backend' },
      keriaAdmin: { url: 'http://localhost:3901/health', name: 'KERIA Admin' },
      keriaBoot: { url: 'http://localhost:3903/health', name: 'KERIA Boot' },
      configServer: { url: 'http://localhost:3904/health', name: 'Config Server' },
      anysync: {
        coordinator: { host: '127.0.0.1', port: 1004, name: 'any-sync Coordinator' },
        filenode: { host: '127.0.0.1', port: 1005, name: 'any-sync Filenode' },
        consensus: { host: '127.0.0.1', port: 1006, name: 'any-sync Consensus' },
      },
    };

interface CheckResult {
  name: string;
  status: 'ok' | 'fail';
  message: string;
}

async function checkHttpService(name: string, url: string): Promise<CheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    // Any HTTP response means the service is up
    return { name, status: 'ok', message: `HTTP ${response.status}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { name, status: 'fail', message: msg.includes('abort') ? 'Timeout' : 'Connection refused' };
  }
}

async function checkTcpPort(name: string, host: string, port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ name, status: 'ok', message: `TCP ${port} open` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ name, status: 'fail', message: 'Timeout' });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ name, status: 'fail', message: 'Connection refused' });
    });

    socket.connect(port, host);
  });
}

async function main() {
  console.log(`\n Health Check (${config.name} mode)\n`);
  console.log('-'.repeat(60));

  // HTTP service checks
  const httpChecks = [
    checkHttpService(config.frontend.name, config.frontend.url),
    checkHttpService(config.backend.name, config.backend.url),
    checkHttpService(config.keriaAdmin.name, config.keriaAdmin.url),
    checkHttpService(config.keriaBoot.name, config.keriaBoot.url),
    checkHttpService(config.configServer.name, config.configServer.url),
  ];

  // TCP port checks for any-sync
  const tcpChecks = [
    checkTcpPort(config.anysync.coordinator.name, config.anysync.coordinator.host, config.anysync.coordinator.port),
    checkTcpPort(config.anysync.filenode.name, config.anysync.filenode.host, config.anysync.filenode.port),
    checkTcpPort(config.anysync.consensus.name, config.anysync.consensus.host, config.anysync.consensus.port),
  ];

  const results = await Promise.all([...httpChecks, ...tcpChecks]);

  let allOk = true;
  let frontendDown = false;
  for (const result of results) {
    const icon = result.status === 'ok' ? '[OK]' : '[FAIL]';
    console.log(`${icon} ${result.name.padEnd(25)} ${result.message}`);
    if (result.status === 'fail') {
      if (result.name === 'Frontend') {
        frontendDown = true;
      } else {
        allOk = false;
      }
    }
  }

  if (frontendDown) {
    console.log('\nNote: Frontend is auto-started by Playwright when running tests.');
  }

  console.log('-'.repeat(60));

  if (allOk) {
    console.log('All services are running!\n');
    process.exit(0);
  } else {
    console.log('Some services are not available.\n');
    process.exit(1);
  }
}

main();
