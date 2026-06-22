const fs = require("fs");
const path = require("path");

function appUrl(host, port) {
  return `http://${host}:${port}`;
}

const bundledImageHostDefaults = {
  IMAGE_HOST_PROVIDER: "imgbb",
  IMGBB_API_KEY: "c8c18845368a2c2a25e2ca56452b0858",
  IMGBB_UPLOAD_ENDPOINT: "https://api.imgbb.com/1/upload",
};

function applyBundledImageHostDefaults() {
  Object.entries(bundledImageHostDefaults).forEach(([key, value]) => {
    if (!process.env[key]) process.env[key] = value;
  });
}

function desktopDataPaths(userDataRoot) {
  return {
    userDataRoot,
    outputsRoot: path.join(userDataRoot, "outputs"),
    logsRoot: path.join(userDataRoot, "logs"),
  };
}

function loadMvpServer(outputsRoot) {
  const serverPath = path.join(__dirname, "..", "mvp", "server.js");
  process.env.AI_VIDEO_OUTPUTS_ROOT = outputsRoot;
  applyBundledImageHostDefaults();
  delete require.cache[require.resolve(serverPath)];
  return require(serverPath);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function startMvpServer(options = {}) {
  const host = options.host || "127.0.0.1";
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 0;
  const outputsRoot = path.resolve(options.outputsRoot || path.join(__dirname, "..", "outputs"));
  fs.mkdirSync(outputsRoot, { recursive: true });

  const { createServer } = loadMvpServer(outputsRoot);
  const server = createServer();
  await listen(server, port, host);
  const address = server.address();
  const assignedPort = typeof address === "object" && address ? address.port : port;

  return {
    host,
    port: assignedPort,
    outputsRoot,
    url: appUrl(host, assignedPort),
    server,
    close: () => close(server),
  };
}

module.exports = {
  appUrl,
  applyBundledImageHostDefaults,
  desktopDataPaths,
  startMvpServer,
};
