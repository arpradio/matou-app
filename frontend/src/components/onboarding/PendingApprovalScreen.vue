<template>
  <div class="pending-approval-screen h-full flex flex-col bg-background">
    <!-- Header -->
    <OnboardingHeader
      title="Registration Pending"
      :subtitle="`Kia ora, ${userName}`"
      :show-back-button="false"
    />

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6 md:p-8 -mt-6">
      <div class="max-w-2xl mx-auto space-y-6">
        <!-- Status Card -->
        <div
          v-motion="fadeSlideUp(100)"
          class="status-card bg-card border border-border rounded-2xl p-6 shadow-sm"
        >
          <div class="flex items-start gap-4">
            <div class="icon-box p-3 rounded-xl shrink-0" :class="statusConfig.bgClass">
              <div v-motion="currentStatus === 'reviewing' ? rotate : undefined">
                <component
                  :is="statusConfig.icon"
                  class="w-6 h-6"
                  :class="[statusConfig.iconClass, { 'animate-spin': statusConfig.animate }]"
                />
              </div>
            </div>
            <div class="flex-1">
              <h2 class="mb-2">{{ statusConfig.title }}</h2>
              <p class="text-muted-foreground mb-4">
                {{ statusConfig.description }}
              </p>

              <!-- Error Message -->
              <div v-if="pollingError" class="error-box bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-4">
                <p class="text-sm text-destructive mb-2">{{ pollingError }}</p>
                <MBtn variant="outline" size="sm" @click="retry">
                  Try Again
                </MBtn>
              </div>

              <!-- Progress Box (only show when reviewing) -->
              <div v-if="currentStatus === 'reviewing'" class="progress-box bg-secondary/50 rounded-xl p-4">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm text-muted-foreground">Typical review time</span>
                  <span class="text-sm font-medium">1-3 days</span>
                </div>
                <div class="progress-bar h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div v-motion="progressBar" class="progress-fill h-full bg-primary" />
                </div>
              </div>

              <!-- Processing Steps (shown when credential is being processed or approved) -->
              <div v-if="currentStatus === 'processing' || currentStatus === 'approved'" class="processing-steps bg-secondary/50 rounded-xl p-4">
                <div class="space-y-3">
                  <div
                    v-for="s in processingSteps"
                    :key="s.key"
                    class="flex items-center gap-3"
                  >
                    <CheckCircle2
                      v-if="isProcessingStepComplete(s.key)"
                      class="w-5 h-5 text-accent shrink-0"
                    />
                    <Loader2
                      v-else-if="isProcessingStepActive(s.key)"
                      class="w-5 h-5 text-primary animate-spin shrink-0"
                    />
                    <Circle
                      v-else
                      class="w-5 h-5 text-muted-foreground/40 shrink-0"
                    />
                    <span
                      class="text-sm"
                      :class="{
                        'text-foreground font-medium': isProcessingStepActive(s.key) || isProcessingStepComplete(s.key),
                        'text-muted-foreground': !isProcessingStepActive(s.key) && !isProcessingStepComplete(s.key),
                      }"
                    >
                      {{ s.label }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Rejection Info (when rejected) -->
        <div
          v-if="currentStatus === 'rejected'"
          v-motion="fadeSlideUp(125)"
          class="rejection-card bg-destructive/5 border border-destructive/20 rounded-2xl p-5"
        >
          <h3 class="font-medium text-destructive mb-2">What you can do</h3>
          <p class="text-sm text-muted-foreground mb-4">
            If you believe this was a mistake or have additional information to share,
            you can contact the community admins for clarification.
          </p>
          <MBtn variant="outline" class="w-full">
            Contact Support
          </MBtn>
        </div>

        <!-- Your Identity (AID) -->
        <div
          v-motion="fadeSlideUp(150)"
          class="aid-card bg-card border border-border rounded-xl p-4 shadow-sm"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <span class="text-xs text-muted-foreground">Your Identity (AID)</span>
              <p class="text-sm font-mono truncate">{{ userAID }}</p>
            </div>
            <button
              @click="copyAID"
              class="p-2 rounded-lg hover:bg-secondary transition-colors shrink-0"
              :title="copied ? 'Copied!' : 'Copy AID'"
            >
              <Check v-if="copied" class="w-4 h-4 text-green-600" />
              <Copy v-else class="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <!-- What Happens Next (hide when rejected) -->
        <div v-if="currentStatus !== 'rejected'" v-motion="fadeSlideUp(200)">
          <h3 class="mb-4">What happens next?</h3>
          <div class="space-y-3">
            <div
              v-for="(step, index) in steps"
              :key="index"
              v-motion="slideInLeft(300 + index * 100)"
              class="step-card flex items-start gap-4 bg-card border border-border rounded-xl p-4"
            >
              <div class="step-number bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                <span class="text-sm font-semibold text-primary">{{ step.step }}</span>
              </div>
              <div>
                <h4 class="mb-1">{{ step.title }}</h4>
                <p class="text-sm text-muted-foreground">{{ step.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Resources -->
        <div v-motion="fadeSlideUp(700)">
          <h3 class="mb-4">Explore while you wait</h3>
          <p class="text-muted-foreground mb-4">
            Learn more about Matou by browsing our documentation and resources
          </p>
          <div class="grid gap-3 md:grid-cols-2">
            <button
              v-for="(resource, index) in resources"
              :key="index"
              v-motion="fadeSlideUp(800 + index * 100)"
              class="resource-card bg-card border border-border rounded-xl p-4 text-left hover:shadow-md transition-all hover:scale-[1.02] group"
            >
              <div class="flex items-start gap-3">
                <div class="icon-box bg-accent/10 p-2 rounded-lg shrink-0">
                  <component :is="resource.icon" class="w-5 h-5 text-accent" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h4 class="truncate">{{ resource.title }}</h4>
                    <ExternalLink
                      class="external-link w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </div>
                  <p class="text-sm text-muted-foreground">{{ resource.description }}</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Help Section -->
        <div
          v-motion="fadeSlideUp(1200)"
          class="help-box bg-secondary/50 border border-border rounded-xl p-5"
        >
          <h4 class="mb-2">Need help?</h4>
          <p class="text-sm text-muted-foreground mb-4">
            If you have questions about your application or the review process, please contact
            our support team.
          </p>
          <MBtn variant="outline" class="w-full"> Contact Support </MBtn>
        </div>
      </div>
    </div>

    <!-- Welcome Overlay -->
    <WelcomeOverlay
      :show="showWelcome"
      :user-name="props.userName"
      :credential="credential"
      @continue="handleContinue"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Clock, FileText, Users, Target, BookOpen, ExternalLink, CheckCircle, CheckCircle2, Circle, XCircle, Loader2, Copy, Check } from 'lucide-vue-next';
import MBtn from '../base/MBtn.vue';
import OnboardingHeader from './OnboardingHeader.vue';
import WelcomeOverlay from './WelcomeOverlay.vue';
import { useAnimationPresets } from 'composables/useAnimationPresets';
import { useCredentialPolling } from 'composables/useCredentialPolling';
import { useIdentityStore } from 'stores/identity';

const { fadeSlideUp, slideInLeft, rotate, backgroundPulse, progressBar } = useAnimationPresets();
const identityStore = useIdentityStore();

// User's AID for display
const userAID = computed(() => identityStore.currentAID?.prefix ?? 'Loading...');
const copied = ref(false);

function copyAID() {
  if (identityStore.currentAID?.prefix) {
    navigator.clipboard.writeText(identityStore.currentAID.prefix);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

interface Props {
  userName: string;
}

const props = withDefaults(defineProps<Props>(), {
  userName: 'Member',
});

const emit = defineEmits<{
  (e: 'approved', credential: any): void;
  (e: 'continue-to-dashboard'): void;
}>();

// Credential polling
const {
  isPolling,
  error: pollingError,
  grantReceived,
  credentialReceived,
  credential,
  spaceInviteReceived,
  spaceInviteKey,
  spaceId,
  readOnlyInviteKey,
  readOnlySpaceId,
  rejectionReceived,
  rejectionInfo,
  startPolling,
  retry,
} = useCredentialPolling({ pollingInterval: 5000 });

// UI State
const showWelcome = ref(false);

// Computed status for display
const currentStatus = computed(() => {
  if (credentialReceived.value) {
    return 'approved';
  }
  if (rejectionReceived.value) {
    return 'rejected';
  }
  if (grantReceived.value) {
    return 'processing';
  }
  return 'reviewing';
});

const statusConfig = computed(() => {
  switch (currentStatus.value) {
    case 'approved':
      return {
        icon: CheckCircle,
        title: 'Membership approved!',
        description: processingStep.value === 'done'
          ? 'Your community access is ready.'
          : 'Your credential has been issued. Setting up community access...',
        iconClass: 'text-green-600',
        bgClass: 'bg-green-100',
      };
    case 'rejected':
      return {
        icon: XCircle,
        title: 'Registration Declined',
        description: rejectionInfo.value?.reason || 'Your registration has been declined by the community admins.',
        iconClass: 'text-destructive',
        bgClass: 'bg-destructive/10',
      };
    case 'processing':
      return {
        icon: Loader2,
        title: 'Credential detected',
        description: 'Your application has been approved. Processing your membership credential...',
        iconClass: 'text-primary',
        bgClass: 'bg-primary/10',
        animate: true,
      };
    default:
      return {
        icon: Clock,
        title: 'Your application is under review',
        description: 'Thank you for your interest in joining Matou! Our admins have been notified of your registration and will review your application soon.',
        iconClass: 'text-primary',
        bgClass: 'bg-primary/10',
      };
  }
});

// Processing steps for post-approval flow
type ProcessingStep = 'admitting' | 'invite' | 'joining' | 'verifying' | 'done';

const processingStep = ref<ProcessingStep>('admitting');

const processingStepOrder: ProcessingStep[] = ['admitting', 'invite', 'joining', 'verifying', 'done'];

const processingSteps = [
  { key: 'admitting' as ProcessingStep, label: 'Admitting credential' },
  { key: 'invite' as ProcessingStep, label: 'Receiving space invite' },
  { key: 'joining' as ProcessingStep, label: 'Joining community space' },
  { key: 'verifying' as ProcessingStep, label: 'Verifying access' },
  { key: 'done' as ProcessingStep, label: 'Ready to enter' },
];

function isProcessingStepComplete(key: ProcessingStep): boolean {
  const currentIdx = processingStepOrder.indexOf(processingStep.value);
  const stepIdx = processingStepOrder.indexOf(key);
  return currentIdx > stepIdx;
}

function isProcessingStepActive(key: ProcessingStep): boolean {
  return processingStep.value === key;
}

// Start polling on mount
onMounted(() => {
  startPolling();
});

// Guard to prevent concurrent watcher callbacks from racing
let joinInProgress = false;

// Watch for both credential and space invite to be ready
watch(
  [credentialReceived, spaceInviteReceived],
  async ([hasCred, hasInvite]) => {
    if (!hasCred) return;

    if (hasInvite && spaceInviteKey.value && !joinInProgress && processingStep.value !== 'done') {
      // Both received — execute community join with full invite data
      joinInProgress = true;
      processingStep.value = 'joining';

      let joined = await identityStore.joinCommunitySpace({
        inviteKey: spaceInviteKey.value,
        spaceId: spaceId.value ?? undefined,
        readOnlyInviteKey: readOnlyInviteKey.value ?? undefined,
        readOnlySpaceId: readOnlySpaceId.value ?? undefined,
      });

      if (!joined) {
        // Retry a few times
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 3000));
          joined = await identityStore.joinCommunitySpace({
            inviteKey: spaceInviteKey.value!,
            spaceId: spaceId.value ?? undefined,
            readOnlyInviteKey: readOnlyInviteKey.value ?? undefined,
            readOnlySpaceId: readOnlySpaceId.value ?? undefined,
          });
          if (joined) break;
        }
      }

      processingStep.value = 'verifying';
      if (joined) {
        // Refresh spaces in store so dashboard guard passes
        await identityStore.fetchUserSpaces();
      }

      processingStep.value = 'done';
      showWelcome.value = true;
      emit('approved', credential.value);
    } else if (!hasInvite && !joinInProgress && processingStep.value === 'admitting') {
      // Credential just received, invite not yet — advance step indicator
      processingStep.value = 'invite';

      // Check if we already have community access (admin/space-owner case)
      const hasAccess = await identityStore.verifyCommunityAccess();
      if (hasAccess) {
        console.log('[PendingApproval] Already have community access (space owner)');
        joinInProgress = true;
        processingStep.value = 'done';
        showWelcome.value = true;
        emit('approved', credential.value);
      }
      // Otherwise, wait — polling continues and will find the space invite,
      // which triggers this watcher again with [true, true]
    }
  }
);

// Handle continue from welcome overlay
function handleContinue() {
  emit('continue-to-dashboard');
}

const steps = [
  {
    step: '1',
    title: 'Admin Review',
    description: "An admin will review your registration details",
  },
  {
    step: '2',
    title: 'Approval Decision',
    description: "You'll receive notification of the decision",
  },
  {
    step: '3',
    title: 'Credential Issuance',
    description: 'Upon approval, your membership credential will be issued',
  },
  {
    step: '4',
    title: 'Welcome to Matou',
    description: 'Full access to governance, contributions, and community chat',
  },
];

const resources = [
  {
    icon: BookOpen,
    title: 'Community Handbook',
    description: 'Learn about governance processes and community guidelines',
    link: '#',
  },
  {
    icon: FileText,
    title: 'Documentation',
    description: 'Explore technical documentation and proposal templates',
    link: '#',
  },
  {
    icon: Target,
    title: 'Contribution Guidelines',
    description: "Discover how to contribute once you're approved",
    link: '#',
  },
  {
    icon: Users,
    title: 'About Working Groups',
    description: 'Learn about our various working groups and their focus areas',
    link: '#',
  },
];
</script>

<style lang="scss" scoped>
.pending-approval-screen {
  background-color: var(--matou-background);
}

// Header styles are now handled by OnboardingHeader component

.icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-card,
.step-card,
.resource-card {
  background-color: var(--matou-card);
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-box {
  background-color: rgba(232, 244, 248, 0.5);
}

.progress-bar {
  background-color: var(--matou-secondary);
}

.progress-fill {
  width: 0%;
}

.help-box {
  background-color: rgba(232, 244, 248, 0.5);
}

.error-box {
  background-color: rgba(var(--matou-destructive-rgb, 220, 38, 38), 0.1);
}

.processing-steps {
  background-color: rgba(232, 244, 248, 0.5);
}

.aid-card {
  background-color: var(--matou-card);
}

.rejection-card {
  background-color: rgba(var(--matou-destructive-rgb, 220, 38, 38), 0.05);
}

.external-link {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.resource-card:hover .external-link {
  opacity: 1;
}
</style>
