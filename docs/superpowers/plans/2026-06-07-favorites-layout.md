# Favorites Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the create/review page layout and add source-aware favorite heart actions.

**Architecture:** Keep the MVP in the existing `mvp/app.js`, `mvp/core.js`, and `mvp/styles.css` files. Use optional `favorite.sourceKey` metadata so section-derived favorites can be recognized without changing existing manual favorites.

**Tech Stack:** Vanilla HTML/CSS/JS, Node-based verification scripts.

---

### Task 1: Tests First

**Files:**
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/verify-app.js`
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/verify-core.js`

- [ ] Add app assertions for `我的收藏`, compact favorite block, and `data-action="save-section-favorite"`.
- [ ] Add core assertion that `Core.addFavorite(..., { sourceKey })` stores `sourceKey`.
- [ ] Run `node mvp/verify-app.js` and `node mvp/verify-core.js`; expected: fail before implementation.

### Task 2: Favorite Metadata and Actions

**Files:**
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/core.js`
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/app.js`

- [ ] Preserve optional `sourceKey` in `Core.addFavorite`.
- [ ] Add app helpers to build favorite candidates for content brief, storyboard, and video.
- [ ] Add `save-section-favorite` handling that saves once, marks the source selected, and shows a toast.

### Task 3: Layout and Styling

**Files:**
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/app.js`
- Modify: `/Users/wy/Documents/ai自动化视频/mvp/styles.css`

- [ ] Rename all visible `收藏库` labels to `我的收藏`.
- [ ] Replace the create-page left process rail with a compact horizontal step strip.
- [ ] Replace the large favorite picker with a compact favorite summary.
- [ ] Add heart buttons beside content planning, video preview, and storyboard panels.
- [ ] Update responsive CSS so the two-column create page collapses cleanly.

### Task 4: Verify

**Files:**
- Run: `/Users/wy/Documents/ai自动化视频/mvp/verify-app.js`
- Run: `/Users/wy/Documents/ai自动化视频/mvp/verify-core.js`
- Run: `/Users/wy/Documents/ai自动化视频/mvp/verify-server.js`

- [ ] Run all verification scripts.
- [ ] Open the local page and visually check `#create` at the current dev server URL.
