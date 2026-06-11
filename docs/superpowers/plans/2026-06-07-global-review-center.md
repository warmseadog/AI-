# Global Review Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current single-task review route into a global review center while keeping the selected task detail available on the same screen.

**Architecture:** Keep the existing local-state MVP structure. `mvp/app.js` will derive review queues from `state.tasks`, render a global list and summary, and reuse the current selected-task detail markup inside the right detail column. `mvp/styles.css` will add dense workbench layout styles without introducing new dependencies.

**Tech Stack:** Plain JavaScript, static HTML rendering, CSS, existing Node verification scripts.

---

### Task 1: Lock Review Center Behavior With Tests

**Files:**
- Modify: `mvp/verify-app.js`

- [ ] Add assertions that `#review` renders global review center copy, queue filters, and a task queue before the selected task detail.
- [ ] Run `node mvp/verify-app.js` and verify it fails because the current `renderReview()` only renders single-task detail.

### Task 2: Render Global Review Center

**Files:**
- Modify: `mvp/app.js`

- [ ] Add small helpers for review queue status grouping.
- [ ] Replace `renderReview()` with a review-center layout.
- [ ] Keep the existing video preview, storyboard, and action buttons for the selected task.
- [ ] Ensure task queue clicks update `state.selectedTaskId` through existing `data-select-task` and `data-view` handling.

### Task 3: Style Review Center

**Files:**
- Modify: `mvp/styles.css`

- [ ] Add responsive styles for review stats, queue list, and detail columns.
- [ ] Preserve existing `review-layout`, `review-main`, and `review-side` behavior where possible.
- [ ] Verify mobile layout stacks cleanly.

### Task 4: Verify

**Files:**
- Run: `node --check mvp/app.js`
- Run: `node --check mvp/core.js`
- Run: `node mvp/verify-app.js`
- Run: `node mvp/verify-core.js`
- Run: `node mvp/verify-server.js`

- [ ] Fix any failures caused by the review-center change.
