<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-container">
      <div class="modal-header">
        <h2>Create Endorsement</h2>
        <button class="modal-close" @click="close">
          <X :size="20" />
        </button>
      </div>

      <div class="modal-body">
        <!-- Endorsee Info -->
        <div class="endorsee-info">
          <UserCircle :size="40" />
          <div class="endorsee-details">
            <p class="endorsee-name">{{ endorseeName || 'Member' }}</p>
            <p class="endorsee-aid">{{ truncatedAid }}</p>
          </div>
        </div>

        <!-- Endorsement Type -->
        <div class="form-field">
          <label class="form-label">Endorsement Type</label>
          <div class="type-options">
            <button
              v-for="option in typeOptions"
              :key="option.value"
              class="type-option"
              :class="{ 'type-option--selected': endorsementType === option.value }"
              @click="endorsementType = option.value"
            >
              <component :is="option.icon" :size="20" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>

        <!-- Category (optional) -->
        <div class="form-field">
          <label class="form-label">
            Category
            <span class="form-hint">(optional)</span>
          </label>
          <input
            v-model="category"
            type="text"
            class="form-input"
            :placeholder="categoryPlaceholder"
          />
        </div>

        <!-- Claim -->
        <div class="form-field">
          <label class="form-label">What are you endorsing?</label>
          <textarea
            v-model="claim"
            class="form-textarea"
            placeholder="Describe the specific claim you're endorsing..."
            rows="3"
          ></textarea>
          <p class="form-counter">{{ claim.length }}/500</p>
        </div>

        <!-- Evidence (optional) -->
        <div class="form-field">
          <label class="form-label">
            Evidence or Context
            <span class="form-hint">(optional)</span>
          </label>
          <textarea
            v-model="evidence"
            class="form-textarea"
            placeholder="How do you know this? What's your evidence?"
            rows="2"
          ></textarea>
        </div>

        <!-- Confidence Level -->
        <div class="form-field">
          <label class="form-label">Confidence Level</label>
          <div class="confidence-options">
            <button
              v-for="option in confidenceOptions"
              :key="option.value"
              class="confidence-option"
              :class="[
                `confidence-option--${option.value}`,
                { 'confidence-option--selected': confidence === option.value }
              ]"
              @click="confidence = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <!-- Relationship -->
        <div class="form-field">
          <label class="form-label">
            Your Relationship
            <span class="form-hint">(optional)</span>
          </label>
          <select v-model="relationship" class="form-select">
            <option value="">Select relationship...</option>
            <option value="colleague">Colleague</option>
            <option value="mentor">Mentor</option>
            <option value="mentee">Mentee</option>
            <option value="collaborator">Collaborator</option>
            <option value="supervisor">Supervisor</option>
            <option value="community_member">Community Member</option>
            <option value="friend">Friend</option>
            <option value="family">Family</option>
            <option value="other">Other</option>
          </select>
        </div>

        <!-- Error Message -->
        <div v-if="error" class="form-error">
          <AlertTriangle :size="16" />
          <span>{{ error }}</span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn--secondary" @click="close" :disabled="isProcessing">
          Cancel
        </button>
        <button
          class="btn btn--primary"
          @click="submitEndorsement"
          :disabled="!canSubmit || isProcessing"
        >
          <Loader2 v-if="isProcessing" class="animate-spin" :size="16" />
          <span v-else>Create Endorsement</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  X,
  UserCircle,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Award,
  Briefcase,
  Heart,
} from 'lucide-vue-next';
import { useEndorsements, EndorsementType, ConfidenceLevel } from 'src/composables/useEndorsements';
import type { EndorsementTypeValue, ConfidenceLevelValue } from 'src/composables/useEndorsements';

const props = defineProps<{
  isOpen: boolean;
  endorseeAid: string;
  endorseeName?: string;
  endorseeMembershipSaid: string;
  endorseeOobi?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', said: string): void;
}>();

const endorsements = useEndorsements();

// Form state
const endorsementType = ref<EndorsementTypeValue>(EndorsementType.SKILL_ENDORSEMENT);
const category = ref('');
const claim = ref('');
const evidence = ref('');
const confidence = ref<ConfidenceLevelValue>(ConfidenceLevel.MEDIUM);
const relationship = ref('');
const error = ref<string | null>(null);
const isProcessing = ref(false);

// Options
const typeOptions = [
  { value: EndorsementType.IDENTITY_VERIFICATION, label: 'Identity', icon: ShieldCheck },
  { value: EndorsementType.SKILL_ENDORSEMENT, label: 'Skill', icon: Award },
  { value: EndorsementType.ROLE_COMPETENCY, label: 'Role', icon: Briefcase },
  { value: EndorsementType.CHARACTER_REFERENCE, label: 'Character', icon: Heart },
];

const confidenceOptions = [
  { value: ConfidenceLevel.LOW, label: 'Low' },
  { value: ConfidenceLevel.MEDIUM, label: 'Medium' },
  { value: ConfidenceLevel.HIGH, label: 'High' },
  { value: ConfidenceLevel.VERY_HIGH, label: 'Very High' },
];

// Computed
const truncatedAid = computed(() => {
  const aid = props.endorseeAid;
  if (!aid) return '';
  return `${aid.slice(0, 12)}...${aid.slice(-6)}`;
});

