const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Core = require("./core.js");

const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const localConfigSandbox = { window: {} };
vm.createContext(localConfigSandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "local-config.js"), "utf8"), localConfigSandbox);
const localConfig = localConfigSandbox.window.AI_VIDEO_LOCAL_CONFIG;
assert.strictEqual(localConfig.integrations.llm.provider, "custom-llm", "local startup config uses custom LLM provider");
assert.strictEqual(localConfig.integrations.llm.model, "gpt-5.5", "local startup config uses GPT-5.5");
assert.strictEqual(localConfig.integrations.llm.endpoint, "https://toapis.com/v1/chat/completions", "local startup config uses GPT-5.5 endpoint");
assert.deepStrictEqual(JSON.parse(JSON.stringify(localConfig.selectedPlatforms)), ["tiktok"], "local startup config selects TikTok only");
assert.ok(indexHtml.includes("app.js?v="), "index references app.js with a cache-busting version");
assert.ok(indexHtml.includes("styles.css?v=20260611-publish-preview"), "index cache-busts publish preview styles");
assert.ok(indexHtml.includes("core.js?v=20260611-publish-preview"), "index cache-busts publish preview core changes");
assert.ok(indexHtml.includes("app.js?v=20260611-publish-preview"), "index cache-busts publish preview app changes");
assert.ok(indexHtml.includes("local-config.js"), "index can load local ignored provider config before app startup");
assert.ok(appJs.includes("loadReverseFrameData"), "app can inline extracted reverse frames for vision-capable LLMs");
assert.ok(appJs.includes("openai-vision-chat"), "app documents the vision-capable LLM apiStyle for reverse reconstruction");
assert.ok(appJs.includes("supportsReverseVisionModel"), "app auto-detects vision-capable reverse models");
assert.ok(appJs.includes("gpt-5.5"), "app treats GPT-5.5 as a reverse vision-capable model");
assert.ok(!appJs.includes('text: task.contentPlanText'), "content plan stream completion does not duplicate the final editable plan text");
assert.ok(appJs.includes("storyboardStream"), "app keeps storyboard stream state separate from content plan streaming");
assert.ok(appJs.includes("renderStoryboardScriptEditor"), "create page renders a storyboard script editor");
assert.ok(appJs.includes("data-storyboard-script-text"), "storyboard script editor has a single large editable textarea");
assert.ok(appJs.includes("streamResponseFromRecoveredJson"), "stream provider can recover from completed JSON when the network stream closes before done");

const state = Core.createInitialState();
state.products[0].imageUrl = "https://example.test/neck-fan.png";
state.contentBrief.seed = "我想在 TikTok 美国地区售卖一款挂脖风扇。";
const migratedTimestampState = Core.migrateState({
  schemaVersion: 2,
  products: state.products,
  tasks: [
    {
      id: "task-without-time",
      productId: state.products[0].id,
      productName: "挂脖风扇",
      favoriteName: "未使用收藏",
      strategy: "content-plan",
      variation: { hook: "热浪痛点" },
      title: "挂脖风扇 · 热浪痛点",
      status: "content_plan_ready",
      owner: "运营",
      duration: 15,
      ratio: "9:16",
    },
  ],
});
assert.ok(migratedTimestampState.tasks[0].createdAt, "migrated tasks get a createdAt timestamp");
assert.ok(migratedTimestampState.tasks[0].updatedAt, "migrated tasks get an updatedAt timestamp");
const task = Core.createContentPlanTask(state, {
  contentPlan: {
    productUnderstanding: "挂脖风扇，免手持，适合夏季通勤和户外。",
    targetAudience: {
      demographics: "TikTok 美国用户。",
      psychographics: "怕热且喜欢实用小电器。",
    },
    keySellingPoints: ["hands-free", "portable"],
    usageScenarios: ["commute", "outdoor"],
    strategy: "热浪痛点开场，展示佩戴和风速。",
    hook: "Wear the breeze.",
    reviewSummary: "避免夸大效果。",
    complianceNotes: ["不承诺具体效果数值"],
    scenes: [
      {
        time: "0-3s",
        title: "热浪痛点",
        visual: "用户在户外排队出汗，拿出挂脖风扇。",
        subtitle: "Too hot outside?",
        camera: "9:16 close-up",
        motion: "quick reveal",
        videoPrompt: "vertical video, neck fan reveal in summer queue",
      },
    ],
  },
});
task.storyboard = Core.normalizeStoryboardTiming([
  {
    time: "0-3s",
    title: "热浪痛点",
    visual: "用户在户外排队出汗，拿出挂脖风扇。",
    subtitle: "Too hot outside?",
    camera: "9:16 close-up",
    motion: "quick reveal",
    videoPrompt: "vertical video, neck fan reveal in summer queue",
  },
], 15);
task.storyboardTimingStatus = task.storyboard.timingStatus;
task.video = {
  url: "https://example.test/generated.mp4",
  provider: "tongyi-wanxiang",
  providerStatus: "SUCCEEDED",
};
task.status = "video_review";
state.selectedTaskId = task.id;

