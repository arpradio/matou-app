<template>
  <div class="account-settings">
    <!-- Header bar with gradient -->
    <div class="settings-header">
      <button class="back-btn" @click="goBack">
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
      <p v-if="saveSuccess" class="save-success">Saved</p>

      <!-- Section 1: Profile Information (SharedProfile) -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><User :size="18" /> Profile Information</h3>
        </div>

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
            <span class="avatar-name">{{ sharedForm.displayName || 'Member' }}</span>
            <span class="avatar-since">Member since {{ formatDate(memberSinceDate) }}</span>
          </div>
        </div>

        <!-- AID field (read-only) -->
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
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.displayName"
            @blur="saveSharedDebounced"
            placeholder="Your display name"
          />
        </div>

        <!-- Email -->
        <div class="field-group">
          <label class="field-label">Email</label>
          <input
            type="email"
            class="field-input"
            v-model="sharedForm.publicEmail"
            @blur="saveSharedDebounced"
            placeholder="Your public email"
          />
          <span class="field-helper">Visible to community members</span>
        </div>
      </section>

      <!-- Section 2: About -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><FileText :size="18" /> About</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Bio</label>
          <textarea
            class="field-input"
            v-model="sharedForm.bio"
            @blur="saveSharedDebounced"
            placeholder="Tell us about yourself"
            rows="3"
          ></textarea>
        </div>

        <div class="field-group">
          <label class="field-label">Location</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.location"
            @blur="saveSharedDebounced"
            placeholder="Your location"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Indigenous Community</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.indigenousCommunity"
            @blur="saveSharedDebounced"
            placeholder="Your community"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Reason for Joining</label>
          <textarea
            class="field-input"
            v-model="sharedForm.joinReason"
            @blur="saveSharedDebounced"
            placeholder="Why you joined"
            rows="2"
          ></textarea>
        </div>
      </section>

      <!-- Section 3: Interests & Skills -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><Sparkles :size="18" /> Interests &amp; Skills</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Participation Interests</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.participationInterests"
            @blur="saveSharedDebounced"
            placeholder="e.g. Governance, Events, Education"
          />
          <span class="field-helper">Separate with commas</span>
        </div>

        <div class="field-group">
          <label class="field-label">Custom Interests</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.customInterests"
            @blur="saveSharedDebounced"
            placeholder="Other interests"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Skills</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.skills"
            @blur="saveSharedDebounced"
            placeholder="e.g. Design, Development, Writing"
          />
          <span class="field-helper">Separate with commas</span>
        </div>

        <div class="field-group">
          <label class="field-label">Languages</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.languages"
            @blur="saveSharedDebounced"
            placeholder="e.g. English, Te Reo Māori"
          />
          <span class="field-helper">Separate with commas</span>
        </div>
      </section>

      <!-- Section 4: Social & Contact -->
      <section class="settings-card">
        <div class="card-header">
          <h3 class="card-title"><Link2 :size="18" /> Social &amp; Contact</h3>
        </div>

        <div class="field-group">
          <label class="field-label">Public Links</label>
          <input
            type="text"
            class="field-input"
            v-model="sharedForm.publicLinks"
            @blur="saveSharedDebounced"
            placeholder="e.g. https://example.com, https://blog.example.com"
          />
          <span class="field-helper">Separate with commas</span>
        </div>

        <div class="field-group">
          <label class="field-label">Facebook</label>
          <input
            type="url"
            class="field-input"
            v-model="sharedForm.facebookUrl"
            @blur="saveSharedDebounced"
            placeholder="Facebook profile URL"
          />
        </div>

        <div class="field-group">
          <label class="field-label">LinkedIn</label>
          <input
            type="url"
            class="field-input"
            v-model="sharedForm.linkedinUrl"
            @blur="saveSharedDebounced"
            placeholder="LinkedIn profile URL"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Twitter / X</label>
          <input
            type="url"
            class="field-input"
            v-model="sharedForm.twitterUrl"
            @blur="saveSharedDebounced"
            placeholder="Twitter profile URL"
          />
        </div>

        <div class="field-group">
          <label class="field-label">Instagram</label>
          <input
            type="url"
            class="field-input"
            v-model="sharedForm.instagramUrl"
            @blur="saveSharedDebounced"
            placeholder="Instagram profile URL"
          />
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
        </div>

        <div class="field-group">
          <label class="field-label">Privacy Settings</label>
          <textarea
            class="field-input"
            v-model="privateForm.privacySettings"
            @blur="savePrivateDebounced"
            rows="3"
            placeholder="{}"
          ></textarea>
        </div>

        <div class="field-group">
          <label class="field-label">App Preferences</label>
          <textarea
            class="field-input"
            v-model="privateForm.appPreferences"
            @blur="savePrivateDebounced"
            rows="3"
            placeholder="{}"
          ></textarea>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
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

const router = useRouter();
const profilesStore = useProfilesStore();
const typesStore = useTypesStore();
const identityStore = useIdentityStore();

const loading = ref(true);
const saveError = ref('');
const saveSuccess = ref(false);
const copied = ref(false);

const aidPrefix = computed(() => identityStore.aidPrefix);

// --- Local form state ---

const sharedForm = reactive({
  displayName: '',
  publicEmail: '',
  bio: '',
  location: '',
  indigenousCommunity: '',
  joinReason: '',
  participationInterests: '',
  customInterests: '',
  skills: '',
  languages: '',
  publicLinks: '',
  facebookUrl: '',
  linkedinUrl: '',
  twitterUrl: '',
  instagramUrl: '',
});

