/**
 * Composable for polling registration requests (admin side)
 * Polls for pending registration notifications and parses applicant data
 *
 * Supports two notification types:
 * 1. Pending (escrowed) - from KERIA patch, sender OOBI not yet resolved
 *    Route: /exn/matou/registration/apply/pending
 *    Data is embedded directly in notification.a.a
 *
 * 2. Verified - normal flow after OOBI resolution
 *    Route: /exn/ipex/apply or /exn/matou/registration/apply
 *    Data must be fetched via getExchange()
 */
import { ref, onUnmounted } from 'vue';
import { useKERIClient } from 'src/lib/keri/client';

export interface PendingRegistration {
  notificationId: string;
  exnSaid: string;
  applicantAid: string;
  applicantOOBI?: string;
  profile: {
    name: string;
    bio: string;
    interests: string[];
    customInterests?: string;
    submittedAt: string;
  };
  /** True if from escrowed message (OOBI not resolved), false if verified */
  isPending: boolean;
}

// Routes to poll for registration notifications
const REGISTRATION_ROUTES = {
  // Pending notifications from KERIA patch (escrowed, unverified)
  PENDING: '/exn/matou/registration/apply/pending',
  // Verified notifications (after OOBI resolution)
  VERIFIED_CUSTOM: '/exn/matou/registration/apply',
  VERIFIED_IPEX: '/exn/ipex/apply',
};

export interface RegistrationPollingOptions {
  pollingInterval?: number;  // Default: 10000ms (10 seconds)
  maxConsecutiveErrors?: number;  // Default: 5
}

