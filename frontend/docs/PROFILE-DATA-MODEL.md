# Profile Data Model & Space Architecture

## Overview

This document defines the data model and space architecture for private and community profiles in Matou Identity, following the Anytype object model paradigm. The design separates **user-writable** fields from **system-computed** fields, ensuring data integrity while preserving user sovereignty.

---

## Core Concepts

### Anytype Object Model Principles

| Concept | Description |
|---------|-------------|
| **Type** | Schema definition (like a class) |
| **Object** | Instance of a Type |
| **Relation** | Property/field on an Object |
| **Space** | Container for Objects with access control |

### Write Permission Levels

| Permission | Symbol | Description |
|------------|--------|-------------|
| `user` | ✏️ | User can create and modify |
| `system` | 🔒 | Only system can write (computed from activity) |
| `once` | 🔐 | User sets once, then immutable |
| `admin` | 👑 | Only community admins can modify |

---

## Space Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S DEVICE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   PERSONAL SPACE                          │  │
│  │  (Encrypted, never synced to community)                   │  │
│  │                                                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐        │  │
│  │  │   PrivateProfile    │  │   ProfileDraft      │        │  │
│  │  │   (1 per user)      │  │   (working copies)  │        │  │
│  │  └─────────────────────┘  └─────────────────────┘        │  │
│  │                                                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐        │  │
│  │  │   PrivateNote       │  │   Contact           │        │  │
│  │  │   (personal notes)  │  │   (private labels)  │        │  │
│  │  └─────────────────────┘  └─────────────────────┘        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                COMMUNITY SPACE: "Matou"                   │  │
│  │  (Synced via any-sync to community members)               │  │
│  │                                                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐        │  │
│  │  │   SharedProfile     │  │   CommunityProfile  │        │  │
│  │  │   (my public face)  │  │   (admin-enhanced)  │        │  │
│  │  └─────────────────────┘  └─────────────────────┘        │  │
│  │                                                           │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐        │  │
│  │  │   ActivityLog       │  │   Endorsement       │        │  │
│  │  │   (system-written)  │  │   (peer-written)    │        │  │
│  │  └─────────────────────┘  └─────────────────────┘        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              COMMUNITY SPACE: "Other Org"                 │  │
│  │  (User may belong to multiple communities)                │  │
│  │  ...                                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Space Types

#### 1. Personal Space
- **Scope**: Local device only, encrypted at rest
- **Sync**: Never synced to any-sync network
- **Access**: Only the owning user
- **Purpose**: Store sensitive data, drafts, private notes

#### 2. Community Space
- **Scope**: Shared with community members
- **Sync**: Synced via any-sync P2P network
- **Access**: Read by community members, write by owner + system
- **Purpose**: Public profile, activity history, endorsements

---

## Object Types

### 1. PrivateProfile

The user's complete private profile stored only in their Personal Space.

```typescript
interface PrivateProfile {
  // === Identity ===
  id: string;                          // 🔒 Object ID (system-generated)
  type: 'PrivateProfile';              // 🔒 Type identifier
  aid: string;                         // 🔐 KERI AID (set once at creation)

  // === User-Editable Fields ===
  displayName: string;                 // ✏️ Preferred display name
  legalName?: string;                  // ✏️ Real name (optional)
  bio: string;                         // ✏️ Personal biography
  email?: string;                      // ✏️ Contact email
  phone?: string;                      // ✏️ Contact phone
  avatar?: Blob;                       // ✏️ Profile image (stored as blob)
  avatarHash?: string;                 // 🔒 Hash for sync verification

  location?: {                         // ✏️ Location info
    country?: string;
    region?: string;
    city?: string;
    coordinates?: [number, number];    // [lat, lng]
  };

  // === Interests & Skills ===
  participationInterests: ParticipationInterest[];  // ✏️ How they want to participate
  customInterests: string[];           // ✏️ Free-form interests
  skills: string[];                    // ✏️ Self-declared skills
  languages: string[];                 // ✏️ Languages spoken

  // === Privacy Settings ===
  privacySettings: {                   // ✏️ User controls
    showEmail: 'nobody' | 'connections' | 'community' | 'public';
    showPhone: 'nobody' | 'connections' | 'community' | 'public';
    showLocation: 'nobody' | 'connections' | 'community' | 'public';
    showActivity: boolean;
    allowEndorsements: boolean;
    allowDirectMessages: boolean;
  };

  // === Wallet & Recovery ===
  mnemonicHint?: string;               // ✏️ User's hint for their mnemonic
  backupVerifiedAt?: string;           // 🔒 When backup was verified

  // === Metadata ===
  createdAt: string;                   // 🔒 ISO timestamp
  updatedAt: string;                   // 🔒 ISO timestamp (auto-updated)
}
```

