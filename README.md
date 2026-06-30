# AI Video Workbench

AI 视频工作台是一个本地运行的 AI 视频生产 MVP，用来验证从产品资料到视频发布前审核的完整业务闭环。

当前流程覆盖：

- 产品想法和产品图录入
- 大模型生成内容规划和视频分镜
- 视频生成接口调用
- 视频结果审核
- 平台发布文案审核
- PostEverywhere 发布接口对接

## 项目状态

这是本地可运行的 MVP/桌面端项目，主要用于真实接口联调和交付验证。项目不会内置私有 API key，模型、视频和发布相关配置需要在本地界面的集成设置中填写。

## 本地启动

安装依赖：

```bash
npm install
```

启动本地服务：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4188
```

也可以直接打开 `mvp/index.html` 查看静态界面，但真实 provider 调用需要启动本地服务。

## 接口能力

本地服务提供这些接口：

- `GET /api/health`
- `POST /api/provider/content-plan`
- `POST /api/provider/storyboard`
- `POST /api/provider/video`
- `POST /api/provider/publisher`

## 验证

运行完整校验：

```bash
npm run verify
```

也可以分别执行：

```bash
node mvp/verify-core.js
node mvp/verify-server.js
node --check mvp/app.js
node --check mvp/core.js
node --check mvp/server.js
```

## 桌面端

开发模式：

```bash
npm run desktop:dev
```

Windows 打包：

```bash
npm run build:win
```

macOS 打包：

```bash
npm run build:mac
```

打包产物会输出到 `dist/`。

## 配置说明

在页面的集成设置中填写：

- 大模型 endpoint、model、API key
- 视频模型 endpoint、model、API key
- 发布接口 endpoint 和认证信息

当前版本只走真实接口。provider 调用失败时会显示真实错误，不会自动生成本地演示数据。

如果浏览器保留了旧本地数据，可以清理 `localStorage` 中的 `ai-video-workbench-mvp`，或导入新的状态文件。
