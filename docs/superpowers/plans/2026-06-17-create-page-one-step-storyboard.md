# Create Page One-Step Storyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enter one content planning idea and generate the 6-scene storyboard with one primary action, while adding resolution request regression tests for `480p`, `720p`, and `1080p`.

**Architecture:** Keep the existing content plan task as the intermediate data model. Add a UI orchestration action that generates or reuses the current content plan, then immediately generates the storyboard from it. Keep resolution normalization in `mvp/core.js`; add matrix tests that verify request payloads instead of changing provider behavior.

**Tech Stack:** Vanilla JS MVP app in `mvp/app.js`, shared domain logic in `mvp/core.js`, Node verification scripts in `mvp/verify-app.js`, `mvp/verify-core.js`, and `mvp/verify-server.js`.

---

## File Structure

- Modify `mvp/app.js`: add one-step storyboard UI action, rename the input label, reduce the content-plan-only controls to secondary actions, and add seed freshness checks before storyboard generation.
- Modify `mvp/core.js`: persist a content plan seed snapshot on content plan tasks if the existing creation path does not already store one.
- Modify `mvp/verify-app.js`: update page assertions for the one-step button and label; keep checks for `480p`, `720p`, `1080p`, and default 6 scenes.
- Modify `mvp/verify-core.js`: add request payload matrix tests for ToAPIs and official Jimeng Seedance resolution values.
- Modify `mvp/verify-server.js`: update any fixture expectations if UI action names or labels are referenced.
- Modify `mvp/index.html`: update cache-busting query if browser assets need a refresh.

### Task 1: Add Failing App Tests For One-Step Storyboard UI

**Files:**
- Modify: `mvp/verify-app.js`
- Test: `mvp/verify-app.js`

- [ ] **Step 1: Update the create-page assertions**

Add assertions that require the new user-facing flow:

```js
assert.ok(appHtml.includes("内容规划想法"), "create page labels the input as content planning idea");
assert.ok(appHtml.includes('data-action="generate-storyboard-script"'), "create page exposes one-step storyboard generation");
assert.ok(appHtml.includes("生成分镜脚本"), "create page labels the one-step storyboard button");
assert.ok(!appHtml.includes("用当前规划生成分镜"), "create page removes the old manual storyboard-from-plan wording");
```

Keep the existing assertions for:

```js
assert.ok(appHtml.includes('<option value="480p"'), "create page video resolution includes 480p");
assert.ok(appHtml.includes('<option value="720p" selected'), "create page defaults video resolution to 720p");
assert.ok(appHtml.includes('<option value="1080p"'), "create page video resolution includes 1080p");
assert.ok(appHtml.includes('<option value="6"'), "create page storyboard preset includes 6 scenes");
```

- [ ] **Step 2: Run the app verification and confirm failure**

Run:

```bash
node mvp/verify-app.js
```

Expected: FAIL because `mvp/app.js` still renders the old label/action.

### Task 2: Implement One-Step Create Page Action

**Files:**
- Modify: `mvp/app.js`
- Test: `mvp/verify-app.js`

- [ ] **Step 1: Add seed freshness helpers**

Add helpers near `latestContentPlanTask()`:

```js
function contentPlanSeedSnapshot(task) {
  return String(task && (task.contentBrief?.seed || task.contentPlanSeed || task.seed || "") || "").trim();
}

function currentContentPlanSeed() {
  return String(state.contentBrief?.seed || "").trim();
}

function hasFreshContentPlan(task) {
  return Boolean(task && task.contentPlan && contentPlanSeedSnapshot(task) === currentContentPlanSeed());
}
```

- [ ] **Step 2: Rename the input label and primary action**

In `renderCreate()`, change the textarea label from:

```html
<label>产品想法</label>
```

to:

```html
<label>内容规划想法</label>
```

Replace the storyboard action button with:

```js
<button class="button" data-action="generate-storyboard-script" ${pendingAttr("generate-storyboard-script")}>${pendingLabel("generate-storyboard-script", "生成分镜脚本", "生成分镜中")}</button>
```

Keep `renderStoryboardPresetSelect(contentBrief)`, `renderVideoBatchControls(contentBrief)`, and the “进入审核生成视频” button unchanged.

- [ ] **Step 3: Add the orchestration function**

Add below `generateStoryboardFromPlanWithUi()`:

```js
async function generateStoryboardScriptWithUi(action) {
  syncDraftForm();
  let task = latestContentPlanTask();
  if (!hasFreshContentPlan(task)) {
    await generateContentPlanWithUi(action, { silentSuccessToast: true });
    task = latestContentPlanTask();
  }
  if (!task || !task.contentPlan) {
    toast("请先输入内容规划想法，并确保内容规划生成成功。");
    return;
  }
  await generateStoryboardFromPlanWithUi(action, { skipStartPending: true });
}
```

Adjust `generateContentPlanWithUi` and `generateStoryboardFromPlanWithUi` to accept the options used here:

```js
async function generateContentPlanWithUi(action, options = {}) {
  ...
  if (!options.silentSuccessToast) {
    toast(options.keepPrevious ? "内容规划已重新生成，可恢复上一版。" : "内容规划已生成，可以继续生成分镜。");
  }
  ...
}

async function generateStoryboardFromPlanWithUi(action, options = {}) {
  ...
  if (!options.skipStartPending && !startPending(action)) return;
  ...
  if (!options.skipStartPending) finishPending(action, { render: false });
  ...
}
```

