# Product Video Storyboard Output Schema

Use this schema as the target for large-model storyboard generation. The app can map it into the current `task` shape while keeping richer data for review and editing.

```json
{
  "contentBrief": {
    "audienceInsight": "25-45 岁租房/母婴/茶饮用户在喝水场景里的真实卡点",
    "painPoint": "想喝温水但要等烧水、水温不准、台面杂乱",
    "productPromise": "即热出水，多档温控，减少等待和临时找热水的麻烦",
    "proofPoints": ["即热出水", "多档温控", "复合滤芯", "台面使用场景"],
    "offer": "下单赠送一支复合滤芯，限时免安装指导",
    "tone": "真实、口语、弱广告感",
    "riskNotes": ["不要承诺治疗/保健效果", "不要夸大净化能力"]
  },
  "tasks": [
    {
      "title": "净饮机 · 喝水等待痛点开场",
      "angle": "等待热水痛点",
      "hook": "想喝温水，还要一直等烧水？",
      "duration": 15,
      "ratio": "9:16",
      "strategy": "用等待和台面杂乱开场，快速切到即热出水和多档温控证明。",
      "qualityScore": 92,
      "reviewSummary": "痛点明确，产品能力和优惠都有露出，需人工确认滤芯赠品话术。",
      "scenes": [
        {
          "time": "0-3s",
          "title": "痛点开场",
          "visual": "厨房台面近景，用户拿杯子等待烧水，旁边水壶和杯具显得杂乱。",
          "camera": "9:16 竖屏，中近景，轻微推进",
          "motion": "手部动作和蒸汽细节，节奏快",
          "subtitle": "想喝温水，还要一直等烧水？",
          "voiceover": "想喝一杯温水，总是要等很久？",
          "screenText": "等烧水 / 水温难控",
          "imagePrompt": "vertical product lifestyle frame, clean kitchen counter, user waiting with cup, realistic lighting",
          "videoPrompt": "3 second vertical video, kitchen counter pain point, user waits for hot water, subtle push-in camera, realistic product ad style",
          "productFocus": "喝水等待痛点",
          "reviewChecklist": ["痛点是否真实", "画面是否能直接看懂", "字幕是否过长"],
          "riskNotes": []
        }
      ]
    }
  ]
}
```

## Mapping to Existing MVP Fields

- `tasks[*].title` -> current task `title`.
- `tasks[*].scenes` -> current task `storyboard`.
- `scene.visual` -> existing `scene.visual`.
- `scene.subtitle` -> existing `scene.subtitle`.
- Preserve richer fields such as `camera`, `motion`, `voiceover`, `imagePrompt`, and `videoPrompt` for the edit modal and future video-model payloads.

## Validation Rules

- `tasks` must contain 1-5 variants for batch generation.
- Each task must contain 3-6 scenes unless the requested duration requires otherwise.
- Every scene must include `time`, `title`, `visual`, and `subtitle`.
- `qualityScore` is only an internal ranking signal; do not show it as objective truth to the end user.
