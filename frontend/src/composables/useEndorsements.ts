/**
 * Composable for creating and managing endorsement credentials
 * Uses chained ACDC pattern where endorsements reference membership credentials via edges
 */
import { ref, computed } from 'vue';
import { useKERIClient } from 'src/lib/keri/client';
import { useIdentityStore } from 'stores/identity';
import { fetchOrgConfig } from 'src/api/config';
import { BACKEND_URL } from 'src/lib/api/client';

// Schema SAIDs (computed via backend/schemas/saidify.js)
const ENDORSEMENT_SCHEMA_SAID = 'ESy4fT0P9b-HiY5nbi0p4tIlEGI2FBLckTY5-wL9ZpTo';
const REVOCATION_SCHEMA_SAID = 'ETsdvysaC0FapPtkyUc58C2DrS1joieXa6-TW7I0VyxI';
const MEMBERSHIP_SCHEMA_SAID = 'EOVL3N0K_tYc9U-HXg7r2jDPo4Gnq3ebCjDqbJzl6fsT';

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
   * Get the registry ID for issuing endorsements
   * Uses the organization's shared registry
   */
  async function getRegistryId(): Promise<string> {
    const configResult = await fetchOrgConfig();
    if (configResult.status === 'not_configured') {
      throw new Error('Organization not configured');
    }

    const config = configResult.status === 'configured'
      ? configResult.config
      : configResult.cached;

    if (!config?.registry?.id) {
      throw new Error('No registry configured for credential issuance');
    }

    return config.registry.id;
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

      // Get registry ID
      const registryId = await getRegistryId();

      // Resolve endorsee OOBI if provided
      if (params.endorseeOobi) {
        try {
          await keriClient.resolveOOBI(params.endorseeOobi, undefined, 10000);
          console.log('[Endorsements] Resolved endorsee OOBI');
        } catch (oobiErr) {
          console.warn('[Endorsements] Could not resolve endorsee OOBI:', oobiErr);
        }
      }

      const endorserAidName = currentAID.value!.name;
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

      // Get registry ID
      const registryId = await getRegistryId();

      const revokerAidName = currentAID.value.name;
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
