# AI 视频工作台 Windows 桌面端使用手册

## 1. 安装包位置

本次生成的 Windows 安装包在：

```text
dist/AI 视频工作台-0.1.0-windows-installer-x64.exe
```

免安装版在：

```text
dist/AI 视频工作台-0.1.0-windows-portable-x64.exe
```

推荐普通用户使用 `windows-installer` 安装包。`windows-portable` 适合临时测试，双击即可运行，不会创建完整卸载项。

## 2. 安装和首次启动

1. 把 `AI 视频工作台-0.1.0-windows-installer-x64.exe` 复制到 Windows 电脑。
2. 双击安装包。
3. 如果 Windows SmartScreen 提示“不常见应用”，点击“更多信息”，再点击“仍要运行”。
4. 安装完成后，从桌面快捷方式或开始菜单打开“AI 视频工作台”。

应用启动后会自动在本机后台启动内置服务，不需要手动安装 Node.js，也不需要打开命令行。

## 3. 首次配置接口

打开应用后进入“设置 / 集成设置”，至少配置这三类接口：

- 大模型接口：用于内容规划、分镜、文案。
- 视频生成接口：用于生成视频。
- 发布接口：用于 PostEverywhere 发布。

需要填写的字段通常包括：

- endpoint
- model
- API key
- status endpoint
- workspace / account / media 相关字段

API key 只保存在当前 Windows 用户的本机应用数据里，不会写入安装目录。

## 4. 基本使用流程

1. 进入“新建”，填写产品信息、卖点、目标平台和视频要求。
2. 生成内容规划。
3. 检查或编辑分镜。
4. 生成视频。
5. 在“审核”页确认视频和文案。
6. 在“发布”页选择立即发布或定时发布。

桌面端保留现有 Web MVP 的 UI 和页面结构，只是把原来的 `http://127.0.0.1:4188` 本地服务封装进桌面应用。

## 5. 本地文件保存位置

Windows 桌面端不会把生成文件写入安装目录，而是写入当前用户的数据目录：

```text
%APPDATA%\AI 视频工作台\outputs
```

常见子目录：

```text
%APPDATA%\AI 视频工作台\outputs\uploads
%APPDATA%\AI 视频工作台\outputs\downloads
```

上传的视频、下载到本地的视频、抽帧图片和 provider 调用日志都会放在这里。

## 6. 视频抽帧说明

本次安装包已内置 Windows 版 `ffmpeg.exe`，用于“视频反推 / 抽帧”这类功能。

如果抽帧仍提示未检测到 ffmpeg，优先检查：

- 是否运行的是本次新生成的安装包。
- 是否被安全软件隔离了 `ffmpeg.exe`。
- 是否从旧版本 portable 包启动。

## 7. 常见问题

### 打开后页面空白

关闭应用后重新打开。如果仍然空白，检查安全软件是否拦截了本地回环地址 `127.0.0.1`。

### 接口测试失败

先确认 endpoint、model、API key 是否和网页版本一致。桌面端不内置你的本地 `mvp/local-config.js`，需要在设置页重新填写或导入配置。

### 生成视频失败

查看任务卡片里的真实错误信息。常见原因是上游模型额度不足、任务仍在排队、status endpoint 配错、或视频模型不支持当前时长/比例。

### 发布失败

检查 PostEverywhere 的 API key、workspace、account id、media id 或定时发布时间。发布接口错误会在页面里显示真实上游响应。

### Windows 安全提示

当前安装包没有购买正式代码签名证书。Windows 可能提示“不常见应用”，这是分发信任提示，不代表应用代码本身运行失败。正式对外分发前建议购买代码签名证书。

## 8. 卸载

如果使用安装包安装：

```text
Windows 设置 -> 应用 -> 已安装的应用 -> AI 视频工作台 -> 卸载
```

卸载应用不会自动删除用户数据。需要彻底清理时，手动删除：

```text
%APPDATA%\AI 视频工作台
```
