---
name: platform-copywriter
description: Use when generating, improving, or reviewing platform-specific publishing copy after a video or storyboard is approved. Trigger for 平台文案, 生成文案, TikTok, Instagram Reels, YouTube Shorts, Threads, PostEverywhere, 发布文案, 文案详情, or when generated copy feels too simple and needs titles, hooks, captions, hashtags, cover text, compliance notes, and editable detail output.
---

# Platform Copywriter

Use this skill after the storyboard or video has enough context to publish. The output must be editable per platform and detailed enough for a human reviewer to inspect before sending to PostEverywhere.

## Inputs

Use the approved task and current settings:

- Product, source favorite, selected angle, approved storyboard, video status or video URL.
- Platform list from settings.
- Safe product facts, offer, CTA, and prohibited claims.
- Desired tone: oral, lifestyle, clear title, or authentic sharing.

## Workflow

1. Summarize the video content in one internal sentence so copy matches the actual scenes.
2. For every selected platform, write a platform-specific package: title, hook, body, CTA, hashtags, cover title, overlay text, first comment, posting notes, compliance warnings, and rationale.
3. Keep each platform distinct:
   - TikTok: oral hook, fast payoff, short sentences.
   - Instagram Reels: lifestyle wording, visual adjectives, balanced hashtags.
   - YouTube Shorts: clear title, searchable description, direct benefit.
   - Threads: real-person sharing tone, less ad-like, fewer hashtags.
4. Do not hide risk. If the storyboard contains a claim that needs confirmation, add a warning rather than silently removing the context.
5. Output structured JSON so the UI can open a detail drawer/modal and allow manual edits.

## Quality Bar

- The copy must reflect the actual video angle, not generic product praise.
- The first line must be scroll-stopping but believable.
- CTA should be specific to the offer or next step.
- Hashtags should be relevant and not spammy.
- Compliance notes must be visible to reviewers before publishing.

## Runtime Integration

When wiring this into `mvp/core.js`, read `references/output-schema.md`. Store generated copy as detailed objects, not plain strings, so `mvp/app.js` can render a clickable copy detail view after "通过并生成文案".
