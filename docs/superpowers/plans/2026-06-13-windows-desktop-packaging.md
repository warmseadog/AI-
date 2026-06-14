# Windows Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the current AI 视频工作台 MVP as a Windows desktop installer that keeps the existing UI and makes the current local-service-backed features usable after installation.

**Architecture:** Add an Electron shell that starts the existing `mvp/server.js` server in-process on a loopback port, then loads the unchanged MVP UI from that local URL. Keep runtime outputs and logs in a user-writable desktop data directory while preserving the current repository `outputs/` behavior for normal local development.

**Tech Stack:** Node.js, Electron, electron-builder, existing vanilla HTML/CSS/JS MVP, existing `node mvp/verify-*.js` verification scripts.

---

### Task 1: Desktop Runtime Test Surface

**Files:**
- Create: `desktop/runtime.js`
- Create: `desktop/verify-runtime.js`
- Modify: `mvp/server.js`

- [ ] **Step 1: Write a failing runtime verification script**

Create `desktop/verify-runtime.js` with assertions that require `desktop/runtime.js`, compute writable output paths, and confirm the MVP server can serve `/api/health` with an injected output directory.

- [ ] **Step 2: Run the new verification script and confirm it fails**

Run: `node desktop/verify-runtime.js`

Expected: FAIL because `desktop/runtime.js` does not exist yet.

- [ ] **Step 3: Implement runtime helpers and server path injection**

Create `desktop/runtime.js` with helpers for app URL, user data subdirectories, and a stable preferred port. Modify `mvp/server.js` so `OUTPUTS_ROOT` can be overridden by `AI_VIDEO_OUTPUTS_ROOT` or `createServer({ outputsRoot })`.

- [ ] **Step 4: Run the verification script again**

Run: `node desktop/verify-runtime.js`

Expected: PASS and print `verify-runtime ok`.

### Task 2: Electron Shell

**Files:**
- Create: `desktop/main.js`
- Create: `desktop/preload.js`
- Modify: `package.json`

- [ ] **Step 1: Add the Electron entry and package scripts**

Add `desktop/main.js` that starts `createServer({ outputsRoot })`, opens `BrowserWindow` at the local URL, handles external links with `shell.openExternal`, and shuts down the server when the app quits.

- [ ] **Step 2: Add a minimal preload**

Add `desktop/preload.js` with a small desktop marker only. Do not expose broad Node APIs to the renderer.

- [ ] **Step 3: Add package scripts**

Create `package.json` with `desktop:dev`, `verify`, `build:win`, and `build:win:dir` scripts plus electron-builder configuration for NSIS and portable Windows targets.

### Task 3: Windows Packaging

**Files:**
- Modify: `package.json`
- Generated: `package-lock.json`
- Generated: `dist/`

- [ ] **Step 1: Install desktop packaging dependencies**

Run: `npm install --save-dev electron electron-builder`

Expected: dependencies install and `package-lock.json` is generated.

- [ ] **Step 2: Build the Windows package**

Run: `npm run build:win`

Expected: `dist/` contains Windows installer or portable artifacts.

### Task 4: User Manual

**Files:**
- Create: `docs/windows-desktop-user-manual.md`

- [ ] **Step 1: Write a concise Chinese manual**

Document installer location, first launch, API key setup, video workflow, local output path behavior, ffmpeg/frame extraction note, and troubleshooting for Windows security prompts and network/API errors.

### Task 5: Verification

**Files:**
- Read: `dist/`
- Read: `docs/windows-desktop-user-manual.md`

- [ ] **Step 1: Run all local verification scripts**

Run: `npm run verify`

Expected: all syntax checks and MVP verification scripts pass.

- [ ] **Step 2: Inspect package artifacts**

Run: `find dist -maxdepth 2 -type f -print`

Expected: Windows artifacts are visible and ready for transfer to a Windows machine.