const privateForm = reactive({
  privacySettings: '',
  appPreferences: '',
});

// --- Store computeds (read-only) ---

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
  const name = sharedForm.displayName || 'M';
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

// --- Init helpers ---

const arrayFields = ['participationInterests', 'skills', 'languages', 'publicLinks'] as const;

function initSharedForm() {
  const d = sharedProfileData.value;
  sharedForm.displayName = (d.displayName as string) || '';
  sharedForm.publicEmail = (d.publicEmail as string) || '';
  sharedForm.bio = (d.bio as string) || '';
  sharedForm.location = (d.location as string) || '';
  sharedForm.indigenousCommunity = (d.indigenousCommunity as string) || '';
  sharedForm.joinReason = (d.joinReason as string) || '';
  sharedForm.customInterests = (d.customInterests as string) || '';
  sharedForm.facebookUrl = (d.facebookUrl as string) || '';
  sharedForm.linkedinUrl = (d.linkedinUrl as string) || '';
  sharedForm.twitterUrl = (d.twitterUrl as string) || '';
  sharedForm.instagramUrl = (d.instagramUrl as string) || '';
  // Arrays → comma-separated strings
  for (const field of arrayFields) {
    sharedForm[field] = asArray(d[field]).join(', ');
  }
}

function initPrivateForm() {
  const d = privateProfileData.value;
  privateForm.privacySettings = formatObject(d.privacySettings);
  privateForm.appPreferences = formatObject(d.appPreferences);
}

// --- Save helpers ---

function buildSharedData(): Record<string, unknown> {
  // Start with existing store data to preserve fields we don't edit (e.g. avatar)
  const data: Record<string, unknown> = { ...sharedProfileData.value };
  // Overlay editable text fields
  data.displayName = sharedForm.displayName;
  data.publicEmail = sharedForm.publicEmail;
  data.bio = sharedForm.bio;
  data.location = sharedForm.location;
  data.indigenousCommunity = sharedForm.indigenousCommunity;
  data.joinReason = sharedForm.joinReason;
  data.customInterests = sharedForm.customInterests;
  data.facebookUrl = sharedForm.facebookUrl;
  data.linkedinUrl = sharedForm.linkedinUrl;
  data.twitterUrl = sharedForm.twitterUrl;
  data.instagramUrl = sharedForm.instagramUrl;
  // Convert comma-separated strings back to arrays
  for (const field of arrayFields) {
    const val = sharedForm[field];
    data[field] = val ? val.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  }
  return data;
}

function buildPrivateData(): Record<string, unknown> {
  const data: Record<string, unknown> = { ...privateProfileData.value };
  try {
    data.privacySettings = privateForm.privacySettings ? JSON.parse(privateForm.privacySettings) : {};
  } catch { /* keep existing */ }
  try {
    data.appPreferences = privateForm.appPreferences ? JSON.parse(privateForm.appPreferences) : {};
  } catch { /* keep existing */ }
  return data;
}

let sharedSaveTimer: ReturnType<typeof setTimeout> | null = null;
let privateSaveTimer: ReturnType<typeof setTimeout> | null = null;

function saveSharedDebounced() {
  if (sharedSaveTimer) clearTimeout(sharedSaveTimer);
  sharedSaveTimer = setTimeout(saveSharedProfile, 400);
}

function savePrivateDebounced() {
  if (privateSaveTimer) clearTimeout(privateSaveTimer);
  privateSaveTimer = setTimeout(savePrivateProfile, 400);
}

async function saveSharedProfile() {
  saveError.value = '';
  const data = buildSharedData();
  const existing = profilesStore.getMyProfile('SharedProfile');
  const result = await profilesStore.saveProfile('SharedProfile', data, {
    id: existing?.id,
  });
  if (result.success) {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2000);
    initSharedForm();
  } else {
    saveError.value = result.error || 'Failed to save profile';
  }
}

async function savePrivateProfile() {
  saveError.value = '';
  const data = buildPrivateData();
  const existing = profilesStore.getMyProfile('PrivateProfile');
  const result = await profilesStore.saveProfile('PrivateProfile', data, {
    id: existing?.id,
  });
  if (result.success) {
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2000);
    initPrivateForm();
  } else {
    saveError.value = result.error || 'Failed to save profile';
  }
}

function goBack() {
  // Flush any pending saves
  if (sharedSaveTimer) { clearTimeout(sharedSaveTimer); saveSharedProfile(); }
  if (privateSaveTimer) { clearTimeout(privateSaveTimer); savePrivateProfile(); }
  router.push({ name: 'dashboard' });
}

// --- Utilities ---

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
  if (!val || (typeof val === 'object' && Object.keys(val as object).length === 0)) return '';
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

// --- Lifecycle ---

onMounted(async () => {
  if (!typesStore.loaded) {
    await typesStore.loadDefinitions();
  }
  await profilesStore.loadMyProfiles();
  initSharedForm();
  initPrivateForm();
  loading.value = false;

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
  width: 720px;
  max-width: 100%;
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

/* Read-only field display */
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

/* Editable field input — looks like field-box but interactive */
.field-input {
  background: #f0f9fa;
  border: 1px solid #d1e7ea;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: var(--matou-foreground, #1f2937);
  width: 100%;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}

.field-input:hover {
  border-color: #a8d4da;
}

.field-input:focus {
  border-color: #1a4f5e;
  box-shadow: 0 0 0 2px rgba(26, 79, 94, 0.1);
}

.field-input::placeholder {
  color: #9ca3af;
}

textarea.field-input {
  resize: vertical;
  min-height: 60px;
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

/* Chips (read-only sections) */
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
