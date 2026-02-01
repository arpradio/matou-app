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
 * Get the backend URL based on the current platform.
 * - Electron: dynamically allocated localhost port
 * - Cordova: localhost with configured port
 * - Browser: from VITE_BACKEND_URL env var or default
 */
export async function getBackendUrl(): Promise<string> {
  if (cachedBackendUrl) return cachedBackendUrl;

  if (isElectron()) {
    const api = (window as unknown as { electronAPI: ElectronAPI }).electronAPI;
    const port = await api.getBackendPort();
    cachedBackendUrl = `http://127.0.0.1:${port}`;
    return cachedBackendUrl;
  }

  // Browser and Cordova use the env var or default
  cachedBackendUrl = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8080';
  return cachedBackendUrl;
}

/**
 * Get the backend URL synchronously (returns cached value or default).
 * Use getBackendUrl() for the async version that resolves Electron ports.
 */
export function getBackendUrlSync(): string {
  return cachedBackendUrl ?? (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:8080';
}
