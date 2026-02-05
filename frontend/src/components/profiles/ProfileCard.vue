<template>
  <div class="profile-card" @click="$emit('click')">
    <div class="card-avatar">
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="displayName"
        class="avatar-img"
      />
      <div v-else class="avatar-placeholder" :class="colorClass">
        {{ initials }}
      </div>
    </div>
    <div class="card-info">
      <span class="card-name">{{ displayName }}</span>
      <span v-if="role" class="card-role">{{ role }}</span>
      <span v-if="memberSince" class="card-date">{{ formatDate(memberSince) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getFileUrl } from 'src/lib/api/client';

const props = defineProps<{
  profile: Record<string, unknown>;
  communityProfile?: Record<string, unknown>;
}>();

defineEmits<{
  (e: 'click'): void;
}>();

const displayName = computed(() => (props.profile?.displayName as string) || 'Unknown');

const avatarUrl = computed(() => {
  // Check SharedProfile avatar first, then CommunityProfile avatar as fallback
  const ref = (props.profile?.avatar as string) || (props.communityProfile?.avatar as string);
  console.log('[ProfileCard] Avatar ref for', props.profile?.displayName, ':', ref, 'profile:', props.profile);
  if (!ref) return '';
  if (ref.startsWith('http') || ref.startsWith('data:')) return ref;
  return getFileUrl(ref);
});

const initials = computed(() => {
  const name = displayName.value;
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
});

const role = computed(() => (props.communityProfile?.role as string) || '');

const memberSince = computed(() => (props.communityProfile?.memberSince as string) || '');

const colorClass = computed(() => {
  const colors = ['gradient-1', 'gradient-2', 'gradient-3', 'gradient-4'];
  const hash = displayName.value.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
});

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Joined today';
  if (diffDays === 1) return 'Joined yesterday';
  if (diffDays < 7) return `Joined ${diffDays} days ago`;
  if (diffDays < 30) return `Joined ${Math.floor(diffDays / 7)} weeks ago`;
  return `Joined ${date.toLocaleDateString('en-NZ', { month: 'short', year: 'numeric' })}`;
}
</script>

<style scoped>
.profile-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.profile-card:hover {
  background: var(--matou-surface-alt, #f3f4f6);
}

.card-avatar {
  flex-shrink: 0;
}

.avatar-img {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.75rem;
  color: white;
}

.gradient-1 { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.gradient-2 { background: linear-gradient(135deg, #ec4899, #f43f5e); }
.gradient-3 { background: linear-gradient(135deg, #14b8a6, #06b6d4); }
.gradient-4 { background: linear-gradient(135deg, #f59e0b, #ef4444); }

.card-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--matou-text, #1f2937);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-role {
  font-size: 0.75rem;
  color: var(--matou-primary, #6366f1);
}

.card-date {
  font-size: 0.75rem;
  color: var(--matou-text-secondary, #6b7280);
}
</style>
