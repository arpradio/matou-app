/**
 * Platform detection utilities for Electron, Cordova, and browser environments.
 */

interface ElectronAPI {
  isElectron: true;
  platform: string;
  getBackendPort: () => Promise<number>;
  getDataDir: () => Promise<string>;
}

let cachedBackendUrl: string | null = null;

/**
 * Check if running inside Electron.
 */
export function isElectron(): boolean {
  return !!(window as unknown as { electronAPI?: ElectronAPI }).electronAPI?.isElectron;
}

/**
 * Check if running inside Cordova/Capacitor.
 */
export function isCordova(): boolean {
  return !!(window as unknown as { cordova?: unknown }).cordova;
}

/**
 * Check if running in a regular browser (dev or web deployment).
 */
export function isBrowser(): boolean {
  return !isElectron() && !isCordova();
}

/**
 * Derive backend URL from the current page's hostname.
 * Always uses window.location.hostname to ensure LAN access works.
 * VITE_BACKEND_PORT can override the default port.
 * VITE_BACKEND_URL can override the entire URL (for special cases).
 */
function deriveBackendUrl(envUrl: string | undefined, defaultPort: number): string {
  // Handle SSR or missing window
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // Check for port override
  const portOverride = import.meta.env.VITE_BACKEND_PORT as string | undefined;
  const port = portOverride ? parseInt(portOverride, 10) : defaultPort;

  let result: string;

  if (envUrl) {
    // Full URL override - still substitute hostname for LAN access
    const isLanAccess = currentHost !== 'localhost' && currentHost !== '127.0.0.1';
    if (isLanAccess && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      result = envUrl.replace(/localhost|127\.0\.0\.1/, currentHost);
    } else {
      result = envUrl;
    }
  } else {
    // Derive from current hostname - this is the LAN-friendly default
    result = `http://${currentHost}:${port}`;
  }

  console.log(`[Platform] Backend URL: ${result} (host: ${currentHost}, port: ${port})`);
  return result;
}

/**
 * Get the backend URL based on the current platform.
 * - Electron: dynamically allocated localhost port
 * - Cordova: localhost with configured port
 * - Browser: derives from current hostname to support LAN access
 */
export async function getBackendUrl(): Promise<string> {
  if (cachedBackendUrl) return cachedBackendUrl;

  if (isElectron()) {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const port = await api.getBackendPort();
    cachedBackendUrl = `http://127.0.0.1:${port}`;
    return cachedBackendUrl;
  }

  // Browser and Cordova: derive from current hostname for LAN support
  cachedBackendUrl = deriveBackendUrl(import.meta.env.VITE_BACKEND_URL as string | undefined, 4000);
  return cachedBackendUrl;
}

/**
 * Get the backend URL synchronously (returns cached value or default).
 * Use getBackendUrl() for the async version that resolves Electron ports.
 */
export function getBackendUrlSync(): string {
  if (cachedBackendUrl) return cachedBackendUrl;
  // Cache the derived URL for consistency with getBackendUrl()
  cachedBackendUrl = deriveBackendUrl(import.meta.env.VITE_BACKEND_URL as string | undefined, 4000);
  return cachedBackendUrl;
}
