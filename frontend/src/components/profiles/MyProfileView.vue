<template>
  <div class="my-profile-view">
    <div class="profile-header">
      <h2>My Profile</h2>
      <button class="close-btn" @click="$emit('close')">&times;</button>
    </div>

    <div v-if="loading" class="loading">Loading profiles...</div>

    <div v-else class="profile-sections">
      <!-- SharedProfile Section (editable) -->
      <section class="profile-section">
        <div class="section-header">
          <h3>My Profile</h3>
          <button
            v-if="!editingShared"
            class="edit-btn"
            @click="editingShared = true"
          >
            Edit
          </button>
          <button
            v-else
            class="cancel-btn"
            @click="editingShared = false"
          >
            Cancel
          </button>
        </div>

        <TypedForm
          v-if="editingShared"
          typeName="SharedProfile"
          layout="form"
          :initialData="sharedProfileData"
          @submit="handleSaveSharedProfile"
        />
        <TypedDisplay
          v-else
          typeName="SharedProfile"
          layout="detail"
          :data="sharedProfileData"
        />
      </section>

      <!-- CommunityProfile Section (read-only) -->
      <section class="profile-section" v-if="communityProfileData">
        <div class="section-header">
          <h3>Membership</h3>
        </div>
        <TypedDisplay
          typeName="CommunityProfile"
          layout="detail"
          :data="communityProfileData"
        />
      </section>

      <!-- PrivateProfile Section (editable) -->
      <section class="profile-section">
        <div class="section-header">
          <h3>Preferences</h3>
          <button
            v-if="!editingPrivate"
            class="edit-btn"
            @click="editingPrivate = true"
          >
            Edit
          </button>
          <button
            v-else
            class="cancel-btn"
            @click="editingPrivate = false"
          >
            Cancel
          </button>
        </div>

        <TypedForm
          v-if="editingPrivate"
          typeName="PrivateProfile"
          layout="form"
          :initialData="privateProfileData"
          @submit="handleSavePrivateProfile"
        />
        <TypedDisplay
          v-else
          typeName="PrivateProfile"
          layout="detail"
          :data="privateProfileData"
        />
      </section>
    </div>

    <p v-if="saveError" class="save-error">{{ saveError }}</p>
    <p v-if="saveSuccess" class="save-success">Profile saved.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProfilesStore } from 'stores/profiles';
import { useTypesStore } from 'stores/types';
import TypedForm from './TypedForm.vue';
import TypedDisplay from './TypedDisplay.vue';

defineEmits<{
  (e: 'close'): void;
}>();

const profilesStore = useProfilesStore();
const typesStore = useTypesStore();

const loading = ref(true);
const editingShared = ref(false);
const editingPrivate = ref(false);
const saveError = ref('');
const saveSuccess = ref(false);

const sharedProfileData = computed(() => {
  const p = profilesStore.getMyProfile('SharedProfile');
  return (p?.data as Record<string, unknown>) || {};
});

const communityProfileData = computed(() => {
  const p = profilesStore.getMyProfile('CommunityProfile');
  return p ? (p.data as Record<string, unknown>) : null;
});

const privateProfileData = computed(() => {
  const p = profilesStore.getMyProfile('PrivateProfile');
  return (p?.data as Record<string, unknown>) || {};
});

async function handleSaveSharedProfile(data: Record<string, unknown>) {
  saveError.value = '';
  saveSuccess.value = false;
  const existing = profilesStore.getMyProfile('SharedProfile');
  const result = await profilesStore.saveProfile('SharedProfile', data, {
    id: existing?.id,
  });
  if (result.success) {
    editingShared.value = false;
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } else {
    saveError.value = result.error || 'Failed to save profile';
  }
}

async function handleSavePrivateProfile(data: Record<string, unknown>) {
  saveError.value = '';
  saveSuccess.value = false;
  const existing = profilesStore.getMyProfile('PrivateProfile');
  const result = await profilesStore.saveProfile('PrivateProfile', data, {
    id: existing?.id,
  });
  if (result.success) {
    editingPrivate.value = false;
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 3000);
  } else {
    saveError.value = result.error || 'Failed to save profile';
  }
}

onMounted(async () => {
  if (!typesStore.loaded) {
    await typesStore.loadDefinitions();
  }
  await profilesStore.loadMyProfiles();
  loading.value = false;
});
</script>

<style scoped>
.my-profile-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.profile-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--matou-text, #1f2937);
  margin: 0;
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

.loading {
  text-align: center;
  color: var(--matou-text-secondary, #6b7280);
  padding: 2rem 0;
}

.profile-sections {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-section {
  border: 1px solid var(--matou-border, #e5e7eb);
  border-radius: 0.5rem;
  padding: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--matou-text, #1f2937);
  margin: 0;
}

.edit-btn,
.cancel-btn {
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--matou-border, #d1d5db);
  border-radius: 0.25rem;
  background: var(--matou-surface, #fff);
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--matou-text, #1f2937);
}

.edit-btn:hover,
.cancel-btn:hover {
  background: var(--matou-surface-alt, #f3f4f6);
}

.save-error {
  color: #ef4444;
  font-size: 0.875rem;
  margin: 0;
}

.save-success {
  color: #10b981;
  font-size: 0.875rem;
  margin: 0;
}
</style>
