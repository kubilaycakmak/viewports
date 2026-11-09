const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('viewports', {
  windowAction: action => ipcRenderer.send('viewports:window-action', action),
  navigate: address => ipcRenderer.invoke('viewports:navigate', address),
  onAddressChange: callback => ipcRenderer.on('viewports:address', (_event, address) => callback(address)),
});
