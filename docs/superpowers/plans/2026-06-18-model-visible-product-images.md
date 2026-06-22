# Model Visible Product Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make uploaded product images become model-visible HTTPS URLs before sending video requests to official Jimeng/Seedance.

**Architecture:** Keep the current MVP structure. `mvp/server.js` owns image upload and optional public URL derivation, `mvp/app.js` saves hosted image metadata into the product image list, and `mvp/core.js` uses hosted `publicUrl` values when building `image_urls` or Jimeng `image_url` content.

**Tech Stack:** Node.js built-in HTTP server, vanilla browser JS, existing `mvp/verify-core.js`, `mvp/verify-app.js`, and `mvp/verify-server.js`.

---

### Task 1: Hosted Product Image Data Path

**Files:**
- Modify: `mvp/core.js`
- Test: `mvp/verify-core.js`

- [ ] Add failing assertions that a product image with `publicUrl` is normalized as a hosted model-visible image.
- [ ] Add failing assertions that official Jimeng/Seedance request content includes that `publicUrl`.
- [ ] Implement minimal `publicUrl` normalization and material URL selection.
- [ ] Run `node mvp/verify-core.js`.

### Task 2: Upload Endpoint Returns Public URL

**Files:**
- Modify: `mvp/server.js`
- Test: `mvp/verify-server.js`

- [ ] Add failing assertions that `/api/uploads/image` returns `publicUrl` when a public base URL is configured.
- [ ] Implement `assetPublicBaseUrl` support with a local-development fallback left disabled by default.
- [ ] Run `node mvp/verify-server.js`.

### Task 3: Frontend Saves Hosted Image Metadata

**Files:**
- Modify: `mvp/app.js`
- Test: `mvp/verify-app.js`

- [ ] Add failing assertions that app code preserves `upload.publicUrl`.
- [ ] Store `publicUrl` and `modelVisible` when adding uploaded product images.
- [ ] Run `node mvp/verify-app.js`.

### Task 4: Final Verification

- [ ] Run `node --check mvp/app.js`.
- [ ] Run `node --check mvp/core.js`.
- [ ] Run `node --check mvp/server.js`.
- [ ] Run `node mvp/verify-core.js`.
- [ ] Run `node mvp/verify-app.js`.
- [ ] Run `node mvp/verify-server.js`.
