# any-sync Space Integration Implementation

This document describes the any-sync SDK integration for MATOU, which provides decentralized data synchronization for credential storage and community spaces.

## Overview

The integration use the any-sync SDK calls using the `app.Component` framework. V1 enables three main features:

1. **Community Space Creation** - When an admin sets up the organization, a shared community space is created
2. **Private Space Creation** - When a user registers, their personal private space is created
3. **Space Invitation** - When an admin issues a membership credential, the user is added to the community space

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vue/Quasar)                     │
├─────────────────────────────────────────────────────────────────┤
│  useOrgSetup.ts    useRegistration.ts    useAdminActions.ts     │
│  useCredentialPolling.ts                                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Go)                                │
├─────────────────────────────────────────────────────────────────┤
│  api/spaces.go (HTTP handlers)                                   │
│       │                                                          │
│       ▼                                                          │
│  anysync/spaces.go (SpaceManager)                               │
│       │                                                          │
│       ▼                                                          │
│  anysync/client.go (any-sync SDK Client)                        │
│       │                                                          │
│       ├── anysync/peer.go (Key management)                      │
│       └── anysync/acl.go (ACL policies)                         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ libp2p/QUIC
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    any-sync Network                              │
├─────────────────────────────────────────────────────────────────┤
│  Coordinator (1004)  │  Consensus (1006)  │  Sync Nodes (1001-3)│
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Peer Key Management (`internal/anysync/peer.go`)

Handles cryptographic identity for the any-sync network.

**Key Features:**
- BIP39 mnemonic-based key derivation using any-sync's `crypto.Mnemonic.DeriveKeys()`
- Falls back to file-based key storage if no mnemonic provided
- Maps KERI AIDs to any-sync peer IDs for identity bridging

**Functions:**
- `DeriveKeyFromMnemonic(mnemonic string)` - Derives libp2p peer key from BIP39 mnemonic
- `GetOrCreatePeerKey(mnemonic, keyPath string)` - Gets existing or creates new peer key
- `NewPeerKeyManager(dataDir string)` - Creates manager for AID-to-peerID mappings

### 2. SDK Client (`internal/anysync/client.go`)

Full any-sync SDK implementation using the `app.Component` framework.

**Component Implementations:**
- `matouAccountService` - Account/identity service
- `matouConfig` - Configuration provider
- `matouPool` - Connection pool management
- `matouNodeConf` - Network node configuration
- `matouStorageProvider` - Space storage using anystore
- `matouCoordinatorClient` - Coordinator communication
- `matouNodeClient` - Sync node communication
- `matouPeerManagerProvider` - Peer connection management
- `matouTreeManager` - CRDT tree management
- `matouStreamHandler` - Stream protocol handling

**Client Methods:**
- `NewClient(configPath string, opts *ClientOptions)` - Initialize SDK client
- `CreateSpace(ctx, ownerAID, spaceType string, aclPolicy *ACLPolicy)` - Create new space
- `DeriveSpace(ctx, spaceID string)` - Connect to existing space
- `AddToACL(ctx, spaceID, peerID string)` - Add user to space ACL
- `SyncDocument(ctx, spaceID, docID string, data []byte)` - Sync data to space
- `GetNetworkID()`, `GetCoordinatorURL()`, `GetPeerID()` - Network info
- `Ping(ctx)` - Health check

### 3. ACL Policies (`internal/anysync/acl.go`)

Defines access control bridging KERI credentials to any-sync.

**Policy Types:**
- `PrivateACL(ownerAID)` - Single owner, full control
- `CommunityACL(orgAID, requiredSchema)` - Membership-gated access
- `PublicACL()` - Read-only public access

**Permissions:**
- `PermissionNone` - No access
- `PermissionRead` - Read-only
- `PermissionWrite` - Read and write
- `PermissionAdmin` - Manage ACL
- `PermissionOwner` - Full control

**Note:** any-sync ACL uses peer IDs. KERI credential requirements are enforced at the application layer before updating the any-sync ACL.

### 4. Space Manager (`internal/anysync/spaces.go`)

High-level space operations using the SDK client.

