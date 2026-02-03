# signify-ts Integration

This document details the integration of signify-ts into the Matou frontend for real KERI functionality.

## Overview

The frontend uses [signify-ts](https://github.com/WebOfTrust/signify-ts) to communicate with KERIA (KERI Agent) for:
- Agent bootstrapping and connection
- AID (Autonomic Identifier) creation (with optional witness backing)
- OOBI (Out-of-Band Introduction) resolution
- Credential issuance (via IPEX grant/admit)
- Registration messaging to admins

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Vue/Quasar)                   │
├─────────────────────────────────────────────────────────────┤
│  ProfileFormScreen.vue     │    CredentialIssuanceScreen    │
│          |                 │    (simulated issuance)         │
│  useRegistration()         │              |                  │
│  useClaimIdentity()        │    useIdentityStore()          │
│          |                 │              |                  │
├─────────────────────────────────────────────────────────────┤
│                    Identity Store (Pinia)                    │
│  - connect(bran)           - createIdentity(name, options?) │
│  - restore()               - disconnect()                    │
│  - fetchUserSpaces()       - joinCommunitySpace(params)     │
│          |                                                   │
├─────────────────────────────────────────────────────────────┤
│                    KERIClient (src/lib/keri/client.ts)       │
│  - initialize(bran)        - createAID(name, options?)      │
│  - resolveOOBI(url, alias) - listAIDs()                     │
│  - getOOBI()               - sendRegistrationToAdmins()     │
│  + static: generatePasscode(), passcodeFromMnemonic()       │
│          |                                                   │
├─────────────────────────────────────────────────────────────┤
│                    signify-ts (SignifyClient)                │
│          |                         |              |          │
│    localhost:3901           localhost:3903   localhost:3902  │
│    (KERIA Admin API)        (KERIA Boot API) (KERIA CESR)  │
└─────────────────────────────────────────────────────────────┘
```

KERIA ports are configurable via `VITE_KERIA_ADMIN_URL`, `VITE_KERIA_BOOT_URL`, and `VITE_KERIA_CESR_URL` environment variables.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/keri/client.ts` | KERIClient wrapper around signify-ts |
| `src/stores/identity.ts` | Pinia store for identity state management |
| `src/stores/onboarding.ts` | Onboarding state management |
| `src/stores/app.ts` | App-level config/state (org config, setup status) |
| `src/lib/api/client.ts` | Backend API client for identity, sync, community, profiles, and file operations |
| `src/boot/keri.ts` | Auto-restore session on app startup |
| `src/composables/useRegistration.ts` | Registration submission to admins |
| `src/composables/useClaimIdentity.ts` | Invitation/claim flow |
| `src/composables/useOrgSetup.ts` | Organization setup composable |
| `src/composables/useCredentialPolling.ts` | Credential polling for approval |

## Connection Flow

### 1. Initialization

The actual passcode generation depends on the flow:
- **Org setup**: `KERIClient.generatePasscode()` for random passcode
- **Claim/invite**: `KERIClient.passcodeFromMnemonic(mnemonic)` for deterministic derivation from BIP39 mnemonic

```typescript
await identityStore.connect(bran);
```

### 2. Boot or Connect

The KERIClient handles both new and returning users:

```typescript
async initialize(bran: string): Promise<void> {
  await ready(); // Initialize libsodium
  this.client = new SignifyClient(keriaUrl, bran, Tier.low, keriaBootUrl);

  try {
    await this.client.connect(); // Try existing agent
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('agent does not exist')) {
      await this.client.boot();  // Create new agent
      await this.client.connect();
    }
  }
}
```

### 3. OOBI Resolution

Witness OOBIs are resolved dynamically from the KERIA config during `initialize()`:

```typescript
const config = await this.client.config().get();
if (config.iurls && Array.isArray(config.iurls)) {
  for (let i = 0; i < config.iurls.length; i++) {
    let iurl = config.iurls[i];
    if (iurl.endsWith('/controller')) {
      iurl = iurl.replace('/controller', '');
    }
    const alias = `wit${i}`;
    const op = await this.client.oobis().resolve(iurl, alias);
    await this.client.operations().wait(op, { signal: AbortSignal.timeout(30000) });
  }
}
```

### 4. AID Creation

The default development path creates AIDs without witnesses. With the `useWitnesses` option, a single witness is used:

```typescript
// Without witnesses (default, faster for development)
result = await this.client.identifiers().create(name);

// With witness backing
result = await this.client.identifiers().create(name, {
  wits: [WITNESS_AID],  // Single witness: BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha (wan, port 5642)
  toad: 1, // Threshold: need 1 witness to acknowledge
});
```

## Configuration

### Vite Configuration

signify-ts requires special bundling configuration for libsodium:

