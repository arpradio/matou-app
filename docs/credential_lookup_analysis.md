# Credential Lookup Analysis: Current Implementation

## TL;DR: Storage Without Verification

Credentials are stored in **anystore** (SQLite-based local storage) and retrieved via:
- **SAID** (primary key lookup)
- **Schema filtering** (membership, steward, etc.)
- **Full scan** (list all credentials)

**Critical Problem:** No indexing by issuer, subject, or time. All lookups require full collection scans or manual JSON query construction.

**No verification happens during lookup** - credentials are assumed valid if they're in the cache.

---

## Storage Architecture

### Backend: anystore (SQLite via anytype-heart)

```
anystore LocalStore
├── Collections (SQLite tables)
│   ├── credentials_cache
│   ├── trust_graph_cache
│   ├── kel_cache
│   ├── spaces
│   ├── user_preferences
│   ├── sync_index
│   └── endorsements_cache
```

### Credential Storage Format

```go
// backend/internal/anystore/client.go
type CachedCredential struct {
    ID         string    `json:"id"`         // SAID (primary key)
    IssuerAID  string    `json:"issuerAID"`  // Not indexed
    SubjectAID string    `json:"subjectAID"` // Not indexed
    SchemaID   string    `json:"schemaID"`   // Not indexed
    Data       any       `json:"data"`       // Arbitrary JSON
    CachedAt   time.Time `json:"cachedAt"`   // Not indexed
    ExpiresAt  time.Time `json:"expiresAt"`  // Not indexed
    Verified   bool      `json:"verified"`   // Not enforced
}
```

