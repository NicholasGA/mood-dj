const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // QQ Music
  initiateQQAuth:      ()         => ipcRenderer.invoke('qq-auth'),
  getQQCookies:        ()         => ipcRenderer.invoke('get-qq-cookies'),
  storeQQCookies:      (c)        => ipcRenderer.invoke('store-qq-cookies', c),
  clearQQCookies:      ()         => ipcRenderer.invoke('clear-qq-cookies'),
  getQQUrl:            (songmid, mediaMid) => ipcRenderer.invoke('qq-get-url', songmid, mediaMid),
  getQQLyric:          (songmid) => ipcRenderer.invoke('qq-get-lyric', songmid),
  getQQFavorites:      () => ipcRenderer.invoke('qq-get-favorites'),
  addQQFavorite:       (songId) => ipcRenderer.invoke('qq-add-favorite', songId),
  createQQPlaylist:    (name) => ipcRenderer.invoke('qq-create-playlist', name),
  addSongsToQQPlaylist:(dirId, songIds) => ipcRenderer.invoke('qq-add-songs', dirId, songIds),
  getMemory:           () => ipcRenderer.invoke('get-memory'),
  storeMemory:         (v) => ipcRenderer.invoke('store-memory', v),
  getConfig:           () => ipcRenderer.invoke('get-config'),
  storeConfig:         (v) => ipcRenderer.invoke('store-config', v),
  openExternal:        (url) => ipcRenderer.invoke('open-external', url),
  onUpdateStatus:      (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
  installUpdate:       () => ipcRenderer.invoke('install-update'),
  // 托盘/后台存在感：托盘菜单与系统挂起会通过 tray-control 发指令；渲染进程把当前播放回传给托盘做 tooltip
  onTrayControl:       (cb) => ipcRenderer.on('tray-control', (_e, action) => cb(action)),
  notifyNowPlaying:    (info) => ipcRenderer.send('tray-nowplaying', info),
  // Window
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),
  setMini:  (on) => ipcRenderer.invoke('set-mini', on),
  setDock:    (on) => ipcRenderer.invoke('set-dock', on),
  dockExpand: (expand) => ipcRenderer.invoke('dock-expand', expand),
  dockMove:   (dx, dy) => ipcRenderer.invoke('dock-move', dx, dy),
})
