<template>
  <div class="account-settings">
    <!-- Header bar with gradient -->
    <div class="settings-header">
      <button class="back-btn" @click="router.push({ name: 'dashboard' })">
        <ArrowLeft :size="20" />
      </button>
      <div>
        <h1 class="header-title">Account Settings</h1>
        <p class="header-subtitle">Manage your profile and preferences</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading profiles...</div>

    <!-- Content area -->
    <div v-else class="settings-content">
      <!-- Save feedback -->
      <p v-if="saveError" class="save-error">{{ saveError }}</p>
      <p v-if="saveSuccess" class="save-success">Profile saved.</p>

      <!-- Section 1: Profile Information (SharedProfile) -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><User :size="18" /> Profile Information</h3>
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

        <template v-else>
          <!-- Avatar row -->
          <div class="avatar-row">
            <div class="avatar-container">
              <img
                v-if="avatarUrl"
                :src="avatarUrl"
                class="avatar-img"
                alt="Avatar"
              />
              <div v-else class="avatar-placeholder">
                {{ userInitials }}
              </div>
              <div class="avatar-camera">
                <Camera :size="14" />
              </div>
            </div>
            <div class="avatar-info">
              <span class="avatar-name">{{ sharedProfileData.displayName || 'Member' }}</span>
              <span class="avatar-since">Member since {{ formatDate(memberSinceDate) }}</span>
            </div>
          </div>

          <!-- AID field -->
          <div class="field-group">
            <label class="field-label">AID (Autonomic Identifier)</label>
            <div class="field-box aid-box">
              <span class="aid-text">{{ aidPrefix || '—' }}</span>
              <button class="copy-btn" @click="copyAid" :title="copied ? 'Copied!' : 'Copy AID'">
                <Check v-if="copied" :size="14" />
                <Copy v-else :size="14" />
              </button>
            </div>
          </div>

          <!-- Display Name -->
          <div class="field-group">
            <label class="field-label">Display Name</label>
            <div class="field-box">{{ sharedProfileData.displayName || '—' }}</div>
          </div>

          <!-- Email -->
          <div class="field-group">
            <label class="field-label">Email</label>
            <div class="field-box">{{ sharedProfileData.publicEmail || '—' }}</div>
            <span class="field-helper">Visible to community members</span>
          </div>
        </template>
      </section>

      <!-- Section 2: About -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><FileText :size="18" /> About</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Bio</label>
          <div class="field-box">{{ sharedProfileData.bio || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Location</label>
          <div class="field-box">{{ sharedProfileData.location || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Indigenous Community</label>
          <div class="field-box">{{ sharedProfileData.indigenousCommunity || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Reason for Joining</label>
          <div class="field-box">{{ sharedProfileData.joinReason || '—' }}</div>
        </div>
      </section>

      <!-- Section 3: Interests & Skills -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><Sparkles :size="18" /> Interests &amp; Skills</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Participation Interests</label>
          <div class="field-box chips-box" v-if="asArray(sharedProfileData.participationInterests).length">
            <span
              v-for="item in asArray(sharedProfileData.participationInterests)"
              :key="item"
              class="chip"
            >{{ item }}</span>
          </div>
          <div class="field-box" v-else>—</div>
        </div>

        <div class="field-group">
          <label class="field-label">Custom Interests</label>
          <div class="field-box">{{ sharedProfileData.customInterests || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Skills</label>
          <div class="field-box chips-box" v-if="asArray(sharedProfileData.skills).length">
            <span
              v-for="item in asArray(sharedProfileData.skills)"
              :key="item"
              class="chip"
            >{{ item }}</span>
          </div>
          <div class="field-box" v-else>—</div>
        </div>

        <div class="field-group">
          <label class="field-label">Languages</label>
          <div class="field-box chips-box" v-if="asArray(sharedProfileData.languages).length">
            <span
              v-for="item in asArray(sharedProfileData.languages)"
              :key="item"
              class="chip"
            >{{ item }}</span>
          </div>
          <div class="field-box" v-else>—</div>
        </div>
      </section>

      <!-- Section 4: Social & Contact -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><Link2 :size="18" /> Social &amp; Contact</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Public Email</label>
          <div class="field-box">{{ sharedProfileData.publicEmail || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Public Links</label>
          <div class="field-box chips-box" v-if="asArray(sharedProfileData.publicLinks).length">
            <a
              v-for="link in asArray(sharedProfileData.publicLinks)"
              :key="link"
              :href="link"
              target="_blank"
              rel="noopener noreferrer"
              class="chip link-chip"
            >{{ link }}</a>
          </div>
          <div class="field-box" v-else>—</div>
        </div>

        <div class="field-group">
          <label class="field-label">Facebook</label>
          <div class="field-box">{{ sharedProfileData.facebookUrl || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">LinkedIn</label>
          <div class="field-box">{{ sharedProfileData.linkedinUrl || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Twitter / X</label>
          <div class="field-box">{{ sharedProfileData.twitterUrl || '—' }}</div>
        </div>

        <div class="field-group">
          <label class="field-label">Instagram</label>
          <div class="field-box">{{ sharedProfileData.instagramUrl || '—' }}</div>
        </div>
      </section>

      <!-- Section 5: Membership (CommunityProfile - read-only) -->
      <section class="settings-card" v-if="communityProfileData">
        <div class="card-header">
          <h3 class="card-title"><Shield :size="18" /> Membership</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Role</label>
          <div class="field-box">
            <span class="role-badge">{{ communityProfileData.role || '—' }}</span>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">Member Since</label>
          <div class="field-box">{{ formatDate(communityProfileData.memberSince as string) }}</div>
        </div>

        <div class="field-group" v-if="asArray(communityProfileData.credentials).length">
          <label class="field-label">Credentials</label>
          <div class="field-box chips-box">
            <span
              v-for="cred in asArray(communityProfileData.credentials)"
              :key="cred"
              class="chip"
            >{{ cred }}</span>
          </div>
        </div>

        <div class="field-group" v-if="asArray(communityProfileData.permissions).length">
          <label class="field-label">Permissions</label>
          <div class="field-box chips-box">
            <span
              v-for="perm in asArray(communityProfileData.permissions)"
              :key="perm"
              class="chip"
            >{{ perm }}</span>
          </div>
        </div>
      </section>

      <!-- Section 6: Preferences (PrivateProfile) -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><Settings :size="18" /> Preferences</h3>
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

        <template v-else>
          <div class="field-group">
            <label class="field-label">Privacy Settings</label>
            <div class="field-box">{{ formatObject(privateProfileData.privacySettings) }}</div>
          </div>

          <div class="field-group">
            <label class="field-label">App Preferences</label>
            <div class="field-box">{{ formatObject(privateProfileData.appPreferences) }}</div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  ArrowLeft,
  User,
  FileText,
  Sparkles,
  Link2,
  Shield,
  Settings,
  Copy,
  Check,
  Camera,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useProfilesStore } from 'stores/profiles';
import { useTypesStore } from 'stores/types';
import { useIdentityStore } from 'stores/identity';
import { getFileUrl } from 'src/lib/api/client';
import TypedForm from 'src/components/profiles/TypedForm.vue';

const router = useRouter();
const profilesStore = useProfilesStore();
const typesStore = useTypesStore();
const identityStore = useIdentityStore();

const loading = ref(true);
const editingShared = ref(false);
const editingPrivate = ref(false);
const saveError = ref('');
const saveSuccess = ref(false);
const copied = ref(false);

const aidPrefix = computed(() => identityStore.aidPrefix);

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

const avatarUrl = computed(() => {
  const avatar = sharedProfileData.value.avatar as string;
  return avatar ? getFileUrl(avatar) : null;
});

const userInitials = computed(() => {
  const name = (sharedProfileData.value.displayName as string) || 'M';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
});

const memberSinceDate = computed(() => {
  if (communityProfileData.value?.memberSince) {
    return communityProfileData.value.memberSince as string;
  }
  return sharedProfileData.value.createdAt as string || '';
});

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function asArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  return [];
}

function formatObject(val: unknown): string {
  if (!val || (typeof val === 'object' && Object.keys(val as object).length === 0)) return '—';
  if (typeof val === 'string') return val;
  return JSON.stringify(val, null, 2);
}

async function copyAid() {
  if (!aidPrefix.value) return;
  try {
    await navigator.clipboard.writeText(aidPrefix.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // Fallback for non-HTTPS contexts
    const ta = document.createElement('textarea');
    ta.value = aidPrefix.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

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

  // Log each profile object for debugging
  const shared = profilesStore.getMyProfile('SharedProfile');
  console.log('[AccountSettings] SharedProfile:', {
    id: shared?.id, data: shared?.data, space: 'community',
  });
  const community = profilesStore.getMyProfile('CommunityProfile');
  console.log('[AccountSettings] CommunityProfile:', {
    id: community?.id, data: community?.data, space: 'community-readonly',
  });
  const priv = profilesStore.getMyProfile('PrivateProfile');
  console.log('[AccountSettings] PrivateProfile:', {
    id: priv?.id, data: priv?.data, space: 'private',
  });
});
</script>

<style scoped>
.account-settings {
  flex: 1;
  background: var(--matou-background, #f4f4f5);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.settings-header {
  background: linear-gradient(135deg, #1a4f5e, #2a7f8f);
  color: white;
  padding: 1.5rem 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.header-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.3;
}

.header-subtitle {
  font-size: 0.875rem;
  margin: 0.25rem 0 0;
  opacity: 0.85;
}

.loading {
  text-align: center;
  color: var(--matou-text-secondary, #6b7280);
  padding: 3rem 0;
}

.settings-content {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
}

.settings-card {
  background: var(--matou-card, white);
  border: 1px solid var(--matou-border, #e5e7eb);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--matou-foreground, #1f2937);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.edit-btn,
.cancel-btn {
  padding: 0.375rem 1rem;
  border: 1px solid var(--matou-border, #d1d5db);
  border-radius: 0.375rem;
  background: var(--matou-card, #fff);
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--matou-foreground, #1f2937);
  transition: background 0.15s ease;
}

.edit-btn:hover,
.cancel-btn:hover {
  background: var(--matou-secondary, #f3f4f6);
}

/* Avatar row */
.avatar-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.avatar-container {
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}

.avatar-img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a4f5e, #2a7f8f);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 1.25rem;
  font-weight: 600;
}

.avatar-camera {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1a4f5e;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
}

.avatar-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.avatar-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--matou-foreground, #1f2937);
}

.avatar-since {
  font-size: 0.8rem;
  color: var(--matou-muted-foreground, #6b7280);
}

/* Field display */
.field-group {
  margin-bottom: 1rem;
}

.field-group:last-child {
  margin-bottom: 0;
}

.field-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--matou-muted-foreground, #6b7280);
  margin-bottom: 0.375rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.field-box {
  background: #f0f9fa;
  border: 1px solid #d1e7ea;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: var(--matou-foreground, #1f2937);
  word-break: break-word;
  white-space: pre-wrap;
}

.field-helper {
  display: block;
  font-size: 0.7rem;
  color: var(--matou-muted-foreground, #9ca3af);
  margin-top: 0.25rem;
}

/* AID field */
.aid-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.aid-text {
  font-family: monospace;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #1a4f5e;
  padding: 0.25rem;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.copy-btn:hover {
  background: rgba(26, 79, 94, 0.1);
}

/* Chips */
.chips-box {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: #e0f2f1;
  color: #1a4f5e;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
}

.link-chip {
  text-decoration: none;
  cursor: pointer;
}

.link-chip:hover {
  background: #b2dfdb;
}

/* Role badge */
.role-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: linear-gradient(135deg, #1a4f5e, #2a7f8f);
  color: white;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

/* Save feedback */
.save-error {
  color: #ef4444;
  font-size: 0.875rem;
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
}

.save-success {
  color: #059669;
  font-size: 0.875rem;
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 0.5rem;
}
</style>
