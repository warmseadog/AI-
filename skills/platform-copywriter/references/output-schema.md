# Platform Copywriter Output Schema

Use this schema for copy-generation responses. It supports copy detail review and later PostEverywhere submission.

```json
{
  "videoSummary": "净饮机短视频用等待热水痛点开场，展示即热出水、多档温控和限时赠品。",
  "copies": [
    {
      "platformId": "tiktok",
      "platformName": "TikTok",
      "title": "喝温水别再等烧水",
      "hook": "想喝温水，还要等水壶慢慢烧？",
      "body": "早上赶时间、晚上想泡茶，一台净饮机直接选温度。即热出水，多档温控，台面也少一堆杯具水壶。",
      "cta": "现在下单赠送一支复合滤芯，限时免安装指导。",
      "hashtags": ["#净饮机", "#厨房好物", "#喝水日常", "#租房好物"],
      "coverTitle": "温水不用等",
      "overlayText": ["即热出水", "多档温控", "台面更清爽"],
      "firstComment": "你平时最常用哪个水温？",
      "postingNotes": "开头保留痛点字幕，封面突出温水不用等。",
      "complianceWarnings": ["滤芯赠品和免安装指导需确认活动仍有效"],
      "rationale": "TikTok 优先用痛点口语化开场，快速承接产品动作。",
      "approved": false
    }
  ]
}
```

## UI Mapping

- `copies[*].title`, `hook`, `body`, `cta`, `hashtags` show in the copy detail modal.
- `coverTitle` and `overlayText` can populate future cover/editor fields.
- `complianceWarnings` must appear in review detail before publish.
- `approved` should remain false until a human explicitly confirms or edits.

## Validation Rules

- Generate one copy object per selected platform.
- Every copy object must include `platformId`, `title`, `hook`, `body`, `cta`, and `hashtags`.
- Hashtags should be an array, not a single string.
- Do not return only a caption string; that is too shallow for this project.