**Methods:**
- `CreateCommunitySpace(ctx, orgAID, orgName)` - Create org community space
- `CreatePrivateSpace(ctx, userAID)` - Create user private space
- `GetOrCreatePrivateSpace(ctx, userAID)` - Idempotent private space creation
- `InviteToCommunitySpace(ctx, userAID, credSAID)` - Add user to community
- `RouteCredential(ctx, cred, issueeAID)` - Sync credential to appropriate spaces

### 5. HTTP Handlers (`internal/api/spaces.go`)

REST API for frontend integration.

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/spaces/community` | POST | Create community space |
| `/api/v1/spaces/community` | GET | Get community space info |
| `/api/v1/spaces/private` | POST | Create private space |
| `/api/v1/spaces/community/invite` | POST | Invite user to community |

### 6. CORS Middleware (`internal/api/middleware.go`)

Enables cross-origin requests from frontend development servers.

**Allowed Origins:**
- `http://localhost:9000` (Quasar dev server)
- `http://localhost:9300` (Electron app)

## Configuration

### Host Configuration (`config/client-host.yml`)

Used when backend runs on host machine (not in Docker):

```yaml
networkId: "N..."
nodes:
  - peerId: "..."
    addresses:
      - "localhost:1001"  # sync-node-1
  # ... more nodes
coordinator:
  addresses:
    - "localhost:1004"
```

### Docker Configuration (`infrastructure/any-sync/etc/client.yml`)

Used when backend runs inside Docker:
- Uses Docker hostnames like `any-sync-node-1:1001`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MATOU_ANYSYNC_CONFIG` | Path to client config | `config/client-host.yml` |
| `MATOU_ANYSYNC_MODE` | Client mode: `local` or `sdk` | `local` |
| `MATOU_DATA_DIR` | Data directory | `./data` |

### Client Modes

**Local Mode** (default): Stores space metadata locally without network synchronization.
- Use for development or when any-sync infrastructure is not available
- Spaces are created with deterministic IDs stored in `./data/spaces/`

**SDK Mode**: Full any-sync SDK with network connectivity.
- Enable with `MATOU_ANYSYNC_MODE=sdk`
- Requires any-sync infrastructure running (coordinator, sync nodes)
- Spaces are registered with the coordinator and synced across nodes

## Data Flow

### 1. Organization Setup

```
Admin clicks "Create Organization"
    │
    ▼
useOrgSetup.ts: setupOrg()
    │
    ├── Creates KERI AIDs, registry, issues admin credential
    │
    ▼
POST /api/v1/spaces/community
    │
    ▼
spaces.go: HandleCreateCommunitySpace()
    │
    ▼
SpaceManager.CreateCommunitySpace()
    │
    ▼
Client.CreateSpace(orgAID, SpaceTypeCommunity, CommunityACL)
    │
    ▼
any-sync coordinator registers space
    │
    ▼
Space ID stored in org config
```

### 2. User Registration

```
User submits registration form
    │
    ▼
useRegistration.ts: submitRegistration()
    │
    ├── Sends EXN to admins
    │
    ▼
POST /api/v1/spaces/private
    │
    ▼
spaces.go: HandleCreatePrivateSpace()
    │
    ▼
SpaceManager.CreatePrivateSpace()
    │
    ▼
Client.CreateSpace(userAID, SpaceTypePrivate, PrivateACL)
    │
    ▼
Private space ID stored in anystore
```

### 3. Credential Issuance & Space Invitation

```
Admin approves registration
    │
    ▼
useAdminActions.ts: approveRegistration()
    │
    ├── Issues membership credential via KERIA
    │
    ▼
POST /api/v1/spaces/community/invite
    │
    ▼
spaces.go: HandleInviteToCommunity()
    │
    ▼
SpaceManager.InviteToCommunitySpace()
    │
    ├── Validates credential
    ├── Adds user to community ACL
    ├── Ensures private space exists
    └── Routes credential to both spaces
```

### 4. Credential Sync (User Side)

```
User receives credential in KERIA wallet
    │
    ▼
useCredentialPolling.ts: credentialReceived = true
    │
    ▼
syncCredentialToBackend()
    │
    ▼
POST /api/v1/sync/credentials
    │
    ▼
SyncHandler: triggers RouteCredential()
    │
    ▼
