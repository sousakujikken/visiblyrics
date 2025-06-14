// Type-safe wrapper for Electron API access in renderer process
// Check if running in Electron environment
export function isElectron() {
    return typeof window !== 'undefined' && 'electronAPI' in window;
}
// Get Electron API with fallback for browser environment
export function getElectronAPI() {
    if (isElectron()) {
        return window.electronAPI;
    }
    return null;
}
// Safe wrapper that checks for Electron availability
export function useElectronAPI() {
    const electronAvailable = isElectron();
    const electronAPI = electronAvailable ? getElectronAPI() : null;
    return {
        isElectron: electronAvailable,
        electronAPI
    };
}