### 2. SharedProfile

The public-facing profile synced to community spaces. Users control what's shared.

```typescript
interface SharedProfile {
  // === Identity ===
  id: string;                          // 🔒 Object ID (deterministic from AID)
  type: 'SharedProfile';               // 🔒 Type identifier
  aid: string;                         // 🔐 KERI AID (immutable link to identity)
  spaceId: string;                     // 🔒 Which community space this is in

  // === User-Editable Fields ===
  displayName: string;                 // ✏️ Public display name
  bio: string;                         // ✏️ Public biography
  avatarCid?: string;                  // ✏️ IPFS CID or any-sync blob ref

  interests: string[];                 // ✏️ Public interests
  skills: string[];                    // ✏️ Public skills

  // === Contact (based on privacy settings) ===
  publicEmail?: string;                // ✏️ Only if user opts in
  publicLinks: {                       // ✏️ External links
    website?: string;
    social?: Record<string, string>;   // { twitter: '@handle', ... }
  };

  // === System-Computed Fields ===
  memberSince: string;                 // 🔒 When membership credential issued
  lastActiveAt: string;                // 🔒 Last activity timestamp

  activityStats: {                     // 🔒 Computed from ActivityLog
    totalContributions: number;
    proposalsCreated: number;
    proposalsVoted: number;
    endorsementsGiven: number;
    endorsementsReceived: number;
    discussionPosts: number;
  };

  trustMetrics: {                      // 🔒 Computed from trust graph
    trustScore: number;                // Overall trust score
    graphDepth: number;                // Distance from org root
    incomingCredentials: number;       // Credentials received
    outgoingCredentials: number;       // Credentials issued
    bidirectionalRelations: number;    // Mutual trust relationships
  };

  // === Credential References ===
  credentials: CredentialRef[];        // 🔒 SAIDs of held credentials

  // === Verification Status ===
  verificationLevel: VerificationLevel; // 🔒 Computed from credentials
  verificationBadges: VerificationBadge[]; // 🔒 Earned badges

  // === Metadata ===
  createdAt: string;                   // 🔒 ISO timestamp
  updatedAt: string;                   // 🔒 ISO timestamp
  version: number;                     // 🔒 Optimistic locking
}
```

### 3. CommunityProfile

Admin-enhanced view of a member, extends SharedProfile with admin-only fields.

```typescript
interface CommunityProfile extends SharedProfile {
  type: 'CommunityProfile';            // 🔒 Type override

  // === Admin-Only Fields ===
  adminNotes?: string;                 // 👑 Internal notes from admins
  flags: ProfileFlag[];                // 👑 Admin-applied flags

  role: CommunityRole;                 // 👑 Assigned community role
  permissions: Permission[];           // 👑 Granted permissions

  moderationHistory: ModerationEvent[]; // 👑 History of mod actions

  // === System-Computed (Admin-Visible) ===
  riskIndicators: {                    // 🔒 Automated risk assessment
    accountAge: number;                // Days since creation
    activityPattern: 'normal' | 'suspicious' | 'inactive';
    reportCount: number;
    warningCount: number;
  };

  auditLog: AuditEntry[];              // 🔒 All changes to this profile
}
```

---

## Supporting Types

### Enums & Constants

```typescript
type ParticipationInterest =
  | 'research_knowledge'
  | 'coordination_operations'
  | 'art_design'
  | 'discussion_community_input'
  | 'follow_learn'
  | 'coding_technical_dev'
  | 'cultural_oversight';

type VerificationLevel =
  | 'unverified'           // No credentials
  | 'identity_verified'    // Basic membership credential
  | 'community_verified'   // Endorsed by community members
  | 'trusted_member'       // High trust score + endorsements
  | 'steward';             // Operations steward credential

type CommunityRole =
  | 'applicant'            // Pending approval
  | 'member'               // Basic member
  | 'contributor'          // Active contributor
  | 'moderator'            // Community moderator
  | 'steward'              // Operations steward
  | 'elder';               // Cultural/governance elder

type Permission =
  | 'read'
  | 'comment'
  | 'vote'
  | 'propose'
  | 'moderate'
  | 'approve_registrations'
  | 'issue_credentials'
  | 'revoke_credentials'
  | 'manage_members'
  | 'manage_spaces'
  | 'admin';
```

