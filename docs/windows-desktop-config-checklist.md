# AI 视频工作台 Windows 桌面端配置清单

这份清单用于把 Windows 安装包发给使用者时同步说明需要准备哪些配置。下面只列字段名和用途，不展示任何真实 key 或账号值。

## 1. 通用大模型配置

在桌面端进入：`必要配置 -> 通用大模型`

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `provider` | 是 | 大模型服务商或自定义接口标识。 |
| `apiStyle` | 是 | 接口格式，例如 OpenAI Chat、OpenAI Responses、视觉模型兼容格式。 |
| `endpoint` | 是 | 大模型生成接口地址。 |
| `model` | 是 | 文案、内容规划、分镜、反推使用的模型名。 |
| `apiKey` | 是 | 只填写在本机，不要在清单里展示真实值。 |

需要支持视频反推看图时，大模型需要能处理图片输入；`apiStyle` 可使用视觉/多模态兼容配置。

## 2. 视频生成配置

在桌面端进入：`必要配置 -> 视频生成模型`

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `provider` | 是 | 视频生成服务商或自定义接口标识。 |
| `apiStyle` | 是 | 视频接口格式，例如 ToAPIs 视频接口、DashScope 视频接口、自定义视频接口。 |
| `endpoint` | 是 | 提交视频生成任务的接口地址。 |
| `statusEndpoint` | 是 | 查询视频任务结果的接口地址，通常需要包含 `{task_id}`。 |
| `model` | 是 | 视频模型名。 |
| `apiKey` | 是 | 只填写在本机，不要在清单里展示真实值。 |

注意：如果视频生成服务需要公开可访问的产品图 URL，上传素材后要先确认图片地址能被上游服务访问。

## 3. PostEverywhere 发布配置

在桌面端进入：`必要配置 -> PostEverywhere 发布`

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `provider` | 是 | 通常为 `posteverywhere`。 |
| `endpoint` | 是 | 发布接口地址。 |
| `workspaceId` | 视账号而定 | 如果发布接口要求 workspace，需要填写。 |
| `accountIds` | 是 | PostEverywhere 账号 ID，支持多个，用英文逗号分隔。 |
| `mediaIds` | 发布前需要 | 已上传到 PostEverywhere 的视频媒体 ID；也可以在任务里先上传媒体后自动带入。 |
| `apiKey` | 是 | 只填写在本机，不要在清单里展示真实值。 |

当前桌面端发布平台默认只启用 TikTok。发布 TikTok 前必须确保有可用的 `accountIds` 和视频 `mediaIds`。

## 4. 可选配置：模型配置档案

在 `必要配置 -> 模型切换` 中可以把常用配置保存为档案。

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `profileName` | 可选 | 配置档案名称，例如某个大模型或视频模型方案。 |
| `activeIntegrationProfileIds.llm` | 可选 | 当前启用的大模型配置档案 ID。 |
| `activeIntegrationProfileIds.video` | 可选 | 当前启用的视频模型配置档案 ID。 |

## 5. 发给使用者前的核对项

- [ ] Windows 安装包已发送：`AI 视频工作台-0.1.0-windows-installer-x64.exe`
- [ ] 如果只是临时试用，可发送：`AI 视频工作台-0.1.0-windows-portable-x64.exe`
- [ ] 使用者已准备大模型 `apiKey`
- [ ] 使用者已准备视频生成 `apiKey`
- [ ] 使用者已准备 PostEverywhere `apiKey`
- [ ] 使用者已确认 PostEverywhere `accountIds`
- [ ] 使用者知道真实 key 只在本机填写，不要发到群里或写进共享文档
- [ ] 使用者知道生成文件保存位置：`%APPDATA%\AI 视频工作台\outputs`

## 6. 空白配置模板

```text
integrations.llm.provider =
integrations.llm.apiStyle =
integrations.llm.endpoint =
integrations.llm.model =
integrations.llm.apiKey = 不展示

integrations.video.provider =
integrations.video.apiStyle =
integrations.video.endpoint =
integrations.video.statusEndpoint =
integrations.video.model =
integrations.video.apiKey = 不展示

integrations.publisher.provider =
integrations.publisher.endpoint =
integrations.publisher.workspaceId =
integrations.publisher.accountIds =
integrations.publisher.mediaIds =
integrations.publisher.apiKey = 不展示

selectedPlatforms = tiktok
```
