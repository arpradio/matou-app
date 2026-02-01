/**
 * Electron Preload Script
 * Exposes a safe API to the renderer process via contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
});
