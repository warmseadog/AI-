const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");
const mainPath = path.join(root, "desktop", "main.js");
const preloadPath = path.join(root, "desktop", "preload.js");
const resourcesBinPath = path.join(root, "resources", "bin");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const pkg = readJson(packageJsonPath);

function linkedLibraries(filePath) {
  if (process.platform !== "darwin") return "";
  return childProcess.execFileSync("otool", ["-L", filePath], { encoding: "utf8" });
}

assert.strictEqual(pkg.main, "desktop/main.js", "Electron main entry points to desktop/main.js");
assert.ok(pkg.scripts.verify.includes("desktop/verify-runtime.js"), "verify script runs runtime checks");
assert.ok(pkg.scripts.verify.includes("desktop/verify-package.js"), "verify script runs package checks");
assert.ok(pkg.scripts["desktop:dev"].includes("electron"), "desktop dev script launches Electron");
assert.ok(pkg.scripts["build:win"].includes("--win"), "Windows build script targets Windows");
assert.ok(pkg.scripts["build:mac"], "Mac build script exists");
assert.ok(pkg.scripts["build:mac"].includes("--mac"), "Mac build script targets macOS");

assert.ok(fs.existsSync(mainPath), "desktop/main.js exists");
assert.ok(fs.existsSync(preloadPath), "desktop/preload.js exists");
assert.ok(fs.existsSync(path.join(resourcesBinPath, "ffmpeg.exe")), "Windows ffmpeg binary is bundled");
assert.ok(fs.existsSync(path.join(resourcesBinPath, "ffprobe.exe")), "Windows ffprobe binary is bundled");
assert.ok(fs.existsSync(path.join(resourcesBinPath, "ffprobe")), "Mac ffprobe binary is bundled");
assert.ok(fs.existsSync(path.join(resourcesBinPath, "ffmpeg")), "Mac ffmpeg binary is bundled");
if (process.platform === "darwin") {
  assert.ok(fs.existsSync(path.join(resourcesBinPath, "lib")), "Mac video tool dylibs are bundled");
  assert.ok(!linkedLibraries(path.join(resourcesBinPath, "ffprobe")).includes("/opt/homebrew"), "bundled ffprobe does not depend on Homebrew paths");
  assert.ok(!linkedLibraries(path.join(resourcesBinPath, "ffmpeg")).includes("/opt/homebrew"), "bundled ffmpeg does not depend on Homebrew paths");
}

const includedFiles = pkg.build.files;
assert.ok(includedFiles.includes("desktop/**/*"), "desktop files are packaged");
assert.ok(includedFiles.includes("mvp/**/*"), "MVP files are packaged");
assert.ok(includedFiles.includes("!mvp/local-config.js"), "local secret config is excluded");
assert.ok(includedFiles.includes("!outputs/**/*"), "generated outputs are excluded");
assert.deepStrictEqual(pkg.build.extraResources, [
  {
    from: "resources/bin",
    to: "bin",
    filter: ["**/*"],
  },
], "optional bundled binaries are copied into the Windows resources directory");
assert.ok(pkg.build.nsis.artifactName.includes("installer"), "NSIS installer artifact name is explicit");
assert.ok(pkg.build.portable.artifactName.includes("portable"), "portable artifact name is explicit");
assert.notStrictEqual(pkg.build.nsis.artifactName, pkg.build.portable.artifactName, "installer and portable artifacts use different names");

const mainSource = fs.readFileSync(mainPath, "utf8");
assert.ok(mainSource.includes("startMvpServer"), "Electron main starts the MVP server");
assert.ok(mainSource.includes("BrowserWindow"), "Electron main creates a desktop window");
assert.ok(mainSource.includes("desktopDataPaths"), "Electron main uses user-data desktop paths");
assert.ok(mainSource.includes("AI_VIDEO_FFMPEG_PATH"), "Electron main wires bundled ffmpeg path when present");
assert.ok(mainSource.includes("AI_VIDEO_FFPROBE_PATH"), "Electron main wires bundled ffprobe path when present");

const preloadSource = fs.readFileSync(preloadPath, "utf8");
assert.ok(preloadSource.includes("aiVideoWorkbench"), "preload exposes a narrow desktop marker");

console.log("verify-package ok");
