const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // QQ Music
  initiateQQAuth:      ()         => ipcRenderer.invoke('qq-auth'),
  getQQCookies:        ()         => ipcRenderer.invoke('get-qq-cookies'),
  storeQQCookies:      (c)        => ipcRenderer.invoke('store-qq-cookies', c),
  clearQQCookies:      ()         => ipcRenderer.invoke('clear-qq-cookies'),
  getQQUrl:            (songmid, mediaMid) => ipcRenderer.invoke('qq-get-url', songmid, mediaMid),
  getQQLyric:          (songmid) => ipcRenderer.invoke('qq-get-lyric', songmid),
  // Window
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),
})
