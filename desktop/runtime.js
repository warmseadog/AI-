const fs = require("fs");
const path = require("path");

function appUrl(host, port) {
  return `http://${host}:${port}`;
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
  desktopDataPaths,
  startMvpServer,
};
