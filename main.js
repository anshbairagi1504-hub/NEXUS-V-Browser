const {
  app, BrowserWindow, ipcMain, session, shell, dialog
} = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow;
let adBlockEnabled = true;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const blockedHosts = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adservice.google.com",
  "adnxs.com",
  "adform.net",
  "adsystem.com",
  "taboola.com",
  "outbrain.com"
];

function installAdBlock(ses) {
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!adBlockEnabled) return callback({});
    try {
      const host = new URL(details.url).hostname;
      const blocked = blockedHosts.some(
        domain => host === domain || host.endsWith("." + domain)
      );
      return callback({ cancel: blocked });
    } catch {
      return callback({});
    }
  });
}

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function createWindow() {
  const browserSession = session.fromPartition("persist:nexus");
  installAdBlock(browserSession);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#202124",
    title: "NEXUS V Browser",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
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
    const id = `${Date.now()}-${Math.random()}`;
    const info = {
      id,
      name: item.getFilename(),
      received: 0,
      total: item.getTotalBytes(),
      state: "progressing",
      savePath: ""
    };

    send("download-update", info);

    item.on("updated", () => {
      info.received = item.getReceivedBytes();
      info.total = item.getTotalBytes();
      info.state = item.getState();
      send("download-update", info);
    });

    item.once("done", (event, state) => {
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("get-version", () => app.getVersion());

ipcMain.handle("open-external", async (event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("set-adblock", (event, enabled) => {
  adBlockEnabled = Boolean(enabled);
  return adBlockEnabled;
});

ipcMain.handle("choose-wallpaper", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose browser wallpaper",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("check-updates", async () => {
  if (!app.isPackaged) {
    return {
      status: "development",
      message: "Update checking works after publishing the installer and configuring a release provider."
    };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: "checking",
      version: result?.updateInfo?.version || null,
      message: "Update check started."
    };
  } catch (error) {
    return { status: "error", message: error.message };
  }
});

ipcMain.handle("download-update", async () => {
  if (!app.isPackaged) {
    return { ok: false, message: "Update download is available after publishing the app." };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true, message: "Update download started." };
  } catch (error) {
    return { ok: false, message: error.message };
  }
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});