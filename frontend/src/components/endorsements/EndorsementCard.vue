<template>
  <div
    class="endorsement-card"
    :class="{ 'endorsement-card--revoked': endorsement.revoked }"
  >
    <div class="endorsement-card__header">
      <div class="endorsement-card__type">
        <component :is="typeIcon" class="endorsement-card__icon" :size="18" />
        <span class="endorsement-card__type-label">{{ typeLabel }}</span>
      </div>
      <div class="endorsement-card__confidence" :class="`confidence--${endorsement.confidence}`">
        {{ confidenceLabel }}
      </div>
    </div>

    <div class="endorsement-card__claim">
      {{ endorsement.claim }}
    </div>

    <div v-if="endorsement.category" class="endorsement-card__category">
      {{ endorsement.category }}
    </div>

    <div v-if="endorsement.evidence" class="endorsement-card__evidence">
      <span class="endorsement-card__evidence-label">Evidence:</span>
      {{ endorsement.evidence }}
    </div>

    <div class="endorsement-card__footer">
      <div class="endorsement-card__endorser">
        <UserCircle :size="16" />
        <span>{{ endorserDisplay }}</span>
        <span v-if="endorsement.relationship" class="endorsement-card__relationship">
          ({{ endorsement.relationship }})
        </span>
      </div>
      <div class="endorsement-card__date">
        {{ formattedDate }}
      </div>
    </div>

    <div v-if="endorsement.revoked" class="endorsement-card__revoked-banner">
      <AlertTriangle :size="14" />
      <span>Revoked{{ endorsement.revocationReason ? `: ${endorsement.revocationReason}` : '' }}</span>
    </div>

    <div v-if="canRevoke" class="endorsement-card__actions">
      <button
        class="endorsement-card__revoke-btn"
        @click="$emit('revoke', endorsement)"
      >
        Revoke
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  UserCircle,
  AlertTriangle,
  ShieldCheck,
  Award,
  Briefcase,
  Heart,
} from 'lucide-vue-next';
import type { Endorsement } from 'src/composables/useEndorsements';
import { EndorsementType, ConfidenceLevel } from 'src/composables/useEndorsements';

const props = defineProps<{
  endorsement: Endorsement;
  currentUserAid?: string;
}>();

defineEmits<{
  (e: 'revoke', endorsement: Endorsement): void;
}>();

const typeLabel = computed(() => {
  switch (props.endorsement.endorsementType) {
    case EndorsementType.IDENTITY_VERIFICATION:
      return 'Identity Verification';
    case EndorsementType.SKILL_ENDORSEMENT:
      return 'Skill Endorsement';
    case EndorsementType.ROLE_COMPETENCY:
      return 'Role Competency';
    case EndorsementType.CHARACTER_REFERENCE:
      return 'Character Reference';
    default:
      return 'Endorsement';
  }
});

const typeIcon = computed(() => {
  switch (props.endorsement.endorsementType) {
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
});

const confidenceLabel = computed(() => {
  switch (props.endorsement.confidence) {
    case ConfidenceLevel.LOW:
      return 'Low';
    case ConfidenceLevel.MEDIUM:
      return 'Medium';
    case ConfidenceLevel.HIGH:
      return 'High';
    case ConfidenceLevel.VERY_HIGH:
      return 'Very High';
    default:
      return 'Medium';
  }
});

const endorserDisplay = computed(() => {
  if (props.endorsement.endorserName) {
    return props.endorsement.endorserName;
  }
  // Truncate AID for display
  const aid = props.endorsement.endorserAid;
  return aid ? `${aid.slice(0, 8)}...${aid.slice(-4)}` : 'Unknown';
});

const formattedDate = computed(() => {
  try {
    const date = new Date(props.endorsement.issuedAt);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return props.endorsement.issuedAt;
  }
});

const canRevoke = computed(() => {
  return (
    props.currentUserAid &&
    props.endorsement.endorserAid === props.currentUserAid &&
    !props.endorsement.revoked
  );
});
</script>

<style scoped>
.endorsement-card {
  background: var(--color-surface, #1a1a2e);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.2s;
}

.endorsement-card:hover {
  border-color: var(--color-border-hover, #3a3a5a);
}

.endorsement-card--revoked {
  opacity: 0.6;
  background: var(--color-surface-muted, #151525);
}

.endorsement-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.endorsement-card__type {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-secondary, #a0a0c0);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.endorsement-card__icon {
  color: var(--color-primary, #7c3aed);
}

.endorsement-card__confidence {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.confidence--low {
  background: var(--color-warning-bg, #3a3520);
  color: var(--color-warning, #f59e0b);
}

.confidence--medium {
  background: var(--color-info-bg, #203040);
  color: var(--color-info, #3b82f6);
}

.confidence--high {
  background: var(--color-success-bg, #1a3520);
  color: var(--color-success, #10b981);
}

.confidence--very_high {
  background: var(--color-primary-bg, #2a1a4a);
  color: var(--color-primary, #7c3aed);
}

.endorsement-card__claim {
  font-size: 15px;
  color: var(--color-text, #e0e0f0);
  line-height: 1.5;
  margin-bottom: 8px;
}

.endorsement-card__category {
  font-size: 12px;
  color: var(--color-text-secondary, #a0a0c0);
  margin-bottom: 8px;
  padding: 4px 8px;
  background: var(--color-surface-raised, #252540);
  border-radius: 4px;
  display: inline-block;
}

.endorsement-card__evidence {
  font-size: 13px;
  color: var(--color-text-muted, #808090);
  margin-bottom: 12px;
  padding: 8px;
  background: var(--color-surface-raised, #252540);
  border-radius: 4px;
  border-left: 2px solid var(--color-border, #3a3a5a);
}

.endorsement-card__evidence-label {
  font-weight: 500;
  margin-right: 4px;
}

.endorsement-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-secondary, #a0a0c0);
}

.endorsement-card__endorser {
  display: flex;
  align-items: center;
  gap: 4px;
}

.endorsement-card__relationship {
  color: var(--color-text-muted, #808090);
}

.endorsement-card__date {
  color: var(--color-text-muted, #808090);
}

.endorsement-card__revoked-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px;
  background: var(--color-error-bg, #3a1a1a);
  color: var(--color-error, #ef4444);
  border-radius: 4px;
  font-size: 12px;
}

.endorsement-card__actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #2a2a4a);
}

.endorsement-card__revoke-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.endorsement-card__revoke-btn:hover {
  background: var(--color-error-bg, #3a1a1a);
}
</style>
