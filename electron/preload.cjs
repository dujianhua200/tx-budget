const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getDb: () => ipcRenderer.invoke('db:get'),
  saveDb: (db) => ipcRenderer.invoke('db:save', db),
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', { filters }),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  openDir: () => ipcRenderer.invoke('dialog:openDir'),
  importQuantities: (filePath) => ipcRenderer.invoke('excel:importQuantities', filePath),
  importQuotas: (filePath) => ipcRenderer.invoke('excel:importQuotas', filePath),
  exportQuotas: (args) => ipcRenderer.invoke('excel:exportQuotas', args),
  exportProject: (args) => ipcRenderer.invoke('excel:exportProject', args),
});
