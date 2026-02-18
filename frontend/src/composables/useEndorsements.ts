/**
 * Composable for creating and managing endorsement credentials
 * Uses chained ACDC pattern where endorsements reference membership credentials via edges
 */
import { ref, computed } from 'vue';
import { useKERIClient } from 'src/lib/keri/client';
import { useIdentityStore } from 'stores/identity';
import { BACKEND_URL } from 'src/lib/api/client';
import { secureStorage } from 'src/lib/secureStorage';

// Schema SAIDs (computed via keripy on infrastructure)
const ENDORSEMENT_SCHEMA_SAID = 'EPIm7hiwSUt5css49iLXFPaPDFOJx0MmfNoB3PkSMXkh';
const REVOCATION_SCHEMA_SAID = 'ECTr_8xypBFYjSIwJkJ5OwD-PUb-8eceHIKc-vZh_BDK';
const MEMBERSHIP_SCHEMA_SAID = 'EOVL3N0K_tYc9U-HXg7r2jDPo4Gnq3ebCjDqbJzl6fsT';

// Schema server URL as seen by KERIA inside Docker (fixed internal hostname)
const SCHEMA_SERVER_URL = 'http://schema-server:7723';
const ENDORSEMENT_SCHEMA_OOBI = `${SCHEMA_SERVER_URL}/oobi/${ENDORSEMENT_SCHEMA_SAID}`;
const REVOCATION_SCHEMA_OOBI = `${SCHEMA_SERVER_URL}/oobi/${REVOCATION_SCHEMA_SAID}`;

// Endorsement types
export const EndorsementType = {
  IDENTITY_VERIFICATION: 'identity_verification',
  SKILL_ENDORSEMENT: 'skill_endorsement',
  ROLE_COMPETENCY: 'role_competency',
  CHARACTER_REFERENCE: 'character_reference',
} as const;

export type EndorsementTypeValue = typeof EndorsementType[keyof typeof EndorsementType];

// Confidence levels
export const ConfidenceLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  VERY_HIGH: 'very_high',
} as const;

export type ConfidenceLevelValue = typeof ConfidenceLevel[keyof typeof ConfidenceLevel];

// Revocation types
export const RevocationType = {
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
  SUPERSEDED: 'superseded',
  ERROR: 'error',
} as const;

export type RevocationTypeValue = typeof RevocationType[keyof typeof RevocationType];

// Endorsement interface
export interface Endorsement {
  said: string;
  endorserAid: string;
  endorserName?: string;
  endorseeAid: string;
  endorseeName?: string;
  endorsementType: EndorsementTypeValue;
  category?: string;
  claim: string;
  evidence?: string;
  confidence: ConfidenceLevelValue;
  relationship?: string;
  membershipSaid: string;
  issuedAt: string;
  revoked?: boolean;
  revokedAt?: string;
  revocationReason?: string;
}

// Endorsement issuance parameters
export interface IssueEndorsementParams {
  endorseeAid: string;
  endorseeMembershipSaid: string;
  endorseeOobi?: string;
  endorsementType: EndorsementTypeValue;
  category?: string;
  claim: string;
  evidence?: string;
  confidence: ConfidenceLevelValue;
  relationship?: string;
}

// Revocation parameters
export interface RevokeEndorsementParams {
  endorsementSaid: string;
  endorseeAid: string;
  reason: string;
  revocationType: RevocationTypeValue;
}

