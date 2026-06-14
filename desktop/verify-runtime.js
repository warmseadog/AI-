const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  appUrl,
  desktopDataPaths,
  startMvpServer,
} = require("./runtime");

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-video-desktop-"));
  const paths = desktopDataPaths(tempRoot);

  assert.strictEqual(paths.userDataRoot, tempRoot, "user data root is preserved");
  assert.strictEqual(paths.outputsRoot, path.join(tempRoot, "outputs"), "outputs live under user data");
  assert.strictEqual(paths.logsRoot, path.join(tempRoot, "logs"), "logs live under user data");

  const app = await startMvpServer({
    host: "127.0.0.1",
    port: 0,
    outputsRoot: paths.outputsRoot,
  });

  try {
    assert.ok(app.port > 0, "dynamic port is assigned");
    assert.strictEqual(app.url, appUrl("127.0.0.1", app.port), "runtime returns the local app URL");
    assert.ok(fs.existsSync(paths.outputsRoot), "outputs directory is created before serving");

    const response = await fetch(`${app.url}/api/health`);
    assert.strictEqual(response.status, 200, "health endpoint is reachable");
    const data = await response.json();
    assert.strictEqual(data.ok, true, "health endpoint reports ok");
    assert.strictEqual(data.service, "ai-video-workbench-mvp", "health endpoint identifies the MVP service");
  } finally {
    await app.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log("verify-runtime ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