let appHtml = "";
const sandbox = {
  console,
  setTimeout() {},
  window: {
    VideoWorkbenchCore: Core,
    AI_VIDEO_LOCAL_CONFIG: {
      integrations: {
        llm: {
          mode: "http",
          provider: "deepseek",
          apiStyle: "openai-chat",
          endpoint: "https://api.deepseek.com/chat/completions",
          model: "deepseek-v4-pro",
          apiKey: "local-llm-key",
        },
        video: {
          mode: "http",
          provider: "tongyi-wanxiang",
          apiStyle: "dashscope-video",
          endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
          statusEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
          model: "wan2.7-i2v-2026-04-25",
          apiKey: "local-video-key",
        },
        publisher: {
          mode: "http",
          provider: "posteverywhere",
          endpoint: "https://app.posteverywhere.ai/api/v1/posts",
          accountIds: "2280",
          apiKey: "local-publisher-key",
        },
      },
    },
    addEventListener() {},
  },
  location: {
    hash: "#review",
    protocol: "http:",
  },
  history: {
    replaceState() {},
  },
  localStorage: {
    getItem() {
      return JSON.stringify(state);
    },
    setItem() {},
  },
  document: {
    getElementById(id) {
      assert.strictEqual(id, "app", "app render targets #app");
      return {
        set innerHTML(value) {
          appHtml = value;
        },
      };
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"), sandbox);
const recoveredStreamResponse = vm.runInContext(`
  streamResponseFromRecoveredJson("storyboard", {
    provider: "deepseek",
    model: "deepseek-v4-pro"
  }, '{"sceneCount":10,"storyboards":[{"time":"0-1.5s","title":"Hook","visual":"Hot kitchen opener.","subtitle":"","videoPrompt":"UGC opener."}]}')
`, sandbox);
assert.deepStrictEqual(recoveredStreamResponse.result.storyboards[0].title, "Hook", "stream fallback parses completed storyboard JSON from received chunks");
const recoveredScript = vm.runInContext(`
  (() => {
    const localTask = {
      productName: "Neck fan",
      variation: { angle: "Kitchen rescue", hook: "Hot kitchen" },
      storyboard: []
    };
    Core.applyStoryboardProviderResult([localTask], streamResponseFromRecoveredJson("storyboard", {
      provider: "deepseek",
      model: "deepseek-v4-pro"
    }, '{"sceneCount":10,"storyboards":[{"time":"0-1.5s","title":"Hook","visual":"Hot kitchen opener.","subtitle":"","videoPrompt":"UGC opener."}]}'));
    return {
      count: localTask.storyboard.length,
      text: storyboardScriptText(localTask)
    };
  })()
`, sandbox);
assert.strictEqual(recoveredScript.count, 10, "stream fallback storyboards JSON is applied to the requested storyboard count");
assert.ok(recoveredScript.text.includes("第 1 镜"), "stream fallback storyboards JSON generates editable storyboard script text");
assert.ok(recoveredScript.text.includes("Hook"), "stream fallback storyboard script includes recovered scene title");
const doneStreamEditorHtml = vm.runInContext(`
  renderStoryboardScriptEditor({
    id: "task-done-stream",
    contentPlan: { productUnderstanding: "Neck fan." },
    storyboard: []
  }, {
    status: "done",
    label: "分镜脚本已生成",
    text: "已收到模型返回，分镜脚本已写入上方可编辑中文分镜框。",
    rawText: "# 分镜脚本（10 镜）\\n\\n第 1 镜｜0-1.5s｜Hook\\n画面：Hot kitchen opener."
  })
`, sandbox);
assert.ok(doneStreamEditorHtml.includes("# 分镜脚本（10 镜）"), "done storyboard stream raw text is shown in the editable storyboard textarea");
const parsedPrettyJsonStream = vm.runInContext(
  `parseProviderStreamText("{\\n  \\"ok\\": false,\\n  \\"error\\": \\"method not allowed\\"\\n}")`,
  sandbox
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(parsedPrettyJsonStream)), {
  events: [],
  fallbackJson: { ok: false, error: "method not allowed" },
}, "stream parser treats pretty JSON responses as fallback JSON instead of NDJSON");
const parsedNdjsonEvent = vm.runInContext(
  `parseProviderStreamText("{\\"type\\":\\"chunk\\",\\"text\\":\\"hello\\"}")`,
  sandbox
);
assert.deepStrictEqual(JSON.parse(JSON.stringify(parsedNdjsonEvent)), {
  events: [{ type: "chunk", text: "hello" }],
  fallbackJson: null,
}, "stream parser treats one-line typed JSON objects as NDJSON events");
assert.strictEqual(vm.runInContext("state.integrations.llm.mode", sandbox), "http", "local config keeps real http llm mode");
assert.strictEqual(vm.runInContext("state.integrations.video.model", sandbox), "wan2.7-i2v-2026-04-25", "local config applies video model");

assert.ok(appHtml.includes("sidebar-shell"), "app renders the single icon sidebar shell");
assert.ok(appHtml.includes("视频</span>"), "icon rail uses Chinese video label");
assert.ok(appHtml.includes("新建</span>"), "icon rail uses Chinese create label");
assert.ok(appHtml.includes("反推</span>"), "icon rail exposes reverse storyboard module");
assert.ok(!appHtml.includes("收藏</span>"), "primary navigation no longer exposes favorites");
assert.ok(appHtml.includes("<svg"), "icon rail uses line icons");
assert.ok(appHtml.includes("审核中心"), "review route renders the global review center title");
assert.ok(appHtml.includes("视频预览"), "review route renders the selected task detail");
assert.ok(appHtml.includes("<video"), "review page renders a video element when video URL exists");
assert.ok(appHtml.includes("https://example.test/generated.mp4"), "generated video URL is used in the preview");
assert.ok(appHtml.includes('data-action="download-video"'), "review page exposes a local video download action");
assert.ok(appHtml.includes("内容来源"), "review summary labels the task source generically");
assert.ok(appHtml.includes("产品想法 + 产品图"), "review summary identifies real input source");
assert.ok(appHtml.includes("生成提示词"), "review storyboard exposes model prompts for review");

vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    Core.approveVideo(publishTask);
    Core.generateCopies(publishTask, ["tiktok"]);
    Core.approveCopy(publishTask, "tiktok");
    copyDetailPlatformId = "tiktok";
    view = "publish";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("实际发布正文"), "copy detail labels the exact text that will be sent as the published caption");
assert.ok(appHtml.includes("PostEverywhere 请求预览"), "copy detail shows the real publisher request body before publishing");
assert.ok(appHtml.includes("文案风格"), "publish page exposes copy style selection");
assert.ok(appHtml.includes('data-field="copyStyle"'), "publish copy style selection is state-backed");
assert.ok(appHtml.includes("痛点解决"), "publish copy style selection includes problem-solution style");
assert.ok(appHtml.includes("&quot;platform_content&quot;"), "publisher request preview includes platform_content");
assert.ok(appHtml.includes("&quot;tiktok&quot;"), "publisher request preview includes the selected platform key");
assert.ok(appHtml.includes("会发布"), "copy detail marks fields included in the publishing payload");
assert.ok(appHtml.includes("仅内部审核"), "copy detail marks fields that are retained only for review");
assert.ok(appHtml.includes("暂未接入发布"), "copy detail marks generated fields that are not sent to PostEverywhere yet");
assert.ok(appHtml.includes("首条评论"), "copy detail still exposes first comment as an editable generated field");
assert.ok(appHtml.includes("中文参考译文"), "copy detail shows a Chinese reference translation");

sandbox.location.hash = "#create";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("可编辑中文分镜脚本"), "create page renders a storyboard script box below the content plan");
assert.ok(appHtml.includes("10 镜 · 高密度"), "create page keeps the storyboard preset control visible near generation actions");
assert.ok(appHtml.includes('data-storyboard-script-text'), "create page storyboard script box is editable from one large textarea");