Credential synced to private + community spaces
```

## Space Types

### Private Space
- **Purpose:** User's personal credential storage
- **ACL:** Single owner (user's AID)
- **Contents:** All credentials issued to the user
- **ID Generation:** Deterministic from user AID (`generatePrivateSpaceID`)

### Community Space
- **Purpose:** Shared space for organization members
- **ACL:** Org owns, members have read/write
- **Contents:** Membership credentials, community data
- **Requirement:** Valid membership credential to join

## Error Handling

### Network Failures
- Space creation is idempotent (returns existing if already created)
- Frontend treats backend unavailability as non-fatal
- Operations can be retried on next sync

### ACL Validation
- Credential schema verified before granting access
- User already in ACL treated as success
- Admin self-credential during setup is skipped

---

## Tests Required

### Unit Tests

#### `internal/anysync/peer_test.go`

| Test | Description |
|------|-------------|
| `TestDeriveKeyFromMnemonic` | Verify key derivation from valid 12-word mnemonic |
| `TestDeriveKeyFromMnemonic_InvalidMnemonic` | Error on invalid mnemonic |
| `TestDeriveKeyFromMnemonic_Deterministic` | Same mnemonic produces same key |
| `TestGetOrCreatePeerKey_FromMnemonic` | Key derived when mnemonic provided |
| `TestGetOrCreatePeerKey_FromFile` | Key loaded from file when no mnemonic |
| `TestGetOrCreatePeerKey_CreatesFile` | New key saved to file |
| `TestPeerKeyManager_MapAIDToPeerID` | AID-to-peer mapping stored and retrieved |
| `TestPeerKeyManager_GetPeerIDForAID` | Retrieve peer ID by AID |
| `TestPeerKeyManager_Persistence` | Mappings persist across restarts |

#### `internal/anysync/acl_test.go`

| Test | Description |
|------|-------------|
| `TestPrivateACL` | Private ACL has owner with full permissions |
| `TestCommunityACL` | Community ACL has org owner, schema requirement |
| `TestPublicACL` | Public ACL allows read-only access |
| `TestACLManager_ValidateAccess_Owner` | Owner has access |
| `TestACLManager_ValidateAccess_Member` | Member has access |
| `TestACLManager_ValidateAccess_NonMember` | Non-member denied |
| `TestACLManager_GrantPermission` | Permission granted and persisted |
| `TestACLManager_RevokePermission` | Permission revoked |

#### `internal/anysync/client_test.go`

| Test | Description |
|------|-------------|
| `TestNewClient_ValidConfig` | Client initializes with valid config |
| `TestNewClient_InvalidConfig` | Error on missing/invalid config |
| `TestNewClient_WithMnemonic` | Client uses mnemonic-derived key |
| `TestClient_CreateSpace_Private` | Creates private space |
| `TestClient_CreateSpace_Community` | Creates community space |
| `TestClient_CreateSpace_Idempotent` | Returns existing space if exists |
| `TestClient_DeriveSpace` | Connects to existing space |
| `TestClient_AddToACL` | Adds peer to space ACL |
| `TestClient_SyncDocument` | Syncs document to space |
| `TestClient_Ping` | Health check returns network status |
| `TestClient_GetNetworkID` | Returns correct network ID |
| `TestClient_Close` | Graceful shutdown |

#### `internal/anysync/spaces_test.go`

| Test | Description |
|------|-------------|
| `TestSpaceManager_CreateCommunitySpace` | Creates community space with ACL |
| `TestSpaceManager_CreateCommunitySpace_Idempotent` | Returns existing on retry |
| `TestSpaceManager_CreatePrivateSpace` | Creates private space |
| `TestSpaceManager_GetOrCreatePrivateSpace` | Gets existing or creates new |
| `TestSpaceManager_InviteToCommunitySpace` | Adds user to community |
| `TestSpaceManager_InviteToCommunitySpace_AlreadyMember` | Handles existing member |
| `TestSpaceManager_InviteToCommunitySpace_NoCommunitySpace` | Error when no community |
| `TestSpaceManager_RouteCredential_Membership` | Routes to both spaces |
| `TestSpaceManager_RouteCredential_PrivateOnly` | Routes to private only |
| `TestSpaceManager_AddToCommunitySpace` | Syncs data to community |
| `TestSpaceManager_SyncToPrivateSpace` | Syncs data to private |

#### `internal/api/spaces_test.go`

| Test | Description |
|------|-------------|
| `TestHandleCreateCommunitySpace_Success` | 200 with space ID |
| `TestHandleCreateCommunitySpace_MissingOrgAID` | 400 on missing field |
| `TestHandleCreateCommunitySpace_Idempotent` | Returns existing space |
| `TestHandleGetCommunitySpace_Exists` | Returns space info |
| `TestHandleGetCommunitySpace_NotConfigured` | 404 when not set up |
| `TestHandleCreatePrivateSpace_Success` | 200 with space ID |
| `TestHandleCreatePrivateSpace_MissingUserAID` | 400 on missing field |
| `TestHandleInviteToCommunity_Success` | 200 with space IDs |
| `TestHandleInviteToCommunity_NoCommunitySpace` | 409 conflict |
| `TestHandleInviteToCommunity_InvalidSchema` | 400 on wrong schema |

#### `internal/api/middleware_test.go`

| Test | Description |
|------|-------------|
| `TestCORSMiddleware_AllowedOrigin` | Sets CORS headers for allowed origin |
| `TestCORSMiddleware_DisallowedOrigin` | No CORS headers for other origins |
| `TestCORSMiddleware_PreflightRequest` | Handles OPTIONS request |
| `TestCORSHandler_WrapsHandler` | Handler called with CORS headers |

### Integration Tests

#### `internal/anysync/integration_test.go`

| Test | Description |
|------|-------------|
| `TestIntegration_CreateAndDeriveSpace` | Create space, reconnect, verify data |
| `TestIntegration_MultipleClients` | Two clients sync same space |
| `TestIntegration_ACLEnforcement` | Unauthorized client rejected |
| `TestIntegration_DocumentSync` | Document syncs between clients |
| `TestIntegration_NetworkReconnect` | Client recovers from disconnect |

### End-to-End Tests

#### `frontend/tests/e2e/spaces.spec.ts`

| Test | Description |
|------|-------------|
| `test('community space created during org setup')` | Verify space exists after setup |
| `test('private space created on registration')` | Verify user private space |
| `test('user invited to community after approval')` | Verify ACL membership |
| `test('credential synced to both spaces')` | Verify credential in spaces |
| `test('graceful degradation when backend unavailable')` | Frontend handles errors |

### Test Infrastructure Requirements

1. **Mock any-sync Network**
   - Mock coordinator client for unit tests
   - Mock space storage for isolation
   - Test fixtures for space payloads

2. **Test Containers**
   - Docker Compose for integration tests
   - any-sync network in test mode
   - Isolated test data directories

3. **Test Utilities**
   ```go
   // internal/anysync/testing/mocks.go
   type MockCoordinator struct { ... }
   type MockSpaceStorage struct { ... }
   type MockPeerManager struct { ... }

   // internal/anysync/testing/fixtures.go
   func NewTestClient(t *testing.T) *Client
   func NewTestSpaceManager(t *testing.T) *SpaceManager
   func GenerateTestMnemonic() string
   func GenerateTestAID() string
   ```

### Running Tests

```bash
# Unit tests
go test ./internal/anysync/... -v

# Integration tests (requires Docker)
docker-compose -f infrastructure/any-sync/docker-compose.yml up -d
go test ./internal/anysync/... -tags=integration -v

# All backend tests
go test ./... -v

# Frontend E2E tests
cd frontend && npm run test:e2e
```

## Known Limitations

1. **Key Derivation** - any-sync uses its own key format; KERI AID keys cannot be directly reused
2. **ACL Enforcement** - Credential validation happens at application layer, not in any-sync
3. **Offline Support** - Current implementation requires network connectivity
4. **Space Recovery** - If coordinator is unavailable, space creation fails (no local-first)

## Future Improvements

1. **Mnemonic Unification** - Derive both KERI and any-sync keys from same mnemonic
2. **Local-First Spaces** - Create spaces locally, sync when network available
3. **Credential-Based ACL** - Implement custom any-sync ACL that verifies KERI credentials
4. **Space Migration** - Tools to export/import space data
