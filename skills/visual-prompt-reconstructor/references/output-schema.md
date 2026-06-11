# Visual Prompt Reconstruction Output Schema

Use this shape when reverse-engineering product videos or keyframes.

```json
{
  "reverseStoryboard": {
    "title": "反推分镜 · reference.mp4",
    "summary": "忠实复刻原视频的主体、环境、镜头和节奏。",
    "hook": "原片前三秒的视觉钩子",
    "duration": 15,
    "ratio": "9:16",
    "sourceReconstruction": {
      "productIdentity": "原视频中可见的产品，不写替换目标产品",
      "environment": "真实场景、背景、道具、表面材质",
      "cameraStyle": "竖屏/横屏、景别、角度、镜头感",
      "lighting": "光源、色温、阴影、对比度",
      "composition": "主体位置、前景/背景、留白",
      "motionRhythm": "剪辑节奏、镜头运动、主体动作",
      "visibleText": ["只写画面中确实可读的文字"],
      "uncertaintyNotes": ["无法确认的产品细节、音频、台词、logo"]
    },
    "rewriteTemplate": {
      "replaceableProductSlot": "可替换的产品位置和动作",
      "lockedElements": ["必须保留的构图", "环境", "光线", "镜头节奏"],
      "adaptableElements": ["字幕", "CTA", "产品卖点", "展示动作"],
      "replacementRules": ["新产品只能替换产品槽位", "不要改变原场景语法"],
      "negativePrompt": "wrong product, changed logo, changed background, changed camera angle, distorted object, unreadable text"
    },
    "scenes": [
      {
        "time": "0.0s-2.5s",
        "title": "原片镜头名称",
        "visual": "只描述画面中能看到的内容",
        "camera": "构图、景别、角度、运镜",
        "motion": "人物/产品/镜头运动",
        "subtitle": "原片字幕或可替换建议",
        "screenText": "画面中可读文字",
        "imagePrompt": "faithful still-frame prompt for this exact shot",
        "videoPrompt": "faithful video prompt for this exact shot",
        "productFocus": "原片产品焦点",
        "reviewChecklist": ["产品是否还是原片产品", "环境是否未漂移", "镜头是否可复现"],
        "riskNotes": ["不确定内容必须人工确认"]
      }
    ]
  }
}
```

Validation rules:

- `sourceReconstruction.productIdentity` must not contain the replacement product unless it is visible in the source.
- `rewriteTemplate` must exist separately from `sourceReconstruction`.
- `scenes[*].imagePrompt` and `scenes[*].videoPrompt` must describe visual facts, not marketing strategy.
- Use `uncertaintyNotes` instead of guessing.
