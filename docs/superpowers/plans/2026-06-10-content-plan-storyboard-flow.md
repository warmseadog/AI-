# Content Plan Storyboard Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the create page compact, editable, and able to generate a more detailed storyboard from the user's confirmed content plan.

**Architecture:** Keep the MVP's existing static app shape. UI and event wiring stay in `mvp/app.js`, presentation stays in `mvp/styles.css`, and request/state behavior stays in `mvp/core.js`. Existing `data-action`, `data-field`, and task state patterns remain stable.

**Tech Stack:** Plain JavaScript, static HTML rendering, Node `assert` verification scripts.

---

### Task 1: Pin UI Contract

**Files:**
- Modify: `mvp/verify-app.js`

- [ ] Add failing assertions for:
  - compact product image module marker: `product-image-compact`
  - content plan editor marker: `content-plan-editor`
  - editable content plan fields: `data-content-plan-field`
  - storyboard settings controls: `data-field="contentBrief.storyboardSceneCount"` and `data-field="contentBrief.storyboardDetailLevel"`
  - action: `data-action="generate-storyboard-from-plan"`

- [ ] Run `node mvp/verify-app.js`; expected failure before implementation.

### Task 2: Pin Core Behavior

**Files:**
- Modify: `mvp/verify-core.js`

- [ ] Add failing assertions that:
  - initial state includes storyboard defaults under `contentBrief`
  - content-plan provider request asks for detailed fields such as `painPoints`, `mustShow`, and `storyboardGuidance`
  - storyboard provider request includes the edited task `contentPlan`
  - storyboard provider request carries target scene count, defaulting to 8 for 15 seconds

- [ ] Run `node mvp/verify-core.js`; expected failure before implementation.

### Task 3: Implement Core Request + State Behavior

**Files:**
- Modify: `mvp/core.js`

- [ ] Extend `createInitialState().contentBrief` with:
  - `storyboardSceneCount: "auto"`
  - `storyboardDetailLevel: "detailed"`

- [ ] Extend content-plan schema and output fields with:
  - `painPoints`
  - `contentAngle`
  - `hookOptions`
  - `coreMessage`
  - `visualStyle`
  - `rhythm`
  - `mustShow`
  - `mustAvoid`
  - `cta`
  - `storyboardGuidance`

- [ ] Add helpers for storyboard settings:
  - auto scene count: 15s -> 8, 10s -> 6, 6s -> 4
  - detail level labels: standard, detailed, dense

- [ ] Add `buildStoryboardFromContentPlanProviderRequest(state, task, options = {})` that reads `task.contentPlan`, includes edited plan fields, and requests the selected scene count.

- [ ] Export the new helper.

- [ ] Run `node mvp/verify-core.js`; expected pass for core behavior.

### Task 4: Implement Create Page UI

**Files:**
- Modify: `mvp/app.js`
- Modify: `mvp/styles.css`

- [ ] Replace the large product image block with a compact module.

- [ ] Render a content plan editor when the selected task has `status === "content_plan_ready"` and `contentPlan`.

- [ ] Render fields for the expanded plan:
  - product understanding
  - target audience
  - pain points
  - usage scenarios
  - key selling points
  - content angle
  - strategy
  - hook
  - rhythm
  - must show
  - must avoid
  - CTA
  - storyboard guidance

- [ ] Add controls for storyboard scene count and detail level.

- [ ] Wire `data-content-plan-field` inputs to mutate `task.contentPlan`.

- [ ] Add `generate-storyboard-from-plan` action that calls the new core request and applies provider result through the existing storyboard result path.

- [ ] Run `node mvp/verify-app.js`; expected pass for UI contract.

### Task 5: Full Verification

**Files:**
- Verify: `mvp/verify-core.js`
- Verify: `mvp/verify-app.js`
- Verify: `mvp/verify-server.js` if localhost bind is available

- [ ] Run:
  - `node mvp/verify-core.js`
  - `node mvp/verify-app.js`
  - `node mvp/verify-server.js`

- [ ] If server verification is blocked by sandbox bind permissions, record the exact error and use the two static verification scripts as the completed proof.