export function useRegistrationPolling(options: RegistrationPollingOptions = {}) {
  const { pollingInterval = 10000, maxConsecutiveErrors = 5 } = options;

  const keriClient = useKERIClient();

  // State
  const pendingRegistrations = ref<PendingRegistration[]>([]);
  const isPolling = ref(false);
  const error = ref<string | null>(null);
  const lastPollTime = ref<Date | null>(null);
  const consecutiveErrors = ref(0);

  // Internal state
  let pollingTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Poll for registration notifications
   */
  async function pollForRegistrations(): Promise<void> {
    const client = keriClient.getSignifyClient();
    if (!client) {
      console.warn('[RegistrationPolling] SignifyClient not available');
      return;
    }

    try {
      const registrations: PendingRegistration[] = [];

      // === 1. Check for PENDING notifications (from KERIA patch) ===
      const pendingNotifications = await keriClient.listNotifications({
        route: REGISTRATION_ROUTES.PENDING,
        read: false,
      });

      for (const notification of pendingNotifications) {
        try {
          // Pending notifications from patch have data directly in a.a
          const attrs = notification.a;
          const embeddedData = attrs?.a || {};

          registrations.push({
            notificationId: notification.i,
            exnSaid: attrs?.d || notification.i,
            applicantAid: attrs?.i || '',
            applicantOOBI: (embeddedData.senderOOBI as string) || undefined,
            profile: {
              name: (embeddedData.name as string) || 'Unknown',
              bio: (embeddedData.bio as string) || '',
              interests: (embeddedData.interests as string[]) || [],
              customInterests: (embeddedData.customInterests as string) || undefined,
              submittedAt: (attrs?.dt as string) || new Date().toISOString(),
            },
            isPending: true,
          });
        } catch (parseErr) {
          console.warn('[RegistrationPolling] Failed to parse pending notification:', notification.i, parseErr);
        }
      }

      // === 2. Check for VERIFIED notifications ===
      const ipexNotifications = await keriClient.listNotifications({
        route: REGISTRATION_ROUTES.VERIFIED_IPEX,
        read: false,
      });

      const customNotifications = await keriClient.listNotifications({
        route: REGISTRATION_ROUTES.VERIFIED_CUSTOM,
        read: false,
      });

      const verifiedNotifications = [...ipexNotifications, ...customNotifications];

      for (const notification of verifiedNotifications) {
        try {
          const exchange = await keriClient.getExchange(notification.a.d);
          const exn = exchange.exn;

          const attributes = exn.a || {};
          let messageData: Record<string, unknown> = {};

          if (typeof attributes.msg === 'string') {
            try {
              messageData = JSON.parse(attributes.msg);
            } catch {
              // Ignore parse errors
            }
          }

          // Check if this looks like a registration
          const isRegistration =
            messageData.type === 'registration' ||
            attributes.name ||
            (exn.r && exn.r.includes('/ipex/apply'));

          if (!isRegistration) continue;

          registrations.push({
            notificationId: notification.i,
            exnSaid: notification.a.d,
            applicantAid: exn.i,
            applicantOOBI: (messageData.senderOOBI as string) || undefined,
            profile: {
              name: (attributes.name as string) || 'Unknown',
              bio: (messageData.bio as string) || '',
              interests: (attributes.interests as string[]) || [],
              customInterests: (messageData.customInterests as string) || undefined,
              submittedAt: (messageData.submittedAt as string) || new Date().toISOString(),
            },
            isPending: false,
          });
        } catch (exnErr) {
          console.warn('[RegistrationPolling] Failed to fetch EXN:', notification.a.d, exnErr);
        }
      }

      // === 3. Deduplicate by exnSaid (prefer verified over pending) ===
      const seenSaids = new Set<string>();
      const deduped: PendingRegistration[] = [];

      // Sort so verified (isPending=false) comes first
      registrations.sort((a, b) => {
        if (a.isPending !== b.isPending) return a.isPending ? 1 : -1;
        return new Date(b.profile.submittedAt).getTime() - new Date(a.profile.submittedAt).getTime();
      });

      for (const reg of registrations) {
        if (!seenSaids.has(reg.exnSaid)) {
          seenSaids.add(reg.exnSaid);
          deduped.push(reg);
        }
      }

      // Re-sort by submission time (newest first)
      deduped.sort((a, b) =>
        new Date(b.profile.submittedAt).getTime() - new Date(a.profile.submittedAt).getTime()
      );

      const pendingCount = deduped.filter(r => r.isPending).length;
      const verifiedCount = deduped.filter(r => !r.isPending).length;
      console.log(`[RegistrationPolling] Found ${deduped.length} registrations (${pendingCount} pending, ${verifiedCount} verified)`);

      pendingRegistrations.value = deduped;
      lastPollTime.value = new Date();
      consecutiveErrors.value = 0;
      error.value = null;
    } catch (err) {
      consecutiveErrors.value++;
      console.error('[RegistrationPolling] Poll error:', err);

      if (consecutiveErrors.value >= maxConsecutiveErrors) {
        error.value = `Failed to poll for registrations after ${maxConsecutiveErrors} attempts`;
        stopPolling();
      }
    }
  }

  /**
   * Start polling for registrations
   */
  function startPolling(): void {
    if (isPolling.value) return;

    const client = keriClient.getSignifyClient();
    if (!client) {
      console.warn('[RegistrationPolling] No SignifyClient available');
      error.value = 'Not connected to KERIA';
      return;
    }

    console.log('[RegistrationPolling] Starting polling...');
    isPolling.value = true;
    error.value = null;
    consecutiveErrors.value = 0;

    // Poll immediately
    pollForRegistrations();

    // Then poll at interval
    pollingTimer = setInterval(() => {
      pollForRegistrations();
    }, pollingInterval);
  }

  /**
   * Stop polling
   */
  function stopPolling(): void {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    isPolling.value = false;
    console.log('[RegistrationPolling] Polling stopped');
  }

  /**
   * Manually trigger a poll (e.g., after taking an action)
   */
  async function refresh(): Promise<void> {
    await pollForRegistrations();
  }

  /**
   * Remove a registration from the list (after processing)
   */
  function removeRegistration(notificationId: string): void {
    pendingRegistrations.value = pendingRegistrations.value.filter(
      r => r.notificationId !== notificationId
    );
  }

  /**
   * Retry after error
   */
  function retry(): void {
    error.value = null;
    consecutiveErrors.value = 0;
    startPolling();
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling();
  });

  return {
    // State
    pendingRegistrations,
    isPolling,
    error,
    lastPollTime,

    // Actions
    startPolling,
    stopPolling,
    refresh,
    removeRegistration,
    retry,
  };
}
