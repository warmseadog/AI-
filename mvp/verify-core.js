const assert = require("assert");
const Core = require("./core.js");

function assertNoDemoWaterText(value, label) {
  const text = JSON.stringify(value);
  [
    ["净", "饮", "机"].join(""),
    ["饮", "水"].join(""),
    ["温", "水"].join(""),
    ["烧", "水"].join(""),
    ["冲", "奶"].join(""),
    ["泡", "茶"].join(""),
    ["水", "温"].join(""),
  ].forEach((term) => {
    assert.ok(!text.includes(term), `${label} should not include demo water term: ${term}`);
  });
}

function assertNoChineseText(value, label) {
  assert.ok(!/[\u3400-\u9fff]/.test(String(value || "")), `${label} should not include Chinese text`);
}

function userMessagePayload(request) {
  const message = request.body.messages.find((item) => item.role === "user");
  if (Array.isArray(message.content)) {
    const textPart = message.content.find((part) => part.type === "text");
    return JSON.parse(textPart.text);
  }
  return JSON.parse(message.content);
}

function userVisionParts(request) {
  const message = request.body.messages.find((item) => item.role === "user");
  return Array.isArray(message.content) ? message.content : [];
}

const state = Core.createInitialState();
assert.strictEqual(state.schemaVersion, 2, "initial state uses real-flow schema version");
assert.deepStrictEqual(state.reverseVideo, {
  upload: null,
  frames: [],
  result: null,
  selectedFavoriteId: "",
  selectedProductId: "product-draft",
  secondaryCount: 3,
  creationStrategy: "rewrite",
  notes: "",
  status: "idle",
  error: "",
}, "initial state includes empty reverse video workspace");
assert.strictEqual(state.products[0].name, "", "default product name starts empty");
assert.strictEqual(state.products[0].imageUrl, "", "default product image URL starts empty");
assert.strictEqual(state.products[0].imageData, "", "default uploaded image starts empty");
assert.strictEqual(state.contentBrief.seed, "", "default idea input starts empty");
assert.strictEqual(state.contentBrief.text, "", "default generated plan text starts empty");
assert.strictEqual(state.contentBrief.storyboardSceneCount, "auto", "default storyboard scene count is automatic");
assert.strictEqual(state.contentBrief.storyboardDetailLevel, "detailed", "default storyboard detail level asks for detailed scenes");
assert.strictEqual(state.contentBrief.videoResolution, "720p", "default video resolution is 720p");
assert.deepStrictEqual(state.favorites, [], "default state has no seeded favorites");
assert.deepStrictEqual(state.tasks, [], "default state has no seeded tasks");
assert.deepStrictEqual(state.scheduledPosts, [], "default state has no scheduled publishing queue");
assert.strictEqual(state.integrations.llm.mode, "http", "LLM defaults to real HTTP mode");
assert.strictEqual(state.integrations.llm.provider, "custom-llm", "LLM defaults to the custom GPT-5.5 provider");
assert.strictEqual(state.integrations.llm.model, "gpt-5.5", "LLM defaults to GPT-5.5");
assert.strictEqual(state.integrations.llm.endpoint, "https://toapis.com/v1/chat/completions", "LLM defaults to the GPT-5.5 ToAPIs chat endpoint");
assert.strictEqual(state.integrations.video.mode, "http", "video defaults to real HTTP mode");
assert.strictEqual(state.integrations.publisher.mode, "http", "publisher defaults to real HTTP mode");
assert.deepStrictEqual(state.selectedPlatforms, ["tiktok"], "default publishing platform is TikTok only");
assert.deepStrictEqual(Core.publishPlatforms.map((platform) => platform.id), ["tiktok"], "enabled publishing platforms are limited to TikTok");
assertNoDemoWaterText(state, "initial state");

const quotaIssue = Core.explainProviderIssue({
  ok: false,
  upstream: { status: 403, data: { code: "quota_not_enough", message: "user quota is not enough" } },
});
assert.strictEqual(quotaIssue.title, "余额不足", "quota errors get an operator-readable title");
assert.ok(quotaIssue.action.includes("充值") || quotaIssue.action.includes("切换"), "quota errors explain the next operator action");

const timeoutIssue = Core.explainProviderIssue({
  ok: false,
  error: "<!DOCTYPE html><title>toapis.com | 524: A timeout occurred</title>",
});
assert.strictEqual(timeoutIssue.title, "接口超时", "Cloudflare timeout errors get an operator-readable title");
assert.ok(timeoutIssue.action.includes("稍后重试"), "timeout errors tell the operator to retry later");

const emptyModelIssue = Core.explainProviderIssue({
  ok: false,
  error: "上游没有返回内容：收到空的流式响应，没有 message.content 或 output_text。",
});
assert.strictEqual(emptyModelIssue.title, "模型无返回", "empty model responses get an operator-readable title");
assert.ok(emptyModelIssue.action.includes("重新生成"), "empty responses tell the operator to regenerate");

const stillGeneratingIssue = Core.explainProviderIssue({
  output: { task_status: "PENDING", task_id: "task-123" },
}, { kind: "video", status: "video_generating" });
assert.strictEqual(stillGeneratingIssue.title, "视频仍在生成", "pending video status gets an operator-readable title");
assert.ok(stillGeneratingIssue.action.includes("查询视频结果"), "pending video status explains the next poll action");

const publisherAccountIssue = Core.explainProviderIssue("缺少 PostEverywhere 账号 ID。", { kind: "publisher" });
assert.strictEqual(publisherAccountIssue.title, "发布账号没配置", "missing publisher account gets an operator-readable title");
assert.ok(publisherAccountIssue.action.includes("集成设置"), "missing publisher account points to settings");

const mp4Issue = Core.explainProviderIssue({
  ok: false,
  error: "PostEverywhere TikTok 视频上传当前只支持 MP4，请先转成 video/mp4。当前类型：video/quicktime",
});
assert.strictEqual(mp4Issue.title, "视频格式不是 MP4", "unsupported video format gets an operator-readable title");
assert.ok(mp4Issue.action.includes("MP4"), "unsupported video format tells the operator to convert to MP4");

const migratedPlatformState = Core.migrateState({
  schemaVersion: 2,
  selectedPlatforms: ["instagram", "youtube", "threads"],
});
assert.deepStrictEqual(migratedPlatformState.selectedPlatforms, ["tiktok"], "migration does not keep unsupported publishing platforms enabled");

const migratedMixedPlatformState = Core.migrateState({
  schemaVersion: 2,
  selectedPlatforms: ["tiktok", "instagram"],
});
assert.deepStrictEqual(migratedMixedPlatformState.selectedPlatforms, ["tiktok"], "migration keeps only TikTok when saved state includes extra platforms");

const oldState = Core.migrateState({
  products: [{ id: "old", imageUrl: "https://demo.test/old.png", imageLabel: ["净", "饮", "机"].join("") }],
  favorites: [{ id: "fav-old", name: `${["净", "饮", "机"].join("")}收藏`, tags: [["净", "饮", "机"].join("")], content: ["温", "水"].join("") }],
  tasks: [{ id: "task-old", title: `${["净", "饮", "机"].join("")}任务` }],
  contentBrief: { seed: ["净", "饮", "机"].join(""), text: ["温", "水"].join("") },
  integrations: {
    llm: {
      mode: "mock",
      provider: "openai-compatible",
      endpoint: "https://example.test/chat/completions",
      model: "custom-model",
      apiKey: "old-key",
    },
  },
});
assert.strictEqual(oldState.products[0].imageUrl, "", "legacy migration drops seeded product image");
assert.deepStrictEqual(oldState.favorites, [], "legacy migration drops seeded favorites");
assert.deepStrictEqual(oldState.tasks, [], "legacy migration drops seeded tasks");
assert.strictEqual(oldState.contentBrief.seed, "", "legacy migration drops seeded idea");
assert.strictEqual(oldState.integrations.llm.apiKey, "old-key", "legacy migration preserves integration key");
assert.strictEqual(oldState.integrations.llm.mode, "http", "legacy mock integration is upgraded to http");
assertNoDemoWaterText(oldState, "migrated state");

assert.throws(() => Core.buildContentPlanProviderRequest(state), /至少提供一张图片素材/, "content planning requires product image material");
state.products[0].imageUrl = "https://example.test/neck-fan.png";
assert.throws(() => Core.buildContentPlanProviderRequest(state), /请先输入产品想法/, "content planning requires idea text");

