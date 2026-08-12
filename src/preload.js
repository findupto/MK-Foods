const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mkFoods', {
  getAppInfo: () => ipcRenderer.invoke('app:info')
});
