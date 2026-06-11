---
name: product-video-storyboard
description: Use when generating, rewriting, or improving AI short-video content planning and storyboard scripts for product-image-to-video workflows in this repo. Trigger for 产品图, 内容策划, 分镜脚本, AI 改写, 视频策划, 15s 短视频, Seedance, 通义万相, 小云雀, or when generated storyboard output feels too simple and needs stronger hooks, audience insight, visual direction, subtitles, review notes, and model-ready prompts.
---

# Product Video Storyboard

Use this skill to turn product inputs into review-ready short-video plans. The goal is not a generic ad outline; every output must carry a clear audience pain point, a specific product proof, a visual sequence, and generation prompts that a video model can use.

## Inputs

Collect or infer from the current task:

- Product name, image/material source, category, price/offer if present.
- Audience, pain point, buying hesitation, usage scenario.
- Required duration, ratio, platform targets, and language.
- Product claims that are safe to say; do not invent medical, safety, financial, or guaranteed-performance claims.
- Existing favorite storyboard, content brief, or user-provided angle.

## Workflow

1. Build a content brief first: audience insight, pain point, product promise, proof points, offer, tone, and risk notes.
2. Generate multiple angles before selecting one. Prefer concrete hooks such as waiting time, mess, effort, comparison, before/after workflow, or social proof.
3. Create a complete storyboard with timed scenes. Each scene needs a role in the arc: hook, product reveal, proof, objection handling, CTA.
4. For each scene, specify visual action, camera/framing, motion, subtitle, optional voiceover, screen text, product focus, image prompt, video prompt, and review checklist.
5. Keep wording natural for short video. Avoid slogans without a visual action. Avoid exaggerated claims and vague phrases like "quality upgrade" unless supported by product facts.
6. Output structured JSON for runtime use. If the user is asking for explanation, summarize the strategy separately, but keep machine-facing payloads as JSON.

## Quality Bar

- The first three seconds must identify the audience problem or visual curiosity.
- Every scene must describe what appears on screen, not only what the message means.
- Subtitles should be short enough for vertical video and should not repeat the full visual description.
- Product proof must be grounded in supplied facts, visible evidence, or a user-provided offer.
- The final scene must have a conversion action, but it should not overpromise.

## Runtime Integration

When wiring this into `mvp/core.js`, read `references/output-schema.md`. Preserve existing task fields for compatibility, and add richer fields under `contentBrief`, `strategy`, `scenes[*]`, and `reviewChecklist` instead of replacing the current state shape abruptly.
