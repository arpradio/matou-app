/**
 * Composable for polling endorsement credential grants
 * Detects when new endorsement credentials are received via IPEX
 */
import { ref, onUnmounted } from 'vue';
import { useKERIClient } from 'src/lib/keri/client';
import { useIdentityStore } from 'stores/identity';
import { useEndorsementsStore } from 'stores/endorsements';
import type { Endorsement } from './useEndorsements';

const ENDORSEMENT_SCHEMA_SAID = 'EMatouEndorsementSchemaV1';
const REVOCATION_SCHEMA_SAID = 'EMatouEndorsementRevocationSchemaV1';

export interface EndorsementPollingOptions {
  pollingInterval?: number; // Default: 10000ms (10 seconds)
}

export interface EndorsementNotification {
  type: 'endorsement' | 'revocation';
  said: string;
  endorserAid: string;
  claim?: string;
}

export function useEndorsementPolling(options: EndorsementPollingOptions = {}) {
  const { pollingInterval = 10000 } = options;

  const keriClient = useKERIClient();
  const identityStore = useIdentityStore();
  const endorsementsStore = useEndorsementsStore();

  // State
  const isPolling = ref(false);
  const newEndorsements = ref<EndorsementNotification[]>([]);
  const lastPollTime = ref<Date | null>(null);

  // Internal state
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let knownCredentialSaids = new Set<string>();

  /**
   * Poll for new endorsement credentials in wallet
   */
  async function pollForEndorsements(): Promise<void> {
    const client = keriClient.getSignifyClient();
    if (!client) return;

    try {
      // Get all credentials from wallet
      const credentials = await client.credentials().list();

      // Check for new endorsement credentials
      for (const cred of credentials) {
        const schema = cred.sad?.s;
        const said = cred.sad?.d;

        if (!said || knownCredentialSaids.has(said)) continue;

        // Check if this is an endorsement or revocation
        if (schema === ENDORSEMENT_SCHEMA_SAID) {
          knownCredentialSaids.add(said);

          const notification: EndorsementNotification = {
            type: 'endorsement',
            said: said,
            endorserAid: cred.sad?.i || '',
            claim: cred.sad?.a?.claim as string,
          };

          newEndorsements.value.push(notification);
          console.log('[EndorsementPolling] New endorsement received:', notification);

          // Add to store
          endorsementsStore.addReceivedEndorsement({
            said: said,
            endorserAid: cred.sad?.i || '',
            endorseeAid: cred.sad?.a?.i as string || '',
            endorsementType: cred.sad?.a?.endorsementType as any || 'skill_endorsement',
            category: cred.sad?.a?.category as string,
            claim: cred.sad?.a?.claim as string || '',
            confidence: cred.sad?.a?.confidence as any || 'medium',
            relationship: cred.sad?.a?.relationship as string,
            membershipSaid: cred.sad?.e?.membership?.n as string || '',
            issuedAt: cred.sad?.a?.dt as string || new Date().toISOString(),
          });
        } else if (schema === REVOCATION_SCHEMA_SAID) {
          knownCredentialSaids.add(said);

          const endorsementSaid = cred.sad?.e?.endorsement?.n as string;
          if (endorsementSaid) {
            const notification: EndorsementNotification = {
              type: 'revocation',
              said: said,
              endorserAid: cred.sad?.i || '',
            };

            newEndorsements.value.push(notification);
            console.log('[EndorsementPolling] Endorsement revocation received:', notification);

            // Mark as revoked in store
            endorsementsStore.markRevoked(
              endorsementSaid,
              cred.sad?.a?.reason as string
            );
          }
        }
      }

      lastPollTime.value = new Date();
    } catch (err) {
      console.warn('[EndorsementPolling] Poll error:', err);
    }
  }

  /**
   * Initialize known credentials (so we don't re-notify for existing ones)
   */
  async function initializeKnownCredentials(): Promise<void> {
    const client = keriClient.getSignifyClient();
    if (!client) return;

    try {
      const credentials = await client.credentials().list();
      for (const cred of credentials) {
        const said = cred.sad?.d;
        if (said) {
          knownCredentialSaids.add(said);
        }
      }
      console.log(`[EndorsementPolling] Initialized with ${knownCredentialSaids.size} known credentials`);
    } catch (err) {
      console.warn('[EndorsementPolling] Failed to initialize known credentials:', err);
    }
  }

  /**
   * Start polling for endorsements
   */
  async function startPolling(): Promise<void> {
    if (isPolling.value) return;

    const client = keriClient.getSignifyClient();
    if (!client) {
      console.warn('[EndorsementPolling] No client available');
      return;
    }

    // Initialize known credentials first
    await initializeKnownCredentials();

    isPolling.value = true;

    // Start polling
    pollingTimer = setInterval(() => {
      pollForEndorsements();
    }, pollingInterval);

    console.log('[EndorsementPolling] Started polling');
  }

  /**
   * Stop polling
   */
  function stopPolling(): void {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    isPolling.value = false;
    console.log('[EndorsementPolling] Stopped polling');
  }

  /**
   * Clear new endorsements (after user has seen them)
   */
  function clearNewEndorsements(): void {
    newEndorsements.value = [];
  }

  /**
   * Get and clear new endorsements
   */
  function consumeNewEndorsements(): EndorsementNotification[] {
    const notifications = [...newEndorsements.value];
    newEndorsements.value = [];
    return notifications;
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling();
  });

  return {
    // State
    isPolling,
    newEndorsements,
    lastPollTime,

    // Actions
    startPolling,
    stopPolling,
    pollForEndorsements,
    clearNewEndorsements,
    consumeNewEndorsements,
  };
}