state.contentBrief.seed = "我想在 TikTok 美国地区售卖一款挂脖风扇，主打通勤、户外和夏天降温。";
const planRequest = Core.buildContentPlanProviderRequest(state);
assert.strictEqual(planRequest.provider, state.integrations.llm.provider, "content plan request uses configured LLM provider");
assert.strictEqual(planRequest.mode, "http", "content plan request is real HTTP mode");
assert.ok(Array.isArray(planRequest.body.messages), "content plan request uses chat messages");
const planPayload = userMessagePayload(planRequest);
assert.strictEqual(planPayload.idea, state.contentBrief.seed, "content plan request includes user idea");
assert.strictEqual(planPayload.materials.length, 1, "content plan request includes image material");
assert.strictEqual(planPayload.materials[0].url, "https://example.test/neck-fan.png", "content plan request includes product image URL");
assert.strictEqual(planPayload.outputLanguage.language, "zh-CN", "content plan request requires readable Chinese output");
assert.ok(JSON.stringify(planRequest.body).includes("所有面向运营审核的可读字段必须使用简体中文"), "content plan system prompt requires Chinese readable fields");
assert.ok(JSON.stringify(planRequest.body).includes("至少 80%"), "content plan request enforces mostly Chinese output");
assert.ok(JSON.stringify(planRequest.body).includes("不允许整段英文输出"), "content plan request rejects English-only sections");
assert.strictEqual(planPayload.duration, 15, "content plan request asks for 15 second plan");
assert.strictEqual(planPayload.ratio, "9:16", "content plan request asks for vertical video");
assert.ok(!planPayload.outputFields.includes("scenes"), "content plan request does not ask for scenes");
assert.ok(!planPayload.outputFields.includes("videoPrompt"), "content plan request does not ask for video prompts");
assert.ok(planPayload.outputFields.includes("painPoints"), "content plan request asks for pain points");
assert.ok(planPayload.outputFields.includes("mustShow"), "content plan request asks for must-show visual requirements");
assert.ok(!planPayload.outputFields.includes("storyboardGuidance"), "content plan request does not ask for storyboard guidance");
assertNoDemoWaterText(planRequest, "content plan request");

const toapisPreset = Core.videoProviders.find((provider) => provider.id === "toapis-seedance");
assert.strictEqual(toapisPreset.name, "Seedance 2 / ToAPIs", "ToAPIs provider label covers standard and fast profiles");

const created = Core.createContentPlanTask(state, {
  contentPlan: {
    productUnderstanding: "挂脖风扇，免手持，适合夏季通勤和户外排队。",
    targetAudience: "TikTok 美国用户，通勤、露营、户外运动人群。",
    keySellingPoints: ["hands-free", "portable", "summer cooling"],
    usageScenarios: ["commute", "walking dog", "outdoor queue"],
    strategy: "用热浪痛点开场，快速展示佩戴和三档风速。",
    hook: "Hot commute? Wear the breeze.",
    reviewSummary: "确认降温说法不要夸大为医疗效果。",
    complianceNotes: ["避免承诺绝对降温温度", "不要暗示医疗功效"],
    scenes: [
      {
        time: "0-3s",
        title: "热浪痛点",
        visual: "地铁站外，用户满头汗，双手拿包无法手持风扇。",
        subtitle: "Too hot to hold another gadget?",
        camera: "9:16 close-up, quick push in",
        motion: "sweat wipe, then reveal neck fan",
        voiceover: "Summer commute gets hot fast.",
        screenText: "Hands-free cooling",
        imagePrompt: "neck fan product, commuter lifestyle, vertical ad",
        videoPrompt: "3 seconds vertical video, hot commute pain point, wearable neck fan reveal",
        productFocus: "hands-free wearing",
        reviewChecklist: ["产品是否完整露出", "字幕是否短"],
        riskNotes: ["不承诺具体降温度数"],
      },
    ],
  },
  providerRequest: planRequest,
  providerResponse: { ok: true },
});
assert.strictEqual(created.status, "content_plan_ready", "created task waits for content plan review");
assert.strictEqual(created.productName, "产品", "blank product name falls back to generic product name");
assert.deepStrictEqual(created.storyboard, [], "content planning does not prefill storyboard scenes");
assert.strictEqual(created.storyboardTimingStatus, "not_started", "content plan task records that storyboard generation has not started");
assert.strictEqual(state.tasks[0].id, created.id, "created content plan task is persisted");
assertNoDemoWaterText(created, "created content plan task");

const objectListState = Core.createInitialState();
const objectListTask = Core.createContentPlanTask(objectListState, {
  contentPlan: {
    productUnderstanding: "挂脖风扇",
    targetAudience: "TikTok 美国用户",
    keySellingPoints: [{ point: "Hands-free", expression: "不需要手持风扇" }],
    usageScenarios: ["commute"],
    painPoints: [{ problem: "夏天排队太热", scene: "户外咖啡店门口" }],
    strategy: "娱乐化夏日反差短剧",
    hook: "POV: You stepped outside in July",
  },
});
assert.ok(!objectListTask.contentPlan.keySellingPoints.includes("[object Object]"), "object-shaped plan list items are not stringified as [object Object]");
assert.ok(objectListTask.contentPlan.keySellingPoints[0].includes("Hands-free"), "object-shaped selling points keep readable object content");
assert.ok(objectListTask.contentPlan.painPoints[0].includes("夏天排队太热"), "object-shaped pain points keep readable object content");

const randomImageNameState = Core.createInitialState();
const randomImageProduct = randomImageNameState.products[0];
randomImageProduct.imageData = "data:image/png;base64,AAA";
randomImageProduct.imageLabel = "IMG_8F3A92C7";
randomImageNameState.contentBrief.seed = "我想做一条净饮机短视频，突出厨房场景。";
const randomImagePlanRequest = Core.buildContentPlanProviderRequest(randomImageNameState);
const randomImagePlanPayload = userMessagePayload(randomImagePlanRequest);
const randomImageNeedle = "IMG_8F3A92C7";
assert.strictEqual(randomImagePlanPayload.materials[0].label, "上传产品图", "uploaded image material uses a generic label when product name is blank");
assert.ok(!JSON.stringify(randomImagePlanRequest).includes(randomImageNeedle), "content plan request does not leak random image filenames");
const randomImageTask = Core.createContentPlanTask(randomImageNameState, {
  contentPlan: {
    productUnderstanding: "台面净饮机，适合厨房和办公室。",
    targetAudience: "家庭用户。",
    keySellingPoints: ["免安装", "即热"],
    usageScenarios: ["厨房", "办公室"],
    strategy: "痛点解决",
    hook: "Tired of boiling water?",
    reviewSummary: "避免夸大净化效果。",
    complianceNotes: ["不承诺医疗功效"],
    scenes: [],
  },
});
assert.strictEqual(randomImageTask.productName, "产品", "blank product name falls back to generic product name, not image filename");
assert.ok(!randomImageTask.title.includes(randomImageNeedle), "task title does not include random image filename");
randomImageTask.storyboard = Core.normalizeStoryboardTiming([
  {
    time: "0-3s",
    title: "厨房痛点",
    visual: "用户在厨房等待热水，随后展示产品。",
    subtitle: "Still boiling water?",
    camera: "9:16 close-up",
    motion: "quick reveal",
    videoPrompt: "vertical video, product reveal in a kitchen",
  },
], 15);
randomImageTask.storyboardTimingStatus = randomImageTask.storyboard.timingStatus;
const randomImageVideoRequest = Core.buildVideoProviderRequest(randomImageNameState, randomImageTask, randomImageProduct);
assert.ok(!JSON.stringify(randomImageVideoRequest.body).includes(randomImageNeedle), "video provider request does not leak random image filenames");
assert.ok(JSON.stringify(randomImageVideoRequest.body).includes("生成产品：产品"), "video provider request uses a generic product name when no explicit name is set");
randomImageNameState.integrations.publisher.accountIds = "2280";
randomImageNameState.integrations.publisher.apiKey = "publisher-key";
randomImageTask.video = { url: "https://example.test/generated.mp4" };
randomImageTask.copies = {
  tiktok: {
    platformId: "tiktok",
    platformName: "TikTok",
    title: "Water check",
    body: "No more waiting for hot water.",
    cta: "Would you use this?",
    hashtags: ["Kitchen"],
    approved: true,
  },
};
const randomImageScheduledPost = Core.createScheduledPost(randomImageNameState, randomImageTask, "tiktok", {
  scheduledAt: "2026-06-12T09:30",
  timezone: "Asia/Shanghai",
});
assert.strictEqual(randomImageScheduledPost.productName, "产品", "scheduled post snapshot does not store random image filename as product name");

