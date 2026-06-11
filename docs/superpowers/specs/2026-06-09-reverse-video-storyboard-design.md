# Reverse Video Storyboard Design

## Decision

Build a first-version left-side module named `反推` for uploading one video, extracting a reusable storyboard script from it, saving that script to `我的收藏`, and using the saved script for secondary batch creation.

The feature should reuse the current MVP boundaries:

- `mvp/app.js` owns navigation, screens, form events, upload actions, and user-facing rendering.
- `mvp/core.js` owns durable local state, provider request builders, provider result normalization, favorite creation, and task creation.
- `mvp/server.js` owns local file upload, static file serving, provider proxying, and server-side video frame extraction.
- Existing favorites stay the main reuse surface. Reverse-engineered scripts should become normal `分镜脚本` favorites instead of a separate asset type.

## Scope

First version includes:

- Add a left navigation item: `反推`.
- Add a `#reverse` screen for one uploaded reference video.
- Save uploaded videos under `outputs/uploads/`.
- Store only upload metadata and URLs in browser state, not raw video bytes.
- Extract key frames from the uploaded video on the local server.
- Send a structured reverse-storyboard request to the configured LLM.
- Render the returned storyboard in an editable review surface.
- Save the accepted reverse storyboard into `我的收藏`.
- Use the saved favorite to create one or more new video tasks for secondary creation.

First version excludes:

- Multi-video batch reverse engineering.
- Automatic viral score or competitor clustering.
- Audio transcription as a hard dependency.
- Direct publishing from the reverse screen.
- Cloud storage or account-level asset management.

## User Flow

1. User opens the left-side `反推` module.
2. User uploads a reference video.
3. App shows a local video preview, filename, duration if available, file size, and extraction status.
4. User clicks `反推分镜`.
5. Server extracts key frames and returns frame URLs plus metadata.
6. App sends a reverse-storyboard provider request through `/api/provider/reverse-storyboard`.
7. LLM returns a normalized storyboard script.
8. App renders the storyboard for review and editing.
9. User clicks `保存到我的收藏`.
10. App creates a `分镜脚本` favorite with source metadata.
11. User clicks `用这个脚本二创`.
12. App creates new generation tasks that reuse the favorite and continue through the existing review, video generation, copy, and publish flow.

## Navigation And Layout

The current nav list should become:

- `视频`
- `新建`
- `反推`
- `审核`
- `发布`
- `设置`

The `反推` screen layout:

- Top section: title `视频反推分镜`, short status text, actions for `反推分镜` and `保存到我的收藏`.
- Left column: upload drop zone and video preview.
- Right column: extraction summary, LLM status, and reuse actions.
- Full-width lower panel: editable storyboard result.

The design should stay workbench-like and dense. It should not become a landing page or marketing page.

## Data Model

Add `reverseVideo` to state:

```js
reverseVideo: {
  upload: null,
  frames: [],
  result: null,
  selectedFavoriteId: "",
  notes: "",
  status: "idle",
  error: "",
}
```

`upload` shape:

```js
{
  id: "upload_xxx",
  fileName: "reference.mp4",
  url: "/outputs/uploads/upload_xxx/reference.mp4",
  mimeType: "video/mp4",
  size: 12345678,
  uploadedAt: "2026-06-09T00:00:00.000Z"
}
```

`frames` shape:

```js
[
  {
    time: "0.0s",
    url: "/outputs/uploads/upload_xxx/frames/frame-001.jpg",
    label: "frame-001"
  }
]
```

`result` shape:

```js
{
  title: "反推分镜 · reference.mp4",
  summary: "",
  hook: "",
  duration: 15,
  ratio: "9:16",
  scenes: [
    {
      time: "0-3s",
      title: "",
      visual: "",
      subtitle: "",
      camera: "",
      motion: "",
      voiceover: "",
      screenText: "",
      imagePrompt: "",
      videoPrompt: "",
      productFocus: "",
      reviewChecklist: [],
      riskNotes: []
    }
  ]
}
```

Favorite created from reverse result:

```js
{
  type: "分镜脚本",
  name: "反推分镜 · reference.mp4",
  content: "<storyboard text>",
  tags: ["反推分镜", "视频拆解"],
  score: 80,
  sourceKey: "reverse-video:upload_xxx"
}
```

## Core Responsibilities

`mvp/core.js` should add:

- `normalizeReverseStoryboard(source)` to accept common LLM response variants and return the `result` shape.
- `buildReverseStoryboardProviderRequest(state)` to build the LLM request from upload metadata, frame URLs, user notes, and target output schema.
- `applyReverseStoryboardProviderResult(state, request, response)` to store normalized result and provider request/response metadata.
- `reverseStoryboardText(result)` to serialize scenes into favorite content.
- `saveReverseStoryboardFavorite(state)` to create or reuse a favorite with `sourceKey`.
- `createTasksFromReverseFavorite(state, options)` to create secondary generation tasks from the selected reverse favorite.