sandbox.location.hash = "#dashboard";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("dashboard-queue-panel"), "dashboard renders the lightweight queue panel");
assert.ok(appHtml.includes('data-dashboard-filter="storyboard"'), "dashboard stat cards expose storyboard filter controls");
assert.ok(appHtml.includes('data-dashboard-filter="videoReview"'), "dashboard stat cards expose video review filter controls");
assert.ok(appHtml.includes("<th>时间</th>"), "dashboard task table includes a time column");
assert.ok(appHtml.includes("创建 "), "dashboard task rows show task creation time");
assert.ok(appHtml.includes("更新 "), "dashboard task rows show task update time");
vm.runInContext(`
  (() => {
    const baseTask = state.tasks[0];
    state.tasks = [
      Object.assign({}, baseTask, {
        id: "task-storyboard",
        title: "分镜就绪任务",
        status: "storyboard_ready",
        createdAt: "2026-06-10T01:00:00.000Z",
        updatedAt: "2026-06-10T02:00:00.000Z"
      }),
      Object.assign({}, baseTask, {
        id: "task-video-review",
        title: "视频审核任务",
        status: "video_review",
        createdAt: "2026-06-10T03:00:00.000Z",
        updatedAt: "2026-06-10T04:00:00.000Z"
      })
    ];
    dashboardFilter = "videoReview";
    renderShell();
  })()
`, sandbox);
const filteredDashboardHtml = appHtml;
assert.ok(filteredDashboardHtml.includes("视频审核任务"), "video review dashboard filter shows matching tasks");
assert.ok(!filteredDashboardHtml.includes("分镜就绪任务"), "video review dashboard filter hides non-matching tasks");
assert.ok(filteredDashboardHtml.includes("筛选：待视频审核"), "dashboard list header names the active filter");
assert.ok(appHtml.includes("task-title-block"), "dashboard task rows use a compact title block");
assert.ok(appHtml.includes("task-meta-line"), "dashboard task rows keep duration and ratio in one metadata line");
assert.ok(appHtml.includes("task-source-chip"), "dashboard source and strategy values are visually de-emphasized");
assert.ok(appHtml.includes("task-actions"), "dashboard row actions are grouped in compact controls");
vm.runInContext(`
  state.storyboardStream = {
    status: "done",
    label: "分镜脚本已生成",
    text: "已收到模型返回，分镜脚本已写入上方可编辑中文分镜框。",
    rawText: "# 分镜脚本（10 镜）\\n\\n第 1 镜｜0-1.5s｜Hook\\n画面：Hot kitchen opener.\\n字幕："
  };
  state.tasks[0].storyboard = [];
  state.tasks[0].storyboardScriptText = "";
  renderShell();
`, sandbox);
assert.ok(!/data-action="enter-review-video"[^>]*disabled/.test(appHtml), "review transition stays enabled when done storyboard raw text is available");
vm.runInContext(`
  state.tasks[0].storyboard = Core.normalizeStoryboardTiming([
    {
      time: "0-3s",
      title: "热浪痛点",
      visual: "用户在户外排队出汗，拿出挂脖风扇。",
      subtitle: "Too hot outside?",
      camera: "9:16 close-up",
      motion: "quick reveal",
      videoPrompt: "vertical video, neck fan reveal in summer queue"
    }
  ], 15);
  state.tasks[0].storyboardTimingStatus = state.tasks[0].storyboard.timingStatus;
`, sandbox);