created.contentPlan.strategy = "用户手动改过的内容规划：先讲办公室热浪，再展示挂脖风扇。";
created.contentPlan.storyboardGuidance = "每个镜头都必须围绕办公室通勤和产品佩戴展开。";
created.contentPlanText = "# 用户修改后的中文大框\n办公室热浪开场，先展示真实痛点，再展示挂脖风扇。";
state.contentBrief.storyboardSceneCount = "auto";
state.contentBrief.storyboardDetailLevel = "dense";
const storyboardFromPlanRequest = Core.buildStoryboardFromContentPlanProviderRequest(state, created);
const storyboardFromPlanPayload = userMessagePayload(storyboardFromPlanRequest);
assert.strictEqual(storyboardFromPlanPayload.contentPlan.strategy, created.contentPlan.strategy, "storyboard request uses the edited content plan strategy");
assert.strictEqual(storyboardFromPlanPayload.contentPlan.storyboardGuidance, created.contentPlan.storyboardGuidance, "storyboard request uses edited storyboard guidance");
assert.strictEqual(storyboardFromPlanPayload.contentPlanText, created.contentPlanText, "storyboard request includes the single edited Chinese content plan box");
assert.strictEqual(storyboardFromPlanPayload.sceneCount, 8, "auto scene count defaults to 8 scenes for a 15 second content plan");
assert.strictEqual(storyboardFromPlanPayload.detailLevel, "dense", "storyboard request includes selected detail level");
assert.strictEqual(storyboardFromPlanPayload.outputLanguage.language, "zh-CN", "storyboard request requires readable Chinese output");
assert.ok(JSON.stringify(storyboardFromPlanRequest.body).includes("所有面向运营审核的可读字段必须使用简体中文"), "storyboard system prompt requires Chinese readable fields");
assert.ok(JSON.stringify(storyboardFromPlanRequest.body).includes("至少 80%"), "storyboard request enforces mostly Chinese output");
assert.ok(JSON.stringify(storyboardFromPlanRequest.body).includes("只有 subtitle、screenText、voiceover"), "storyboard request limits English to audience-facing short text");

