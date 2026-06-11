# AI Video Workbench Skill Integration Plan

Date: 2026-06-07

## Added Project Skills

- `skills/product-video-storyboard`: improves product content planning and storyboard generation with audience insight, angles, visual action, camera/motion, subtitles, prompts, and review notes.
- `skills/platform-copywriter`: improves platform copy after video/storyboard approval with detailed per-platform titles, hooks, captions, hashtags, cover text, compliance notes, and rationale.
- `skills/employee-review-flow`: governs human review UX, global queues, editable detail flows, copy details, and AI loading states.

## External Skill Direction Reviewed

- `aicontentskills/ai-video-storyboard-skill`: useful direction for multi-shot storyboards, visual consistency, shot lists, prompts, and production checklists.
- `inference-sh/skills`: useful category direction for storyboard creation, image-to-video, text-to-video, and AI-video generation, but not copied because it is provider-ecosystem specific.
- `coreyhaines31/marketingskills`: useful direction for marketing copy and growth-focused content skills.

The project skills are original local rules written for this MVP's product-image-to-video, review, and publishing workflow.

## Complete Implementation Plan

### 1. Upgrade Storyboard Generation

Owner files:

- `mvp/core.js`
- `mvp/verify-core.js`

Work:

- Replace the current simple storyboard prompt with a prompt based on `skills/product-video-storyboard/references/output-schema.md`.
- Ask the model for `contentBrief` plus 1-5 task variants.
- Preserve current fields: `title`, `storyboard`, `status`, `videoUrl`, `copy`.
- Add richer optional fields: `strategy`, `hook`, `qualityScore`, `reviewSummary`, `storyboard[*].camera`, `storyboard[*].motion`, `storyboard[*].voiceover`, `storyboard[*].imagePrompt`, `storyboard[*].videoPrompt`, `storyboard[*].reviewChecklist`.
- Add fallback logic so old localStorage tasks still render.

Acceptance:

- New AI-generated storyboard is not just four short cards.
- Each scene has visual action, subtitle, and model-ready prompt.
- Existing generated tasks still open in review.

### 2. Improve Storyboard Review UI

Owner files:

- `mvp/app.js`
- `mvp/styles.css`
- `mvp/verify-app.js`

Work:

- Keep the current readable storyboard list as the default.
- In the edit modal, expose richer fields without crowding the main review page.
- Add compact labels for camera, motion, voiceover, image/video prompt if present.
- Add scene-level review checklist and risk notes.

Acceptance:

- Review page remains easy to scan.
- Editing is possible but does not break layout.
- New richer fields remain readable on desktop and mobile.

### 3. Upgrade Platform Copy Generation

Owner files:

- `mvp/core.js`
- `mvp/app.js`
- `mvp/styles.css`
- `mvp/verify-core.js`
- `mvp/verify-app.js`

Work:

- Replace simple copy output with `skills/platform-copywriter/references/output-schema.md`.
- Generate one detailed object per selected platform.
- Store copy details under the task, not only a single text string.
- Add a clickable "查看文案" detail modal after "通过并生成文案".
- Allow manual edits before publish.

Acceptance:

- Clicking generated copy shows title, hook, body, CTA, hashtags, cover title, overlay text, first comment, notes, warnings, and rationale.
- Platform copy differs by TikTok, Instagram Reels, YouTube Shorts, and Threads.
- Publish payload can use the reviewed copy detail.

### 4. Add AI Loading Spinner States

Owner files:

- `mvp/app.js`
- `mvp/styles.css`
- `mvp/verify-app.js`

Work:

- Add a task/action-scoped pending state.
- Apply spinner and disabled state to AI actions:
  - 生成分镜
  - 生成视频
  - 查询视频结果
  - 通过并生成文案
  - 发布
- Use `finally` to clear pending state.
- In mock mode, keep a short perceptible pending state so the UI does not feel broken.

Acceptance:

- Button shows spinner while work is running.
- Repeated clicks are blocked during pending.
- Failure still clears spinner and shows status.

### 5. Verification

Run after implementation:

```bash
node --check mvp/app.js
node --check mvp/core.js
node --check mvp/server.js
node mvp/verify-app.js
node mvp/verify-core.js
node mvp/verify-server.js
```

Then open the local MVP and verify:

- Storyboard generation produces richer planning.
- Review center still shows global queue.
- Storyboard default view is readable.
- Edit modal works.
- Copy detail opens after generation.
- AI buttons show spinner states.
