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
assert.ok(indexHtml.includes("styles.css?v=20260614-product-image-label"), "index cache-busts product image label styles");
assert.ok(indexHtml.includes("core.js?v=20260614-product-image-label"), "index cache-busts product image label core changes");
assert.ok(indexHtml.includes("app.js?v=20260614-product-image-label"), "index cache-busts product image label app changes");
assert.ok(indexHtml.includes("local-config.js"), "index can load local ignored provider config before app startup");
assert.ok(appJs.includes("loadReverseFrameData"), "app can inline extracted reverse frames for vision-capable LLMs");
assert.ok(appJs.includes("openai-vision-chat"), "app documents the vision-capable LLM apiStyle for reverse reconstruction");
assert.ok(appJs.includes("supportsReverseVisionModel"), "app auto-detects vision-capable reverse models");
assert.ok(appJs.includes("gpt-5.5"), "app treats GPT-5.5 as a reverse vision-capable model");
assert.ok(!appJs.includes('text: task.contentPlanText'), "content plan stream completion does not duplicate the final editable plan text");
assert.ok(appJs.includes("storyboardStream"), "app keeps storyboard stream state separate from content plan streaming");
assert.ok(appJs.includes("finalEvent.upstream.ok === false"), "streaming provider failures throw the upstream error before result parsing");
assert.ok(appJs.includes("renderStoryboardScriptEditor"), "create page renders a storyboard script editor");
assert.ok(appJs.includes("data-storyboard-script-text"), "storyboard script editor has a single large editable textarea");
assert.ok(appJs.includes("streamResponseFromRecoveredJson"), "stream provider can recover from completed JSON when the network stream closes before done");
assert.ok(appJs.includes('callProvider("publisher", scheduledPost.providerRequestPreview)'), "confirm schedule submits the post to PostEverywhere for hosted scheduling");
assert.ok(appJs.includes("Core.applyScheduledPostProviderResult"), "confirm schedule stores the platform-hosted scheduling result");
assert.ok(appJs.includes("Core.buildCancelScheduledPostProviderRequest"), "hosted schedule cancellation builds a PostEverywhere DELETE request");
assert.ok(appJs.includes("Core.applyCancelScheduledPostProviderResult"), "hosted schedule cancellation stores the platform cancellation result");
assert.ok(appJs.includes('callProvider("publisher", cancelRequest)'), "hosted schedule cancellation calls the publisher proxy");
assert.ok(appJs.includes("Core.buildRescheduleScheduledPostProviderRequest"), "hosted schedule time update builds a PostEverywhere PATCH request");
assert.ok(appJs.includes("Core.applyRescheduleScheduledPostProviderResult"), "hosted schedule time update stores the platform update result");
assert.ok(appJs.includes('callProvider("publisher", rescheduleRequest)'), "hosted schedule time update calls the publisher proxy");

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
  localUrl: "/outputs/downloads/task-video-review/generated.mp4",
  localPath: "/Users/wy/Documents/ai自动化视频/outputs/downloads/task-video-review/generated.mp4",
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
      integrationProfiles: {
        llm: [
          {
            id: "local-deepseek-v4-pro",
            name: "DeepSeek V4 Pro",
            provider: "deepseek",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-v4-pro",
            apiStyle: "openai-chat",
            config: {
              mode: "http",
              provider: "deepseek",
              apiStyle: "openai-chat",
              endpoint: "https://api.deepseek.com/chat/completions",
              model: "deepseek-v4-pro",
              apiKey: "local-llm-key",
            },
          },
        ],
        video: [
          {
            id: "local-dashscope-wan",
            name: "Wan 2.7 / DashScope",
            provider: "tongyi-wanxiang",
            endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
            model: "wan2.7-i2v-2026-04-25",
            apiStyle: "dashscope-video",
            config: {
              mode: "http",
              provider: "tongyi-wanxiang",
              apiStyle: "dashscope-video",
              endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
              statusEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
              model: "wan2.7-i2v-2026-04-25",
              apiKey: "local-video-key",
            },
          },
          {
            id: "local-toapis-seedance-fast",
            name: "Seedance 2 Fast / ToAPIs",
            provider: "toapis-seedance",
            endpoint: "https://toapis.com/v1/videos/generations",
            model: "seedance-2-fast",
            apiStyle: "toapis-video",
            config: {
              mode: "http",
              provider: "toapis-seedance",
              apiStyle: "toapis-video",
              endpoint: "https://toapis.com/v1/videos/generations",
              statusEndpoint: "https://toapis.com/v1/videos/generations/{task_id}",
              model: "seedance-2-fast",
              apiKey: "local-video-key",
            },
          },
        ],
      },
      activeIntegrationProfileIds: {
        llm: "local-deepseek-v4-pro",
        video: "local-dashscope-wan",
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
assert.ok(appHtml.includes("收藏</span>"), "primary navigation exposes the favorites library");
assert.ok(appHtml.includes("<svg"), "icon rail uses line icons");
assert.ok(appHtml.includes("审核中心"), "review route renders the global review center title");
assert.ok(appHtml.includes("视频预览"), "review route renders the selected task detail");
assert.ok(appHtml.includes("review-triage-board"), "review route uses a triage board layout");
assert.ok(appHtml.includes("review-worklist-panel"), "review queue is rendered as a worklist panel");
assert.ok(appHtml.includes("review-worklist-head"), "review queue has a stable scan header");
assert.ok(appHtml.includes("review-worklist-row"), "review queue renders scan-friendly worklist rows");
assert.ok(appHtml.includes("当前卡点"), "review queue exposes the current blocker column");
assert.ok(appHtml.includes("主操作"), "review queue exposes the primary action column");
assert.ok(appHtml.includes("review-active-decision"), "review detail leads with the active decision panel");
assert.ok(appHtml.includes('class="icon-button review-task-delete"'), "review queue renders a compact task delete control");
assert.ok(appHtml.includes(`data-action="delete-task" data-task-id="${task.id}"`), "review queue delete control targets the queued task");
assert.ok(appHtml.includes('data-review-filter="videoGenerate"'), "review status cards expose video-generation filtering");
assert.ok(appHtml.includes('data-review-filter="videoReview"'), "review status cards expose video-review filtering");
assert.ok(appHtml.includes('data-review-filter="copyReview"'), "review status cards expose copy-review filtering");
assert.ok(appHtml.includes('data-review-filter="ready"'), "review status cards expose publish-confirmation filtering");
assert.ok(appHtml.includes("待视频确认"), "review status cards separate video confirmation from video generation");
assert.ok(appHtml.includes("review-decision-card"), "review summary is reduced to a decision card");
assert.ok(appHtml.includes("review-flow-step"), "review summary shows the video-copy-publish loop");
assert.ok(appHtml.includes("先确认视频能用"), "review summary leads with the current next step");
assert.ok(appHtml.includes("通过并生成文案"), "review summary exposes the main action for video review");
assert.ok(!appHtml.includes("发布页对应状态"), "review summary no longer shows a separate publish status table");
assert.ok(appHtml.includes("<video"), "review page renders a video element when video URL exists");
assert.ok(appHtml.includes("https://example.test/generated.mp4"), "generated video URL is used in the preview");
assert.ok(appHtml.includes('data-action="download-video"'), "review page exposes a local video download action");
assert.ok(!appHtml.includes("打开本地视频"), "review preview does not expose a redundant local-video link");
assert.ok(!appHtml.includes("打开原始视频"), "review preview does not expose a redundant original-video link");
assert.ok(appHtml.includes("视频确认"), "review summary starts the closed loop with video confirmation");
assert.ok(appHtml.includes("文案审核"), "review summary includes copy review in the closed loop");
assert.ok(appHtml.includes("发布确认"), "review summary ends the closed loop with publish confirmation");
assert.ok(appHtml.includes("生成提示词"), "review storyboard exposes model prompts for review");
assert.ok(!appHtml.includes('<button class="button" data-view="publish">查看文案</button>'), "review storyboard panel does not show a copy shortcut before copy review");

vm.runInContext(`
  (() => {
    const videoTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    const copyTask = Object.assign({}, videoTask, {
      id: "task-copy-filter",
      title: "文案筛选任务",
      status: "copy_review",
      copies: {}
    });
    state.tasks.push(copyTask);
    state.selectedTaskId = videoTask.id;
    reviewStatusFilter = "copyReview";
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("文案筛选任务"), "review copy filter shows copy-review tasks");

vm.runInContext(`
  (() => {
    globalThis.__dashboardReviewSelectionState = {
      tasks: state.tasks.slice(),
      selectedTaskId: state.selectedTaskId,
      reviewStatusFilter,
      view
    };
    const baseTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    const latestPlanTask = Object.assign({}, baseTask, {
      id: "task-latest-dashboard-view",
      title: "最新看板任务",
      status: "content_plan_ready",
      variation: { hook: "LATEST DASHBOARD HOOK" },
      video: null,
      copies: {}
    });
    const oldPublishTask = Object.assign({}, baseTask, {
      id: "task-old-publish-view",
      title: "旧待发布视频任务",
      status: "ready_to_publish",
      variation: { hook: "OLD PUBLISH HOOK" },
      video: { url: "https://example.test/old-video.mp4" },
      copies: {
        tiktok: { platformId: "tiktok", platformName: "TikTok", title: "A", body: "B", approved: true }
      }
    });
    state.tasks = [latestPlanTask, oldPublishTask];
    state.selectedTaskId = latestPlanTask.id;
    reviewStatusFilter = "ready";
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("LATEST DASHBOARD HOOK"), "review route keeps the dashboard-selected task even when the previous review filter excludes it");
assert.ok(!appHtml.includes("https://example.test/old-video.mp4"), "review route does not fall back to an older queued video when opening a dashboard-selected task");
vm.runInContext(`reviewStatusFilter = "all"; renderShell();`, sandbox);
assert.ok(appHtml.includes("待生成视频"), "content-plan-ready tasks are clearly labeled as waiting for video generation");
vm.runInContext(`
  (() => {
    const previous = globalThis.__dashboardReviewSelectionState;
    state.tasks = previous.tasks;
    state.selectedTaskId = previous.selectedTaskId;
    reviewStatusFilter = previous.reviewStatusFilter;
    view = previous.view;
    delete globalThis.__dashboardReviewSelectionState;
  })()
`, sandbox);

vm.runInContext(`
  (() => {
    const richTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    richTask.productName = "净饮机";
    richTask.status = "copy_review";
    richTask.storyboard = [
      Object.assign({}, richTask.storyboard[0], {
        title: "挂脖风扇厨房救场",
        visual: "孕妇在厨房佩戴 neck fan 后继续做饭。",
        screenText: [{ text: "Too hot?" }, { text: "Wear the breeze" }],
        productFocus: true
      })
    ];
    richTask.copies = {
      tiktok: { platformId: "tiktok", platformName: "TikTok", title: "A", body: "B", approved: false },
      instagram: { platformId: "instagram", platformName: "Instagram", title: "A", body: "B", approved: false },
      youtube: { platformId: "youtube", platformName: "YouTube", title: "A", body: "B", approved: false },
      threads: { platformId: "threads", platformName: "Threads", title: "A", body: "B", approved: false }
    };
    state.selectedPlatforms = ["tiktok"];
    state.selectedTaskId = richTask.id;
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(!appHtml.includes("[object Object]"), "review storyboard renders object-shaped scene fields as readable text");
assert.ok(appHtml.includes("Too hot?、Wear the breeze"), "review storyboard joins object-shaped screen text values");
assert.ok(!appHtml.includes("产品重点</strong>true"), "review storyboard does not expose boolean scene fields as literal true");
assert.ok(!appHtml.includes("产品与分镜可能不一致"), "review detail does not warn about product/storyboard mismatch");
assert.ok(appHtml.includes("0/1 平台文案已审核"), "review queue counts only currently enabled publishing platforms");
assert.ok(!appHtml.includes("0/4 平台文案已审核"), "review queue does not count disabled historical platform copies");
assert.ok(!appHtml.includes('data-action="approve-video"'), "copy-review detail does not show the disabled video approval action");

vm.runInContext(`
  (() => {
    const copyMissingTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    copyMissingTask.status = "copy_review";
    copyMissingTask.copies = {};
    copyMissingTask.publishResults = {};
    state.selectedPlatforms = ["tiktok"];
    state.selectedTaskId = copyMissingTask.id;
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("文案已被移除，需要重新生成"), "review queue explains copy-review tasks with missing copy");
assert.ok(appHtml.includes("待补文案"), "review detail labels missing copy as a recoverable state");
assert.ok(appHtml.includes('data-action="recover-missing-copies"'), "review detail can regenerate missing platform copy in place");
assert.ok(appHtml.includes('data-action="delete-current-task"'), "review detail can delete an unrecoverable stuck task in place");

vm.runInContext(`
  (() => {
    const copyReviewTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    copyReviewTask.status = "copy_review";
    Core.generateCopies(copyReviewTask, ["tiktok"]);
    copyReviewTask.copies.tiktok.approved = false;
    state.selectedPlatforms = ["tiktok"];
    state.selectedTaskId = copyReviewTask.id;
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("文案待审核"), "review detail labels existing copy-review work");
assert.ok(appHtml.includes('data-action="generate-copies"'), "review detail can regenerate existing platform copy in place");
assert.ok(appHtml.includes("查看并审核文案"), "review detail can jump to the copy page for existing copy-review tasks");

vm.runInContext(`
  (() => {
    const failedVideoTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    failedVideoTask.status = "rejected";
    failedVideoTask.reviewNote = "视频 provider 调用失败：user quota is not enough";
    failedVideoTask.video = { providerStatus: "failed", providerMessage: "user quota is not enough" };
    failedVideoTask.providerResponses = {
      video: {
        ok: false,
        upstream: { status: 403, data: { code: "quota_not_enough", message: "user quota is not enough" } }
      }
    };
    state.selectedTaskId = failedVideoTask.id;
    view = "review";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("余额不足"), "review page translates quota provider errors for operators");
assert.ok(appHtml.includes("充值") || appHtml.includes("切换"), "review page shows the operator action for quota errors");
vm.runInContext(`
  (() => {
    const failedVideoTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    failedVideoTask.status = "video_review";
    failedVideoTask.reviewNote = "";
    failedVideoTask.video = {
      url: "https://example.test/generated.mp4",
      localUrl: "/outputs/downloads/task-video-review/generated.mp4",
      localPath: "/Users/wy/Documents/ai自动化视频/outputs/downloads/task-video-review/generated.mp4",
      provider: "tongyi-wanxiang",
      providerStatus: "SUCCEEDED"
    };
    failedVideoTask.providerResponses = {};
    view = "review";
    renderShell();
  })()
`, sandbox);

vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    Core.approveVideo(publishTask);
    Core.generateCopies(publishTask, ["tiktok"]);
    Core.approveCopy(publishTask, "tiktok");
    publishTask.publishResults = {};
    publishTask.providerResponses = {};
    state.integrations.publisher.mediaIds = "";
    state.scheduleDate = "2026-06-12";
    state.scheduleTime = "09:30";
    state.scheduleTimezone = "Asia/Shanghai";
    copyDetailPlatformId = "tiktok";
    view = "publish";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("缺少 PostEverywhere 媒体 ID"), "publish page blocks TikTok publishing when media ids are missing");
assert.ok(appHtml.includes('data-action="upload-publisher-media"'), "publish page offers media upload when TikTok media is missing");
vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    publishTask.copies.tiktok.approved = false;
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("1 个文案待审核。"), "publish readiness prioritizes pending copy review before media checks");
vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    Core.approveCopy(publishTask, "tiktok");
    publishTask.providerResponses.publisherMedia = {
      ok: true,
      mediaId: "media_from_upload"
    };
    renderShell();
  })()
`, sandbox);
assert.ok(!appHtml.includes("缺少 PostEverywhere 媒体 ID"), "publish page accepts media id returned by publisher upload");
assert.ok(appHtml.includes("媒体 media_from_upload"), "publish row displays media id returned by publisher upload");
vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    publishTask.providerResponses.publisher = {
      ok: false,
      error: "Platform requirements not met: [tiktok] TikTok requires media (video or image)"
    };
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("上次提交失败 · Platform requirements not met"), "publish page labels stale publisher errors as the previous submission result");
assert.ok(!appHtml.includes(">提交失败 · Platform requirements not met"), "publish page avoids presenting stale publisher errors as a fresh failure");
vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    publishTask.providerResponses.publisher = {
      ok: false,
      error: "PostEverywhere TikTok 视频上传当前只支持 MP4，请先转成 video/mp4。当前类型：video/quicktime"
    };
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("视频格式不是 MP4"), "publish page translates video-format publisher errors for operators");
assert.ok(appHtml.includes("转成 MP4"), "publish page shows the operator action for non-MP4 upload errors");
vm.runInContext(`
  state.integrations.publisher.mediaIds = "media_1";
  renderShell();
`, sandbox);
assert.ok(appHtml.includes("中文翻译参考"), "copy detail shows the Chinese translation reference directly");
assert.ok(!appHtml.includes("参考与高级字段"), "copy detail removes the advanced collapsible section");
assert.ok(!appHtml.includes("copy-detail-more"), "copy detail does not hide secondary fields in an advanced section");
assert.ok(!appHtml.includes("实际发布正文"), "copy detail removes the extra publish preview block");
assert.ok(!appHtml.includes("PostEverywhere 请求预览"), "copy detail removes the publisher request preview");
assert.ok(appHtml.includes("文案风格"), "publish page exposes copy style selection");
assert.ok(appHtml.includes('data-field="copyStyle"'), "publish copy style selection is state-backed");
assert.ok(appHtml.includes("痛点解决"), "publish copy style selection includes problem-solution style");
assert.ok(!appHtml.includes("publish-platform-picker"), "publish page does not put platform selection in the top bar");
assert.ok(!appHtml.includes('data-platform-card="instagram"'), "publish page does not show Instagram while TikTok is the only enabled publishing platform");
assert.ok(!appHtml.includes('data-platform-card="youtube"'), "publish page does not show YouTube Shorts while TikTok is the only enabled publishing platform");
assert.ok(!appHtml.includes('data-platform-card="threads"'), "publish page does not show Threads while TikTok is the only enabled publishing platform");
assert.ok(!appHtml.includes("点击选择后可批量生成"), "publish page does not invite users to generate unsupported platform copy");
assert.ok(appHtml.includes("生成 TikTok 文案"), "publish page labels the batch action from the selected platform card");
assert.ok(!appHtml.includes("批量生成已选平台文案"), "publish page avoids referring to hidden selected-platform state");
assert.ok(!appHtml.includes(">生成平台文案<"), "publish page avoids an ambiguous global copy-generation label");
assert.ok(!appHtml.includes('data-action="publish-task"'), "publish page removes confusing global publish action");
const platformSelectionResult = vm.runInContext(`
  (() => {
    state.selectedPlatforms = ["tiktok"];
    const added = setPlatformSelected("instagram", true);
    const labelAfterUnsupportedAdd = selectedCopyGenerationLabel();
    const blocked = setPlatformSelected("tiktok", false);
    const afterBlocked = state.selectedPlatforms.slice();
    state.selectedPlatforms = ["tiktok"];
    renderShell();
    return { added, labelAfterUnsupportedAdd, blocked, afterBlocked };
  })()
`, sandbox);
assert.strictEqual(platformSelectionResult.added, false, "platform card selection does not enable unsupported platforms");
assert.strictEqual(platformSelectionResult.labelAfterUnsupportedAdd, "生成 TikTok 文案", "batch action label stays on TikTok when unsupported platforms are requested");
assert.strictEqual(platformSelectionResult.blocked, false, "platform card selection keeps at least one platform selected");
assert.strictEqual(JSON.stringify(platformSelectionResult.afterBlocked), JSON.stringify(["tiktok"]), "platform card selection does not clear the final selected platform");
assert.ok(appHtml.includes("publish-queue-table"), "publish page renders a compact publishing queue table");
assert.ok(appHtml.includes('data-publish-row="'), "publish page renders compact task rows");
assert.ok(!appHtml.includes("publish-scheduler"), "publish page does not show global scheduling controls");
assert.ok(!appHtml.includes('data-field="publishMode"'), "publish mode is not a global publish page control");
assert.ok(!appHtml.includes('data-field="scheduleDate"'), "schedule date is only shown after choosing schedule for a row");
assert.ok(!appHtml.includes("copy-card selectable-copy-card"), "publish queue does not render large copy cards by default");
assert.ok(appHtml.includes('data-action="open-publish-dialog"'), "approved rows expose a row-level publish dialog action");
assert.ok(appHtml.includes('data-action="open-schedule-dialog"'), "approved rows expose a row-level schedule dialog action");
assert.ok(!appHtml.includes('data-action="upload-publisher-media"'), "rows with TikTok media hide the upload action");
assert.ok(appHtml.includes('data-action="regenerate-copy"'), "compact rows still expose single-copy regeneration");
assert.ok(appHtml.includes("重新生成"), "compact rows keep a regeneration action");
assert.ok(appJs.includes("confirm(`这会重新生成所选平台文案"), "batch copy generation confirms before overwriting existing platform copy");
assert.ok(appJs.includes("Core.buildCopyProviderRequest(state, task, [platformId])"), "single-copy regeneration requests only the clicked platform");
assert.ok(!appHtml.includes('data-action="approve-copy"'), "approved copy card hides the approve action after approval");
assert.ok(!appHtml.includes("第一版会把"), "publish page removes implementation explanation text");
assert.ok(!appHtml.includes("当前为立即发布"), "publish page removes mode helper text");
assert.ok(!appHtml.includes("还没有定时发布任务"), "publish page hides empty scheduled queue");
assert.ok(!appHtml.includes("<strong>文案摘要</strong>"), "publish page removes redundant copy summary block");
assert.ok(!appHtml.includes("批量通过"), "publish page removes non-essential batch approval action");
assert.ok(!appHtml.includes("清空未通过"), "publish page removes non-essential clear action");
assert.ok(!appHtml.includes(`<h1>文案与发布</h1><p class="muted">${task.title}</p>`), "publish page header does not repeat long task title");

vm.runInContext(`
  handleAction({ action: "open-schedule-dialog", taskId: ${JSON.stringify(task.id)}, platform: "tiktok" });
`, sandbox);
assert.ok(appHtml.includes("publish-action-modal"), "schedule action opens a task-level publish modal");
assert.ok(appHtml.includes('data-action="confirm-schedule-copy"'), "schedule modal confirms scheduling for the selected task");
assert.ok(appHtml.includes('data-dialog-field="scheduleDate"'), "schedule date appears inside the modal");
assert.ok(appHtml.includes('data-dialog-field="scheduleTime"'), "schedule time appears inside the modal");
assert.ok(appHtml.includes('data-dialog-field="scheduleTimezone"'), "schedule timezone appears inside the modal");
vm.runInContext(`
  handleAction({ action: "close-publish-dialog" });
  handleAction({ action: "open-publish-dialog", taskId: ${JSON.stringify(task.id)}, platform: "tiktok" });
`, sandbox);
assert.ok(appHtml.includes('data-action="confirm-publish-copy"'), "publish modal confirms immediate publishing for the selected task");
vm.runInContext("handleAction({ action: 'close-publish-dialog' });", sandbox);

vm.runInContext(`
  (() => {
    globalThis.__publishQueuePreviousState = {
      tasks: JSON.parse(JSON.stringify(state.tasks)),
      selectedTaskId: state.selectedTaskId,
      selectedPlatforms: state.selectedPlatforms.slice()
    };
    const firstPublishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    const secondPublishTask = JSON.parse(JSON.stringify(firstPublishTask));
    firstPublishTask.id = "publish-task-one";
    firstPublishTask.title = "第一条待发布视频";
    firstPublishTask.copies.tiktok.title = "First publish card";
    secondPublishTask.id = "publish-task-two";
    secondPublishTask.title = "第二条待发布视频";
    secondPublishTask.copies.tiktok.title = "Second publish card";
    secondPublishTask.status = "ready_to_publish";
    state.tasks = [firstPublishTask, secondPublishTask];
    state.selectedTaskId = firstPublishTask.id;
    state.selectedPlatforms = ["tiktok"];
    view = "publish";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes('data-publish-task-card="publish-task-one"'), "publish page renders the first ready task card");
assert.ok(appHtml.includes('data-publish-task-card="publish-task-two"'), "publish page renders the second ready task card");
assert.ok(appHtml.includes('data-action="open-publish-dialog" data-task-id="publish-task-two" data-platform="tiktok"'), "publish actions carry the clicked ready task id");
vm.runInContext(`
  (() => {
    state.tasks = globalThis.__publishQueuePreviousState.tasks;
    state.selectedTaskId = globalThis.__publishQueuePreviousState.selectedTaskId;
    state.selectedPlatforms = globalThis.__publishQueuePreviousState.selectedPlatforms;
    delete globalThis.__publishQueuePreviousState;
    view = "publish";
    renderShell();
  })()
`, sandbox);

vm.runInContext(`
  (() => {
    const publishTask = state.tasks.find((item) => item.id === ${JSON.stringify(task.id)});
    const scheduledPost = Core.createScheduledPost(state, publishTask, "tiktok", {
      scheduledAt: "2026-06-12T09:30",
      timezone: "Asia/Shanghai"
    });
    Core.applyScheduledPostProviderResult(scheduledPost, {
      ok: true,
      upstream: {
        data: {
          data: {
            post: {
              post_id: "post-hosted-verify",
              status: "scheduled",
              scheduled_for: "2026-06-12T01:30:00.000Z",
              timezone: "UTC"
            }
          }
        }
      }
    });
    view = "publish";
    renderShell();
  })()
`, sandbox);
assert.ok(appHtml.includes("定时发布队列"), "publish page renders the scheduled publishing queue");
assert.ok(appHtml.includes('data-action="cancel-scheduled-post"'), "scheduled publishing queue can cancel posts");
assert.ok(appHtml.includes("取消平台定时"), "platform-hosted scheduled posts expose platform cancellation copy");
assert.match(appHtml, /data-action="reschedule-scheduled-post"[^>]*>\s*更新时间\s*<\/button>/, "platform-hosted scheduled posts keep time editing enabled");
assert.ok(appHtml.includes('data-action="publish-scheduled-now"'), "scheduled publishing queue can publish queued posts now");
assert.ok(appHtml.includes('data-action="reschedule-scheduled-post"'), "scheduled publishing queue can reschedule queued posts");
assert.ok(appHtml.includes("中文翻译参考"), "copy detail still exposes a Chinese reference translation");
assert.ok(!appHtml.includes("首条评论"), "copy detail removes non-essential first-comment editing");
assert.ok(!appHtml.includes("封面标题"), "copy detail removes non-essential cover-title editing");
vm.runInContext(`
  (() => {
    Core.cancelScheduledPost(state, state.scheduledPosts[0].id);
    renderShell();
  })()
`, sandbox);
assert.ok(!appHtml.includes("定时发布队列"), "publish page hides the scheduled queue when every scheduled post is cancelled");
assert.ok(!appHtml.includes("post-hosted-verify"), "publish page removes cancelled scheduled posts from the visible queue");

sandbox.location.hash = "#create";
vm.runInContext(`
  (() => {
    state.products[0].imageData = "data:image/png;base64,AAA";
    state.products[0].imageLabel = "hfahfiajfaf.jpg";
    view = initialView();
    renderShell();
  })()
`, sandbox);
assert.ok(!appHtml.includes("hfahfiajfaf"), "create page does not show short opaque uploaded image filenames");
assert.ok(appHtml.includes("上传图：本地上传图片"), "create page uses a generic uploaded image label for random filenames");
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
assert.ok(appHtml.includes('data-dashboard-date-range="today"'), "dashboard exposes a today date range filter");
assert.ok(appHtml.includes('data-dashboard-date-range="7d"'), "dashboard exposes a recent-days date range filter");
assert.ok(appHtml.includes('data-dashboard-date-field="start"'), "dashboard exposes custom start date input");
assert.ok(appHtml.includes('data-dashboard-date-field="end"'), "dashboard exposes custom end date input");
vm.runInContext(`
  (() => {
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 10, 0, 0).toISOString();
    const baseTask = state.tasks[0];
    state.tasks = [
      Object.assign({}, baseTask, {
        id: "task-storyboard",
        title: "分镜就绪任务",
        status: "storyboard_ready",
        createdAt: yesterday,
        updatedAt: yesterday
      }),
      Object.assign({}, baseTask, {
        id: "task-video-review",
        title: "视频审核任务",
        status: "video_review",
        createdAt: startToday,
        updatedAt: startToday
      })
    ];
    dashboardFilter = "videoReview";
    dashboardDateRange = "today";
    renderShell();
  })()
`, sandbox);
const filteredDashboardHtml = appHtml;
assert.ok(filteredDashboardHtml.includes("视频审核任务"), "video review dashboard filter shows matching tasks");
assert.ok(!filteredDashboardHtml.includes("分镜就绪任务"), "video review dashboard filter hides non-matching tasks");
assert.ok(filteredDashboardHtml.includes("筛选：待视频审核"), "dashboard list header names the active filter");
assert.ok(filteredDashboardHtml.includes("日期：今日"), "dashboard list header names the active date range");
vm.runInContext(`
  dashboardFilter = "all";
  dashboardDateRange = "7d";
  renderShell();
`, sandbox);
assert.ok(appHtml.includes("分镜就绪任务"), "recent-days dashboard date filter includes earlier tasks");
assert.ok(appHtml.includes("视频审核任务"), "recent-days dashboard date filter keeps today's tasks");
assert.ok(appHtml.includes("日期：近 7 天"), "dashboard list header names recent-days date range");
assert.ok(appHtml.includes("task-title-block"), "dashboard task rows use a compact title block");
assert.ok(appHtml.includes("task-meta-line"), "dashboard task rows keep duration and ratio in one metadata line");
assert.ok(appHtml.includes("task-source-chip"), "dashboard source and strategy values are visually de-emphasized");
assert.ok(appHtml.includes("task-actions"), "dashboard row actions are grouped in compact controls");

sandbox.location.hash = "#favorites";
vm.runInContext(`
  state.favorites = [
    {
      id: "fav-video",
      type: "视频",
      name: "视频任务 · 净饮机",
      content: "视频地址：https://files.example.test/video.mp4 产品：净饮机 开头：厨房过热场景 状态：待文案审核",
      tags: ["视频", "净饮机", "待文案审核"],
      score: 82,
      reuseCount: 0
    },
    {
      id: "fav-story",
      type: "分镜脚本",
      name: "US TikTok Product Showcase Template",
      content: "A customizable short video structure designed for high engagement on TikTok with quick cuts and clear CTA.",
      tags: ["反推分镜", "视频拆解"],
      score: 80,
      reuseCount: 12
    }
  ];
  view = initialView();
  renderShell();
`, sandbox);
assert.ok(appHtml.includes("收藏库"), "favorites page is labeled as a library");
assert.ok(appHtml.includes("favorite-workbench-screen"), "favorites page uses a workbench layout");
assert.ok(appHtml.includes("favorite-insight-strip"), "favorites page summarizes library composition");
assert.ok(appHtml.includes("favorite-command-bar"), "favorites library has a compact command bar");
assert.ok(appHtml.includes("favorite-workbench-layout"), "favorites library uses asset list plus action panel layout");
assert.ok(appHtml.includes("favorite-asset-list-panel"), "favorites library renders an asset list panel");
assert.ok(appHtml.includes("favorite-usage-panel"), "favorites library renders a usage panel instead of a duplicated preview");
assert.ok(appHtml.includes("favorite-asset-row"), "favorites library renders scan-friendly asset rows");
assert.ok(appHtml.includes('data-action="select-favorite"'), "favorites library lets users select an asset without leaving the page");
assert.ok(appHtml.includes('data-action="use-favorite-for-create"'), "favorites library can carry an asset into the content planning flow");
assert.ok(appHtml.includes('data-action="use-favorite-for-reverse"'), "favorites library can carry an asset into the reverse remix flow");
assert.ok(appHtml.includes("下一步动作"), "favorites selected panel leads with next actions");
assert.ok(!appHtml.includes("详情预览"), "favorites page removes the redundant detail preview label");
assert.ok(appHtml.includes("<summary>新增收藏</summary>"), "manual favorite form is collapsed behind a details summary");
assert.ok(appHtml.includes('data-favorites-search'), "favorites library exposes search");
assert.ok(appHtml.includes('data-favorites-type'), "favorites library exposes type filter");
assert.ok(appHtml.includes("全部类型"), "favorites library includes an all-types filter");
assert.ok(appHtml.includes("新增收藏"), "favorites library keeps manual add form");
assert.ok(appHtml.includes("还没有收藏内容") || appHtml.includes("favorite-asset-row"), "favorites library renders empty state or asset rows");
vm.runInContext(`handleAction({ action: "use-favorite-for-reverse", favoriteId: "fav-story" });`, sandbox);
assert.strictEqual(vm.runInContext(`state.reverseVideo.selectedFavoriteId`, sandbox), "fav-story", "favorite reverse action selects the asset in reverse workflow state");
assert.strictEqual(vm.runInContext(`view`, sandbox), "reverse", "favorite reverse action opens the reverse workflow");
vm.runInContext(`handleAction({ action: "use-favorite-for-create", favoriteId: "fav-story" });`, sandbox);
assert.strictEqual(vm.runInContext(`view`, sandbox), "create", "favorite create action opens the content planning workflow");
assert.ok(vm.runInContext(`state.contentBrief.seed.includes("参考收藏：US TikTok Product Showcase Template")`, sandbox), "favorite create action carries the selected asset into the planning seed");
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
vm.runInContext(`view = initialView(); reviewStatusFilter = "all"; state.selectedTaskId = ${JSON.stringify(task.id)}; storyboardEditorOpen = true; storyboardEditorSceneIndex = 0; renderShell();`, sandbox);
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
assert.ok(!appHtml.includes("create-storyboard-preview"), "create page does not render the redundant storyboard preview below the editor");
assert.ok(!appHtml.includes("storyboard-read-head"), "create page does not duplicate generated storyboard rows below the editor");
assert.ok(!appJs.includes('view = "review";\\n      finishPending(action);'), "storyboard generation keeps the user on the create page");
assert.ok(!appHtml.includes("[object Object]"), "create page renders object-shaped plan fields as readable text");
vm.runInContext(`
  (() => {
    const previousTasks = state.tasks.slice();
    const previousSelectedTaskId = state.selectedTaskId;
    const staleTask = Core.createContentPlanTask(state, {
      contentPlan: {
        productUnderstanding: "挂脖风扇",
        targetAudience: "TikTok 美国用户",
        keySellingPoints: [{ point: "Hands-free", expression: "不需要一直手持风扇" }],
        usageScenarios: ["commute"],
        painPoints: [{ problem: "夏天排队太热", scene: "户外咖啡店门口" }],
        strategy: "娱乐化夏日反差短剧",
        hook: "POV: You stepped outside in July"
      }
    });
    staleTask.contentPlanText = "# 主要卖点\\n[object Object]";
    state.tasks = [staleTask];
    state.selectedTaskId = staleTask.id;
    view = "create";
    renderShell();
    state.tasks = previousTasks;
    state.selectedTaskId = previousSelectedTaskId;
  })()
`, sandbox);
const staleContentPlanHtml = appHtml;
assert.ok(!staleContentPlanHtml.includes("[object Object]"), "create page repairs stale saved content plan text before display");
assert.ok(staleContentPlanHtml.includes("Hands-free"), "create page rebuilds stale content plan text from structured plan data");
assert.ok(appHtml.includes("进入审核生成视频"), "create page links generated plans to review");
assert.ok(appHtml.includes('data-action="enter-review-video"'), "review transition is an explicit user action");
assert.ok(appHtml.includes("生成数量"), "create page exposes video batch count beside review entry");
assert.ok(appHtml.includes('data-field="contentBrief.videoBatchCount"'), "create page video batch count is editable");
assert.ok(appHtml.includes('<option value="6"'), "create page video batch count includes 6");
assert.ok(appHtml.includes('<option value="9"'), "create page video batch count includes 9");
assert.ok(appHtml.includes('<option value="10"'), "create page video batch count includes 10");
assert.ok(appHtml.includes('data-field="contentBrief.videoCreationStrategy"'), "create page video generation strategy is editable");
assert.ok(appHtml.includes("原内容 + 平台风格"), "create page reuses reverse generation strategy labels");
assert.ok(appHtml.includes("清晰度"), "create page exposes video resolution beside review entry");
assert.ok(appHtml.includes('data-field="contentBrief.videoResolution"'), "create page video resolution is editable");
assert.ok(appHtml.includes('<option value="720p" selected'), "create page defaults video resolution to 720p");
assert.ok(appHtml.includes('<option value="480p"'), "create page video resolution includes 480p");
assert.ok(appHtml.includes('<option value="1080p"'), "create page video resolution includes 1080p");
assert.ok(!appHtml.includes("create-action-bar"), "create page no longer parks editor actions under the storyboard box");
assert.ok(!appHtml.includes('data-action="create-batch"'), "create page does not expose batch storyboard generation");
assert.ok(!appHtml.includes('data-action="generate-content-brief"'), "create page does not expose brief-only generation");
assert.ok(!appHtml.includes("favorite-compact"), "create page does not restore the old inline favorite picker");
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
    state.contentBrief.videoResolution = "1080p";
    handleAction({ action: "enter-review-video" });
    return {
      view,
      taskCount: state.tasks.length,
      selectedStatus: state.tasks.find((item) => item.id === state.selectedTaskId).status,
      variantCount: state.tasks.filter((item) => item.source === "content-plan-batch").length,
      strategy: state.tasks[0].strategy,
      videoResolution: state.tasks[0].videoResolution,
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
  videoResolution: "1080p",
  instruction: "按「原内容 + 平台风格」生成视频变体：平台风格 1。保持同一套已确认分镜，不重新生成分镜。",
}, "create review entry creates multiple same-storyboard video tasks with selected strategy");

sandbox.location.hash = "#reverse";
vm.runInContext("view = initialView(); renderShell();", sandbox);
assert.ok(appHtml.includes("视频反推分镜"), "reverse page renders title");
assert.ok(appHtml.includes('data-file="reverse-video"'), "reverse page renders video upload input");
assert.ok(appHtml.includes('data-field="reverseVideo.notes"'), "reverse page renders reverse notes input");
assert.ok(appHtml.includes("二创设置"), "reverse page uses a concise remix settings panel");
assert.ok(appHtml.includes("二创产品"), "reverse page renders remix product selection");
assert.ok(appHtml.includes('data-field="reverseVideo.selectedProductId"'), "reverse page exposes selected remix product field");
assert.ok(!appHtml.includes("产品名称"), "reverse page removes the duplicate selected product name editor");
assert.ok(!appHtml.includes('data-product-field="name"'), "reverse page no longer edits product name from the remix panel");
assert.ok(appHtml.includes('data-product-field="imageUrl"'), "reverse page can edit selected product image URL");
assert.ok(appHtml.includes('data-file="product-image"'), "reverse page can upload selected product image");
assert.ok(appHtml.includes('data-field="reverseVideo.secondaryCount"'), "reverse page renders editable secondary count");
assert.ok(appHtml.includes('data-field="reverseVideo.creationStrategy"'), "reverse page renders editable creation strategy");
assert.ok(appHtml.includes('data-action="reverse-storyboard"'), "reverse page exposes reverse storyboard action");
assert.ok(appHtml.includes('data-action="save-reverse-favorite"'), "reverse page exposes save favorite action");
assert.ok(appHtml.includes('data-action="create-reverse-tasks"'), "reverse page exposes secondary creation action");
assert.ok(appHtml.includes("反推结果"), "reverse page renders result panel");
assert.ok(appHtml.includes('data-reverse-script-text'), "reverse page renders one editable Chinese storyboard script textarea");
assert.ok(!appHtml.includes("上传参考视频，抽取关键帧"), "reverse page removes redundant header explanation");
assert.ok(!appHtml.includes("支持 mp4、mov、webm"), "reverse uploader removes file-format helper copy");
assert.ok(!appHtml.includes("处理状态"), "reverse page removes passive status panel title");
assert.ok(!appHtml.includes("关键帧"), "reverse settings hides passive frame count");
assert.ok(!appHtml.includes("产品素材"), "reverse settings hides passive product material status");
assert.ok(!appHtml.includes("<div><span>收藏</span>"), "reverse settings hides passive favorite status row");
assert.ok(!appHtml.includes("结果会自动保存"), "reverse result removes redundant save/edit helper copy");
assert.ok(!appJs.includes("即梦"), "reverse page copy avoids naming a specific downstream video model");
assert.ok(appJs.includes("反推需要支持图片输入的通用大模型"), "reverse page can warn when LLM config cannot see video frames");
assert.ok(!appHtml.includes('data-reverse-scene-field="negativePrompt"'), "reverse page does not expose negative prompt as a default small field");

vm.runInContext(`state.reverseVideo.upload = {
  id: "upload_verify",
  fileName: "微信视频_20260609093018.mp4",
  url: "/outputs/uploads/upload_verify/微信视频_20260609093018.mp4",
  mimeType: "video/mp4",
  size: 1024,
  uploadedAt: "2026-06-11T00:00:00.000Z",
}; view = 'reverse'; renderShell();`, sandbox);
assert.ok(appHtml.includes("reverse-video-player"), "reverse upload renders the compact video player");
assert.ok(!appHtml.includes("<strong>微信视频_20260609093018.mp4</strong>"), "reverse upload does not render the uploaded filename block");
assert.ok(!appHtml.includes("reverse-upload-path"), "reverse upload does not render the upload path block");

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
assert.ok(!appHtml.includes("原片开场钩子</span>"), "reverse result hides the hook badge");
assert.ok(!appHtml.includes("中文反推摘要</p>"), "reverse result hides the summary line");
assert.ok(!appHtml.includes("直接改这一整段中文"), "reverse script editor removes instructional helper copy");
assert.ok(!appHtml.includes("镜头明细"), "reverse result does not render redundant scene detail disclosure");
assert.ok(!appHtml.includes("reverse-scene-details"), "reverse result removes the scene detail panel");
assert.ok(!appHtml.includes("data-reverse-scene-field"), "reverse result does not render per-scene small fields");
const textOnlyReverseConfig = vm.runInContext("shouldInlineReverseFrames()", sandbox);
assert.strictEqual(textOnlyReverseConfig, false, "default text-only LLM config is not treated as frame-aware reverse config");
vm.runInContext("state.integrations.llm.model = 'gpt-5.5';", sandbox);
const visionReverseConfig = vm.runInContext("shouldInlineReverseFrames()", sandbox);
assert.strictEqual(visionReverseConfig, true, "vision-capable LLM config is treated as frame-aware reverse config");

sandbox.location.hash = "#settings";
vm.runInContext(`
  state.connectionTests = state.connectionTests || {};
  state.connectionTests.llm = {
    ok: true,
    provider: "deepseek",
    checkedAt: "2026-06-14T00:00:00.000Z",
    message: "真实接口连接成功。",
    warnings: ["注意：当前模型反推不可用。DeepSeek 文本模型不能读取关键帧图片；如需反推，请切换支持图片输入的视觉模型。"],
    capabilities: { reverseStoryboard: false }
  };
  view = initialView();
  renderShell();
`, sandbox);
assert.ok(appHtml.includes("必要配置"), "settings page is reduced to necessary configuration");
assert.ok(!appHtml.includes("接口配置"), "settings page removes broad integration configuration wrapper");
assert.ok(!appHtml.includes("http 真实接口"), "settings page hides fixed http mode");
assert.ok(!appHtml.includes(["本地", "模拟"].join("")), "settings page does not expose local simulation mode");
assert.ok(!appHtml.includes('value="mock"'), "settings page does not include a mock mode option");
assert.ok(appHtml.includes("视频生成模型"), "settings page exposes video generation settings");
assert.ok(appHtml.includes("通用大模型"), "settings page exposes LLM settings");
assert.ok(appHtml.includes("PostEverywhere 发布"), "settings page exposes publisher settings");
assert.ok(appHtml.includes("模型切换"), "settings page restores model switching");
assert.ok(appHtml.includes("大模型"), "settings page renders saved LLM profile library");
assert.ok(appHtml.includes("视频模型"), "settings page renders saved video profile library");
assert.ok(appHtml.includes("model-switch-console"), "settings page uses a compact model switch console");
assert.ok(appHtml.includes("compact-integration-card"), "settings page uses compact integration cards");
assert.ok(appHtml.includes('data-action="apply-integration-profile"'), "settings page can enable a saved model profile");
assert.ok(appHtml.includes('data-action="save-integration-profile"'), "settings page can save the current model profile");
assert.ok(appHtml.includes("DeepSeek V4 Pro"), "settings page shows local LLM profile");
assert.ok(appHtml.includes("Seedance 2 Fast / ToAPIs"), "settings page shows local video model alternatives");
assert.ok(appHtml.includes("连接正常"), "settings page keeps a successful LLM connection test as normal");
assert.ok(appHtml.includes("当前模型反推不可用"), "settings page shows reverse-storyboard warning after successful DeepSeek connection test");
assert.ok(appJs.includes("连接测试通过，但当前模型反推不可用"), "connection test toast distinguishes partial capability warnings from full success");
assert.ok(!appHtml.includes("当前请求/响应预览"), "settings page removes request preview");
assert.ok(!appHtml.includes("默认发布平台"), "settings page removes platform settings block");
assert.ok(!appHtml.includes("工作区 ID"), "settings page hides optional publisher workspace id");
assert.ok(appHtml.includes("PostEverywhere Media IDs"), "settings page exposes required publisher media ids for TikTok");

vm.runInContext(`handleAction({
  action: "apply-integration-profile",
  profileKey: "video",
  profileId: "local-toapis-seedance-fast",
});`, sandbox);
assert.strictEqual(vm.runInContext("state.integrations.video.model", sandbox), "seedance-2-fast", "saved video profile switching updates the active video model");
assert.strictEqual(vm.runInContext("state.activeIntegrationProfileIds.video", sandbox), "local-toapis-seedance-fast", "saved video profile switching updates the active profile id");

console.log("verify-app ok");