state.contentBrief.storyboardSceneCount = "10";
state.contentBrief.storyboardDetailLevel = "dense";
const tenSceneStoryboardRequest = Core.buildStoryboardFromContentPlanProviderRequest(state, created);
created.providerRequests.storyboard = tenSceneStoryboardRequest;
created.storyboard = [];
const fencedStoryboardApplied = Core.applyStoryboardProviderResult([created], {
  ok: true,
  upstream: {
    data: {
      choices: [
        {
          message: {
            content: [
              "下面是按内容规划生成的分镜 JSON：",
              "```json",
              JSON.stringify({
                storyboard: [
                  { time: "00:00-00:01.500", startSecond: 0, endSecond: 1.5, durationSecond: 1.5, title: "Pregnant woman suffering in kitchen", visual: "Close-up of pregnant woman's sweaty face in a hot kitchen.", subtitle: "", videoPrompt: "Handheld hot kitchen opener." },
                  { time: "00:01.500-00:03.000", startSecond: 1.5, endSecond: 3, durationSecond: 1.5, title: "Husband rushes in", visual: "Husband enters with the neck fan and puts it on her.", subtitle: "", videoPrompt: "Natural UGC rescue moment." },
                ],
              }),
              "```",
            ].join("\n"),
          },
        },
      ],
    },
  },
});
assert.strictEqual(fencedStoryboardApplied, true, "fenced storyboard JSON from chat content is accepted");
assert.strictEqual(created.storyboard.length, 10, "fenced top-level storyboard scenes are repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].title, "Pregnant woman suffering in kitchen", "fenced top-level storyboard first scene is applied");

created.storyboard = [];
Core.applyStoryboardProviderResult([created], {
  ok: true,
  upstream: {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              tasks: [
                {
                  angle: "Kitchen rescue",
                  hook: "Too hot in the kitchen",
                  duration: 15,
                  scenes: [
                    { time: "0-5s", title: "Heat hook", visual: "Sweaty kitchen opener.", subtitle: "It's way too hot.", videoPrompt: "Hot kitchen UGC opener." },
                    { time: "5-10s", title: "Fan reveal", visual: "Husband puts the neck fan on her.", subtitle: "Try this.", videoPrompt: "Neck fan reveal." },
                    { time: "10-15s", title: "CTA", visual: "Couple talks to camera.", subtitle: "Link in bio.", videoPrompt: "Natural TikTok CTA." },
                  ],
                },
              ],
            }),
          },
        },
      ],
    },
  },
});
assert.strictEqual(created.storyboard.length, 10, "storyboard provider result is repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].time, "0-1.5s", "repaired 10 scene storyboard starts at 0 seconds");
assert.strictEqual(created.storyboard[9].time, "13.5-15s", "repaired 10 scene storyboard ends at 15 seconds");

created.storyboard = [];
Core.applyStoryboardProviderResult([created], {
  ok: true,
  upstream: {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              video_storyboard_batch: [
                { time: "0-1.5s", title: "Pain opener", visual: "Pregnant woman overheats while cooking steak.", subtitle: "", videoPrompt: "Hot kitchen UGC opener." },
                { time: "1.5-3s", title: "Rescue entry", visual: "Husband runs in and puts the neck fan on her.", subtitle: "", videoPrompt: "Husband applies neck fan." },
              ],
            }),
          },
        },
      ],
    },
  },
});
assert.strictEqual(created.storyboard.length, 10, "top-level video_storyboard_batch scenes are repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].title, "Pain opener", "top-level video_storyboard_batch first scene is applied");
assert.strictEqual(created.storyboard.at(-1).time, "13.5-15s", "top-level video_storyboard_batch result is timed to 15 seconds");

created.storyboard = [];
Core.applyStoryboardProviderResult([created], {
  result: {
    schema: "video_storyboard_batch",
    ratio: "9:16",
    durationSecond: 15,
    sceneCount: 10,
    scenes: [
      { time: "0.0s-1.5s", title: "厨房热到崩溃的第一帧钩子", visual: "孕妇在厨房煎牛排，脸颊通红，额头和脖子有汗珠。", subtitle: "", videoPrompt: "Hot kitchen UGC opener." },
      { time: "1.5s-3.0s", title: "传统风扇帮不上忙的痛点", visual: "她一边煎牛排一边用空手扇风。", subtitle: "", videoPrompt: "Show normal fan cannot help." },
    ],
  },
});
assert.strictEqual(created.storyboard.length, 10, "schema video_storyboard_batch with top-level scenes is repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].title, "厨房热到崩溃的第一帧钩子", "schema video_storyboard_batch first scene is applied");
assert.strictEqual(created.storyboard.at(-1).time, "13.5-15s", "schema video_storyboard_batch result is timed to 15 seconds");

const tasksBeforeContentPlanVideoBatch = state.tasks.slice();
const selectedBeforeContentPlanVideoBatch = state.selectedTaskId;
const contentPlanVideoTasks = Core.createTasksFromContentPlanStoryboard(state, created, { count: 3, strategy: "platform" });
assert.strictEqual(contentPlanVideoTasks.length, 3, "content plan storyboard can create multiple same-storyboard video tasks");
assert.strictEqual(contentPlanVideoTasks[0].status, "storyboard_ready", "content plan video variants enter storyboard-ready state");
assert.strictEqual(contentPlanVideoTasks[0].strategy, "platform", "content plan video variants use the selected generation strategy");
assert.strictEqual(contentPlanVideoTasks[0].storyboard[0].title, created.storyboard[0].title, "content plan video variants keep the confirmed storyboard");
assert.notStrictEqual(contentPlanVideoTasks[0].storyboard, created.storyboard, "content plan video variants clone storyboard arrays");
assert.ok(contentPlanVideoTasks[1].videoStyleInstruction.includes("平台风格"), "content plan video variants carry style instructions into video generation");
assert.strictEqual(state.selectedTaskId, contentPlanVideoTasks[0].id, "first generated video variant becomes selected");
const contentPlanVideoRequest = Core.buildVideoProviderRequest(state, contentPlanVideoTasks[1], state.products[0]);
assert.ok(contentPlanVideoRequest.body.prompt.includes("平台风格"), "video provider prompt includes the selected variant style");
state.tasks = tasksBeforeContentPlanVideoBatch;
state.selectedTaskId = selectedBeforeContentPlanVideoBatch;

created.storyboard = [];
Core.applyStoryboardProviderResult([created], {
  ok: true,
  upstream: {
    data: {
      choices: [
        {
          message: {
            content: JSON.stringify({
              videoStoryboardBatch: {
                videoConfiguration: {
                  totalDurationSeconds: 15,
                  sceneCount: 10,
                  ratio: "9:16",
                },
                scenes: [
                  { time: "00:00-00:01.5", title: "厨房痛感特写", visual: "白人肥胖长发孕妇在厨房灶台前，脸部特写，满头大汗。", subtitle: "", videoPrompt: "Shaky handheld hot kitchen close-up." },
                  { time: "00:01.5-00:03", title: "厨房环境与动作", visual: "稍宽景别，显示厨房环境，孕妇手持锅铲，另一只手无力扇风。", subtitle: "", videoPrompt: "Show wider kitchen action." },
                ],
              },
            }),
          },
        },
      ],
    },
  },
});
assert.strictEqual(created.storyboard.length, 10, "camelCase videoStoryboardBatch object scenes are repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].title, "厨房痛感特写", "camelCase videoStoryboardBatch first scene is applied");
assert.strictEqual(created.duration, 15, "camelCase videoStoryboardBatch duration metadata is applied");

created.storyboard = [];
Core.applyStoryboardProviderResult([created], {
  result: {
    storyboards: [
      { startSecond: 0, endSecond: 1.5, durationSecond: 1.5, title: "EXTREME DISCOMFORT CLOSE-UP", visual: "Super tight close-up of a plus-size pregnant woman's face.", subtitle: "", videoPrompt: "Raw UGC close-up." },
      { startSecond: 1.5, endSecond: 3, durationSecond: 1.5, title: "HUSBAND RUNS IN", visual: "Husband rushes into the kitchen holding the neck fan.", subtitle: "", videoPrompt: "Handheld rescue moment." },
    ],
  },
});
assert.strictEqual(created.storyboard.length, 10, "top-level storyboards scenes are repaired to the requested 10 scenes");
assert.strictEqual(created.storyboard[0].title, "EXTREME DISCOMFORT CLOSE-UP", "top-level storyboards first scene is applied");

const contentPlanRequestPayload = userMessagePayload(planRequest);
assert.ok(!contentPlanRequestPayload.outputFields.includes("scenes"), "content plan request does not ask the LLM to output storyboard scenes");
assert.ok(!JSON.stringify(planRequest.body.messages).includes("分镜生成要求"), "content plan prompt does not ask for storyboard generation requirements");
assert.ok(!JSON.stringify(planRequest.body.messages).includes("videoPrompt"), "content plan prompt does not ask for video-generation prompt fields");

const planOnlyState = Core.createInitialState();
planOnlyState.products[0].imageUrl = "https://example.test/neck-fan.png";
planOnlyState.contentBrief.seed = "neck fan UGC";
const planOnlyTask = Core.createContentPlanTask(planOnlyState, {
  contentPlan: {
    productUnderstanding: "Neck fan.",
    targetAudience: "US consumers.",
    keySellingPoints: ["strong wind", "lightweight"],
    strategy: "UGC kitchen rescue.",
    hook: "Hot kitchen rescue.",
    reviewSummary: "Avoid medical claims.",
    complianceNotes: ["No health promises."],
  },
});
assert.ok(planOnlyTask, "content plan task can be created without storyboard scenes");
assert.deepStrictEqual(planOnlyTask.storyboard, [], "content planning does not prefill storyboard scenes");

created.storyboard = Core.normalizeStoryboardTiming([
  {
    time: "0-15s",
    title: "Kitchen rescue",
    visual: "Hot kitchen UGC scene with the neck fan reveal.",
    subtitle: "This kitchen is way too hot.",
    videoPrompt: "15 second vertical UGC neck fan kitchen rescue scene.",
  },
], 15);
created.storyboardTimingStatus = created.storyboard.timingStatus;

Object.assign(state.integrations.video, {
  mode: "http",
  provider: "toapis-seedance",
  apiStyle: "toapis-video",
  endpoint: "https://toapis.com/v1/videos/generations",
  statusEndpoint: "https://toapis.com/v1/videos/generations/{task_id}",
  model: "seedance-2-fast",
  apiKey: "toapis-key",
});
const toapisVideoRequest = Core.buildVideoProviderRequest(state, created, state.products[0]);
assert.strictEqual(toapisVideoRequest.body.duration, 15, "ToAPIs video request preserves a 15 second task duration");
assert.deepStrictEqual(toapisVideoRequest.duration, { requested: 15, submitted: 15, supported: [6, 10, 15] }, "ToAPIs video request records duration metadata");

Object.assign(state.integrations.video, {
  mode: "http",
  provider: "toapis-seedance",
  apiStyle: "toapis-video",
  endpoint: "https://toapis.com/v1/videos/generations",
  statusEndpoint: "https://toapis.com/v1/videos/generations/{task_id}",
  model: "viduq3-turbo",
  apiKey: "toapis-key",
});
const viduQ3VideoRequest = Core.buildVideoProviderRequest(state, created, state.products[0]);
assert.strictEqual(viduQ3VideoRequest.endpoint, "https://toapis.com/v1/videos/generations", "Vidu Q3 uses the ToAPIs generation API endpoint");
assert.strictEqual(viduQ3VideoRequest.body.model, "viduq3-turbo", "Vidu Q3 request uses configured model");
assert.strictEqual(viduQ3VideoRequest.body.duration, 15, "Vidu Q3 turbo keeps the requested 15 second duration");
assert.strictEqual(viduQ3VideoRequest.body.resolution, "720p", "Vidu Q3 request uses documented lowercase resolution values");
assert.strictEqual(viduQ3VideoRequest.body.audio, true, "Vidu Q3 request enables audio by default");
assert.deepStrictEqual(viduQ3VideoRequest.duration, { requested: 15, submitted: 15, supported: [1, 16] }, "Vidu Q3 request records its supported duration range");

created.duration = 13.1;
const fractionalViduQ3VideoRequest = Core.buildVideoProviderRequest(state, created, state.products[0]);
assert.strictEqual(fractionalViduQ3VideoRequest.body.duration, 13, "Vidu Q3 request submits integer duration seconds");
assert.deepStrictEqual(fractionalViduQ3VideoRequest.duration, { requested: 13.1, submitted: 13, supported: [1, 16] }, "Vidu Q3 request records normalized fractional duration");
created.duration = 15;

const variantState = Core.createInitialState();
variantState.products[0].imageUrl = "https://example.test/neck-fan.png";
variantState.contentBrief.seed = "neck fan UGC";
const variantTask = Core.createContentPlanTask(variantState, {
  contentPlan: {
    productUnderstanding: "Neck fan.",
    targetAudience: "US consumers.",
    keySellingPoints: ["strong wind", "lightweight"],
    strategy: "UGC kitchen rescue.",
    hook: "Hot kitchen rescue.",
    scenes: [
      {
        time: "0:00-0:03",
        sceneTitle: "Kitchen heat",
        description: "Hot summer kitchen, sweaty user frying steak before the neck fan reveal.",
        caption: "This kitchen is way too hot.",
      },
    ],
  },
});
assert.ok(variantTask, "content plan task still accepts provider responses that include legacy scenes");
assert.deepStrictEqual(variantTask.storyboard, [], "legacy content plan scenes are not used as the task storyboard");

const repairedTimingScenes = Core.normalizeStoryboardTiming([
  { time: "0-4s", title: "Hook", visual: "Hot commute hook.", subtitle: "Too hot?" },
  { time: "4-8s", title: "Reveal", visual: "Reveal the neck fan.", subtitle: "Wear it." },
  { time: "8-13s", title: "CTA", visual: "Show final product shot.", subtitle: "Tap to shop." },
], 15);
assert.strictEqual(repairedTimingScenes[2].time, "8-15s", "storyboard timing repair extends the final scene to 15s");
assert.strictEqual(repairedTimingScenes[2].endSecond, 15, "storyboard timing repair records numeric final end second");
assert.strictEqual(repairedTimingScenes.timingStatus, "auto_repaired", "storyboard timing repair marks repaired timing");

const storyboardAppliedTask = {
  productName: "Neck fan",
  variation: { angle: "Hot commute", hook: "Too hot?" },
  title: "Old title",
  storyboard: [
    { time: "0-3s", title: "Old", visual: "", subtitle: "" },
    { time: "3-7s", title: "Old", visual: "", subtitle: "" },
    { time: "7-11s", title: "Old", visual: "", subtitle: "" },
  ],
};
Core.applyStoryboardProviderResult([storyboardAppliedTask], {
  result: {
    tasks: [{
      title: "Timed storyboard",
      angle: "Hot commute",
      hook: "Too hot?",
      duration: 15,
      scenes: [
        { time: "0-4s", title: "Hook", visual: "Hot commute hook.", subtitle: "Too hot?" },
        { time: "4-8s", title: "Reveal", visual: "Reveal the neck fan.", subtitle: "Wear it." },
        { time: "8-13s", title: "CTA", visual: "Show final product shot.", subtitle: "Tap to shop." },
      ],
    }],
  },
});
assert.strictEqual(storyboardAppliedTask.duration, 15, "provider storyboard duration is stored on the task");
assert.strictEqual(storyboardAppliedTask.storyboard.at(-1).time, "8-15s", "provider storyboard result is repaired to cover 15s");
assert.strictEqual(storyboardAppliedTask.storyboardTimingStatus, "auto_repaired", "task records repaired storyboard timing status");

const migratedVariant = Core.migrateState({
  schemaVersion: 2,
  tasks: [
    {
      id: "task-saved-variant",
      title: "Saved variant",
      status: "content_plan_ready",
      storyboard: [{ time: "0:00-0:03", title: "分镜", visual: "", subtitle: "" }],
      contentPlan: {
        scenes: [{ time: "0:00-0:03", title: "分镜", visual: "", subtitle: "" }],
      },
      providerResponses: {
        contentPlan: {
          ok: true,
          upstream: {
            data: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      contentPlan: {
                        productUnderstanding: "Neck fan.",
                        targetAudience: "US consumers.",
                        keySellingPoints: ["strong wind"],
                        strategy: "UGC kitchen rescue.",
                        hook: "Hot kitchen rescue.",
                        scenes: [
                          {
                            time: "0:00-0:03",
                            sceneTitle: "Kitchen heat",
                            description: "Recovered hot kitchen scene from provider response.",
                            caption: "This kitchen is way too hot.",
                          },
                        ],
                      },
                    }),
                  },
                },
              ],
            },
          },
        },
      },
    },
  ],
});
assert.strictEqual(migratedVariant.tasks[0].storyboard[0].visual, "Recovered hot kitchen scene from provider response.", "migration repairs blank storyboard visual from saved provider response");

