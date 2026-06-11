---
name: visual-prompt-reconstructor
description: Use when reverse-engineering prompts from product videos, keyframes, screenshots, image references, or generated media in this repo. Trigger for 反推提示词, 场景还原, 复刻原视频, 关键帧拆解, image-to-prompt, video-to-prompt, prompt reconstruction, or when a reverse storyboard returns generic/wrong products and must be grounded in visual evidence.
---

# Visual Prompt Reconstructor

Use this skill to maximize scene reconstruction fidelity before any remix. The goal is not a generic reusable ad template; the first output must preserve what the reference media actually shows.

## Workflow

1. Confirm the available visual evidence: uploaded video, extracted frames, image URL, screenshot, or local image files.
2. If only local frame paths are present, make sure the runtime can send actual image content to a vision-capable model. Text-only models can describe structure but cannot reliably identify the product.
3. Produce two separate artifacts:
   - `sourceReconstruction`: faithful reconstruction of the original media.
   - `rewriteTemplate`: replaceable structure for secondary creation with a new product.
4. Never mix the user’s target replacement product into `sourceReconstruction`.
5. Mark uncertainty explicitly. Do not invent logos, text, material, audio, dialogue, product category, or claims.
6. Convert each shot into model-ready prompts only after the visual facts are locked.

## Required Fields

For a concrete JSON target, read `references/output-schema.md`.

For the overall reconstruction:

- `productIdentity`: visible product type, color, shape, materials, logo/text if readable.
- `environment`: location, props, background, surfaces, time of day, weather if visible.
- `cameraStyle`: aspect ratio, framing, lens feel, angle, handheld/static, depth of field.
- `lighting`: light source, contrast, shadows, color temperature.
- `composition`: subject placement, foreground/background, negative space.
- `motionRhythm`: pacing, cuts, camera movement, object movement.
- `visibleText`: exact readable text only.
- `uncertaintyNotes`: what cannot be confirmed from the frames.

For every shot:

- `time`, `title`, `visual`, `camera`, `motion`, `subtitle`, `screenText`.
- `imagePrompt`: one still-frame prompt faithful to the source shot.
- `videoPrompt`: one video-generation prompt faithful to the source shot.
- `negativePrompt`: wrong product, wrong logo, changed background, changed camera angle, unreadable text, distortion.

For `rewriteTemplate`:

- `replaceableProductSlot`: what can be swapped.
- `lockedElements`: scene, composition, light, motion, timing, and mood that should stay.
- `adaptableElements`: text, CTA, product-specific actions, claims.
- `replacementRules`: how to insert the new product without changing the source scene grammar.

## Quality Bar

- If the prompt contains `Generic product`, `[Product Name]`, or an unrelated product, it failed.
- If a text-only model was used, state that product identity is not reliable unless a human or vision model checked the frames.
- Keep original reconstruction and product-replacement prompt visibly separate.
- Prefer concrete visual nouns over style adjectives.
- Use the existing `product-video-storyboard` skill only after this reconstruction step when turning the result into a campaign storyboard.

## Runtime Notes

In this repo, the MVP reverse module should use:

- `fidelityMode: "source_reconstruction_first"`
- `sourceReconstruction` for original scene facts.
- `rewriteTemplate` for secondary creation.
- `apiStyle: "openai-vision-chat"` or another `vision`/`multimodal` style when sending actual keyframe images.

If the configured LLM is plain `openai-chat`, the app can still return a structure, but it is not a true visual prompt reconstruction.
