<template>
  <div class="endorsement-list">
    <div v-if="loading" class="endorsement-list__loading">
      <Loader2 class="animate-spin" :size="24" />
      <span>Loading endorsements...</span>
    </div>

    <div v-else-if="endorsements.length === 0" class="endorsement-list__empty">
      <Award :size="32" />
      <p>No endorsements yet</p>
      <p v-if="canEndorse" class="endorsement-list__empty-hint">
        Be the first to endorse this member!
      </p>
    </div>

    <template v-else>
      <!-- Group by type if requested -->
      <template v-if="groupByType">
        <div
          v-for="[type, items] in groupedEndorsements"
          :key="type"
          class="endorsement-list__group"
        >
          <h4 class="endorsement-list__group-title">
            <component :is="getTypeIcon(type)" :size="16" />
            {{ getTypeLabel(type) }}
            <span class="endorsement-list__group-count">({{ items.length }})</span>
          </h4>
          <div class="endorsement-list__cards">
            <EndorsementCard
              v-for="endorsement in items"
              :key="endorsement.said"
              :endorsement="endorsement"
              :current-user-aid="currentUserAid"
              @revoke="$emit('revoke', $event)"
            />
          </div>
        </div>
      </template>

      <!-- Flat list -->
      <template v-else>
        <div class="endorsement-list__cards">
          <EndorsementCard
            v-for="endorsement in sortedEndorsements"
            :key="endorsement.said"
            :endorsement="endorsement"
            :current-user-aid="currentUserAid"
            @revoke="$emit('revoke', $event)"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Loader2, Award, ShieldCheck, Briefcase, Heart } from 'lucide-vue-next';
import EndorsementCard from './EndorsementCard.vue';
import type { Endorsement } from 'src/composables/useEndorsements';
import { EndorsementType } from 'src/composables/useEndorsements';

const props = withDefaults(defineProps<{
  endorsements: Endorsement[];
  loading?: boolean;
  groupByType?: boolean;
  currentUserAid?: string;
  canEndorse?: boolean;
  hideRevoked?: boolean;
}>(), {
  loading: false,
  groupByType: true,
  canEndorse: false,
  hideRevoked: false,
});

defineEmits<{
  (e: 'revoke', endorsement: Endorsement): void;
}>();

const filteredEndorsements = computed(() => {
  if (props.hideRevoked) {
    return props.endorsements.filter(e => !e.revoked);
  }
  return props.endorsements;
});

const sortedEndorsements = computed(() => {
  return [...filteredEndorsements.value].sort((a, b) => {
    // Revoked last
    if (a.revoked !== b.revoked) return a.revoked ? 1 : -1;
    // Then by date (newest first)
    return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
  });
});

const groupedEndorsements = computed(() => {
  const groups = new Map<string, Endorsement[]>();

  // Define order of types
  const typeOrder = [
    EndorsementType.IDENTITY_VERIFICATION,
    EndorsementType.ROLE_COMPETENCY,
    EndorsementType.SKILL_ENDORSEMENT,
    EndorsementType.CHARACTER_REFERENCE,
  ];

  // Initialize groups in order
  for (const type of typeOrder) {
    groups.set(type, []);
  }

  // Fill groups
  for (const endorsement of sortedEndorsements.value) {
    const type = endorsement.endorsementType;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(endorsement);
  }

  // Filter out empty groups
  return Array.from(groups.entries()).filter(([_, items]) => items.length > 0);
});

function getTypeLabel(type: string): string {
  switch (type) {
    case EndorsementType.IDENTITY_VERIFICATION:
      return 'Identity Verifications';
    case EndorsementType.SKILL_ENDORSEMENT:
      return 'Skills';
    case EndorsementType.ROLE_COMPETENCY:
      return 'Roles & Competencies';
    case EndorsementType.CHARACTER_REFERENCE:
      return 'Character References';
    default:
      return 'Endorsements';
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case EndorsementType.IDENTITY_VERIFICATION:
      return ShieldCheck;
    case EndorsementType.SKILL_ENDORSEMENT:
      return Award;
    case EndorsementType.ROLE_COMPETENCY:
      return Briefcase;
    case EndorsementType.CHARACTER_REFERENCE:
      return Heart;
    default:
      return Award;
  }
}
</script>

<style scoped>
.endorsement-list {
  width: 100%;
}

.endorsement-list__loading,
.endorsement-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--color-text-secondary, #a0a0c0);
  text-align: center;
  gap: 8px;
}

.endorsement-list__empty-hint {
  font-size: 13px;
  color: var(--color-text-muted, #808090);
}

.endorsement-list__group {
  margin-bottom: 24px;
}

.endorsement-list__group:last-child {
  margin-bottom: 0;
}

.endorsement-list__group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #a0a0c0);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #2a2a4a);
}

.endorsement-list__group-count {
  font-weight: 400;
  color: var(--color-text-muted, #808090);
}

.endorsement-list__cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