export function useEndorsements() {
  const keriClient = useKERIClient();
  const identityStore = useIdentityStore();

  // State
  const isProcessing = ref(false);
  const error = ref<string | null>(null);
  const lastEndorsement = ref<{ said: string; success: boolean } | null>(null);

  // Computed
  const currentAID = computed(() => identityStore.currentAID);

  /**
   * Get or create a personal registry for the endorser.
   * Each member needs their own registry to issue credentials.
   * The org's registry can only be used by the org AID.
   */
  async function getOrCreatePersonalRegistry(aidName: string): Promise<string> {
    const REGISTRY_KEY = `matou_endorser_registry_${aidName}`;

    // Check if we have a cached registry ID
    const cachedRegistryId = await secureStorage.getItem(REGISTRY_KEY);
    if (cachedRegistryId) {
      console.log(`[Endorsements] Using cached personal registry: ${cachedRegistryId}`);
      return cachedRegistryId;
    }

    const client = keriClient.getSignifyClient();
    if (!client) {
      throw new Error('Not connected to KERIA');
    }

    // Check if registry already exists in KERIA
    const registries = await client.registries().list(aidName);
    const registryName = `${aidName}-endorsements`;
    const existing = registries.find(
      (r: { name: string }) => r.name === registryName
    );

    if (existing) {
      console.log(`[Endorsements] Found existing registry: ${existing.regk}`);
      await secureStorage.setItem(REGISTRY_KEY, existing.regk);
      return existing.regk;
    }

    // Create new personal registry for endorsements
    console.log(`[Endorsements] Creating personal registry for ${aidName}...`);
    const result = await client.registries().create({
      name: aidName,
      registryName: registryName,
    });

    const op = await result.op();
    await client.operations().wait(op, { signal: AbortSignal.timeout(60000) });

    // Get the created registry ID
    const newRegistries = await client.registries().list(aidName);
    const newRegistry = newRegistries.find(
      (r: { name: string }) => r.name === registryName
    );

    if (!newRegistry) {
      throw new Error('Failed to create personal registry');
    }

    console.log(`[Endorsements] Created personal registry: ${newRegistry.regk}`);
    await secureStorage.setItem(REGISTRY_KEY, newRegistry.regk);
    return newRegistry.regk;
  }

  /**
   * Validate that the current user can issue endorsements
   */
  async function validateEndorser(): Promise<void> {
    if (!currentAID.value) {
      throw new Error('No identity found. Please ensure you are logged in.');
    }

    // Check that endorser has a membership credential
    const client = keriClient.getSignifyClient();
    if (!client) {
      throw new Error('Not connected to KERIA');
    }

    const credentials = await client.credentials().list();
    const hasMembership = credentials.some(
      (cred: { sad?: { s?: string } }) => cred.sad?.s === MEMBERSHIP_SCHEMA_SAID
    );

    if (!hasMembership) {
      throw new Error('You must have a valid membership credential to issue endorsements');
    }
  }

  /**
   * Issue an endorsement credential with edge chain to membership credential
   */
  async function issueEndorsement(
    params: IssueEndorsementParams
  ): Promise<{ success: boolean; said?: string; error?: string }> {
    if (isProcessing.value) {
      return { success: false, error: 'Already processing an endorsement' };
    }

    isProcessing.value = true;
    error.value = null;

    try {
      const client = keriClient.getSignifyClient();
      if (!client) {
        throw new Error('Not connected to KERIA');
      }

      // Validate endorser
      await validateEndorser();

      // Prevent self-endorsement
      if (params.endorseeAid === currentAID.value?.prefix) {
        throw new Error('You cannot endorse yourself');
      }

      const endorserAidName = currentAID.value!.name;

      // Get or create personal registry for the endorser
      // Note: Each member needs their own registry - they can't use the org's registry
      const registryId = await getOrCreatePersonalRegistry(endorserAidName);
      console.log(`[Endorsements] Using registry: ${registryId}`);

      // Resolve endorsement schema OOBI (required before issuing)
      console.log('[Endorsements] Resolving endorsement schema OOBI...');
      try {
        await keriClient.resolveOOBI(ENDORSEMENT_SCHEMA_OOBI, ENDORSEMENT_SCHEMA_SAID, 15000);
        console.log('[Endorsements] Endorsement schema OOBI resolved');
      } catch (schemaErr) {
        console.warn('[Endorsements] Schema OOBI resolution issue:', schemaErr);
        // Continue anyway - KERIA might already have it cached
      }

      // Resolve endorsee OOBI if provided
      if (params.endorseeOobi) {
        try {
          await keriClient.resolveOOBI(params.endorseeOobi, undefined, 10000);
          console.log('[Endorsements] Resolved endorsee OOBI');
        } catch (oobiErr) {
          console.warn('[Endorsements] Could not resolve endorsee OOBI:', oobiErr);
        }
      }

      const dt = new Date().toISOString();

      // Build edge section referencing the membership credential
      // The edge creates a cryptographic chain from endorsement to membership
      const edgeData = {
        d: '', // Will be populated by SAID calculation
        membership: {
          n: params.endorseeMembershipSaid,
          s: MEMBERSHIP_SCHEMA_SAID,
        },
      };

      console.log('[Endorsements] Issuing endorsement credential...');

      // Issue the credential with edge chain
      const credResult = await client.credentials().issue(endorserAidName, {
        ri: registryId,
        s: ENDORSEMENT_SCHEMA_SAID,
        a: {
          i: params.endorseeAid,
          dt: dt,
          endorsementType: params.endorsementType,
          category: params.category || '',
          claim: params.claim,
          evidence: params.evidence || '',
          confidence: params.confidence,
          relationship: params.relationship || '',
        },
        e: edgeData,
      });

      console.log('[Endorsements] Waiting for credential issuance...');
      const credOp = credResult.op;
      await client.operations().wait(credOp, { signal: AbortSignal.timeout(60000) });

      // Get SAID from the ACDC
      const acdcKed = (credResult.acdc as { ked?: { d?: string } })?.ked;
      const credentialSaid = acdcKed?.d || 'unknown';
      console.log(`[Endorsements] Credential issued with SAID: ${credentialSaid}`);

      // Grant the credential via IPEX to the endorsee
      console.log('[Endorsements] Granting endorsement via IPEX...');

      const [grant, gsigs, end] = await client.ipex().grant({
        senderName: endorserAidName,
        recipient: params.endorseeAid,
        message: JSON.stringify({
          type: 'endorsement',
          endorsementType: params.endorsementType,
          claim: params.claim,
        }),
        acdc: credResult.acdc,
        iss: credResult.iss,
        anc: credResult.anc,
        datetime: dt,
      });

      await client.ipex().submitGrant(endorserAidName, grant, gsigs, end, [params.endorseeAid]);

      const grantSaid = (grant as { ked?: { d?: string } })?.ked?.d || 'unknown';
      console.log(`[Endorsements] IPEX grant submitted, SAID: ${grantSaid}`);

      // Sync to backend for trust graph update
      try {
        await syncEndorsementToBackend({
          said: credentialSaid,
          endorserAid: currentAID.value!.prefix,
          endorseeAid: params.endorseeAid,
          endorsementType: params.endorsementType,
          category: params.category,
          claim: params.claim,
          confidence: params.confidence,
          relationship: params.relationship,
          membershipSaid: params.endorseeMembershipSaid,
          issuedAt: dt,
        });
      } catch (syncErr) {
        console.warn('[Endorsements] Backend sync deferred:', syncErr);
      }

      lastEndorsement.value = { said: credentialSaid, success: true };

      return { success: true, said: credentialSaid };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Endorsements] Issue failed:', err);
      error.value = errorMsg;
      lastEndorsement.value = { said: '', success: false };

      return { success: false, error: errorMsg };
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * Revoke a previously issued endorsement
   * Creates a revocation credential that chains to the original endorsement
   */
  async function revokeEndorsement(
    params: RevokeEndorsementParams
  ): Promise<{ success: boolean; said?: string; error?: string }> {
    if (isProcessing.value) {
      return { success: false, error: 'Already processing' };
    }

    isProcessing.value = true;
    error.value = null;

    try {
      const client = keriClient.getSignifyClient();
      if (!client) {
        throw new Error('Not connected to KERIA');
      }

      if (!currentAID.value) {
        throw new Error('No identity found');
      }

      const revokerAidName = currentAID.value.name;

      // Get or create personal registry for the revoker
      const registryId = await getOrCreatePersonalRegistry(revokerAidName);
      console.log(`[Endorsements] Using registry for revocation: ${registryId}`);

      // Resolve revocation schema OOBI (required before issuing)
      console.log('[Endorsements] Resolving revocation schema OOBI...');
      try {
        await keriClient.resolveOOBI(REVOCATION_SCHEMA_OOBI, REVOCATION_SCHEMA_SAID, 15000);
        console.log('[Endorsements] Revocation schema OOBI resolved');
      } catch (schemaErr) {
        console.warn('[Endorsements] Revocation schema OOBI resolution issue:', schemaErr);
        // Continue anyway - KERIA might already have it cached
      }

      const dt = new Date().toISOString();

      // Build edge section referencing the endorsement being revoked
      const edgeData = {
        d: '',
        endorsement: {
          n: params.endorsementSaid,
          s: ENDORSEMENT_SCHEMA_SAID,
        },
      };

      console.log('[Endorsements] Issuing revocation credential...');

      // Issue revocation credential
      const credResult = await client.credentials().issue(revokerAidName, {
        ri: registryId,
        s: REVOCATION_SCHEMA_SAID,
        a: {
          i: params.endorseeAid,
          dt: dt,
          reason: params.reason,
          revocationType: params.revocationType,
        },
        e: edgeData,
      });

      const credOp = credResult.op;
      await client.operations().wait(credOp, { signal: AbortSignal.timeout(60000) });

      const acdcKed = (credResult.acdc as { ked?: { d?: string } })?.ked;
      const revocationSaid = acdcKed?.d || 'unknown';
      console.log(`[Endorsements] Revocation issued with SAID: ${revocationSaid}`);

      // Grant revocation to endorsee (notification)
      const [grant, gsigs, end] = await client.ipex().grant({
        senderName: revokerAidName,
        recipient: params.endorseeAid,
        message: JSON.stringify({
          type: 'endorsement_revocation',
          endorsementSaid: params.endorsementSaid,
          reason: params.reason,
        }),
        acdc: credResult.acdc,
        iss: credResult.iss,
        anc: credResult.anc,
        datetime: dt,
      });

      await client.ipex().submitGrant(revokerAidName, grant, gsigs, end, [params.endorseeAid]);

      // Sync revocation to backend
      try {
        await syncRevocationToBackend(params.endorsementSaid, revocationSaid, params.reason, dt);
      } catch (syncErr) {
        console.warn('[Endorsements] Backend sync deferred:', syncErr);
      }

      return { success: true, said: revocationSaid };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[Endorsements] Revocation failed:', err);
      error.value = errorMsg;

      return { success: false, error: errorMsg };
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * Get all endorsements for a specific member
   */
  async function getEndorsementsFor(memberAid: string): Promise<Endorsement[]> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/endorsements/${memberAid}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn('[Endorsements] Failed to fetch endorsements:', await response.text());
        return [];
      }

      const result = await response.json() as { endorsements: Endorsement[] };
      return result.endorsements || [];
    } catch (err) {
      console.warn('[Endorsements] Error fetching endorsements:', err);
      return [];
    }
  }

  /**
   * Get endorsements issued by the current user
   */
  async function getMyIssuedEndorsements(): Promise<Endorsement[]> {
    if (!currentAID.value) return [];

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/endorsements/issued/${currentAID.value.prefix}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) return [];

      const result = await response.json() as { endorsements: Endorsement[] };
      return result.endorsements || [];
    } catch (err) {
      console.warn('[Endorsements] Error fetching issued endorsements:', err);
      return [];
    }
  }

  /**
   * Get endorsements received by the current user
   */
  async function getMyReceivedEndorsements(): Promise<Endorsement[]> {
    if (!currentAID.value) return [];
    return getEndorsementsFor(currentAID.value.prefix);
  }

  /**
   * Get endorsements from local KERIA wallet
   */
  async function getLocalEndorsements(): Promise<Endorsement[]> {
    const client = keriClient.getSignifyClient();
    if (!client) return [];

    try {
      const credentials = await client.credentials().list();
      const endorsements = credentials
        .filter((cred: { sad?: { s?: string } }) => cred.sad?.s === ENDORSEMENT_SCHEMA_SAID)
        .map((cred: { sad?: { d?: string; i?: string; a?: Record<string, unknown>; e?: { membership?: { n?: string } } } }) => ({
          said: cred.sad?.d || '',
          endorserAid: cred.sad?.i || '',
          endorseeAid: (cred.sad?.a?.i as string) || '',
          endorsementType: (cred.sad?.a?.endorsementType as EndorsementTypeValue) || 'skill_endorsement',
          category: (cred.sad?.a?.category as string) || '',
          claim: (cred.sad?.a?.claim as string) || '',
          evidence: (cred.sad?.a?.evidence as string) || '',
          confidence: (cred.sad?.a?.confidence as ConfidenceLevelValue) || 'medium',
          relationship: (cred.sad?.a?.relationship as string) || '',
          membershipSaid: cred.sad?.e?.membership?.n || '',
          issuedAt: (cred.sad?.a?.dt as string) || new Date().toISOString(),
        }));

      return endorsements;
    } catch (err) {
      console.warn('[Endorsements] Error fetching local endorsements:', err);
      return [];
    }
  }

  /**
   * Sync endorsement to backend for trust graph
   */
  async function syncEndorsementToBackend(endorsement: Endorsement): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/api/v1/endorsements/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endorsement }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Backend sync failed: ${await response.text()}`);
    }
  }

  /**
   * Sync revocation to backend
   */
  async function syncRevocationToBackend(
    endorsementSaid: string,
    revocationSaid: string,
    reason: string,
    revokedAt: string
  ): Promise<void> {
    const response = await fetch(`${BACKEND_URL}/api/v1/endorsements/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endorsementSaid,
        revocationSaid,
        reason,
        revokedAt,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Revocation sync failed: ${await response.text()}`);
    }
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = null;
  }

  return {
    // State
    isProcessing,
    error,
    lastEndorsement,

    // Constants
    EndorsementType,
    ConfidenceLevel,
    RevocationType,

    // Actions
    issueEndorsement,
    revokeEndorsement,
    getEndorsementsFor,
    getMyIssuedEndorsements,
    getMyReceivedEndorsements,
    getLocalEndorsements,
    clearError,
  };
}
