const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'inventoryDesktop',
  Object.freeze({
    language: 'fr',
    ready: () => ipcRenderer.send('inventory:ui-ready'),
    reportError: (message) =>
      ipcRenderer.send('inventory:ui-error', String(message).slice(0, 1500)),
    openLog: () => ipcRenderer.invoke('inventory:open-log'),
    importBackup: () => ipcRenderer.invoke('inventory:import-backup'),
    exportBackup: (name) => ipcRenderer.invoke('inventory:export-backup', name),
    openDataFolder: () => ipcRenderer.invoke('inventory:open-data-folder'),
  }),
);
window.addEventListener('error', (event) => {
  ipcRenderer.send(
    'inventory:ui-error',
    String(event.message || 'Script failed to load.').slice(0, 1500),
  );
});
window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.send(
    'inventory:ui-error',
    String(event.reason?.message || 'Unhandled promise rejection.').slice(0, 1500),
  );
});
