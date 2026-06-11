# Real Content Planning MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the MVP from demo/mock batch storyboard generation to a real test flow where the user enters one rough idea plus a product image and receives a complete content plan.

**Architecture:** Keep the existing static app plus local proxy server. Replace seeded demo data and local storyboard fallbacks with an empty initial state, a `content_plan` provider request, and explicit failure handling when real LLM output is unavailable.

**Tech Stack:** Vanilla JS, localStorage state, Node HTTP proxy, existing assertion-based verification scripts.

---

### Task 1: Lock Real-Flow Behavior With Tests

**Files:**
- Modify: `mvp/verify-core.js`
- Modify: `mvp/verify-server.js`

- [ ] Assert initial state has no seeded favorites, tasks, content text, image URL, or water-dispenser language.
- [ ] Assert content planning requires at least one image material and user idea text.
- [ ] Assert `buildContentPlanProviderRequest()` sends product materials, idea text, duration, ratio, platform, and structured output fields.
- [ ] Assert `applyContentPlanProviderResult()` creates a `content_plan_ready` task with scenes and review metadata from provider JSON.
- [ ] Assert no fallback storyboard is created when provider output is missing.
- [ ] Assert the server rejects non-http provider calls instead of returning mock success.

### Task 2: Rebuild Core State and Provider Model

**Files:**
- Modify: `mvp/core.js`

- [ ] Replace demo product/favorite/default brief with an empty product draft and empty `contentBrief`.
- [ ] Add `schemaVersion: 2` and migrate old demo states by dropping products/favorites/tasks/content while preserving integration profiles and API keys.
- [ ] Force integrations to `mode: "http"` and remove mock as a first-class mode.
- [ ] Add `buildContentPlanProviderRequest()`, `applyContentPlanProviderResult()`, and `createContentPlanTask()`.
- [ ] Keep video, copy, publish request builders compatible with the new content-plan-backed task shape.
- [ ] Remove water-dispenser fallback copy from local copy generation.

### Task 3: Simplify the New Task UI

**Files:**
- Modify: `mvp/app.js`
- Modify: `mvp/styles.css`

- [ ] Replace the create page with three inputs: rough idea, product image upload, product image URL.
- [ ] Replace batch/favorites controls with one `生成内容规划` action.
- [ ] Show a result panel for content plan summary, scenes, prompts, and compliance notes.
- [ ] Remove default favorites navigation from the primary flow and remove the reset demo action.
- [ ] Make provider failures visible and keep the user on the create page.

### Task 4: Remove Server Mock Responses From User Flow

**Files:**
- Modify: `mvp/server.js`
- Modify: `mvp/README.md`

- [ ] Make provider endpoints return a 400 error when `mode !== "http"`.
- [ ] Keep proxying real HTTP requests and static output serving.
- [ ] Update README to describe the real test path and localStorage reset note.

### Task 5: Verify and Inspect

**Commands:**
- `node mvp/verify-core.js`
- `node mvp/verify-server.js`
- `node --check mvp/app.js`
- `node --check mvp/core.js`
- `node --check mvp/server.js`

- [ ] Start the local server.
- [ ] Open `http://127.0.0.1:4188/#create` in the browser.
- [ ] Confirm the new page has no mock/favorites complexity and no water-dispenser text.