### Credential Reference

```typescript
interface CredentialRef {
  said: string;                        // Credential SAID
  schema: string;                      // Schema identifier
  issuer: string;                      // Issuer AID
  issuedAt: string;                    // When issued
  type: 'membership' | 'steward' | 'endorsement' | 'achievement';
}
```

### Activity & Audit

```typescript
interface ActivityLog {
  id: string;
  type: 'ActivityLog';
  profileAid: string;                  // Link to profile
  spaceId: string;

  entries: ActivityEntry[];            // 🔒 System-written only
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  action: ActivityAction;
  target?: string;                     // Object ID of target
  metadata?: Record<string, unknown>;
}

type ActivityAction =
  | 'joined_community'
  | 'created_proposal'
  | 'voted_on_proposal'
  | 'posted_discussion'
  | 'gave_endorsement'
  | 'received_endorsement'
  | 'earned_credential'
  | 'updated_profile'
  | 'invited_member';

interface AuditEntry {
  timestamp: string;
  actor: string;                       // AID of who made change
  action: string;
  fieldChanged?: string;
  oldValue?: unknown;
  newValue?: unknown;
}
```

### Endorsement

```typescript
interface Endorsement {
  id: string;
  type: 'Endorsement';
  spaceId: string;

  fromAid: string;                     // ✏️ Endorser (auto from signer)
  toAid: string;                       // ✏️ Endorsed profile

  category: EndorsementCategory;       // ✏️ What they're endorsing
  message?: string;                    // ✏️ Optional message
  skills?: string[];                   // ✏️ Specific skills endorsed

  createdAt: string;                   // 🔒 Timestamp
  signature: string;                   // 🔒 KERI signature
}

type EndorsementCategory =
  | 'knowledge'
  | 'reliability'
  | 'cultural_contribution'
  | 'technical_skill'
  | 'leadership'
  | 'mentorship';
```

### Flags & Moderation

```typescript
interface ProfileFlag {
  type: 'warning' | 'restriction' | 'highlight' | 'note';
  reason: string;
  appliedBy: string;                   // Admin AID
  appliedAt: string;
  expiresAt?: string;                  // Optional expiry
}

interface ModerationEvent {
  id: string;
  timestamp: string;
  moderator: string;                   // Admin AID
  action: 'warning' | 'mute' | 'restrict' | 'suspend' | 'reinstate';
  reason: string;
  duration?: number;                   // Hours
}

interface VerificationBadge {
  id: string;
  name: string;
  description: string;
  icon: string;                        // Icon identifier
  earnedAt: string;
  credentialSaid?: string;             // Backing credential
}
```

---

## Field Write Permissions Matrix

| Field | PrivateProfile | SharedProfile | CommunityProfile |
|-------|----------------|---------------|------------------|
| `displayName` | ✏️ User | ✏️ User | ✏️ User |
| `bio` | ✏️ User | ✏️ User | ✏️ User |
| `avatar` | ✏️ User | ✏️ User | ✏️ User |
| `email` | ✏️ User | ✏️ User (opt-in) | ✏️ User |
| `location` | ✏️ User | - | 👑 Admin |
| `interests` | ✏️ User | ✏️ User | ✏️ User |
| `skills` | ✏️ User | ✏️ User | ✏️ User |
| `privacySettings` | ✏️ User | - | - |
| `memberSince` | - | 🔒 System | 🔒 System |
| `lastActiveAt` | - | 🔒 System | 🔒 System |
| `activityStats` | - | 🔒 System | 🔒 System |
| `trustMetrics` | - | 🔒 System | 🔒 System |
| `credentials` | - | 🔒 System | 🔒 System |
| `verificationLevel` | - | 🔒 System | 🔒 System |
| `role` | - | - | 👑 Admin |
| `permissions` | - | - | 👑 Admin |
| `adminNotes` | - | - | 👑 Admin |
| `flags` | - | - | 👑 Admin |
| `riskIndicators` | - | - | 🔒 System |
| `auditLog` | - | - | 🔒 System |

---

## Sync & Propagation Rules

### Profile Update Flow

```
┌─────────────────┐
│  User edits     │
│  PrivateProfile │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Privacy Filter                              │
│  (Apply privacySettings to determine what   │
│   gets copied to SharedProfile)             │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  Update SharedProfile                        │
│  (In each community space user belongs to)  │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  any-sync propagation                        │
│  (P2P sync to community members)            │
└─────────────────────────────────────────────┘
```

