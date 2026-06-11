# Create Page Vertical Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before production edits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the create page into a vertical workflow with a compact product image module, one large editable Chinese content plan box, regenerate controls, and in-page streaming output.

**Architecture:** Keep the existing static app and local Node proxy. Use `mvp/app.js` for page structure and client streaming state, `mvp/styles.css` for layout, `mvp/core.js` only for small content-plan text compatibility, and `mvp/server.js` for a streaming provider proxy that falls back cleanly when the browser or upstream does not stream.

**Tech Stack:** Vanilla JS, localStorage state, Node HTTP server, existing assertion-based verification scripts.

---

### Task 1: Lock UI Contract

**Files:**
- Modify: `mvp/verify-app.js`

- [ ] Add assertions that the create page uses a vertical layout marker.
- [ ] Add assertions that product image upload uses the compact module.
- [ ] Add assertions that content plan editing is one large textarea instead of many field textareas.
- [ ] Add assertions for `重新生成`, `恢复上一版`, and streaming output markers.
- [ ] Run `node mvp/verify-app.js` and confirm the new assertions fail before implementation.

### Task 2: Implement Create Page UX

**Files:**
- Modify: `mvp/app.js`
- Modify: `mvp/styles.css`

- [ ] Replace the create-page two-column layout with a vertical workflow.
- [ ] Keep product idea, image URL/upload, and storyboard settings.
- [ ] Replace field-by-field content plan editor with one Chinese Markdown textarea.
- [ ] Add regenerate and restore-previous actions.
- [ ] Add in-page streaming status and output area.

### Task 3: Add Minimal Streaming Path

**Files:**
- Modify: `mvp/app.js`
- Modify: `mvp/server.js`

- [ ] Add client-side `callProviderStream()` for content planning.
- [ ] Add `/api/provider/content-plan-stream` in the local server.
- [ ] Stream upstream chunks when possible and return normal JSON when not possible.
- [ ] Keep the existing non-streaming `callProvider("content-plan")` as fallback.

### Task 4: Verify

**Commands:**
- `node mvp/verify-app.js`
- `node mvp/verify-core.js`
- `node mvp/verify-server.js`
- `node --check mvp/app.js`
- `node --check mvp/core.js`
- `node --check mvp/server.js`
