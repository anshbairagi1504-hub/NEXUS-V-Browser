const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexus", {
  getVersion: () => ipcRenderer.invoke("get-version"),
  openExternal: url => ipcRenderer.invoke("open-external", url),
  setAdBlock: enabled => ipcRenderer.invoke("set-adblock", enabled),
  chooseWallpaper: () => ipcRenderer.invoke("choose-wallpaper"),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  onDownloadUpdate: callback =>
    ipcRenderer.on("download-update", (event, data) => callback(data)),

  onUpdateAvailable: callback =>
    ipcRenderer.on("update-available", (event, version) => callback(version)),

  onUpdateNotAvailable: callback =>
    ipcRenderer.on("update-not-available", () => callback()),

  onUpdateProgress: callback =>
    ipcRenderer.on("update-progress", (event, data) => callback(data)),

  onUpdateDownloaded: callback =>
    ipcRenderer.on("update-downloaded", (event, version) => callback(version)),

  onUpdateError: callback =>
    ipcRenderer.on("update-error", (event, message) => callback(message))
});