assert.strictEqual(Core.applyContentPlanProviderResult(state, planRequest, { ok: true, result: {} }), null, "empty provider result does not create fallback task");
assert.strictEqual(state.tasks.length, 1, "empty provider result does not append task");

state.reverseVideo.upload = {
  id: "upload_verify",
  fileName: "reference.mp4",
  url: "/outputs/uploads/upload_verify/reference.mp4",
  mimeType: "video/mp4",
  size: 123456,
  uploadedAt: "2026-06-09T00:00:00.000Z",
};
state.reverseVideo.frames = [
  { time: "0.0s", url: "/outputs/uploads/upload_verify/frames/frame-001.jpg", label: "frame-001" },
  { time: "3.0s", url: "/outputs/uploads/upload_verify/frames/frame-002.jpg", label: "frame-002" },
];
state.reverseVideo.notes = "保留原视频节奏，后续替换成挂脖风扇。";
const reverseRequest = Core.buildReverseStoryboardProviderRequest(state);
assert.strictEqual(reverseRequest.provider, state.integrations.llm.provider, "reverse request uses configured LLM provider");
assert.strictEqual(reverseRequest.mode, "http", "reverse request uses real HTTP mode");
const reversePayload = userMessagePayload(reverseRequest);
assert.strictEqual(reversePayload.upload.fileName, "reference.mp4", "reverse request includes upload metadata");
assert.strictEqual(reversePayload.frames.length, 2, "reverse request includes ordered frame URLs");
assert.strictEqual(reversePayload.notes, state.reverseVideo.notes, "reverse request includes user notes");
assert.strictEqual(reversePayload.fidelityMode, "source_reconstruction_first", "reverse request prioritizes original scene reconstruction");
assert.ok(JSON.stringify(reversePayload.reconstructionProtocol).includes("先忠实复刻原视频"), "reverse request tells the model to reconstruct before remixing");
assert.ok(JSON.stringify(reversePayload.prohibitedBehavior).includes("不要把原视频产品替换成备注里的新产品"), "reverse request forbids replacing the original product during reconstruction");
assert.strictEqual(reversePayload.language, "zh-CN", "reverse request asks for Chinese storyboard output");
assert.ok(!JSON.stringify(reverseRequest.body).includes("即梦"), "reverse request does not name a specific downstream video model");
assert.ok(!JSON.stringify(reverseRequest.body).includes("Seedance"), "reverse request does not name a specific downstream video model");
assert.ok(JSON.stringify(reversePayload.reconstructionProtocol).includes("文案、语音、镜头角度"), "reverse request prioritizes copy, voice, and camera angle reconstruction");
assert.ok(reversePayload.outputFields.includes("videoPrompt"), "reverse request asks for video prompt fields");
assert.ok(reversePayload.outputFields.includes("sourceReconstruction"), "reverse request asks for source reconstruction fields");
assert.ok(reversePayload.outputFields.includes("rewriteTemplate"), "reverse request asks for rewrite template fields");
assert.ok(reversePayload.outputFields.includes("negativePrompt"), "reverse request asks for negative prompt fields");

const visionState = Core.migrateState(JSON.parse(JSON.stringify(state)));
visionState.integrations.llm.apiStyle = "openai-vision-chat";
visionState.reverseVideo.frames = [
  { time: "0.0s", url: "/outputs/uploads/upload_verify/frames/frame-001.jpg", label: "frame-001", dataUrl: "data:image/jpeg;base64,AAA" },
];
const visionReverseRequest = Core.buildReverseStoryboardProviderRequest(visionState);
const visionParts = userVisionParts(visionReverseRequest);
assert.ok(visionParts.some((part) => part.type === "image_url"), "vision reverse request includes inline frame image parts");
assert.ok(!JSON.stringify(userMessagePayload(visionReverseRequest).frames).includes("base64"), "vision reverse JSON metadata does not duplicate base64 frame data");

const gptVisionState = Core.migrateState(JSON.parse(JSON.stringify(state)));
gptVisionState.integrations.llm.provider = "custom-llm";
gptVisionState.integrations.llm.apiStyle = "openai-chat";
gptVisionState.integrations.llm.model = "gpt-5.5";
gptVisionState.reverseVideo.frames = Array.from({ length: 8 }, (_, index) => ({
  time: `${index}s`,
  url: `/outputs/uploads/upload_verify/frames/frame-${String(index + 1).padStart(3, "0")}.jpg`,
  label: `frame-${index + 1}`,
  dataUrl: `data:image/jpeg;base64,BBB${index}`,
}));
const gptVisionRequest = Core.buildReverseStoryboardProviderRequest(gptVisionState);
assert.ok(userVisionParts(gptVisionRequest).some((part) => part.type === "image_url"), "gpt reverse request auto-includes frame images even when apiStyle is openai-chat");
assert.strictEqual(userVisionParts(gptVisionRequest).filter((part) => part.type === "image_url").length, 4, "gpt reverse request limits inline images to representative frames");
assert.strictEqual(userMessagePayload(gptVisionRequest).frames.length, 8, "gpt reverse request keeps all frame metadata even when inline image count is capped");

const responsesVisionState = Core.migrateState(JSON.parse(JSON.stringify(state)));
responsesVisionState.integrations.llm.apiStyle = "openai-responses";
responsesVisionState.integrations.llm.endpoint = "https://api.openai.com/v1/responses";
responsesVisionState.integrations.llm.model = "gpt-5.5";
responsesVisionState.reverseVideo.frames = [
  { time: "0.0s", url: "/outputs/uploads/upload_verify/frames/frame-001.jpg", label: "frame-001", dataUrl: "data:image/jpeg;base64,CCC" },
];
const responsesVisionRequest = Core.buildReverseStoryboardProviderRequest(responsesVisionState);
const responsesUserContent = responsesVisionRequest.body.input.find((item) => item.role === "user").content;
assert.ok(Array.isArray(responsesUserContent), "Responses reverse request uses content parts for multimodal input");
assert.ok(responsesUserContent.some((part) => part.type === "input_image"), "Responses reverse request includes input_image frame parts");
assert.ok(responsesUserContent.some((part) => part.type === "input_text" && !part.text.includes("base64")), "Responses reverse request keeps base64 out of JSON text metadata");

const reverseTaskCountBefore = state.tasks.length;
const reverseResult = Core.applyReverseStoryboardProviderResult(state, reverseRequest, {
  ok: true,
  result: {
    reverseStoryboard: {
      title: "反推分镜 · reference.mp4",
      summary: "先痛点，再产品演示，最后 CTA。",
      hook: "先看这个结果",
      duration: 15,
      ratio: "9:16",
      sourceReconstruction: {
        productIdentity: "原视频中的白色手持小风扇",
        environment: "夏天户外排队场景",
        cameraStyle: "9:16 竖屏手持拍摄",
      },
      rewriteTemplate: {
        replaceableProductSlot: "可替换成挂脖风扇",
        lockedElements: ["竖屏构图", "户外热浪痛点", "手持真实感"],
      },
      scenes: [
        {
          sceneTitle: "结果前置",
          description: "开头直接展示使用前后对比。",
          caption: "Before vs After",
          video_prompt: "vertical video, before after hook",
          negative_prompt: "wrong product, changed background",
        },
      ],
    },
  },
});
assert.strictEqual(state.tasks.length, reverseTaskCountBefore, "reverse provider result does not create tasks directly");
assert.strictEqual(reverseResult.scenes[0].title, "结果前置", "reverse normalization accepts sceneTitle");
assert.strictEqual(reverseResult.scenes[0].visual, "开头直接展示使用前后对比。", "reverse normalization accepts description");
assert.strictEqual(reverseResult.scenes[0].subtitle, "Before vs After", "reverse normalization accepts caption");
assert.strictEqual(reverseResult.scenes[0].videoPrompt, "vertical video, before after hook", "reverse normalization accepts video_prompt");
assert.strictEqual(reverseResult.scenes[0].negativePrompt, "wrong product, changed background", "reverse normalization accepts negative_prompt");
assert.strictEqual(reverseResult.sourceReconstruction.productIdentity, "原视频中的白色手持小风扇", "reverse normalization preserves source reconstruction");
assert.deepStrictEqual(reverseResult.rewriteTemplate.lockedElements, ["竖屏构图", "户外热浪痛点", "手持真实感"], "reverse normalization preserves rewrite template");
assert.strictEqual(state.reverseVideo.status, "ready", "reverse result marks workspace ready");