### System Field Computation

System-writable fields are computed by background processes:

| Field | Trigger | Computation |
|-------|---------|-------------|
| `lastActiveAt` | Any user action | Current timestamp |
| `activityStats` | ActivityLog update | Aggregate counts |
| `trustMetrics` | Credential change | Trust graph recalculation |
| `verificationLevel` | Credential change | Check held credentials |
| `verificationBadges` | Various | Rule-based badge awarding |
| `riskIndicators` | Periodic | Pattern analysis |

---

## Schema Definitions (KERI/ACDC Compatible)

### PrivateProfile Schema

```json
{
  "$id": "EPrivateProfileSchemaV1",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Private Profile",
  "description": "User's complete private profile stored locally",
  "type": "object",
  "credentialType": "PrivateProfileCredential",
  "properties": {
    "aid": { "type": "string", "format": "keri-aid" },
    "displayName": { "type": "string", "maxLength": 100 },
    "legalName": { "type": "string", "maxLength": 200 },
    "bio": { "type": "string", "maxLength": 2000 },
    "email": { "type": "string", "format": "email" },
    "phone": { "type": "string" },
    "avatar": { "type": "string", "contentEncoding": "base64" },
    "location": {
      "type": "object",
      "properties": {
        "country": { "type": "string" },
        "region": { "type": "string" },
        "city": { "type": "string" },
        "coordinates": {
          "type": "array",
          "items": { "type": "number" },
          "minItems": 2,
          "maxItems": 2
        }
      }
    },
    "participationInterests": {
      "type": "array",
      "items": { "type": "string" }
    },
    "skills": { "type": "array", "items": { "type": "string" } },
    "languages": { "type": "array", "items": { "type": "string" } },
    "privacySettings": { "$ref": "#/$defs/privacySettings" }
  },
  "required": ["aid", "displayName"],
  "$defs": {
    "privacySettings": {
      "type": "object",
      "properties": {
        "showEmail": { "enum": ["nobody", "connections", "community", "public"] },
        "showPhone": { "enum": ["nobody", "connections", "community", "public"] },
        "showLocation": { "enum": ["nobody", "connections", "community", "public"] },
        "showActivity": { "type": "boolean" },
        "allowEndorsements": { "type": "boolean" },
        "allowDirectMessages": { "type": "boolean" }
      }
    }
  }
}
```

### SharedProfile Schema

```json
{
  "$id": "ESharedProfileSchemaV1",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Shared Profile",
  "description": "Public profile synced to community spaces",
  "type": "object",
  "credentialType": "SharedProfileCredential",
  "properties": {
    "aid": { "type": "string", "format": "keri-aid" },
    "spaceId": { "type": "string" },
    "displayName": { "type": "string", "maxLength": 100 },
    "bio": { "type": "string", "maxLength": 1000 },
    "avatarCid": { "type": "string" },
    "interests": { "type": "array", "items": { "type": "string" } },
    "skills": { "type": "array", "items": { "type": "string" } },
    "publicEmail": { "type": "string", "format": "email" },
    "publicLinks": {
      "type": "object",
      "properties": {
        "website": { "type": "string", "format": "uri" },
        "social": { "type": "object", "additionalProperties": { "type": "string" } }
      }
    },
    "memberSince": { "type": "string", "format": "date-time" },
    "lastActiveAt": { "type": "string", "format": "date-time" },
    "activityStats": { "$ref": "#/$defs/activityStats" },
    "trustMetrics": { "$ref": "#/$defs/trustMetrics" },
    "credentials": {
      "type": "array",
      "items": { "$ref": "#/$defs/credentialRef" }
    },
    "verificationLevel": {
      "enum": ["unverified", "identity_verified", "community_verified", "trusted_member", "steward"]
    }
  },
  "required": ["aid", "spaceId", "displayName"],
  "$defs": {
    "activityStats": {
      "type": "object",
      "properties": {
        "totalContributions": { "type": "integer", "minimum": 0 },
        "proposalsCreated": { "type": "integer", "minimum": 0 },
        "proposalsVoted": { "type": "integer", "minimum": 0 },
        "endorsementsGiven": { "type": "integer", "minimum": 0 },
        "endorsementsReceived": { "type": "integer", "minimum": 0 },
        "discussionPosts": { "type": "integer", "minimum": 0 }
      }
    },
    "trustMetrics": {
      "type": "object",
      "properties": {
        "trustScore": { "type": "number" },
        "graphDepth": { "type": "integer" },
        "incomingCredentials": { "type": "integer" },
        "outgoingCredentials": { "type": "integer" },
        "bidirectionalRelations": { "type": "integer" }
      }
    },
    "credentialRef": {
      "type": "object",
      "properties": {
        "said": { "type": "string" },
        "schema": { "type": "string" },
        "issuer": { "type": "string" },
        "issuedAt": { "type": "string", "format": "date-time" },
        "type": { "enum": ["membership", "steward", "endorsement", "achievement"] }
      },
      "required": ["said", "schema", "issuer", "issuedAt", "type"]
    }
  }
}
```

