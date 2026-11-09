const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewports', {
  navigate: address => ipcRenderer.invoke('viewports:navigate', address),
  onAddressChange: callback => ipcRenderer.on('viewports:address', (_event, address) => callback(address)),
});