const wrapperState = Core.migrateState(JSON.parse(JSON.stringify(state)));
const wrapperReverseResult = Core.applyReverseStoryboardProviderResult(wrapperState, reverseRequest, {
  ok: true,
  result: {
    title: "外层标题",
    summary: "外层摘要",
    sourceReconstruction: {
      productIdentity: "外层产品身份",
    },
    reverseStoryboard: {
      duration: 13,
      hook: "外层响应里的钩子",
      ratio: "9:16",
    },
    scenes: [
      {
        title: "外层分镜",
        visual: "模型把 scenes 放在 reverseStoryboard 外层。",
        subtitle: "Scene outside wrapper",
        videoPrompt: "复刻外层 scenes。",
      },
    ],
  },
});
assert.strictEqual(wrapperReverseResult.scenes[0].title, "外层分镜", "reverse normalization accepts wrapper-level scenes when reverseStoryboard omits scenes");
assert.strictEqual(wrapperReverseResult.sourceReconstruction.productIdentity, "外层产品身份", "reverse normalization preserves wrapper-level source reconstruction");

const reverseFavorite = Core.saveReverseStoryboardFavorite(state);
assert.strictEqual(reverseFavorite.type, "分镜脚本", "reverse result saves as storyboard favorite");
assert.strictEqual(reverseFavorite.sourceKey, "reverse-video:upload_verify", "reverse favorite stores source key");
assert.ok(reverseFavorite.content.includes("结果前置"), "reverse favorite stores storyboard text");
assert.ok(reverseFavorite.content.includes("复刻目标"), "reverse favorite stores source-fidelity guidance");
assert.ok(reverseFavorite.content.includes("文案/语音"), "reverse favorite includes copy and voice reconstruction guidance");
assert.ok(!reverseFavorite.content.includes("即梦"), "reverse favorite text avoids naming a specific downstream video model");
const reverseFavoriteCount = state.favorites.length;
const duplicateReverseFavorite = Core.saveReverseStoryboardFavorite(state);
assert.strictEqual(duplicateReverseFavorite.id, reverseFavorite.id, "duplicate reverse save reuses existing favorite");
assert.strictEqual(state.favorites.length, reverseFavoriteCount, "duplicate reverse save does not append favorite");

state.products.push({
  id: "product-neck-fan-target",
  name: "可折叠挂脖风扇",
  imageLabel: "挂脖风扇产品图",
  imageUrl: "https://example.test/target-neck-fan.png",
  imageData: "",
  audience: "夏季通勤和户外排队用户",
  sellingPoints: "免手持, 三档风速, 轻量便携",
  offer: "TikTok Shop 限时优惠",
  brandTone: "真实测评，弱广告感",
  detailsSaved: true,
});
state.reverseVideo.selectedProductId = "product-neck-fan-target";
state.selectedProductId = "product-draft";
state.reverseVideo.secondaryCount = 4;
state.reverseVideo.creationStrategy = "hooks";
state.contentBrief.videoResolution = "480p";
const reverseCreatedTasksFromState = Core.createTasksFromReverseFavorite(state);
assert.strictEqual(reverseCreatedTasksFromState.length, 4, "reverse secondary task count can come from workspace settings");
assert.strictEqual(reverseCreatedTasksFromState[0].strategy, "hooks", "reverse secondary task strategy can come from workspace settings");
assert.strictEqual(reverseCreatedTasksFromState[0].productId, "product-neck-fan-target", "reverse secondary tasks use the selected remix product");
assert.strictEqual(reverseCreatedTasksFromState[0].productName, "可折叠挂脖风扇", "reverse secondary task product name comes from selected remix product");
assert.ok(reverseCreatedTasksFromState[0].contentBrief.productPromise.includes("免手持"), "reverse secondary task content brief includes selected product selling points");
assert.strictEqual(reverseCreatedTasksFromState[0].videoResolution, "480p", "secondary task records the selected video resolution");
const reverseVideoProviderRequest = Core.buildVideoProviderRequest(state, reverseCreatedTasksFromState[0], Core.getById(state.products, "product-neck-fan-target"));
assert.ok(reverseVideoProviderRequest.body.prompt.includes("可折叠挂脖风扇"), "reverse video prompt includes selected product name");
assert.ok(reverseVideoProviderRequest.body.prompt.includes("免手持"), "reverse video prompt includes selected product facts");
assert.ok(reverseVideoProviderRequest.body.prompt.includes("最大程度复刻参考视频"), "reverse video prompt preserves the source video style");
assert.ok(reverseVideoProviderRequest.body.prompt.includes("旁白"), "reverse video prompt includes voiceover guidance");
assert.ok(reverseVideoProviderRequest.body.prompt.includes("产品参考图为最高优先级"), "reverse video prompt locks the selected product reference image");
assert.ok(reverseVideoProviderRequest.body.prompt.includes("不得改变产品颜色、外观轮廓、比例、材质和关键结构"), "reverse video prompt forbids product appearance drift");
assert.deepStrictEqual(reverseVideoProviderRequest.body.image_urls, ["https://example.test/target-neck-fan.png"], "reverse video request uses selected product image URL");
assert.strictEqual(reverseVideoProviderRequest.body.resolution, "480p", "ToAPIS video request uses the selected resolution");

const waterPurifierRequest = Core.buildVideoProviderRequest(
  state,
  Object.assign({}, reverseCreatedTasksFromState[0], { productName: "Aigerri 净饮机" }),
  {
    id: "product-aigerri-water-purifier",
    name: "Aigerri 净饮机",
    imageLabel: "Aigerri 净饮机参考图",
    imageUrl: "https://example.test/aigerri-water-purifier.png",
    imageData: "",
    audience: "家庭厨房用户",
    sellingPoints: "台式即热, 多档温度",
    offer: "",
    brandTone: "真实演示",
    detailsSaved: true,
  }
);
assert.ok(waterPurifierRequest.body.prompt.includes("乳白色圆角机身"), "water purifier prompt locks the cream rounded body");
assert.ok(waterPurifierRequest.body.prompt.includes("黑色半透明水箱/侧面面板"), "water purifier prompt locks the black translucent tank panel");
assert.ok(waterPurifierRequest.body.prompt.includes("Aigerri 标识"), "water purifier prompt locks the brand mark");

const reverseCreatedTasks = Core.createTasksFromReverseFavorite(state, { count: 2, strategy: "rewrite" });
assert.strictEqual(reverseCreatedTasks.length, 2, "reverse favorite can create secondary tasks");
assert.strictEqual(reverseCreatedTasks[0].favoriteId, reverseFavorite.id, "secondary task keeps reverse favorite id");
assert.strictEqual(reverseCreatedTasks[0].source, "reverse-video", "secondary task records reverse source");
assert.strictEqual(reverseCreatedTasks[0].storyboard[0].title, "结果前置", "secondary task preserves reverse storyboard structure");

Core.simulateVideoGeneration(state, created);
assert.strictEqual(created.status, "video_generating", "real HTTP video generation enters generating state");
assert.ok(created.providerRequests.video.body.prompt.includes("Target duration: exactly 15s"), "video request includes exact 15 second duration instruction");
assert.ok(created.providerRequests.video.body.prompt.includes("0-15s"), "video request includes repaired full-length content plan scene prompt");

Core.applyVideoProviderResult(created, {
  upstream: {
    data: {
      output: {
        task_status: "SUCCEEDED",
        video_url: "https://example.test/generated.mp4",
      },
    },
  },
});
assert.strictEqual(created.video.url, "https://example.test/generated.mp4", "video URL is stored from provider response");
assert.strictEqual(created.status, "video_review", "successful video enters review");

Core.applyVideoProviderResult(created, {
  upstream: {
    data: {
      id: "tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J",
      status: "completed",
      result: {
        data: [
          {
            format: "mp4",
            url: "https://files.toapis.com/videos/tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J/1780931198_73743d66.mp4",
          },
        ],
        type: "video",
      },
    },
  },
});
assert.strictEqual(created.video.url, "https://files.toapis.com/videos/tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J/1780931198_73743d66.mp4", "ToAPI completed video URL is stored from nested result data");
assert.strictEqual(created.status, "video_review", "ToAPI completed video enters review");

