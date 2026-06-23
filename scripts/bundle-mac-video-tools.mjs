import childProcess from "child_process";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const binDir = path.join(root, "resources", "bin");
const libDir = path.join(binDir, "lib");
const tools = ["ffmpeg"];
const systemPrefixes = ["/System/", "/usr/lib/"];

function execFile(command, args) {
  return childProcess.execFileSync(command, args, { encoding: "utf8" });
}

function commandPath(command) {
  return execFile("which", [command]).trim();
}

function linkedLibraries(filePath) {
  return execFile("otool", ["-L", filePath])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

function shouldBundleLibrary(filePath) {
  if (!path.isAbsolute(filePath)) return false;
  return !systemPrefixes.some((prefix) => filePath.startsWith(prefix));
}

function changeDependency(filePath, fromPath, toPath) {
  childProcess.execFileSync("install_name_tool", ["-change", fromPath, toPath, filePath]);
}

function changeLibraryId(filePath, id) {
  childProcess.execFileSync("install_name_tool", ["-id", id, filePath]);
}

function signAdHoc(filePath) {
  childProcess.execFileSync("codesign", ["--force", "--sign", "-", filePath]);
}

function copyExecutable(command) {
  const source = commandPath(command);
  const target = path.join(binDir, command);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, 0o755);
  return target;
}

function copyLibrary(source) {
  const target = path.join(libDir, path.basename(source));
  if (!fs.existsSync(target)) {
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o755);
  }
  return target;
}

if (process.platform !== "darwin") {
  console.log("prepare-mac-video-tools skipped: not macOS");
  process.exit(0);
}

fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(libDir, { recursive: true });

const installTargets = tools.map(copyExecutable);
const queue = [];
const knownLibraries = new Map();

for (const target of installTargets) {
  for (const dependency of linkedLibraries(target).filter(shouldBundleLibrary)) {
    const copied = copyLibrary(dependency);
    knownLibraries.set(dependency, copied);
    queue.push(copied);
    changeDependency(target, dependency, `@loader_path/lib/${path.basename(dependency)}`);
  }
}

for (let index = 0; index < queue.length; index += 1) {
  const library = queue[index];
  changeLibraryId(library, `@loader_path/${path.basename(library)}`);
  for (const dependency of linkedLibraries(library).filter(shouldBundleLibrary)) {
    let copied = knownLibraries.get(dependency);
    if (!copied) {
      copied = copyLibrary(dependency);
      knownLibraries.set(dependency, copied);
      queue.push(copied);
    }
    changeDependency(library, dependency, `@loader_path/${path.basename(dependency)}`);
  }
}

for (const library of queue) {
  signAdHoc(library);
}
for (const target of installTargets) {
  signAdHoc(target);
}

console.log(`prepare-mac-video-tools ok: ${installTargets.length} tools, ${knownLibraries.size} libraries`);