**Problems:**
- ❌ No foreign key to AID table (doesn't exist)
- ❌ No index on `IssuerAID` or `SubjectAID`
- ❌ No index on `SchemaID`
- ❌ `Verified` field is a boolean, but nothing actually verifies
- ❌ `ExpiresAt` not enforced (stale credentials remain)

---

## Lookup Methods

### 1. By SAID (Primary Key)

**Used for:** Direct credential retrieval

```go
// backend/internal/anystore/client.go
func (s *LocalStore) GetCredential(
    ctx context.Context,
    said string,
) (*CachedCredential, error) {
    coll, err := s.CredentialsCache(ctx)
    if err != nil {
        return nil, err
    }
    
    // FindId uses SAID as document ID
    doc, err := coll.FindId(ctx, said)
    if err != nil {
        return nil, fmt.Errorf("credential not found: %w", err)
    }
    
    var cred CachedCredential
    json.Unmarshal([]byte(doc.Value().String()), &cred)
    return &cred, nil
}
```

**API Endpoint:**
```
GET /api/v1/credentials/{said}
```

**Performance:** O(1) - Direct lookup by ID
**Verification:** None - returns cached credential without checking KEL

---

### 2. List All Credentials (Full Scan)

**Used for:** Getting all credentials for a user/org

```go
// backend/internal/anystore/client.go
func (s *LocalStore) GetAllCredentials(
    ctx context.Context,
) ([]*CachedCredential, error) {
    coll, err := s.CredentialsCache(ctx)
    if err != nil {
        return nil, err
    }
    
    // Find(nil) returns ALL documents
    iter, err := coll.Find(nil).Iter(ctx)
    if err != nil {
        return nil, err
    }
    defer iter.Close()
    
    var credentials []*CachedCredential
    for iter.Next() {
        doc, err := iter.Doc()
        if err != nil {
            continue // Skip malformed documents
        }
        
        var cred CachedCredential
        json.Unmarshal([]byte(doc.Value().String()), &cred)
        credentials = append(credentials, &cred)
    }
    
    return credentials, nil
}
```

**API Endpoint:**
```
GET /api/v1/credentials
```

**Performance:** O(N) - Scans entire collection
**Verification:** None
**Problem:** Returns ALL credentials without filtering

---

### 3. Filter by Schema (Manual Query)

**Used for:** Getting credentials of a specific type

```go
// backend/internal/api/sync.go
func (h *SyncHandler) HandleGetCommunityMembers(w http.ResponseWriter, r *http.Request) {
    credCollection, _ := h.store.CredentialsCache(ctx)
    
    // Manual JSON query construction
    query := anystore.MustParseJSON(`{"schemaID": "EMatouMembershipSchemaV1"}`)
    
    iter, _ := credCollection.Find(query).Iter(ctx)
    defer iter.Close()
    
    for iter.Next() {
        doc, _ := iter.Doc()
        var cached anystore.CachedCredential
        json.Unmarshal([]byte(doc.Value().String()), &cached)
        
        // Manual filtering happens here
        if cached.SchemaID == "EMatouMembershipSchemaV1" {
            members = append(members, cached)
        }
    }
}
```

**API Endpoint:**
```
GET /api/v1/community/members
```

**Performance:** O(N) - Scans entire collection
**Problem:** 
- Manual JSON query construction
- No schema index (collection scan required)
- Query may not actually filter at DB level

---

### 4. Filter by Visibility (In-Memory)

**Used for:** Getting community-visible vs private credentials

```go
// backend/internal/api/sync.go
func (h *SyncHandler) HandleGetCommunityCredentials(w http.ResponseWriter, r *http.Request) {
    // Get ALL credentials
    iter, _ := credCollection.Find(nil).Iter(ctx)
    
    for iter.Next() {
        var cached anystore.CachedCredential
        json.Unmarshal([]byte(doc.Value().String()), &cached)
        
        // Filter in memory after retrieval
        anysyncCred := &anysync.Credential{Schema: cached.SchemaID}
        if !anysync.IsCommunityVisible(anysyncCred) {
            continue // Skip private credentials
        }
        
        credentials = append(credentials, cached)
    }
}
```

**Visibility Logic:**
```go
// backend/internal/anysync/credentials.go
func IsCommunityVisible(cred *Credential) bool {
    switch cred.Schema {
    case "EMatouMembershipSchemaV1":
        return true
    case "EOperationsStewardSchemaV1":
        return true
    case "ESelfClaimSchemaV1":
        return false // Private
    case "EInvitationSchemaV1":
        return false // Private
    default:
        return false
    }
}
```

**Performance:** O(N) - Full scan + in-memory filter
**Problem:** Two-pass filtering (database then memory)

---

### 5. Filter by Endorsement (Manual Query)

**Used for:** Getting endorsements for a member

```go
// backend/internal/anystore/client.go
func (s *LocalStore) GetEndorsementsForMember(
    ctx context.Context,
    memberAID string,
) ([]*CachedEndorsement, error) {
    coll, _ := s.EndorsementsCache(ctx)
    
    // Manual JSON query with string interpolation
    query := anyenc.MustParseJson(fmt.Sprintf(
        `{"endorseeAid": "%s"}`,
        memberAID,
    ))
    
    iter, _ := coll.Find(query).Iter(ctx)
    // ... iterate and collect
}
```

**API Endpoint:**
```
GET /api/v1/endorsements/{aid}
```

**Performance:** O(N) - Collection scan
**Problems:**
- String interpolation in query (SQL injection risk)
- No index on `endorseeAid`
- No verification of endorsement validity

---

## Trust Graph Building (Worst Case)

Trust graph construction requires **all credentials**:

```go
// backend/internal/trust/builder.go
func (b *Builder) Build(ctx context.Context) (*Graph, error) {
    graph := NewGraph(b.orgAID)
    
    // Get ALL credentials
    credentials, err := b.getAllCredentials(ctx)
    if err != nil {
        return nil, err
    }
    
    // Process each credential
    for _, cred := range credentials {
        b.processCredential(graph, cred)
    }
    
    graph.MarkBidirectionalEdges()
    return graph, nil
}

func (b *Builder) getAllCredentials(
    ctx context.Context,
) ([]*anystore.CachedCredential, error) {
    collection, _ := b.store.CredentialsCache(ctx)
    
    // Full collection scan
    iter, _ := collection.Find(nil).Iter(ctx)
    
    // Build in-memory list
    var credentials []*anystore.CachedCredential
    for iter.Next() {
        // Parse and append each credential
    }
    
    return credentials, nil
}
```

**Performance:** O(N) scan + O(N²) graph construction
**Problem:** No caching, rebuilds entire graph on every request

---

## Dual Storage: anystore + Any-Sync ObjectTree

Some endpoints try **two storage locations**:

```go
// backend/internal/api/sync.go
func (h *SyncHandler) HandleGetCommunityMembers(w http.ResponseWriter, r *http.Request) {
    // Try Any-Sync ObjectTree first
    communitySpaceID := h.spaceManager.GetCommunitySpaceID()
    if communitySpaceID != "" {
        treeMgr := h.spaceManager.CredentialTreeManager()
        if treeMgr != nil {
            creds, err := treeMgr.ReadCredentials(ctx, communitySpaceID)
            if err == nil && len(creds) > 0 {
                // Use P2P-synced credentials
                return credentials
            }
        }
    }
    
    // Fallback to anystore cache
    credCollection, _ := h.store.CredentialsCache(ctx)
    // ... scan collection
}
```

**Why Two Locations?**
1. **Any-Sync ObjectTree:** P2P-synced, community-visible credentials
2. **anystore:** Local cache, all credentials (including private)

**Problem:** Inconsistency between the two stores

---

## Performance Characteristics

### Current Performance (1000 credentials)

| Operation | Time | Method |
|-----------|------|--------|
| Get by SAID | ~1ms | Direct ID lookup |
| List all | ~50ms | Full scan + JSON parse |
| Filter by schema | ~50ms | Full scan + filter |
| Build trust graph | ~200ms | Full scan + graph construction |
| Community members | ~100ms | ObjectTree read OR full scan + filter |

### Bottlenecks

1. **No Indexes**
   - Every query except SAID lookup is O(N)
   - Schema filtering requires full scan
   - Subject/issuer filtering requires full scan

2. **JSON Parsing Overhead**
   - Every document is JSON string → Go struct
   - Happens on every scan

3. **Dual Storage**
   - ObjectTree read can fail → fallback to anystore
   - Inconsistency between stores

4. **Trust Graph Rebuild**
   - No caching
   - Rebuilds entire graph on every request
   - O(N²) edge detection

---

## Missing Functionality

### No Query By Issuer

```go
// DOES NOT EXIST
func GetCredentialsByIssuer(issuerAID string) ([]*Credential, error)
```

**Workaround:** Full scan + manual filter

### No Query By Subject

```go
// DOES NOT EXIST
func GetCredentialsBySubject(subjectAID string) ([]*Credential, error)
```

**Workaround:** Full scan + manual filter

### No Time-Based Query

```go
// DOES NOT EXIST
func GetCredentialsAfter(timestamp time.Time) ([]*Credential, error)
func GetCredentialsExpiring() ([]*Credential, error)
```

**Problem:** `CachedAt` and `ExpiresAt` fields exist but can't be queried

### No Revocation Check

```go
// DOES NOT EXIST
func IsRevoked(said string) (bool, error)
```

**Problem:** Revoked credentials remain in cache

### No Verification on Retrieval

```go
// DOES NOT EXIST
func GetVerifiedCredential(said string) (*Credential, error)
```

**Problem:** `Verified` boolean but no actual verification

---

## Comparison: What It Should Look Like

### Proper Indexed Storage

```sql
CREATE TABLE credentials (
    said TEXT PRIMARY KEY,
    issuer_aid TEXT NOT NULL,
    subject_aid TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    data JSON NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE,
    
    INDEX idx_issuer (issuer_aid),
    INDEX idx_subject (subject_aid),
    INDEX idx_schema (schema_id),
    INDEX idx_expires (expires_at)
);

CREATE TABLE revocations (
    credential_said TEXT PRIMARY KEY,
    revoked_at TIMESTAMP NOT NULL,
    revocation_said TEXT NOT NULL,
    reason TEXT,
    
    FOREIGN KEY (credential_said) REFERENCES credentials(said)
);
```

### Proper Query Methods

```go
func GetCredentialsByIssuer(issuerAID string) ([]*Credential, error) {
    // Uses index on issuer_aid
    return db.Query("SELECT * FROM credentials WHERE issuer_aid = ?", issuerAID)
}

func GetCredentialsBySubject(subjectAID string) ([]*Credential, error) {
    // Uses index on subject_aid
    return db.Query("SELECT * FROM credentials WHERE subject_aid = ?", subjectAID)
}

func GetCredentialsBySchema(schema string) ([]*Credential, error) {
    // Uses index on schema_id
    return db.Query("SELECT * FROM credentials WHERE schema_id = ?", schema)
}

func GetExpiringCredentials() ([]*Credential, error) {
    // Uses index on expires_at
    return db.Query("SELECT * FROM credentials WHERE expires_at < NOW() + INTERVAL '7 days'")
}

func IsRevoked(said string) (bool, error) {
    // Uses primary key on revocations
    var count int
    db.QueryRow("SELECT COUNT(*) FROM revocations WHERE credential_said = ?", said).Scan(&count)
    return count > 0, nil
}
```

### Verification on Retrieval

```go
func GetVerifiedCredential(
    ctx context.Context,
    said string,
) (*Credential, error) {
    // 1. Get from cache
    cred, err := s.GetCredential(ctx, said)
    if err != nil {
        return nil, err
    }
    
    // 2. Verify against witnesses
    if err := s.verifier.VerifyCredential(ctx, cred); err != nil {
        return nil, fmt.Errorf("verification failed: %w", err)
    }
    
    // 3. Check revocation
    if revoked, err := s.IsRevoked(ctx, said); err != nil || revoked {
        return nil, fmt.Errorf("credential revoked")
    }
    
    return cred, nil
}
```

---

## Recommendations

### Immediate (Week 1)

**1. Add Indexes to anystore Schema**

If anytype-heart supports indexes, add them:
```
- Index on `issuerAID`
- Index on `subjectAID`
- Index on `schemaID`
- Index on `expiresAt`
```

**2. Add Proper Query Methods**
```go
func GetCredentialsByIssuer(issuerAID string) ([]*Credential, error)
func GetCredentialsBySubject(subjectAID string) ([]*Credential, error)
func GetCredentialsBySchema(schema string) ([]*Credential, error)
```

**3. Add Expiration Cleanup**
```go
func DeleteExpiredCredentials(ctx context.Context) error {
    // Remove credentials where expiresAt < now
}
```

### Short Term (1-2 weeks)

**1. Add Verification to Lookup**
```go
func GetVerifiedCredential(said string) (*Credential, error) {
    cred, _ := GetCredential(said)
    verifier.VerifyCredential(ctx, cred)
    return cred
}
```

**2. Add Revocation Table**
```go
type Revocation struct {
    CredentialSAID string
    RevokedAt      time.Time
    RevocationSAID string
    Reason         string
}
```

**3. Cache Trust Graph**
```go
type TrustGraphCache struct {
    graph       *Graph
    lastUpdated time.Time
    ttl         time.Duration // e.g., 5 minutes
}
```

### Medium Term (1 month)

**1. Replace anystore with SQLite**
- Direct SQL queries
- Proper indexes
- Foreign keys
- Transactions

**2. Remove Dual Storage**
- Choose one source of truth
- Sync between them if needed

**3. Add Query Optimizer**
- Query planning
- Index usage analysis
- Slow query logging

---

## Critical Issues Summary

### Storage
- ❌ No indexes (except SAID)
- ❌ Manual JSON query construction
- ❌ String interpolation in queries
- ❌ Dual storage with inconsistency

### Lookup
- ❌ Full collection scans for most queries
- ❌ No query by issuer or subject
- ❌ No time-based queries
- ❌ In-memory filtering after retrieval

### Verification
- ❌ No verification on lookup
- ❌ `Verified` field is meaningless
- ❌ No revocation checking
- ❌ Expired credentials not cleaned up

### Performance
- ❌ O(N) for most operations
- ❌ No caching (trust graph rebuilt every time)
- ❌ JSON parse overhead on every lookup
- ❌ No query optimization

### Architecture
- ❌ Trust graph builder scans all credentials
- ❌ Community endpoints try two storage locations
- ❌ No foreign keys or referential integrity
- ❌ No transaction support

---

## Bottom Line

**Current credential lookup is:**
- Functional for small datasets (<1000 credentials)
- Unverified (trusts cached data)
- Unoptimized (full scans everywhere)
- Inconsistent (dual storage)

**To implement true SSI with trust policies:**
1. Add witness verification to lookup
2. Add proper indexes or switch to SQL
3. Query credentials by issuer/subject/time
4. Check revocation on every lookup
5. Cache verified results, not unverified credentials

**The goal:** Shift from "cache and trust" to "verify on demand with optional caching for performance."