```typescript
// quasar.config.ts
extendViteConf(viteConf) {
  viteConf.optimizeDeps = viteConf.optimizeDeps || {};
  viteConf.optimizeDeps.include = viteConf.optimizeDeps.include || [];
  viteConf.optimizeDeps.include.push(
    'signify-ts',
    'libsodium-wrappers-sumo',
    'libsodium-sumo'
  );
  viteConf.optimizeDeps.esbuildOptions = { target: 'es2022' };

  viteConf.resolve.alias = {
    ...viteConf.resolve.alias,
    'libsodium-wrappers-sumo': path.join(
      __dirname,
      'node_modules/libsodium-wrappers-sumo/dist/modules-sumo/libsodium-wrappers.js'
    ),
  };

  viteConf.build.commonjsOptions = {
    include: [/libsodium/, /node_modules/],
    transformMixedEsModules: true,
  };
}
```

### CORS Handling

For development, Chrome is launched with disabled web security in Playwright tests:

```typescript
// playwright.config.ts
launchOptions: {
  args: [
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--allow-running-insecure-content',
  ],
}
```

For production, use a reverse proxy (nginx) to add CORS headers to KERIA responses.

## Witness Configuration

The infrastructure uses a single `witness-demo` container running 6 witnesses:

| Witness | Docker Host | Port | AID |
|---------|-------------|------|-----|
| wan | witness-demo:5642 | 5642 | `BBilc4-L3tFUnfM_wJr4S4OJanAv_VmF_dJNN6vkf2Ha` |
| wil | witness-demo:5643 | 5643 | `BLskRTInXnMxWaGqcpSyMgo0nYbalW99cGZESrz3zapM` |
| wes | witness-demo:5644 | 5644 | `BIKKuvBwpmDVA4Ds-EpL5bt9OqPzWPja2LigFYZN2YfX` |
| wit | witness-demo:5645 | 5645 | `BM35JN8XeJSEfpxopjn5jr7tAHCE5749f0OobhMLCorE` |
| wub | witness-demo:5646 | 5646 | `BIj15u5V11bkbtAxMA7gcNJZcax-7TgaBMLsQnMHpYHP` |
| wyz | witness-demo:5647 | 5647 | `BF2rZTW79z4IXocYRQnjjsOuvFUQv-ptCf8Yltd7PfsM` |

Witness OOBIs are loaded dynamically from KERIA's config (`iurls`), not hardcoded.

## Session Persistence

The passcode (bran) is stored in localStorage for session restoration:

```typescript
// On connect
localStorage.setItem('matou_passcode', bran);
```

On boot, `keri.ts` checks for a saved passcode and calls `restoreIdentity()` asynchronously (non-blocking) after loading org config. The `restore()` method in the identity store reads the passcode from localStorage internally.

**Security Note**: In production, encrypt the passcode before storing.

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `agent does not exist for controller` | New passcode, no agent | Call `boot()` before `connect()` |
| `unknown witness` | Witness OOBI not resolved | Resolve witness OOBIs first |
| `HTTP GET /identifiers/... - 401` | Name with special chars | Use `list()` and filter by name |
| `net::ERR_FAILED` on `/identifiers` | CORS blocked | Use proxy or disable web security |

## Testing

### E2E Tests

```bash
# Run all tests
npm run test

# Run with visible browser
npm run test:headed

# Interactive test UI
npm run test:ui

# Debug mode
npm run test:debug
```

### Test Projects

The test suite is organized into project-based test groups:

1. **org-setup** — Creates the organization (must run first)
2. **registration** — Registration flow
3. **invitation** — Invitation flow
4. **multi-backend** — Multi-backend infrastructure smoke test
5. **recovery-errors** — Recovery & error handling
6. **chromium** — Default project for individual test files

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| AIDs | Without witnesses (faster) | With 1-of-1 witness threshold (configurable) |
| CORS | Chrome flags or proxy | Reverse proxy with headers |
| Passcode storage | Plain localStorage | Encrypted storage |
| KERIA URLs | localhost:3901/3903 | Environment variables |

## Implemented Features

- **Witness-backed AIDs**: Available via `useWitnesses` option in `createIdentity()`
- **Credential Issuance**: KERIClient has full `issueCredential()`, `admitCredential()`, `createRegistry()` methods. The `CredentialIssuanceScreen.vue` currently simulates the flow but the underlying methods are functional.

## Future Enhancements

1. **Multi-sig Support**: Implement threshold signatures
2. **Credential Exchange**: Full IPEX protocol for credential presentation

## References

- [signify-ts GitHub](https://github.com/WebOfTrust/signify-ts)
- [KERI Specification](https://weboftrust.github.io/ietf-keri/draft-ssmith-keri.html)
- [KERIA Documentation](https://github.com/WebOfTrust/keria)
