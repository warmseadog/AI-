# AI 视频工作台 MVP

这是当前项目的本地可跑 MVP。它用于验证真实接口业务闭环：

产品想法 + 产品图 -> 真实大模型内容规划 -> 视频生成 -> 视频审核 -> 平台文案审核 -> PostEverywhere 发布。

## 直接打开

双击或打开：

```text
mvp/index.html
```

这种方式只能查看静态界面。真实 provider 调用需要启动本地服务。

## 启动本地服务

为了测试 provider API 端点，使用：

```bash
node mvp/server.js
```

然后打开：

```text
http://127.0.0.1:4188
```

本地服务提供：

- `GET /api/health`
- `POST /api/provider/content-plan`
- `POST /api/provider/storyboard`
- `POST /api/provider/video`
- `POST /api/provider/publisher`

在 `集成设置` 里填写大模型、视频模型和发布接口的 endpoint、model、API key。当前版本只支持 `http` 真实接口；provider 失败会显示真实错误，不再生成本地演示内容。

如果浏览器还保留旧本地数据，打开开发者工具清理 `localStorage` 里的 `ai-video-workbench-mvp`，或导入一份新状态。

## 验证

```bash
node mvp/verify-core.js
node mvp/verify-server.js
node --check mvp/app.js
node --check mvp/core.js
node --check mvp/server.js
```
