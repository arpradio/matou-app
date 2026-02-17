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
 * If accessed via LAN IP, use that IP for backend too.
 */
function deriveBackendUrl(envUrl: string | undefined, defaultPort: number): string {
  // Handle SSR or missing window
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isLanAccess = currentHost !== 'localhost' && currentHost !== '127.0.0.1';

  let result: string;

  if (envUrl) {
    // If env var uses localhost but we're accessed via LAN IP, substitute hostname
    if (isLanAccess && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      result = envUrl.replace(/localhost|127\.0\.0\.1/, currentHost);
    } else {
      result = envUrl;
    }
  } else {
    // No env var: use current hostname with default backend port
    result = `http://${currentHost}:${defaultPort}`;
  }

  console.log(`[Platform] Backend URL derived: ${result} (host: ${currentHost}, envUrl: ${envUrl || 'not set'})`);
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