Do not duplicate an existing favorite if `sourceKey` already exists. In that case, select the existing favorite.

## Server Responsibilities

`mvp/server.js` should add:

- `POST /api/uploads/video`
  - Accept one video upload.
  - Save it under `outputs/uploads/<uploadId>/`.
  - Return upload metadata and a browser-usable URL.

- `POST /api/video/frames`
  - Input: `{ uploadId, url, count }`.
  - Extract approximately `count` frames, default `8`.
  - Save frames under `outputs/uploads/<uploadId>/frames/`.
  - Return frame metadata.

- `POST /api/provider/reverse-storyboard`
  - Reuse the existing provider proxy pattern.
  - Require `mode: "http"`.
  - Log redacted provider events like existing provider calls.

Frame extraction should prefer `ffmpeg` if available. If unavailable, the server should return a clear error: `未检测到 ffmpeg，无法从视频抽帧。请先安装 ffmpeg 或改用手动上传关键帧版本。`

## Provider Request

The reverse-storyboard prompt should ask the LLM to infer structure, not to claim exact certainty.

Required output:

- `title`
- `summary`
- `hook`
- `duration`
- `ratio`
- `scenes`

Each scene should include:

- `time`
- `title`
- `visual`
- `subtitle`
- `camera`
- `motion`
- `voiceover`
- `screenText`
- `imagePrompt`
- `videoPrompt`
- `productFocus`
- `reviewChecklist`
- `riskNotes`

The user content should include:

- upload metadata
- ordered frame URLs
- optional user notes
- target use case: `反推优秀视频结构，用于后续替换产品和批量二创`
- current selected platform and market if present

## Editing

The first version can reuse the existing storyboard field model but does not need to reuse the current modal implementation exactly.

Minimum editable fields:

- `time`
- `title`
- `visual`
- `subtitle`
- `camera`
- `motion`
- `voiceover`
- `screenText`
- `imagePrompt`
- `videoPrompt`

Edits should update `state.reverseVideo.result.scenes` and autosave to localStorage.

## Secondary Creation

After saving the reverse result to favorites, `用这个脚本二创` should:

- Set `state.selectedFavoriteId` to the saved favorite.
- Create generation tasks from that favorite.
- Preserve the original reverse structure as the source.
- Let the user choose count and strategy in the first version with conservative defaults:
  - count: `3`
  - strategy: `rewrite`

Generated tasks should appear on `视频任务看板` and continue through existing review and generation steps.

## Error Handling

Upload errors:

- Unsupported file type: show `请上传 mp4、mov 或 webm 视频。`
- File too large: show `视频过大，请先压缩后再上传。`
- Server unavailable: show `上传需要先启动本地服务。`

Frame extraction errors:

- Missing upload: show `没有找到已上传的视频。`
- Missing `ffmpeg`: show the explicit ffmpeg message above.
- Extraction failed: show stderr summary if available, with secrets redacted.

LLM errors:

- Missing API config: keep current settings flow and link to `设置`.
- Empty or malformed response: show `大模型没有返回可用的 scenes，请检查响应 JSON。`
- Provider failure: save the redacted request/response preview for debugging.

Favorite errors:

- Empty result: block save and show `当前没有可保存的分镜结果。`
- Duplicate source: select the existing favorite and show `这个反推脚本已在我的收藏里。`

## Verification

Core tests:

- Initial state includes `reverseVideo`.
- `buildReverseStoryboardProviderRequest()` includes upload metadata, frames, notes, and schema fields.
- `applyReverseStoryboardProviderResult()` normalizes provider scene variants.
- `saveReverseStoryboardFavorite()` creates a `分镜脚本` favorite with `sourceKey`.
- Duplicate reverse favorites are not created.
- Secondary tasks created from reverse favorite preserve source metadata.

Server tests:

- Upload endpoint rejects non-video MIME types.
- Upload endpoint stores a video under `outputs/uploads/`.
- Frame extraction endpoint reports a clear error when `ffmpeg` is missing.
- Reverse provider endpoint rejects non-http mode.
- Reverse provider endpoint proxies real HTTP requests through the existing proxy path.

App checks:

- Left nav shows `反推`.
- `#reverse` renders upload, preview, result, save, and reuse controls.
- Editing a reverse scene updates local state.
- Saving a reverse result makes it visible in `我的收藏`.
- Reusing a saved reverse script creates tasks visible on the dashboard.

## Implementation Order

1. Add core state and pure functions.
2. Add server upload and frame extraction endpoints.
3. Add reverse provider request and result normalization.
4. Add `#reverse` screen and navigation.
5. Add save-to-favorite and reuse actions.
6. Add verification scripts.
7. Run the existing app/core/server checks plus new reverse checks.

## Open Constraints

- First implementation may require local `ffmpeg`. If it is not installed, the app should fail clearly instead of silently generating fake frames.
- Uploaded videos remain local under `outputs/uploads/`; cleanup is manual in first version.
- LLM video understanding is frame-based in first version. It should not claim exact audio/dialogue unless a later transcription step is added.