sandbox.location.hash = "#review";
vm.runInContext("view = initialView(); storyboardEditorOpen = true; storyboardEditorSceneIndex = 0; renderShell();", sandbox);
assert.ok(appHtml.includes("storyboard-editor-shell"), "storyboard editor uses a focused shell layout");
assert.ok(appHtml.includes("storyboard-scene-list"), "storyboard editor renders the scene navigation list");
assert.ok(appHtml.includes("data-action=\"select-storyboard-scene\""), "storyboard editor can select a scene to edit");
assert.ok(appHtml.includes("storyboard-detail-editor"), "storyboard editor renders the active scene detail editor");
assert.ok(appHtml.includes("storyboard-main-visual"), "storyboard editor promotes visual description to the main field");
assert.ok(appHtml.includes("<summary>高级字段</summary>"), "storyboard editor collapses secondary fields by default");

sandbox.location.hash = "#create";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("新建内容规划"), "create page is focused on content planning");
assert.ok(appHtml.includes('data-field="contentBrief.seed"'), "create page renders the rough idea input");
assert.ok(appHtml.includes('data-file="product-image"'), "create page renders product image upload");
assert.ok(appHtml.includes('data-field="product.imageUrl"'), "create page renders product image URL input");
assert.ok(appHtml.includes('data-action="generate-content-plan"'), "create page exposes the real content plan generation action");
assert.ok(appHtml.includes("规划结果"), "create page renders content plan result area");
assert.ok(appHtml.includes("product-image-compact"), "create page uses a compact product image module");
assert.ok(appHtml.includes("create-layout-vertical"), "create page uses a vertical workflow layout");
assert.ok(appHtml.includes("content-plan-big-editor"), "create page renders one large editable content plan box");
assert.ok(appHtml.includes("data-content-plan-text"), "create page exposes one editable content plan text field");
assert.ok(!appHtml.includes("data-content-plan-field"), "create page no longer splits the content plan into many small fields");
assert.ok(appHtml.includes('data-action="regenerate-content-plan"'), "create page exposes content plan regeneration");
assert.ok(appHtml.includes('data-action="restore-previous-content-plan"'), "create page exposes previous content plan restore");
assert.ok(appHtml.includes("content-plan-editor-actions"), "content plan actions are placed inside the content plan editor header");
assert.ok(!appHtml.includes("stream-output"), "create page no longer renders a separate streaming output box");
assert.ok(!appHtml.includes("AI 生成过程"), "create page does not split generation process from the editable plan");
assert.ok(appHtml.includes("content-plan-generation-log"), "create page keeps generation status inside the editable plan box");
assert.ok(!appHtml.includes("content-plan-result"), "create page no longer renders a separate content plan summary card");
assert.ok(!appHtml.includes("<span>产品理解</span>"), "create page does not duplicate product understanding in a summary grid");
assert.ok(!appHtml.includes("<span>视频节奏</span>"), "create page does not duplicate rhythm in a summary grid");
vm.runInContext(
  `updateContentPlanStream({ status: "done", label: "内容规划已生成", text: "已收到模型返回，内容规划已写入下方编辑框。", rawText: "# 产品理解\\n最终规划全文" }); renderShell();`,
  sandbox
);
assert.ok(appHtml.includes("已收到模型返回，内容规划已写入下方编辑框。"), "done stream output shows a short process log");
assert.ok(!appHtml.includes("# 产品理解\\n最终规划全文"), "done stream output does not duplicate the final editable content plan");
assert.ok(!appHtml.includes("<h2>分镜设置</h2>"), "create page no longer renders a standalone storyboard settings panel");
assert.ok(appHtml.includes("storyboard-inline-settings"), "create page keeps storyboard settings beside the storyboard generation action");
assert.ok(appHtml.includes("storyboard-editor-actions"), "storyboard actions are placed inside the storyboard editor header");
assert.ok(appHtml.includes("data-storyboard-preset"), "create page exposes one storyboard preset dropdown");
assert.ok(!appHtml.includes('data-field="contentBrief.storyboardSceneCount"'), "create page does not expose scene count as a standalone field");
assert.ok(!appHtml.includes('data-field="contentBrief.storyboardDetailLevel"'), "create page does not expose detail level as a standalone field");
assert.ok(appHtml.includes('data-action="generate-storyboard-from-plan"'), "create page can generate storyboard from the confirmed content plan");
assert.ok(appHtml.includes("create-storyboard-preview"), "create page renders a large storyboard preview after storyboard generation");
assert.ok(appHtml.includes("storyboard-read-head"), "create page shows generated storyboard rows without jumping to review");
assert.ok(!appJs.includes('view = "review";\\n      finishPending(action);'), "storyboard generation keeps the user on the create page");
assert.ok(!appHtml.includes("[object Object]"), "create page renders object-shaped plan fields as readable text");
assert.ok(appHtml.includes("进入审核生成视频"), "create page links generated plans to review");
assert.ok(appHtml.includes('data-action="enter-review-video"'), "review transition is an explicit user action");
assert.ok(appHtml.includes("生成数量"), "create page exposes video batch count beside review entry");
assert.ok(appHtml.includes('data-field="contentBrief.videoBatchCount"'), "create page video batch count is editable");
assert.ok(appHtml.includes('<option value="6"'), "create page video batch count includes 6");
assert.ok(appHtml.includes('<option value="9"'), "create page video batch count includes 9");
assert.ok(appHtml.includes('<option value="10"'), "create page video batch count includes 10");
assert.ok(appHtml.includes('data-field="contentBrief.videoCreationStrategy"'), "create page video generation strategy is editable");
assert.ok(appHtml.includes("原内容 + 平台风格"), "create page reuses reverse generation strategy labels");
assert.ok(!appHtml.includes("create-action-bar"), "create page no longer parks editor actions under the storyboard box");
assert.ok(!appHtml.includes('data-action="create-batch"'), "create page does not expose batch storyboard generation");
assert.ok(!appHtml.includes('data-action="generate-content-brief"'), "create page does not expose brief-only generation");
assert.ok(!appHtml.includes("参考收藏"), "create page does not expose favorite reuse");
const createBatchResult = vm.runInContext(`
  (() => {
    const sourceTask = Object.assign({}, state.tasks[0], {
      id: "content-plan-batch-source",
      productName: "挂脖风扇",
      title: "挂脖风扇 · 热浪痛点",
      status: "content_plan_ready",
      strategy: "content-plan",
      variation: { hook: "热浪痛点", tone: "真实内容规划", angle: "单条内容规划" },
      contentPlan: { hook: "热浪痛点", strategy: "同一套分镜批量生成视频。" },
      contentBrief: { proofPoints: ["风力强劲", "重量轻"], text: "同一套分镜批量生成视频。" },
      storyboard: Core.normalizeStoryboardTiming([
        {
          time: "0-3s",
          title: "热浪痛点",
          visual: "用户在厨房里感到很热，准备戴上挂脖风扇。",
          subtitle: "",
          videoPrompt: "UGC hot kitchen opener."
        }
      ], 15),
      storyboardTimingStatus: "ok",
      video: null
    });
    state.tasks = [sourceTask];
    state.selectedTaskId = sourceTask.id;
    state.contentBrief.videoBatchCount = 3;
    state.contentBrief.videoCreationStrategy = "platform";
    handleAction({ action: "enter-review-video" });
    return {
      view,
      taskCount: state.tasks.length,
      selectedStatus: state.tasks.find((item) => item.id === state.selectedTaskId).status,
      variantCount: state.tasks.filter((item) => item.source === "content-plan-batch").length,
      strategy: state.tasks[0].strategy,
      instruction: state.tasks[0].videoStyleInstruction
    };
  })()
`, sandbox);
assert.deepStrictEqual(JSON.parse(JSON.stringify(createBatchResult)), {
  view: "review",
  taskCount: 4,
  selectedStatus: "storyboard_ready",
  variantCount: 3,
  strategy: "platform",
  instruction: "按「原内容 + 平台风格」生成视频变体：平台风格 1。保持同一套已确认分镜，不重新生成分镜。",
}, "create review entry creates multiple same-storyboard video tasks with selected strategy");