const repairedVideoState = Core.migrateState({
  schemaVersion: 2,
  tasks: [{
    id: "task-saved-video",
    status: "video_review",
    video: {
      url: "",
      jobId: "tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J",
      providerStatus: "completed",
    },
    providerResponses: {
      videoStatus: {
        upstream: {
          data: {
            id: "tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J",
            status: "completed",
            result: {
              data: [
                {
                  format: "mp4",
                  url: "https://files.toapis.com/videos/tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J/1780931198_73743d66.mp4",
                },
              ],
              type: "video",
            },
          },
        },
      },
    },
  }],
});
assert.strictEqual(repairedVideoState.tasks[0].video.url, "https://files.toapis.com/videos/tsk_vid_01KTKW19EFCCDSF5H0EXEJ0X0J/1780931198_73743d66.mp4", "migration repairs saved completed ToAPI video URL");
assert.strictEqual(repairedVideoState.tasks[0].status, "video_review", "migration keeps repaired completed video in review");

Core.approveVideo(created);
Core.generateCopies(created, ["tiktok"]);
assertNoChineseText(created.copies.tiktok.title, "local copy fallback title");
assertNoDemoWaterText(created.copies, "generated copy");
assert.strictEqual(created.copies.tiktok.language, "en", "local copy fallback generates English publishing copy");
assert.ok(created.copies.tiktok.chineseTranslation.includes("中文参考"), "local copy fallback includes Chinese reference translation");
assert.ok(!created.copies.tiktok.body.includes("围绕"), "local copy fallback is not a Chinese video summary");
assert.ok(!/[A-Za-z]{4,}/.test(created.copies.tiktok.chineseTranslation), "local copy fallback Chinese translation is fully Chinese");
assert.ok(!/[A-Za-z]{4,}/.test(created.copies.tiktok.postingNotes), "local copy fallback posting notes are Chinese");
assert.ok(created.copies.tiktok.complianceWarnings.every((item) => !/[A-Za-z]{4,}/.test(item)), "local copy fallback compliance warnings are Chinese");
assert.ok(!/[A-Za-z]{4,}/.test(created.copies.tiktok.rationale), "local copy fallback rationale is Chinese");
state.copyStyle = "problem-solution";
const styledCopyRequest = Core.buildCopyProviderRequest(state, created, ["tiktok"]);
const styledCopyPayload = userMessagePayload(styledCopyRequest);
assert.strictEqual(styledCopyPayload.copyStyle.id, "problem-solution", "copy provider request includes selected copy style");
assert.strictEqual(styledCopyPayload.language.publish, "English", "copy provider request requires English publishing copy");
assert.strictEqual(styledCopyPayload.language.referenceTranslation, "Chinese", "copy provider request requires Chinese reference translation");
assert.strictEqual(styledCopyPayload.language.internalReviewFields, "Chinese", "copy provider request requires Chinese internal review fields");
assert.ok(styledCopyPayload.outputFields.includes("chineseTranslation"), "copy provider request asks for Chinese translation field");
assert.ok(JSON.stringify(styledCopyRequest.body).includes("不要输出视频概述"), "copy provider request forbids video-summary captions");
assert.ok(JSON.stringify(styledCopyRequest.body).includes("内部审核字段必须使用中文"), "copy provider request requires Chinese internal review fields");
created.copies.tiktok.body = "原分镜脚本复用：Unknown White Gadget。展示 图片素材中的产品特征、用户想法中的卖点。";

Core.approveCopy(created, "tiktok");
state.integrations.publisher.accountIds = "2280";
state.integrations.publisher.mediaIds = "media_1";
Core.publishTask(state, created);
assert.strictEqual(created.status, "published", "publish updates task status");
assert.deepStrictEqual(created.providerRequests.publisher.body.account_ids, [2280], "publish request includes account ids");
assert.deepStrictEqual(created.providerRequests.publisher.body.media_ids, ["media_1"], "publish request includes media ids");
assert.ok(!created.providerRequests.publisher.body.content.includes("原分镜脚本复用"), "publish payload removes internal reverse-workflow wording");
assert.ok(!created.providerRequests.publisher.body.content.includes("Unknown White Gadget"), "publish payload removes unknown placeholder product wording");
assert.ok(!created.providerRequests.publisher.body.content.includes("图片素材中的产品特征"), "publish payload removes internal product-material placeholder wording");

const uploadMediaState = Core.createInitialState();
uploadMediaState.integrations.publisher.accountIds = "2280";
const uploadMediaTask = Core.createContentPlanTask(uploadMediaState, {
  contentPlan: {
    productUnderstanding: "轻便挂脖风扇。",
    targetAudience: "美国 TikTok 用户。",
    keySellingPoints: ["strong airflow"],
    usageScenarios: ["kitchen"],
    strategy: "痛点解决",
    hook: "Hot kitchen",
    reviewSummary: "准备发布。",
    complianceNotes: [],
  },
});
uploadMediaTask.video = { url: "https://example.test/video.mp4", provider: "toapis" };
uploadMediaTask.providerResponses = { publisherMedia: { ok: true, mediaId: "media_from_upload" } };
Core.approveVideo(uploadMediaTask);
Core.generateCopies(uploadMediaTask, ["tiktok"], { style: "problem-solution" });
Core.approveCopy(uploadMediaTask, "tiktok");
const uploadMediaRequest = Core.buildPublishProviderRequest(uploadMediaState, uploadMediaTask);
assert.deepStrictEqual(uploadMediaRequest.body.media_ids, ["media_from_upload"], "publish request reuses media id returned by publisher upload");

const scheduledMediaState = Core.createInitialState();
scheduledMediaState.integrations.publisher.accountIds = "2280";
const scheduledMediaTask = Core.createContentPlanTask(scheduledMediaState, {
  contentPlan: {
    productUnderstanding: "轻便挂脖风扇。",
    targetAudience: "美国 TikTok 用户。",
    keySellingPoints: ["strong airflow"],
    usageScenarios: ["kitchen"],
    strategy: "痛点解决",
    hook: "Hot kitchen",
    reviewSummary: "准备发布。",
    complianceNotes: [],
  },
});
scheduledMediaTask.video = { url: "https://example.test/video.mp4", provider: "toapis" };
Core.approveVideo(scheduledMediaTask);
Core.generateCopies(scheduledMediaTask, ["tiktok"], { style: "problem-solution" });
Core.approveCopy(scheduledMediaTask, "tiktok");
scheduledMediaState.scheduledPosts = [{
  id: "scheduled-media",
  taskId: scheduledMediaTask.id,
  platformId: "tiktok",
  status: "scheduled",
  mediaIds: ["media_from_scheduled_post"],
}];
const scheduledMediaRequest = Core.buildPublishProviderRequest(scheduledMediaState, scheduledMediaTask);
assert.deepStrictEqual(scheduledMediaRequest.body.media_ids, ["media_from_scheduled_post"], "publish request reuses matching scheduled post media ids when live task media is empty");

