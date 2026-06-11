# Reverse Video Storyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-version `反推` module that uploads one video, extracts frames, asks the LLM for a storyboard, saves it to favorites, and reuses it for secondary tasks.

**Architecture:** Keep the current vanilla MVP structure. `mvp/core.js` owns state and pure transformations, `mvp/server.js` owns local upload/frame extraction/proxy endpoints, and `mvp/app.js` owns the new navigation screen and actions.

**Tech Stack:** Vanilla JavaScript, localStorage, Node HTTP server, optional local `ffmpeg`, existing assertion-based verification scripts.

---

### Task 1: Core Reverse Storyboard Model

**Files:**
- Modify: `mvp/verify-core.js`
- Modify: `mvp/core.js`

- [ ] Add failing assertions for `reverseVideo` initial state.
- [ ] Add failing assertions for reverse provider request shape.
- [ ] Add failing assertions for provider result normalization.
- [ ] Add failing assertions for save-to-favorite duplicate protection.
- [ ] Add failing assertions for creating secondary tasks from reverse favorites.
- [ ] Implement core functions and exports.
- [ ] Run `node mvp/verify-core.js`.

### Task 2: Server Upload, Frame Extraction, And Reverse Proxy

**Files:**
- Modify: `mvp/verify-server.js`
- Modify: `mvp/server.js`

- [ ] Add failing assertions for video upload endpoint.
- [ ] Add failing assertions for non-video upload rejection.
- [ ] Add failing assertions for missing-ffmpeg frame extraction error or extracted frame output.
- [ ] Add failing assertions for `/api/provider/reverse-storyboard`.
- [ ] Implement upload body parsing, file persistence, frame extraction, and provider route.
- [ ] Run `node mvp/verify-server.js`.

### Task 3: Frontend Reverse Module

**Files:**
- Modify: `mvp/verify-app.js`
- Modify: `mvp/app.js`
- Modify: `mvp/styles.css`

- [ ] Add failing assertions for `#reverse` route and left-nav entry.
- [ ] Add failing assertions for upload, notes, reverse, save, reuse, and editable storyboard controls.
- [ ] Implement reverse screen rendering and events.
- [ ] Implement upload, extract, reverse, edit, save favorite, and reuse actions.
- [ ] Run `node mvp/verify-app.js`.

### Task 4: Final Verification

**Files:**
- Check: `mvp/app.js`
- Check: `mvp/core.js`
- Check: `mvp/server.js`

- [ ] Run `node --check mvp/app.js`.
- [ ] Run `node --check mvp/core.js`.
- [ ] Run `node --check mvp/server.js`.
- [ ] Run `node mvp/verify-core.js`.
- [ ] Run `node mvp/verify-server.js`.
- [ ] Run `node mvp/verify-app.js`.