sandbox.location.hash = "#reverse";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("视频反推分镜"), "reverse page renders title");
assert.ok(appHtml.includes('data-file="reverse-video"'), "reverse page renders video upload input");
assert.ok(appHtml.includes('data-field="reverseVideo.notes"'), "reverse page renders reverse notes input");
assert.ok(appHtml.includes("二创产品"), "reverse page renders remix product selection");
assert.ok(appHtml.includes('data-field="reverseVideo.selectedProductId"'), "reverse page exposes selected remix product field");
assert.ok(appHtml.includes("产品名称"), "reverse page renders selected product name editor");
assert.ok(appHtml.includes('data-product-field="name"'), "reverse page can edit selected product name");
assert.ok(appHtml.includes('data-product-field="imageUrl"'), "reverse page can edit selected product image URL");
assert.ok(appHtml.includes('data-file="product-image"'), "reverse page can upload selected product image");
assert.ok(appHtml.includes('data-field="reverseVideo.secondaryCount"'), "reverse page renders editable secondary count");
assert.ok(appHtml.includes('data-field="reverseVideo.creationStrategy"'), "reverse page renders editable creation strategy");
assert.ok(appHtml.includes('data-action="reverse-storyboard"'), "reverse page exposes reverse storyboard action");
assert.ok(appHtml.includes('data-action="save-reverse-favorite"'), "reverse page exposes save favorite action");
assert.ok(appHtml.includes('data-action="create-reverse-tasks"'), "reverse page exposes secondary creation action");
assert.ok(appHtml.includes("反推结果"), "reverse page renders result panel");
assert.ok(appHtml.includes('data-reverse-script-text'), "reverse page renders one editable Chinese storyboard script textarea");
assert.ok(!appJs.includes("即梦"), "reverse page copy avoids naming a specific downstream video model");
assert.ok(appJs.includes("反推需要支持图片输入的通用大模型"), "reverse page can warn when LLM config cannot see video frames");
assert.ok(!appHtml.includes('data-reverse-scene-field="negativePrompt"'), "reverse page does not expose negative prompt as a default small field");