When `skipStartPending` is true, the outer one-step action owns the pending state.

- [ ] **Step 4: Wire the new action handler**

In the central action handler, replace:

```js
if (action === "generate-storyboard-from-plan") {
  await generateStoryboardFromPlanWithUi(action);
  return;
}
```

with:

```js
if (action === "generate-storyboard-script") {
  await generateStoryboardScriptWithUi(action);
  return;
}
```

The old function can remain for secondary/internal use.

- [ ] **Step 5: Run the app verification**

Run:

```bash
node mvp/verify-app.js
```

Expected: PASS.

### Task 3: Persist Content Plan Seed Snapshot

**Files:**
- Modify: `mvp/core.js`
- Test: `mvp/verify-core.js`

- [ ] **Step 1: Add or confirm seed snapshot in content plan task creation**

In the content plan task creation path, ensure the task stores the current idea:

```js
contentPlanSeed: String(state.contentBrief && state.contentBrief.seed || "").trim(),
contentBrief: Object.assign({}, state.contentBrief || {}, {
  seed: String(state.contentBrief && state.contentBrief.seed || "").trim(),
  videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
}),
```

- [ ] **Step 2: Add core assertion for the seed snapshot**

In `mvp/verify-core.js`, after creating a content plan task, add:

```js
assert.strictEqual(imageGroupTask.contentPlanSeed, imageGroupState.contentBrief.seed, "content plan task records the idea seed used for generation");
assert.strictEqual(imageGroupTask.contentBrief.seed, imageGroupState.contentBrief.seed, "content plan task content brief keeps the idea seed snapshot");
```

- [ ] **Step 3: Run core verification**

Run:

```bash
node mvp/verify-core.js
```

Expected: PASS after implementation.

### Task 4: Add Resolution Request Matrix Tests

**Files:**
- Modify: `mvp/verify-core.js`
- Test: `mvp/verify-core.js`

- [ ] **Step 1: Add ToAPIs matrix assertions**

Create a helper in `mvp/verify-core.js`:

```js
function buildVideoResolutionRequest(apiStyle, resolution) {
  const resolutionState = Core.createInitialState();
  resolutionState.integrations.video.apiStyle = apiStyle;
  resolutionState.integrations.video.mode = "http";
  resolutionState.integrations.video.apiKey = "video-key";
  resolutionState.integrations.video.endpoint = "https://example.test/video";
  resolutionState.integrations.video.statusEndpoint = "https://example.test/video/{task_id}";
  resolutionState.integrations.video.model = apiStyle === "jimeng-seedance-official"
    ? "doubao-seedance-2-0-260128"
    : "vidu/q3";
  resolutionState.contentBrief.videoResolution = resolution;
  const product = resolutionState.products[0];
  product.imageUrl = "https://example.test/product.png";
  const task = {
    id: `task_${resolution}`,
    duration: 15,
    ratio: "9:16",
    videoResolution: resolution,
    storyboard: [
      { time: "0:00-0:03", title: "Hook", visual: "Show product", subtitle: "Cool down fast" },
    ],
    contentBrief: { videoResolution: resolution },
  };
  return Core.buildVideoProviderRequest(resolutionState, task, product);
}
```

Assert ToAPIs values:

```js
["480p", "720p", "1080p"].forEach((resolution) => {
  const request = buildVideoResolutionRequest("toapis-video", resolution);
  assert.strictEqual(request.body.resolution, resolution, `ToAPIs video request keeps ${resolution} lowercase`);
});
```

- [ ] **Step 2: Add official Jimeng matrix assertions**

Add:

```js
["480p", "720p", "1080p"].forEach((resolution) => {
  const request = buildVideoResolutionRequest("jimeng-seedance-official", resolution);
  assert.strictEqual(request.body.parameters.resolution, resolution, `official Jimeng request keeps ${resolution} lowercase`);
});
```

- [ ] **Step 3: Add uppercase and invalid fallback assertions**

Add:

```js
assert.strictEqual(buildVideoResolutionRequest("toapis-video", "480P").body.resolution, "480p", "ToAPIs normalizes uppercase 480P");
assert.strictEqual(buildVideoResolutionRequest("jimeng-seedance-official", "bad-value").body.parameters.resolution, "720p", "official Jimeng falls back invalid resolution to 720p");
```

- [ ] **Step 4: Run core verification**

Run:

```bash
node mvp/verify-core.js
```

Expected: PASS.

### Task 5: Full Verification And Cache Bust

**Files:**
- Modify: `mvp/index.html`
- Test: all verification scripts

- [ ] **Step 1: Update the JS cache-busting query if `mvp/index.html` references app assets**

Set the app query suffix to a new value such as:

```html
?v=20260617-one-step-storyboard
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS. If local port binding fails with `EPERM`, rerun with the approved elevated command path for this project.

- [ ] **Step 3: Report final result**

Report changed files, tests run, and whether the local app needs a restart for the browser to pick up changed static assets.
