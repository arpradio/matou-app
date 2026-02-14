import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useEndorsements, type Endorsement } from 'src/composables/useEndorsements';

export const useEndorsementsStore = defineStore('endorsements', () => {
  // State
  const receivedEndorsements = ref<Endorsement[]>([]);
  const issuedEndorsements = ref<Endorsement[]>([]);
  const endorsementsByMember = ref<Map<string, Endorsement[]>>(new Map());
  const loading = ref(false);
  const lastUpdated = ref<Date | null>(null);

  // Computed
  const totalReceived = computed(() => receivedEndorsements.value.length);
  const totalIssued = computed(() => issuedEndorsements.value.length);
  const activeReceived = computed(() =>
    receivedEndorsements.value.filter(e => !e.revoked)
  );
  const activeIssued = computed(() =>
    issuedEndorsements.value.filter(e => !e.revoked)
  );

  // Group endorsements by type
  const receivedByType = computed(() => {
    const grouped: Record<string, Endorsement[]> = {};
    for (const e of activeReceived.value) {
      if (!grouped[e.endorsementType]) {
        grouped[e.endorsementType] = [];
      }
      grouped[e.endorsementType].push(e);
    }
    return grouped;
  });

  /**
   * Load endorsements for the current user
   */
  async function loadMyEndorsements(): Promise<void> {
    loading.value = true;
    try {
      const endorsements = useEndorsements();

      const [received, issued, local] = await Promise.all([
        endorsements.getMyReceivedEndorsements(),
        endorsements.getMyIssuedEndorsements(),
        endorsements.getLocalEndorsements(),
      ]);

      // Merge backend and local endorsements (prefer backend for duplicates)
      const receivedMap = new Map(received.map(e => [e.said, e]));
      for (const e of local) {
        if (!receivedMap.has(e.said)) {
          receivedMap.set(e.said, e);
        }
      }

      receivedEndorsements.value = Array.from(receivedMap.values());
      issuedEndorsements.value = issued;
      lastUpdated.value = new Date();

      console.log(`[EndorsementsStore] Loaded ${receivedEndorsements.value.length} received, ${issuedEndorsements.value.length} issued`);
    } catch (err) {
      console.warn('[EndorsementsStore] Failed to load endorsements:', err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Load endorsements for a specific member
   */
  async function loadEndorsementsFor(memberAid: string): Promise<Endorsement[]> {
    // Check cache first
    const cached = endorsementsByMember.value.get(memberAid);
    if (cached) {
      return cached;
    }

    try {
      const endorsements = useEndorsements();
      const memberEndorsements = await endorsements.getEndorsementsFor(memberAid);

      // Cache the results
      endorsementsByMember.value.set(memberAid, memberEndorsements);

      return memberEndorsements;
    } catch (err) {
      console.warn(`[EndorsementsStore] Failed to load endorsements for ${memberAid}:`, err);
      return [];
    }
  }

  /**
   * Add a newly issued endorsement to the store
   */
  function addIssuedEndorsement(endorsement: Endorsement): void {
    issuedEndorsements.value.push(endorsement);

    // Update cache for the endorsee
    const cached = endorsementsByMember.value.get(endorsement.endorseeAid);
    if (cached) {
      cached.push(endorsement);
    }
  }

  /**
   * Add a received endorsement to the store
   */
  function addReceivedEndorsement(endorsement: Endorsement): void {
    // Check if already exists
    const exists = receivedEndorsements.value.some(e => e.said === endorsement.said);
    if (!exists) {
      receivedEndorsements.value.push(endorsement);
    }
  }

  /**
   * Mark an endorsement as revoked
   */
  function markRevoked(endorsementSaid: string, reason?: string): void {
    const now = new Date().toISOString();

    // Update in received
    const receivedIdx = receivedEndorsements.value.findIndex(e => e.said === endorsementSaid);
    if (receivedIdx !== -1) {
      receivedEndorsements.value[receivedIdx].revoked = true;
      receivedEndorsements.value[receivedIdx].revokedAt = now;
      receivedEndorsements.value[receivedIdx].revocationReason = reason;
    }

    // Update in issued
    const issuedIdx = issuedEndorsements.value.findIndex(e => e.said === endorsementSaid);
    if (issuedIdx !== -1) {
      issuedEndorsements.value[issuedIdx].revoked = true;
      issuedEndorsements.value[issuedIdx].revokedAt = now;
      issuedEndorsements.value[issuedIdx].revocationReason = reason;
    }

    // Update in cache
    for (const [aid, endorsements] of endorsementsByMember.value) {
      const idx = endorsements.findIndex(e => e.said === endorsementSaid);
      if (idx !== -1) {
        endorsements[idx].revoked = true;
        endorsements[idx].revokedAt = now;
        endorsements[idx].revocationReason = reason;
      }
    }
  }

  /**
   * Get endorsements for a member (from cache or empty)
   */
  function getEndorsements(memberAid: string): Endorsement[] {
    return endorsementsByMember.value.get(memberAid) || [];
  }

  /**
   * Clear the cache for a specific member
   */
  function clearCacheFor(memberAid: string): void {
    endorsementsByMember.value.delete(memberAid);
  }

  /**
   * Clear all cached data
   */
  function clearAll(): void {
    receivedEndorsements.value = [];
    issuedEndorsements.value = [];
    endorsementsByMember.value.clear();
    lastUpdated.value = null;
  }

  return {
    // State
    receivedEndorsements,
    issuedEndorsements,
    endorsementsByMember,
    loading,
    lastUpdated,

    // Computed
    totalReceived,
    totalIssued,
    activeReceived,
    activeIssued,
    receivedByType,

    // Actions
    loadMyEndorsements,
    loadEndorsementsFor,
    addIssuedEndorsement,
    addReceivedEndorsement,
    markRevoked,
    getEndorsements,
    clearCacheFor,
    clearAll,
  };
});
