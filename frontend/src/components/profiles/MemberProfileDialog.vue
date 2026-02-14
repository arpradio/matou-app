<template>
  <div class="member-profile-overlay" @click.self="$emit('close')">
    <div class="member-profile-dialog">
      <div class="dialog-header">
        <h2>Member Profile</h2>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <div class="dialog-body">
        <!-- SharedProfile (community space) -->
        <section class="dialog-section" v-if="sharedData">
          <TypedDisplay
            typeName="SharedProfile"
            layout="detail"
            :data="sharedData"
          />
        </section>

        <!-- CommunityProfile (community read-only space) -->
        <section class="dialog-section" v-if="communityData">
          <h3>Membership Info</h3>
          <TypedDisplay
            typeName="CommunityProfile"
            layout="detail"
            :data="communityData"
          />
        </section>

        <!-- Endorsements Section -->
        <section class="dialog-section" v-if="memberAid">
          <div class="endorsements-header">
            <h3>Endorsements</h3>
            <button
              v-if="canEndorse"
              class="endorse-btn"
              @click="showEndorsementModal = true"
            >
              <Award :size="16" />
              Endorse
            </button>
          </div>
          <EndorsementList
            :endorsements="memberEndorsements"
            :loading="loadingEndorsements"
            :current-user-aid="currentUserAid"
            :can-endorse="canEndorse"
            :hide-revoked="false"
            @revoke="handleRevoke"
          />
        </section>

        <div v-if="!sharedData && !communityData" class="no-data">
          No profile data available.
        </div>
      </div>
    </div>

    <!-- Create Endorsement Modal -->
    <CreateEndorsementModal
      v-if="memberAid && membershipSaid"
      :is-open="showEndorsementModal"
      :endorsee-aid="memberAid"
      :endorsee-name="memberName"
      :endorsee-membership-said="membershipSaid"
      :endorsee-oobi="memberOobi"
      @close="showEndorsementModal = false"
      @success="handleEndorsementSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Award } from 'lucide-vue-next';
import TypedDisplay from './TypedDisplay.vue';
import EndorsementList from '../endorsements/EndorsementList.vue';
import CreateEndorsementModal from '../endorsements/CreateEndorsementModal.vue';
import { useEndorsementsStore } from 'stores/endorsements';
import { useIdentityStore } from 'stores/identity';
import type { Endorsement } from 'src/composables/useEndorsements';

const props = defineProps<{
  sharedProfile?: Record<string, unknown>;
  communityProfile?: Record<string, unknown>;
  memberAid?: string;
  membershipSaid?: string;
  memberOobi?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'endorsementCreated', said: string): void;
}>();

const endorsementsStore = useEndorsementsStore();
const identityStore = useIdentityStore();

// State
const showEndorsementModal = ref(false);
const loadingEndorsements = ref(false);
const memberEndorsements = ref<Endorsement[]>([]);

// Computed
const sharedData = computed(() => {
  if (!props.sharedProfile) return null;
  // Data may be nested in .data or at top level
  return (props.sharedProfile.data as Record<string, unknown>) || props.sharedProfile;
});

const communityData = computed(() => {
  if (!props.communityProfile) return null;
  return (props.communityProfile.data as Record<string, unknown>) || props.communityProfile;
});

const memberName = computed(() => {
  const data = sharedData.value || communityData.value;
  return (data?.displayName as string) || (data?.name as string) || undefined;
});

const currentUserAid = computed(() => identityStore.currentAID?.prefix);

const canEndorse = computed(() => {
  // Can endorse if: logged in, has different AID than member, and member has AID
  return (
    currentUserAid.value &&
    props.memberAid &&
    currentUserAid.value !== props.memberAid
  );
});

// Load endorsements when member changes
watch(() => props.memberAid, async (aid) => {
  if (aid) {
    await loadEndorsements(aid);
  }
}, { immediate: true });

async function loadEndorsements(aid: string) {
  loadingEndorsements.value = true;
  try {
    memberEndorsements.value = await endorsementsStore.loadEndorsementsFor(aid);
  } catch (err) {
    console.warn('[MemberProfileDialog] Failed to load endorsements:', err);
    memberEndorsements.value = [];
  } finally {
    loadingEndorsements.value = false;
  }
}

function handleEndorsementSuccess(said: string) {
  // Refresh endorsements
  if (props.memberAid) {
    endorsementsStore.clearCacheFor(props.memberAid);
    loadEndorsements(props.memberAid);
  }
  emit('endorsementCreated', said);
}

async function handleRevoke(endorsement: Endorsement) {
  // TODO: Implement revocation modal
  console.log('[MemberProfileDialog] Revoke requested for:', endorsement.said);
}
</script>

<style scoped>
.member-profile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.member-profile-dialog {
  background: var(--matou-surface, #fff);
  border-radius: 0.75rem;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--matou-border, #e5e7eb);
}

.dialog-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
  color: var(--matou-text, #1f2937);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--matou-text-secondary, #6b7280);
  padding: 0;
  line-height: 1;
}

.dialog-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.dialog-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--matou-text-secondary, #6b7280);
  margin: 0 0 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.endorsements-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.endorsements-header h3 {
  margin: 0;
}

.endorse-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: var(--matou-primary, #7c3aed);
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.endorse-btn:hover {
  background: var(--matou-primary-dark, #6d28d9);
}

.no-data {
  text-align: center;
  color: var(--matou-text-secondary, #6b7280);
  padding: 2rem 0;
}
</style>