vm.runInContext(`state.reverseVideo.result = ${JSON.stringify({
  title: "反推分镜",
  summary: "中文反推摘要",
  hook: "原片开场钩子",
  duration: 15,
  ratio: "9:16",
  scenes: [
    {
      time: "0-3s",
      title: "开场",
      visual: "按原片角度展示产品入画。",
      subtitle: "原片字幕",
      camera: "竖屏近景",
      motion: "手持推进",
      voiceover: "照原片语气复述。",
      videoPrompt: "中文视频提示词，复刻原片。",
      negativePrompt: "不要改变镜头角度。",
    },
  ],
})}; view = 'reverse'; renderShell();`, sandbox);
assert.ok(appHtml.includes("可编辑中文反推脚本"), "reverse result uses a Chinese script editor once a result exists");
assert.ok(appHtml.includes("最大程度复刻原视频"), "reverse result script explains source fidelity before regeneration");
assert.ok(appHtml.includes("按原片角度展示产品入画。"), "reverse result script includes scene visual detail");
assert.ok(!appHtml.includes("镜头明细"), "reverse result does not render redundant scene detail disclosure");
assert.ok(!appHtml.includes("reverse-scene-details"), "reverse result removes the scene detail panel");
assert.ok(!appHtml.includes("data-reverse-scene-field"), "reverse result does not render per-scene small fields");
const textOnlyReverseConfig = vm.runInContext("shouldInlineReverseFrames()", sandbox);
assert.strictEqual(textOnlyReverseConfig, false, "default text-only LLM config is not treated as frame-aware reverse config");
vm.runInContext("state.integrations.llm.model = 'gpt-5.5';", sandbox);
const visionReverseConfig = vm.runInContext("shouldInlineReverseFrames()", sandbox);
assert.strictEqual(visionReverseConfig, true, "vision-capable LLM config is treated as frame-aware reverse config");

sandbox.location.hash = "#settings";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("接口配置"), "settings page groups provider settings clearly");
assert.ok(appHtml.includes("http 真实接口"), "settings page exposes real http mode");
assert.ok(!appHtml.includes(["本地", "模拟"].join("")), "settings page does not expose local simulation mode");
assert.ok(!appHtml.includes('value="mock"'), "settings page does not include a mock mode option");
assert.ok(appHtml.includes("视频生成模型"), "settings page exposes video generation settings");
assert.ok(appHtml.includes("通用大模型"), "settings page exposes LLM settings");
assert.ok(appHtml.includes("PostEverywhere 发布"), "settings page exposes publisher settings");

console.log("verify-app ok");