---

## Implementation Notes

### 1. Object ID Generation

```typescript
// PrivateProfile: Random UUID (local only)
const privateProfileId = crypto.randomUUID();

// SharedProfile: Deterministic from AID + spaceId
const sharedProfileId = hashKeri(`${aid}:${spaceId}:SharedProfile`);

// CommunityProfile: Same as SharedProfile (it's an extension)
const communityProfileId = hashKeri(`${aid}:${spaceId}:CommunityProfile`);
```

### 2. Privacy Filter Implementation

```typescript
function deriveSharedProfile(
  privateProfile: PrivateProfile,
  spaceId: string
): SharedProfile {
  const settings = privateProfile.privacySettings;

  return {
    id: hashKeri(`${privateProfile.aid}:${spaceId}:SharedProfile`),
    type: 'SharedProfile',
    aid: privateProfile.aid,
    spaceId,

    // Always shared
    displayName: privateProfile.displayName,
    bio: privateProfile.bio,
    avatarCid: privateProfile.avatarHash,
    interests: privateProfile.participationInterests,
    skills: privateProfile.skills,

    // Conditional based on privacy settings
    publicEmail: settings.showEmail !== 'nobody' ? privateProfile.email : undefined,

    // System fields initialized
    memberSince: '', // Set by system on join
    lastActiveAt: new Date().toISOString(),
    activityStats: { /* initialized to zeros */ },
    trustMetrics: { /* computed by system */ },
    credentials: [],
    verificationLevel: 'unverified',
    verificationBadges: [],

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}
```

### 3. System Field Update Service

```typescript
class ProfileSystemService {
  // Called when user performs any action
  async recordActivity(aid: string, action: ActivityAction, target?: string) {
    // Update lastActiveAt
    await this.updateField(aid, 'lastActiveAt', new Date().toISOString());

    // Append to activity log
    await this.appendActivityLog(aid, { action, target, timestamp: new Date() });

    // Recompute stats
    await this.recomputeActivityStats(aid);
  }

  // Called when credentials change
  async onCredentialChange(aid: string) {
    // Recompute trust metrics from trust graph
    const trustMetrics = await this.trustGraph.computeMetrics(aid);
    await this.updateField(aid, 'trustMetrics', trustMetrics);

    // Update verification level
    const credentials = await this.getCredentials(aid);
    const verificationLevel = this.computeVerificationLevel(credentials);
    await this.updateField(aid, 'verificationLevel', verificationLevel);

    // Check for new badges
    await this.checkAndAwardBadges(aid);
  }
}
```

---

## Migration from Current Model

The current `ProfileData` interface maps to the new model as follows:

| Current Field | New Location | Notes |
|---------------|--------------|-------|
| `name` | `PrivateProfile.displayName` | Direct map |
| `bio` | `PrivateProfile.bio` | Direct map |
| `email` | `PrivateProfile.email` | Direct map |
| `avatar` | `PrivateProfile.avatar` | Direct map |
| `participationInterests` | `PrivateProfile.participationInterests` | Direct map |
| `customInterests` | `PrivateProfile.customInterests` | Direct map |
| `hasAgreedToTerms` | `PrivateProfile.agreedToTermsAt` | Convert to timestamp |

---

## Future Extensions

### 1. Multi-Community Profiles
Users can have different SharedProfiles for different communities with different visibility settings.

### 2. Selective Disclosure
Using KERI's ACDC selective disclosure, users can reveal specific fields to specific parties without revealing entire profile.

### 3. Reputation Portability
Trust metrics and endorsements could be partially portable between communities using chained credentials.

### 4. Decentralized Storage
Avatars and large media could use IPFS/Filecoin with CIDs stored in profile, enabling true decentralization.
