const path = require("path");
const { app, BrowserWindow, dialog, shell } = require("electron");
const { desktopDataPaths, startMvpServer } = require("./runtime");

let mainWindow = null;
let mvpRuntime = null;

function configureBundledBinary(envKey, baseName) {
  if (process.env[envKey]) return;
  const executable = process.platform === "win32" ? `${baseName}.exe` : baseName;
  const candidates = [
    path.join(process.resourcesPath || "", "bin", executable),
    path.join(__dirname, "..", "resources", "bin", executable),
  ];
  const binaryPath = candidates.find((candidate) => candidate && require("fs").existsSync(candidate));
  if (binaryPath) {
    process.env[envKey] = binaryPath;
  }
}

function configureBundledVideoTools() {
  configureBundledBinary("AI_VIDEO_FFMPEG_PATH", "ffmpeg");
}

function isAppUrl(url) {
  return Boolean(mvpRuntime && String(url || "").startsWith(mvpRuntime.url));
}

function protectNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

async function createMainWindow() {
  const paths = desktopDataPaths(app.getPath("userData"));
  configureBundledVideoTools();
  mvpRuntime = await startMvpServer({
    host: "127.0.0.1",
    port: 0,
    outputsRoot: paths.outputsRoot,
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    title: "AI 视频工作台",
    backgroundColor: "#f6f7fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  protectNavigation(mainWindow);
  await mainWindow.loadURL(mvpRuntime.url);
}

async function stopMvpServer() {
  if (!mvpRuntime) return;
  const current = mvpRuntime;
  mvpRuntime = null;
  try {
    await current.close();
  } catch {
    // The app is already quitting; a closed server should not block shutdown.
  }
}

app.setName("AI 视频工作台");

app.whenReady()
  .then(createMainWindow)
  .catch((error) => {
    dialog.showErrorBox("AI 视频工作台启动失败", error && error.message ? error.message : String(error));
    app.quit();
  });

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow().catch((error) => {
      dialog.showErrorBox("AI 视频工作台启动失败", error && error.message ? error.message : String(error));
    });
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  stopMvpServer();
});
