const { app, BrowserWindow, ipcMain, session, shell, dialog, clipboard } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

let mainWindow;
let adBlockEnabled = false;
let adBlocker = null;
let adBlockReady = false;
let blockedCount = 0;
const downloadItems = new Map();

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}

async function installAdBlock(ses) {
  try {
    adBlocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
    adBlockReady = true;
    console.log("NEXUS V ad/tracker filters loaded.");
    send("adblock-ready", true);
    ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, callback) => {
      if (!adBlockEnabled || !adBlockReady || !adBlocker) return callback({});
      try {
        adBlocker.onBeforeRequest(details, response => {
          if (response.cancel || response.redirectURL) {
            blockedCount++;
            send("adblock-count", blockedCount);
          }
          callback(response || {});
        });
      } catch (err) {
        callback({});
      }
    });
  } catch (error) {
    adBlockReady = false;
    console.error("Ad blocker initialization failed:", error);
    send("adblock-error", error.message);
  }
}

function createWindow() {
  const browserSession = session.fromPartition("persist:nexus");
  installAdBlock(browserSession);

  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 620,
    backgroundColor: "#10131d", title: "NEXUS V Browser",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true
    }
  });

  mainWindow.webContents.on("will-attach-webview", (event, webPreferences) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    delete webPreferences.preload;
  });

  browserSession.on("will-download", (event, item) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const info = { id, name: item.getFilename(), received: 0, total: item.getTotalBytes(), state: "progressing", savePath: "" };
    downloadItems.set(id, info);
    send("download-update", info);
    item.on("updated", () => {
      info.received = item.getReceivedBytes();
      info.total = item.getTotalBytes();
      info.state = item.getState();
      send("download-update", info);
    });
    item.once("done", (_event, state) => {
      info.state = state;
      info.savePath = item.getSavePath();
      send("download-update", info);
    });
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

ipcMain.handle("get-version", () => app.getVersion());
ipcMain.handle("open-external", async (_event, url) => {
  if (typeof url !== "string") return false;
  if (url.startsWith("file://")) {
    const filePath = url.replace(/^file:\/\/\/?/i, "");
    await shell.openPath(decodeURIComponent(filePath));
    return true;
  }
  if (!/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});
ipcMain.handle("set-adblock", (_event, enabled) => {
  adBlockEnabled = Boolean(enabled);
  return { enabled: adBlockEnabled, ready: adBlockReady, blockedCount };
});
ipcMain.handle("get-adblock-state", () => ({ enabled: adBlockEnabled, ready: adBlockReady, blockedCount }));
ipcMain.handle("choose-wallpaper", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose browser wallpaper", properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("copy-text", (_event, value) => {
  clipboard.writeText(String(value ?? ""));
  return true;
});
ipcMain.handle("clear-site-data", async () => {
  const ses = session.fromPartition("persist:nexus");
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});
ipcMain.handle("check-updates", async () => {
  if (!app.isPackaged) return { status: "development", message: "Update checking works in the installed, packaged app." };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: "checking", version: result?.updateInfo?.version || null, message: "Update check started." };
  } catch (error) {
    return { status: "error", message: error.message };
  }
});
ipcMain.handle("download-update", async () => {
  if (!app.isPackaged) return { ok: false, message: "Update download is available in the installed app." };
  try { await autoUpdater.downloadUpdate(); return { ok: true, message: "Update download started." }; }
  catch (error) { return { ok: false, message: error.message }; }
});
ipcMain.handle("install-update", () => {
  if (!app.isPackaged) return false;
  autoUpdater.quitAndInstall();
  return true;
});

autoUpdater.on("update-available", info => send("update-available", info.version));
autoUpdater.on("update-not-available", () => send("update-not-available"));
autoUpdater.on("download-progress", progress => send("update-progress", progress));
autoUpdater.on("update-downloaded", info => send("update-downloaded", info.version));
autoUpdater.on("error", error => send("update-error", error.message));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