const scheduleState = Core.createInitialState();
scheduleState.products[0].imageUrl = "https://example.test/neck-fan.png";
scheduleState.contentBrief.seed = "TikTok neck fan test";
scheduleState.integrations.publisher.accountIds = "2280";
scheduleState.integrations.publisher.mediaIds = "media_1";
scheduleState.integrations.publisher.endpoint = "https://app.posteverywhere.ai/api/v1/posts";
scheduleState.integrations.publisher.apiKey = "publisher-secret-verify";
const schedulableTask = Core.createContentPlanTask(scheduleState, {
  contentPlan: {
    productUnderstanding: "轻便挂脖风扇。",
    targetAudience: "美国 TikTok 用户。",
    keySellingPoints: ["strong airflow", "lightweight"],
    usageScenarios: ["kitchen", "outdoor"],
    strategy: "痛点解决",
    hook: "Hot kitchen",
    reviewSummary: "准备发布。",
    complianceNotes: [],
  },
});
schedulableTask.video = { url: "https://example.test/video.mp4", provider: "toapis" };
Core.approveVideo(schedulableTask);
Core.generateCopies(schedulableTask, ["tiktok"], { style: "problem-solution" });
Core.approveCopy(schedulableTask, "tiktok");
const scheduledPost = Core.createScheduledPost(scheduleState, schedulableTask, "tiktok", {
  scheduledAt: "2026-06-12T09:30",
  timezone: "Asia/Shanghai",
});
assert.strictEqual(scheduleState.scheduledPosts.length, 1, "scheduled post is persisted in queue");
assert.strictEqual(scheduledPost.status, "scheduled", "new scheduled post starts as scheduled");
assert.strictEqual(scheduledPost.taskId, schedulableTask.id, "scheduled post remembers task id");
assert.strictEqual(scheduledPost.platformId, "tiktok", "scheduled post remembers platform");
assert.strictEqual(scheduledPost.copySnapshot.title, schedulableTask.copies.tiktok.title, "scheduled post snapshots copy");
assert.strictEqual(scheduledPost.videoSnapshot.url, schedulableTask.video.url, "scheduled post snapshots video");
assert.deepStrictEqual(scheduledPost.accountIds, [2280], "scheduled post snapshots account ids");
assert.strictEqual(scheduledPost.providerRequestPreview.body.scheduled_for, "2026-06-12T01:30:00.000Z", "scheduled post provider request uses PostEverywhere hosted scheduled_for time");
assert.strictEqual(scheduledPost.providerRequestPreview.body.timezone, "UTC", "scheduled post provider request sends UTC timezone with UTC scheduled_for");
assert.ok(scheduledPost.providerRequestPreview.body.content.includes(schedulableTask.copies.tiktok.title), "scheduled post snapshots publish request preview");
const hostedScheduledPost = JSON.parse(JSON.stringify(scheduledPost));
Core.applyScheduledPostProviderResult(hostedScheduledPost, {
  ok: true,
  upstream: {
    data: {
      data: {
        post: {
          post_id: "post-hosted-1",
          status: "scheduled",
          scheduled_for: "2026-06-12T01:30:00.000Z",
          timezone: "UTC",
        },
      },
    },
  },
});
assert.strictEqual(hostedScheduledPost.status, "platform_scheduled", "scheduled post is marked as platform-hosted after provider accepts it");
assert.strictEqual(hostedScheduledPost.platformPostId, "post-hosted-1", "scheduled post stores the PostEverywhere post id");
assert.strictEqual(Core.dueScheduledPosts({ scheduledPosts: [hostedScheduledPost] }, "2026-06-12T01:30:00.000Z").length, 0, "platform-hosted scheduled posts are not locally due");
const cancelHostedRequest = Core.buildCancelScheduledPostProviderRequest(scheduleState, hostedScheduledPost);
assert.strictEqual(cancelHostedRequest.method, "DELETE", "hosted scheduled post cancellation uses PostEverywhere DELETE");
assert.strictEqual(cancelHostedRequest.endpoint, "https://app.posteverywhere.ai/api/v1/posts/post-hosted-1", "hosted scheduled post cancellation targets the platform post id");
assert.strictEqual(cancelHostedRequest.apiKey, scheduleState.integrations.publisher.apiKey, "hosted scheduled post cancellation preserves publisher auth");
Core.applyCancelScheduledPostProviderResult(hostedScheduledPost, {
  ok: true,
  upstream: { status: 204, data: {} },
});
assert.strictEqual(hostedScheduledPost.status, "cancelled", "platform cancellation marks hosted scheduled post cancelled locally");
assert.strictEqual(hostedScheduledPost.platformStatus, "cancelled", "platform cancellation snapshots cancelled platform status");
assert.strictEqual(hostedScheduledPost.providerCancelResponse.upstream.status, 204, "platform cancellation stores provider response");
const rescheduledHostedPost = JSON.parse(JSON.stringify(hostedScheduledPost));
rescheduledHostedPost.status = "platform_scheduled";
Core.reschedulePost({ scheduledPosts: [rescheduledHostedPost] }, rescheduledHostedPost.id, "2026-06-13T08:00", "Asia/Shanghai");
const rescheduleHostedRequest = Core.buildRescheduleScheduledPostProviderRequest(scheduleState, rescheduledHostedPost);
assert.strictEqual(rescheduleHostedRequest.method, "PATCH", "hosted scheduled post time update uses PostEverywhere PATCH");
assert.strictEqual(rescheduleHostedRequest.endpoint, "https://app.posteverywhere.ai/api/v1/posts/post-hosted-1", "hosted scheduled post time update targets the platform post id");
assert.deepStrictEqual(rescheduleHostedRequest.body, {
  scheduled_for: "2026-06-13T00:00:00.000Z",
  timezone: "UTC",
}, "hosted scheduled post time update sends the new UTC scheduled time only");
Core.applyRescheduleScheduledPostProviderResult(rescheduledHostedPost, {
  ok: true,
  upstream: {
    data: {
      data: {
        post: {
          post_id: "post-hosted-1",
          status: "scheduled",
          scheduled_for: "2026-06-13T00:00:00.000Z",
          timezone: "UTC",
        },
      },
    },
  },
});
assert.strictEqual(rescheduledHostedPost.status, "platform_scheduled", "platform time update keeps hosted scheduled status");
assert.strictEqual(rescheduledHostedPost.platformScheduledFor, "2026-06-13T00:00:00.000Z", "platform time update stores hosted scheduled time");
schedulableTask.copies.tiktok.title = "Edited after scheduling";
assert.notStrictEqual(scheduledPost.copySnapshot.title, schedulableTask.copies.tiktok.title, "scheduled post snapshot is stable after copy edits");
assert.strictEqual(Core.scheduledPostStatusLabel("scheduled"), "已定时", "scheduled status has Chinese label");
assert.strictEqual(Core.dueScheduledPosts(scheduleState, "2026-06-12T01:29:00.000Z").length, 0, "scheduled post is not due before scheduled time");
assert.strictEqual(Core.dueScheduledPosts(scheduleState, "2026-06-12T01:30:00.000Z").length, 1, "scheduled post is due at scheduled time");
Core.markDueScheduledPosts(scheduleState, "2026-06-12T01:30:00.000Z");
assert.strictEqual(scheduleState.scheduledPosts[0].status, "due", "due scheduled posts are marked as waiting for publish");
Core.reschedulePost(scheduleState, scheduledPost.id, "2026-06-13T08:00", "Asia/Shanghai");
assert.strictEqual(scheduleState.scheduledPosts[0].status, "scheduled", "rescheduling moves due post back to scheduled");
assert.ok(scheduleState.scheduledPosts[0].scheduledAt.includes("2026-06-13T00:00:00.000Z"), "rescheduling stores UTC ISO time");
assert.strictEqual(scheduleState.scheduledPosts[0].providerRequestPreview.body.scheduled_for, "2026-06-13T00:00:00.000Z", "rescheduling updates hosted PostEverywhere scheduled_for time");
Core.cancelScheduledPost(scheduleState, scheduledPost.id);
assert.strictEqual(scheduleState.scheduledPosts[0].status, "cancelled", "cancel scheduled post updates status");

const migratedScheduledState = Core.migrateState({
  schemaVersion: 2,
  scheduledPosts: "bad value",
});
assert.deepStrictEqual(migratedScheduledState.scheduledPosts, [], "migration repairs missing scheduled queue");

const migratedCopyState = Core.migrateState({
  schemaVersion: 2,
  products: state.products,
  favorites: [],
  tasks: [
    {
      id: "task-old-copy",
      productId: state.products[0].id,
      productName: "挂脖风扇",
      favoriteName: "未使用收藏",
      strategy: "content-plan",
      variation: { hook: "Hot kitchen" },
      title: "挂脖风扇 · Hot kitchen",
      status: "copy_review",
      owner: "运营",
      duration: 15,
      ratio: "9:16",
      copies: {
        tiktok: {
          platformId: "tiktok",
          platformName: "TikTok",
          title: "净饮机 summer check",
          hook: "Hot kitchen, hands full, still need airflow.",
          body: "Hot kitchen, sweaty face, zero patience. This hands-free fan keeps air moving while you cook, clean, or walk outside.",
          cta: "Would you use this in the kitchen or outside?",
          hashtags: ["NeckFan"],
          chineseTranslation: "中文参考译文：\nNeck fan summer check\n厨房很热。 This hands-free fan keeps air moving.",
          postingNotes: "Use 痛点解决 style. Keep the final caption in English.",
          complianceWarnings: ["Confirm product airflow and lightweight claims are true"],
          rationale: "TikTok uses English 痛点解决 style.",
        },
      },
    },
  ],
});
const migratedCopy = migratedCopyState.tasks[0].copies.tiktok;
assertNoChineseText(migratedCopy.title, "migration repaired copy title");
assert.ok(!/[A-Za-z]{4,}/.test(migratedCopy.chineseTranslation), "migration repairs old mixed-language Chinese translation");
assert.ok(!/[A-Za-z]{4,}/.test(migratedCopy.postingNotes), "migration repairs old English posting notes");
assert.ok(migratedCopy.complianceWarnings.every((item) => !/[A-Za-z]{4,}/.test(item)), "migration repairs old English compliance warnings");
assert.ok(!/[A-Za-z]{4,}/.test(migratedCopy.rationale), "migration repairs old English rationale");

Core.clearProductImage(state, state.products[0].id);
assert.strictEqual(state.products[0].imageData, "", "clearProductImage removes uploaded image data");
assert.strictEqual(state.products[0].imageLabel, "产品图", "clearProductImage restores generic image label");

console.log("verify-core ok");