const categoryPlaceholder = computed(() => {
  switch (endorsementType.value) {
    case EndorsementType.IDENTITY_VERIFICATION:
      return 'e.g., Personal acquaintance, Professional verification';
    case EndorsementType.SKILL_ENDORSEMENT:
      return 'e.g., Software Development, Leadership, Design';
    case EndorsementType.ROLE_COMPETENCY:
      return 'e.g., Project Manager, Community Elder';
    case EndorsementType.CHARACTER_REFERENCE:
      return 'e.g., Integrity, Reliability';
    default:
      return 'Category...';
  }
});

const canSubmit = computed(() => {
  return claim.value.trim().length >= 10 && claim.value.length <= 500;
});

// Watch for modal open/close to reset state
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    resetForm();
  }
});

function resetForm() {
  endorsementType.value = EndorsementType.SKILL_ENDORSEMENT;
  category.value = '';
  claim.value = '';
  evidence.value = '';
  confidence.value = ConfidenceLevel.MEDIUM;
  relationship.value = '';
  error.value = null;
}

function close() {
  emit('close');
}

async function submitEndorsement() {
  if (!canSubmit.value || isProcessing.value) return;

  isProcessing.value = true;
  error.value = null;

  try {
    const result = await endorsements.issueEndorsement({
      endorseeAid: props.endorseeAid,
      endorseeMembershipSaid: props.endorseeMembershipSaid,
      endorseeOobi: props.endorseeOobi,
      endorsementType: endorsementType.value,
      category: category.value.trim() || undefined,
      claim: claim.value.trim(),
      evidence: evidence.value.trim() || undefined,
      confidence: confidence.value,
      relationship: relationship.value || undefined,
    });

    if (result.success && result.said) {
      emit('success', result.said);
      close();
    } else {
      error.value = result.error || 'Failed to create endorsement';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create endorsement';
  } finally {
    isProcessing.value = false;
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-container {
  background: var(--color-surface, #1a1a2e);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #2a2a4a);
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #e0e0f0);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  color: var(--color-text-secondary, #a0a0c0);
  cursor: pointer;
  padding: 4px;
  display: flex;
  border-radius: 4px;
}

.modal-close:hover {
  background: var(--color-surface-raised, #252540);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.endorsee-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-surface-raised, #252540);
  border-radius: 8px;
  margin-bottom: 20px;
}

.endorsee-info svg {
  color: var(--color-text-secondary, #a0a0c0);
}

.endorsee-name {
  font-weight: 500;
  color: var(--color-text, #e0e0f0);
  margin: 0;
}

.endorsee-aid {
  font-size: 12px;
  color: var(--color-text-muted, #808090);
  font-family: monospace;
  margin: 0;
}

.form-field {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #a0a0c0);
  margin-bottom: 8px;
}

.form-hint {
  font-weight: 400;
  color: var(--color-text-muted, #808090);
}

.type-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--color-surface-raised, #252540);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 8px;
  color: var(--color-text-secondary, #a0a0c0);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
}

.type-option:hover {
  border-color: var(--color-border-hover, #3a3a5a);
}

.type-option--selected {
  background: var(--color-primary-bg, #2a1a4a);
  border-color: var(--color-primary, #7c3aed);
  color: var(--color-primary, #7c3aed);
}

.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: 10px 12px;
  background: var(--color-surface-raised, #252540);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 6px;
  color: var(--color-text, #e0e0f0);
  font-size: 14px;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-primary, #7c3aed);
}

.form-textarea {
  resize: vertical;
  min-height: 80px;
}

.form-counter {
  font-size: 11px;
  color: var(--color-text-muted, #808090);
  text-align: right;
  margin-top: 4px;
}

.confidence-options {
  display: flex;
  gap: 8px;
}

.confidence-option {
  flex: 1;
  padding: 8px 12px;
  background: var(--color-surface-raised, #252540);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 6px;
  color: var(--color-text-secondary, #a0a0c0);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.confidence-option:hover {
  border-color: var(--color-border-hover, #3a3a5a);
}

.confidence-option--selected.confidence-option--low {
  background: var(--color-warning-bg, #3a3520);
  border-color: var(--color-warning, #f59e0b);
  color: var(--color-warning, #f59e0b);
}

.confidence-option--selected.confidence-option--medium {
  background: var(--color-info-bg, #203040);
  border-color: var(--color-info, #3b82f6);
  color: var(--color-info, #3b82f6);
}

.confidence-option--selected.confidence-option--high {
  background: var(--color-success-bg, #1a3520);
  border-color: var(--color-success, #10b981);
  color: var(--color-success, #10b981);
}

.confidence-option--selected.confidence-option--very_high {
  background: var(--color-primary-bg, #2a1a4a);
  border-color: var(--color-primary, #7c3aed);
  color: var(--color-primary, #7c3aed);
}

.form-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--color-error-bg, #3a1a1a);
  color: var(--color-error, #ef4444);
  border-radius: 6px;
  font-size: 13px;
  margin-top: 16px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #2a2a4a);
}

.btn {
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn--secondary {
  background: transparent;
  border: 1px solid var(--color-border, #2a2a4a);
  color: var(--color-text-secondary, #a0a0c0);
}

.btn--secondary:hover:not(:disabled) {
  border-color: var(--color-border-hover, #3a3a5a);
}

.btn--primary {
  background: var(--color-primary, #7c3aed);
  border: none;
  color: white;
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover, #6d28d9);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
