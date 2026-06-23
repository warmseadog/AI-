(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.VideoWorkbenchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const platforms = [
    { id: "tiktok", name: "TikTok", tone: "口语、强钩子、短句", limit: 220 },
    { id: "instagram", name: "Instagram Reels", tone: "生活方式、hashtag", limit: 300 },
    { id: "youtube", name: "YouTube Shorts", tone: "标题清楚、描述简洁", limit: 500 },
    { id: "threads", name: "Threads", tone: "真实分享、弱广告感", limit: 500 },
  ];
  const publishPlatformIds = ["tiktok"];
  const publishPlatforms = platforms.filter((platform) => publishPlatformIds.includes(platform.id));
  const publishPlatformIdSet = new Set(publishPlatformIds);

  function isPublishPlatformEnabled(platformId) {
    return publishPlatformIdSet.has(platformId);
  }

  function normalizePublishPlatformIds(platformIds) {
    const selected = Array.isArray(platformIds)
      ? platformIds.filter((platformId) => isPublishPlatformEnabled(platformId))
      : [];
    return selected.length ? Array.from(new Set(selected)) : publishPlatformIds.slice();
  }

  function readableChineseOutputSpec(scope) {
    return {
      language: "zh-CN",
      scope,
      rules: [
        "所有面向运营审核的可读字段必须使用简体中文，包括标题、策略、痛点、卖点、画面描述、字幕、旁白、屏幕文字、视频提示词、审核点和风险提示。",
        "强制要求：整体可读文本至少 80% 为简体中文，不允许整段英文输出，不允许纯英文内容规划或纯英文分镜脚本。",
        "只有 subtitle、screenText、voiceover 中直接面向美国 TikTok 观众的短句可以使用英文；标题、画面、运镜、动作、图片提示词、视频提示词、产品重点、审核点和风险提示必须中文为主。",
        "TikTok、US、CTA、UGC、品牌名、产品英文名、英文屏幕文案可以保留英文，但必须放在中文句子里说明，不能整段英文输出。",
        "如果用户输入中包含英文要求，先理解含义，再用中文表达给运营审核。",
      ],
      forbidden: [
        "不要把产品理解、目标用户、内容策略、画面描述、视频提示词等可读字段写成整段英文。",
        "不要输出纯英文段落或纯英文列表。",
        "不要输出中英混杂到难以审核的正文。",
      ],
    };
  }

  function readableChineseSystemInstruction(scope) {
    return [
      "所有面向运营审核的可读字段必须使用简体中文。",
      `适用范围：${scope}。`,
      "强制要求：整体可读文本至少 80% 为简体中文，不允许整段英文输出。",
      "只有 subtitle、screenText、voiceover 这类直接给美国观众看的短句可以少量英文；其他解释、画面、策略、提示词和审核字段必须中文为主。",
      "允许保留 TikTok、US、UGC、CTA、品牌名、产品英文名或少量英文屏幕文案，但正文解释必须是中文。",
      "如果用户原始想法是英文或包含英文营销语境，也要转写成运营能直接看懂和修改的中文。",
    ].join("");
  }

  const copyStyles = [
    { id: "ugc-real", label: "真实 UGC", instruction: "像真实用户随手分享，短句、口语、少广告腔。" },
    { id: "problem-solution", label: "痛点解决", instruction: "先点出具体痛点，再自然带出产品解决方式。" },
    { id: "soft-sell", label: "轻带货", instruction: "轻度销售导向，突出适用场景和低压 CTA。" },
    { id: "funny", label: "搞笑剧情", instruction: "承接剧情反差，用轻松幽默语气，不冒犯人物。" },
    { id: "comparison", label: "前后对比", instruction: "强调使用前后的体感和动作变化，避免绝对化承诺。" },
  ];

  const llmProviders = [
    {
      id: "deepseek",
      name: "DeepSeek",
      apiStyle: "openai-chat",
      endpoint: "https://api.deepseek.com/chat/completions",
      model: "deepseek-v4-pro",
    },
    {
      id: "openai-responses",
      name: "OpenAI Responses",
      apiStyle: "openai-responses",
      endpoint: "https://api.openai.com/v1/responses",
      model: "gpt-4.1-mini",
    },
    {
      id: "openai-compatible",
      name: "OpenAI 兼容接口",
      apiStyle: "openai-chat",
      endpoint: "",
      model: "",
    },
    {
      id: "qwen-compatible",
      name: "通义千问兼容接口",
      apiStyle: "openai-chat",
      endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: "qwen-plus",
    },
    {
      id: "doubao-compatible",
      name: "豆包/火山方舟兼容接口",
      apiStyle: "openai-chat",
      endpoint: "",
      model: "",
    },
    {
      id: "custom-llm",
      name: "自定义大模型接口",
      apiStyle: "openai-chat",
      endpoint: "https://toapis.com/v1/chat/completions",
      model: "gpt-5.5",
    },
  ];

  const videoProviders = [
    {
      id: "jimeng-seedance-official",
      name: "即梦官方 / Seedance",
      apiStyle: "jimeng-seedance-official",
      endpoint: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
      statusEndpoint: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}",
      model: "doubao-seedance-2-0-260128",
    },
    {
      id: "toapis-seedance",
      name: "Seedance 2 / ToAPIs",
      apiStyle: "toapis-video",
      endpoint: "https://toapis.com/v1/videos/generations",
      statusEndpoint: "https://toapis.com/v1/videos/generations/{task_id}",
      model: "seedance-2-fast",
    },
    {
      id: "tongyi-wanxiang",
      name: "通义万相 / DashScope",
      apiStyle: "dashscope-video",
      endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      statusEndpoint: "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
      model: "wan2.7-i2v-2026-04-25",
    },
    { id: "seedfast2", name: "小云雀 SeedFast2", endpoint: "", model: "SeedFast2" },
    { id: "seedance", name: "Seedance / 火山引擎", endpoint: "", model: "Seedance" },
    { id: "kling", name: "可灵", endpoint: "", model: "Kling" },
    { id: "runway", name: "Runway", endpoint: "", model: "Runway" },
    { id: "pika", name: "Pika", endpoint: "", model: "Pika" },
    { id: "custom-video", name: "自定义视频接口", endpoint: "", model: "" },
  ];

  const seedProduct = {
    id: "product-draft",
    name: "",
    imageLabel: "产品图",
    imageUrl: "",
    imageData: "",
    images: [],
    audience: "",
    sellingPoints: "",
    offer: "",
    brandTone: "",
    detailsSaved: false,
  };

  const legacyFavoriteType = ["脚", "本"].join("");

  const defaultState = {
    schemaVersion: 2,
    products: [seedProduct],
    favorites: [],
    tasks: [],
    selectedProductId: seedProduct.id,
    selectedFavoriteId: "",
    strategy: "rewrite",
    count: 1,
    selectedTaskId: null,
    selectedPlatforms: ["tiktok"],
    copyStyle: "ugc-real",
    publishMode: "immediate",
    scheduleDate: "",
    scheduleTime: "",
    scheduleTimezone: "Asia/Shanghai",
    scheduledPosts: [],
    contentBrief: {
      seed: "",
      text: "",
      storyboardSceneCount: "6",
      storyboardDetailLevel: "detailed",
      videoBatchCount: 1,
      videoCreationStrategy: "original",
      videoResolution: "720p",
    },
    reverseVideo: {
      upload: null,
      frames: [],
      result: null,
      selectedFavoriteId: "",
      selectedProductId: seedProduct.id,
      secondaryCount: 3,
      creationStrategy: "rewrite",
      notes: "",
      status: "idle",
      error: "",
    },
    integrations: {
      llm: {
        mode: "http",
        provider: "custom-llm",
        apiStyle: "openai-chat",
        endpoint: "https://toapis.com/v1/chat/completions",
        model: "gpt-5.5",
        apiKey: "",
        providerConfigs: {},
      },
      video: {
        mode: "http",
        provider: "jimeng-seedance-official",
        apiStyle: "jimeng-seedance-official",
        endpoint: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
        statusEndpoint: "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}",
        model: "doubao-seedance-2-0-260128",
        apiKey: "",
        providerConfigs: {},
      },
      publisher: {
        mode: "http",
        provider: "posteverywhere",
        endpoint: "",
        workspaceId: "",
        accountIds: "",
        mediaIds: "",
        apiKey: "",
      },
    },
    integrationProfiles: {
      llm: [],
      video: [],
      publisher: [],
    },
    activeIntegrationProfileIds: {
      llm: "",
      video: "",
      publisher: "",
    },
    newFavorite: {
      type: "分镜脚本",
      name: "",
      content: "",
      tags: "",
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createInitialState() {
    return clone(defaultState);
  }

  function forceHttpMode(integration) {
    if (!integration || typeof integration !== "object") return integration;
    integration.mode = "http";
    return integration;
  }

  function normalizeVideoResolution(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["480p", "720p", "1080p"].includes(normalized) ? normalized : "720p";
  }

  function providerVideoResolution(value, uppercase = false) {
    const resolution = normalizeVideoResolution(value);
    return uppercase ? resolution.toUpperCase() : resolution;
  }

  function migrateState(input) {
    const base = createInitialState();
    const incoming = input && typeof input === "object" ? input : {};
    const legacy = incoming.schemaVersion !== 2;
    const state = legacy ? base : Object.assign(base, incoming);
    state.schemaVersion = 2;
    state.products = legacy ? base.products : (Array.isArray(state.products) && state.products.length ? state.products : base.products);
    state.favorites = legacy ? [] : (Array.isArray(state.favorites) ? state.favorites : []);
    state.tasks = legacy ? [] : (Array.isArray(state.tasks) ? state.tasks : []);
    state.tasks = state.tasks.map((task) => repairSavedTaskTimestamps(repairSavedVideoTask(repairSavedCopyTask(repairSavedContentPlanTask(task)))));
    state.scheduledPosts = legacy ? [] : (Array.isArray(state.scheduledPosts) ? state.scheduledPosts : []);
    state.selectedPlatforms = normalizePublishPlatformIds(state.selectedPlatforms);
    state.copyStyle = copyStyles.some((style) => style.id === state.copyStyle) ? state.copyStyle : base.copyStyle;
    state.publishMode = ["immediate", "scheduled"].includes(state.publishMode) ? state.publishMode : base.publishMode;
    state.scheduleDate = state.scheduleDate || base.scheduleDate;
    state.scheduleTime = state.scheduleTime || base.scheduleTime;
    state.scheduleTimezone = state.scheduleTimezone || base.scheduleTimezone;
    state.products = state.products.map(normalizeProduct);
    state.favorites = state.favorites.map((favorite) => Object.assign({}, favorite, {
      type: favorite.type === legacyFavoriteType ? "分镜脚本" : favorite.type,
    }));
    state.contentBrief = legacy ? clone(base.contentBrief) : Object.assign({}, base.contentBrief, state.contentBrief || {});
    state.integrations = {
      llm: forceHttpMode(Object.assign({}, base.integrations.llm, incoming.integrations && (incoming.integrations.llm || incoming.integrations.gpt))),
      video: forceHttpMode(Object.assign({}, base.integrations.video, incoming.integrations && incoming.integrations.video)),
      publisher: forceHttpMode(Object.assign({}, base.integrations.publisher, incoming.integrations && incoming.integrations.publisher)),
    };
    state.integrationProfiles = Object.assign({}, base.integrationProfiles, state.integrationProfiles || {});
    state.integrationProfiles.llm = Array.isArray(state.integrationProfiles.llm) ? state.integrationProfiles.llm : (Array.isArray(state.llmProfiles) ? state.llmProfiles : []);
    state.integrationProfiles.video = Array.isArray(state.integrationProfiles.video) ? state.integrationProfiles.video : [];
    state.integrationProfiles.publisher = Array.isArray(state.integrationProfiles.publisher) ? state.integrationProfiles.publisher : [];
    state.activeIntegrationProfileIds = Object.assign({}, base.activeIntegrationProfileIds, state.activeIntegrationProfileIds || {});
    state.activeIntegrationProfileIds.llm = state.activeIntegrationProfileIds.llm || state.activeLlmProfileId || "";
    state.activeIntegrationProfileIds.video = state.activeIntegrationProfileIds.video || "";
    state.activeIntegrationProfileIds.publisher = state.activeIntegrationProfileIds.publisher || "";
    state.newFavorite = Object.assign({}, base.newFavorite, state.newFavorite || {});
    if (state.newFavorite.type === legacyFavoriteType) state.newFavorite.type = "分镜脚本";
    state.contentBrief.videoBatchCount = Math.max(1, Math.min(Number(state.contentBrief.videoBatchCount || base.contentBrief.videoBatchCount), 10));
    state.contentBrief.videoCreationStrategy = state.contentBrief.videoCreationStrategy || base.contentBrief.videoCreationStrategy;
    state.contentBrief.videoResolution = normalizeVideoResolution(state.contentBrief.videoResolution || base.contentBrief.videoResolution);
    state.reverseVideo = Object.assign({}, base.reverseVideo, state.reverseVideo || {});
    state.reverseVideo.frames = Array.isArray(state.reverseVideo.frames) ? state.reverseVideo.frames : [];
    state.reverseVideo.selectedProductId = state.reverseVideo.selectedProductId || state.selectedProductId || base.reverseVideo.selectedProductId;
    state.reverseVideo.secondaryCount = Math.max(1, Math.min(Number(state.reverseVideo.secondaryCount || base.reverseVideo.secondaryCount), 10));
    state.reverseVideo.creationStrategy = state.reverseVideo.creationStrategy || base.reverseVideo.creationStrategy;
    return state;
  }

  function getProviderPreset(list, providerId) {
    return list.find((provider) => provider.id === providerId) || list[0];
  }

  const integrationProviderFields = ["mode", "provider", "apiStyle", "endpoint", "statusEndpoint", "model", "apiKey", "workspaceId", "accountIds", "mediaIds"];

  function rememberIntegrationProviderConfig(integration) {
    if (!integration || !integration.provider) return integration;
    integration.providerConfigs = integration.providerConfigs && typeof integration.providerConfigs === "object" ? integration.providerConfigs : {};
    const saved = {};
    integrationProviderFields.forEach((field) => {
      if (integration[field] !== undefined) saved[field] = integration[field];
    });
    integration.providerConfigs[integration.provider] = saved;
    return integration;
  }

  function applyIntegrationPreset(integration, preset) {
    if (!integration || !preset) return integration;
    integration.provider = preset.id;
    if (preset.apiStyle) integration.apiStyle = preset.apiStyle;
    if (!integration.endpoint || integration.endpoint === "" || integration.endpoint.includes("api.openai.com") || integration.endpoint.includes("api.deepseek.com")) {
      integration.endpoint = preset.endpoint || "";
    }
    if (preset.statusEndpoint) integration.statusEndpoint = preset.statusEndpoint;
    if (!integration.model || integration.model === "" || integration.model === "gpt-4.1-mini" || integration.model === "deepseek-chat" || integration.model === "SeedFast2") {
      integration.model = preset.model || "";
    }
    return integration;
  }

  function savedConfigLooksLikeAnotherPreset(saved, providerId) {
    if (!saved) return false;
    return llmProviders.concat(videoProviders).some((candidate) => {
      if (!candidate || candidate.id === providerId || /^custom-/.test(candidate.id)) return false;
      const endpointMatches = candidate.endpoint && saved.endpoint === candidate.endpoint;
      const modelMatches = candidate.model && saved.model === candidate.model;
      const apiStyleMatches = candidate.apiStyle && saved.apiStyle === candidate.apiStyle;
      const statusEndpointMatches = candidate.statusEndpoint && saved.statusEndpoint === candidate.statusEndpoint;
      return endpointMatches && (modelMatches || apiStyleMatches || statusEndpointMatches);
    });
  }

  function savedProviderConfigMatchesPreset(saved, preset) {
    if (!saved || !preset) return false;
    if (/^custom-/.test(preset.id)) return !savedConfigLooksLikeAnotherPreset(saved, preset.id);
    if (preset.endpoint && saved.endpoint && saved.endpoint !== preset.endpoint) return false;
    if (preset.apiStyle && saved.apiStyle && saved.apiStyle !== preset.apiStyle) return false;
    if (preset.model && saved.model && saved.model !== preset.model) return false;
    if (preset.statusEndpoint && saved.statusEndpoint && saved.statusEndpoint !== preset.statusEndpoint) return false;
    return true;
  }

  function switchIntegrationProvider(integration, preset) {
    if (!integration || !preset) return integration;
    rememberIntegrationProviderConfig(integration);
    const providerConfigs = integration.providerConfigs && typeof integration.providerConfigs === "object" ? integration.providerConfigs : {};
    const saved = savedProviderConfigMatchesPreset(providerConfigs[preset.id], preset) ? providerConfigs[preset.id] : null;
    const currentMode = "http";
    integrationProviderFields.forEach((field) => {
      delete integration[field];
    });
    Object.assign(integration, saved || {
      mode: currentMode,
      apiStyle: preset.apiStyle || "",
      endpoint: preset.endpoint || "",
      statusEndpoint: preset.statusEndpoint || "",
      model: preset.model || "",
      apiKey: "",
    });
    integration.provider = preset.id;
    integration.mode = "http";
    integration.providerConfigs = providerConfigs;
    return integration;
  }

  function cloneIntegrationProfileConfig(integration) {
    return integrationProviderFields.reduce((acc, field) => {
      if (integration && integration[field] !== undefined) acc[field] = integration[field];
      return acc;
    }, {});
  }

  function ensureIntegrationProfileState(state, key) {
    state.integrationProfiles = state.integrationProfiles && typeof state.integrationProfiles === "object" ? state.integrationProfiles : {};
    state.activeIntegrationProfileIds = state.activeIntegrationProfileIds && typeof state.activeIntegrationProfileIds === "object" ? state.activeIntegrationProfileIds : {};
    state.integrationProfiles[key] = Array.isArray(state.integrationProfiles[key]) ? state.integrationProfiles[key] : [];
    state.activeIntegrationProfileIds[key] = state.activeIntegrationProfileIds[key] || "";
  }

  function saveIntegrationProfile(state, key, name) {
    ensureIntegrationProfileState(state, key);
    const integration = state.integrations && state.integrations[key] ? state.integrations[key] : {};
    const profileName = String(name || integration.model || integration.provider || "未命名配置").trim() || "未命名配置";
    const existingId = state.activeIntegrationProfileIds[key];
    const existing = existingId ? state.integrationProfiles[key].find((profile) => profile.id === existingId) : null;
    const profile = existing || { id: uid(`${key}-profile`), createdAt: new Date().toISOString() };
    Object.assign(profile, {
      name: profileName,
      provider: integration.provider || "",
      endpoint: integration.endpoint || "",
      model: integration.model || "",
      apiStyle: integration.apiStyle || "",
      updatedAt: new Date().toISOString(),
      config: cloneIntegrationProfileConfig(integration),
    });
    if (!existing) state.integrationProfiles[key].unshift(profile);
    state.activeIntegrationProfileIds[key] = profile.id;
    return profile;
  }

  function applyIntegrationProfile(state, key, profileId) {
    ensureIntegrationProfileState(state, key);
    const profile = state.integrationProfiles[key].find((item) => item.id === profileId);
    if (!profile || !profile.config) return null;
    state.integrations = state.integrations || {};
    state.integrations[key] = Object.assign({}, state.integrations[key] || {}, profile.config);
    state.integrations[key].mode = "http";
    rememberIntegrationProviderConfig(state.integrations[key]);
    state.activeIntegrationProfileIds[key] = profile.id;
    return profile;
  }

  function deleteIntegrationProfile(state, key, profileId) {
    ensureIntegrationProfileState(state, key);
    const index = state.integrationProfiles[key].findIndex((profile) => profile.id === profileId);
    if (index < 0) return null;
    const deleted = state.integrationProfiles[key].splice(index, 1)[0];
    if (state.activeIntegrationProfileIds[key] === profileId) {
      state.activeIntegrationProfileIds[key] = state.integrationProfiles[key][0] ? state.integrationProfiles[key][0].id : "";
    }
    return deleted;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function getById(list, id) {
    return list.find((item) => item.id === id) || list[0];
  }

  function strategyLabel(strategy) {
    return {
      rewrite: "AI 改写后批量生成",
      original: "原内容直接生成多条",
      hooks: "原内容 + 不同开头",
      platform: "原内容 + 平台风格",
    }[strategy] || "AI 改写后批量生成";
  }

  function copyStyleById(styleId) {
    return copyStyles.find((style) => style.id === styleId) || copyStyles[0];
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) return tags.filter(Boolean);
    return String(tags || "")
      .split(/[，,\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function productDisplayName(product) {
    return String(product && product.name || "").trim() || "产品";
  }

  function productMaterialLabel(product) {
    const name = String(product && product.name || "").trim();
    return name ? `${name} 产品图` : "上传产品图";
  }

  const productImageRoles = ["主图", "正面", "侧面", "背面", "45 度", "细节", "场景图"];
  const productImageRolePurposes = {
    "主图": "主图锁定整体外观、颜色、比例和主体轮廓。",
    "正面": "正面锁定面板、Logo、出水口、按钮等正向关键结构。",
    "侧面": "侧面补充机身厚度、水箱、侧边结构和材质过渡。",
    "背面": "背面补充背部比例、接口、背板和不可忽略的结构。",
    "45 度": "45 度图补充立体体积、边角弧度和前侧关系。",
    "细节": "细节图锁定托盘、按钮、Logo、出水口、水箱材质等局部。",
    "场景图": "场景图只参考环境、台面摆放、手部动作和氛围，不改变产品本体。",
  };

  function normalizeProductImageRole(value, fallback) {
    const role = String(value || "").trim();
    if (role === "场景") return "场景图";
    if (role === "包装") return "细节";
    if (/45|四十五|斜/i.test(role)) return "45 度";
    if (productImageRoles.includes(role)) return role;
    return fallback || "细节";
  }

  function productImageFallbackRole(index) {
    return productImageRoles[Math.min(index, productImageRoles.length - 1)] || "细节";
  }

  function normalizeProductImage(input, index = 0) {
    if (!input || typeof input !== "object") return null;
    const url = String(input.url || "").trim();
    const publicUrl = String(input.publicUrl || input.publicURL || "").trim();
    const dataUrl = String(input.dataUrl || input.dataURL || input.imageData || "").trim();
    if (!url && !publicUrl && !dataUrl) return null;
    const type = publicUrl ? "hosted" : (url ? "url" : "upload");
    const label = String(input.label || input.imageLabel || "").trim() || (type === "url" ? "图片 URL" : "上传产品图");
    const priority = Number.isFinite(Number(input.priority)) ? Number(input.priority) : index + 1;
    return {
      id: String(input.id || uid("product-image")),
      type,
      url,
      publicUrl,
      dataUrl,
      label,
      role: normalizeProductImageRole(input.role, productImageFallbackRole(index)),
      priority,
      useForVideo: input.useForVideo === false ? false : true,
      modelVisible: Boolean(input.modelVisible || publicUrl),
    };
  }

  function sortedProductImages(images) {
    return (Array.isArray(images) ? images : [])
      .map((image, index) => normalizeProductImage(image, index))
      .filter(Boolean)
      .sort((left, right) => (Number(left.priority || 0) - Number(right.priority || 0)) || String(left.id).localeCompare(String(right.id)));
  }

  function normalizeProduct(product) {
    const normalized = Object.assign({ detailsSaved: false, images: [] }, product || {});
    normalized.images = sortedProductImages(normalized.images);
    return normalized;
  }

  function addProductImage(product, input) {
    if (!product) return null;
    const images = sortedProductImages(product.images);
    const image = normalizeProductImage(Object.assign({}, input, {
      priority: input && input.priority !== undefined ? input.priority : images.length + 1,
      role: input && input.role || productImageFallbackRole(images.length),
    }), images.length);
    if (!image) return null;
    images.push(image);
    product.images = sortedProductImages(images);
    if (image.type === "upload" && !String(product.imageData || "").trim()) {
      product.imageData = image.dataUrl;
      product.imageLabel = image.label || "产品图";
    }
    if (image.type === "url" && !String(product.imageUrl || "").trim()) {
      product.imageUrl = image.url;
    }
    return image;
  }

  function updateProductImage(product, imageId, field, value) {
    if (!product || !imageId) return null;
    product.images = sortedProductImages(product.images);
    const image = product.images.find((item) => item.id === imageId);
    if (!image) return null;
    if (field === "role") image.role = normalizeProductImageRole(value, image.role);
    if (field === "label") image.label = String(value || "").trim() || image.label;
    if (field === "priority") image.priority = Number.isFinite(Number(value)) ? Number(value) : image.priority;
    if (field === "useForVideo") image.useForVideo = Boolean(value);
    product.images = sortedProductImages(product.images);
    return image;
  }

  function removeProductImage(product, imageId) {
    if (!product || !imageId) return null;
    product.images = sortedProductImages(product.images);
    const index = product.images.findIndex((image) => image.id === imageId);
    if (index < 0) return null;
    const removed = product.images.splice(index, 1)[0];
    product.images = sortedProductImages(product.images.map((image, imageIndex) => Object.assign({}, image, { priority: imageIndex + 1 })));
    if (removed.dataUrl && product.imageData === removed.dataUrl) {
      const nextUpload = product.images.find((image) => image.dataUrl);
      product.imageData = nextUpload ? nextUpload.dataUrl : "";
      product.imageLabel = nextUpload ? nextUpload.label : "产品图";
    }
    if (removed.url && product.imageUrl === removed.url) {
      const nextUrl = product.images.find((image) => image.url);
      product.imageUrl = nextUrl ? nextUrl.url : "";
    }
    return removed;
  }

  function productAiContext(product) {
    if (!product || product.detailsSaved !== true) return {};
    const context = {
      name: String(product.name || "").trim(),
      audience: String(product.audience || "").trim(),
      sellingPoints: String(product.sellingPoints || "").trim(),
      offer: String(product.offer || "").trim(),
      brandTone: String(product.brandTone || "").trim(),
    };
    return Object.fromEntries(Object.entries(context).filter(([, value]) => value));
  }

  function materialFromProductImage(image) {
    const material = {
      type: image.type,
      label: image.label || image.role || "产品参考图",
      role: image.role || "细节",
      priority: image.priority || 1,
      useForVideo: image.useForVideo !== false,
    };
    if (image.url) material.url = image.url;
    if (image.publicUrl) material.publicUrl = image.publicUrl;
    if (image.dataUrl) material.dataUrl = image.dataUrl;
    if (image.modelVisible) material.modelVisible = true;
    return material;
  }

  function productImageUrlMaterial(product, priority = 1) {
    const imageUrl = String(product && product.imageUrl || "").trim();
    if (!imageUrl) return null;
    const material = { type: "url", label: "图片 URL", role: "主图", priority, useForVideo: true, url: imageUrl };
    if (/^https?:\/\//i.test(imageUrl)) material.modelVisible = true;
    return material;
  }

  function productMaterials(product) {
    if (product && Array.isArray(product.images) && product.images.length) {
      const materials = sortedProductImages(product.images).map(materialFromProductImage);
      const imageUrlMaterial = productImageUrlMaterial(product, 0);
      if (imageUrlMaterial && !httpMaterialUrls(materials).length) {
        const imageUrl = String(imageUrlMaterial.url || "").trim();
        const alreadyIncluded = materials.some((material) => {
          return String(material.publicUrl || material.url || "").trim() === imageUrl;
        });
        if (!alreadyIncluded) materials.unshift(imageUrlMaterial);
      }
      return materials;
    }
    const materials = [];
    const imageUrlMaterial = productImageUrlMaterial(product, 1);
    if (imageUrlMaterial) materials.push(imageUrlMaterial);
    const imageData = String(product && product.imageData || "").trim();
    if (imageData) {
      materials.push({
        type: "upload",
        label: productMaterialLabel(product),
        role: materials.length ? "细节" : "主图",
        priority: materials.length + 1,
        useForVideo: true,
        dataUrl: imageData,
      });
    }
    return materials;
  }

  function videoProductMaterials(product) {
    return productMaterials(product).filter((material) => material.useForVideo !== false);
  }

  function materialUrl(material) {
    return material && String(material.publicUrl || material.url || material.dataUrl || "").trim();
  }

  function httpMaterialUrls(materials) {
    return materials
      .map((material) => String(material.publicUrl || material.url || "").trim())
      .filter((url) => /^https?:\/\//i.test(url));
  }

  function isDataImageUrl(value) {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || "").trim());
  }

  function isLocalOutputUrl(value) {
    return /^\/outputs\/uploads\//i.test(String(value || "").trim());
  }

  function jimengMaterialReferences(materials) {
    return materials
      .map((material) => {
        const dataUrl = String(material && material.dataUrl || "").trim();
        const publicUrl = String(material && material.publicUrl || "").trim();
        const url = String(material && material.url || "").trim();
        const localUrl = isLocalOutputUrl(url) ? url : "";
        const modelUrl = isDataImageUrl(dataUrl) ? dataUrl : (/^https?:\/\//i.test(publicUrl || url) ? (publicUrl || url) : localUrl);
        if (!modelUrl) return null;
        return {
          url: modelUrl,
          localUrl: localUrl && modelUrl !== dataUrl ? localUrl : "",
        };
      })
      .filter(Boolean);
  }

  function modelVisibleProductImageValidation(product, videoMaterials, videoImageUrls) {
    return {
      required: true,
      productName: productDisplayName(product),
      materialCount: videoMaterials.length,
      imageUrlCount: videoImageUrls.length,
      missingReason: videoMaterials.length
        ? "产品图目前只有本地路径或本地上传数据，视频模型无法访问。"
        : "当前任务没有可用于视频生成的产品图。",
    };
  }

  function modelVisibleProductImageError(validation) {
    const reason = validation && validation.missingReason || "视频模型没有收到产品图链接。";
    return `模型无法接收产品图：${reason} 请先上传到 ImgBB/公网图床，或填写公网 HTTPS 图片链接后再生成视频。`;
  }

  function assertModelVisibleProductImages(validation) {
    if (!validation || validation.required !== true) return;
    if (Number(validation.imageUrlCount || 0) > 0) return;
    const error = new Error(modelVisibleProductImageError(validation));
    error.code = "MODEL_VISIBLE_PRODUCT_IMAGE_REQUIRED";
    throw error;
  }

  function jimengReferenceImageContent(references) {
    return references.slice(0, 9).map((reference) => {
      const imageUrl = { url: reference.url };
      if (reference.localUrl) imageUrl.local_url = reference.localUrl;
      return {
        role: "reference_image",
        type: "image_url",
        image_url: imageUrl,
      };
    });
  }

  function listItemText(value) {
    if (value === undefined || value === null || value === false) return "";
    if (Array.isArray(value)) return value.map(listItemText).filter(Boolean).join("、");
    if (typeof value === "object") {
      return Object.entries(value)
        .map(([key, item]) => {
          const text = listItemText(item);
          return text ? `${key}: ${text}` : "";
        })
        .filter(Boolean)
        .join("；");
    }
    return String(value || "").trim();
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(listItemText).filter(Boolean);
    if (value && typeof value === "object") return [listItemText(value)].filter(Boolean);
    return String(value || "")
      .split(/[，,\n#]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function containsChineseText(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function englishCopyTitle(platformId) {
    return platformId === "youtube" ? "Real Use in 15 Seconds" : "Summer Use Check";
  }

  function publisherAccountIds(integration) {
    return splitList(integration && (integration.accountIds || integration.account_ids))
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  function uniqueList(items) {
    const seen = new Set();
    return items.filter((item) => {
      const value = String(item || "").trim();
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function publisherUploadMediaIds(task) {
    const response = task && task.providerResponses && task.providerResponses.publisherMedia;
    if (!response || response.ok === false) return [];
    return splitList(response.mediaId || response.media_id || response.id || response.result?.media_id || response.result?.mediaId);
  }

  function scheduledPostMediaIds(state, task, platformIds) {
    if (!state || !task || !Array.isArray(state.scheduledPosts)) return [];
    const platformSet = new Set((platformIds || []).filter(Boolean));
    const matchesPlatform = (post) => !platformSet.size || platformSet.has(post.platformId);
    return uniqueList(state.scheduledPosts
      .filter((post) => post && post.taskId === task.id && post.status !== "cancelled" && matchesPlatform(post))
      .flatMap((post) => splitList(
        post.mediaIds
        || post.media_ids
        || post.providerRequestPreview?.body?.media_ids
        || post.videoSnapshot?.posteverywhereMediaId
        || post.videoSnapshot?.mediaId
      )));
  }

  function publishMediaIds(state, task, platformIds) {
    const integration = state && state.integrations && state.integrations.publisher || {};
    const sources = [
      splitList(task && task.video && (task.video.posteverywhereMediaId || task.video.mediaId)),
      publisherUploadMediaIds(task),
      splitList(integration.mediaIds || integration.media_ids),
      scheduledPostMediaIds(state, task, platformIds),
    ];
    const firstAvailable = sources.find((items) => items.length);
    return firstAvailable ? uniqueList(firstAvailable) : [];
  }

  function timezoneOffsetMinutes(timezone) {
    return {
      UTC: 0,
      "Asia/Shanghai": 480,
      "America/Los_Angeles": -420,
      "America/Chicago": -300,
      "America/New_York": -240,
    }[timezone] ?? 0;
  }

  function scheduledLocalToIso(localDateTime, timezone) {
    const value = String(localDateTime || "").trim();
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) throw new Error("请选择有效的定时发布时间");
    const [, year, month, day, hour, minute] = match.map(Number);
    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - timezoneOffsetMinutes(timezone) * 60000;
    return new Date(utcMs).toISOString();
  }

  function scheduledIsoToLocal(iso, timezone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { date: "", time: "" };
    const localMs = date.getTime() + timezoneOffsetMinutes(timezone) * 60000;
    const shifted = new Date(localMs);
    const pad = (value) => String(value).padStart(2, "0");
    return {
      date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
      time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    };
  }

  function sanitizePublishText(value) {
    return String(value || "")
      .replace(/Unknown White Gadget/gi, "这款产品")
      .replace(/原分镜脚本复用/g, "真实场景演示")
      .replace(/图片素材中的产品特征、用户想法中的卖点/g, "产品实拍细节和真实使用卖点")
      .replace(/图片素材中的产品特征/g, "产品实拍细节")
      .replace(/用户想法中的卖点/g, "真实使用卖点")
      .replace(/\s+([。！？,.，])/g, "$1")
      .trim();
  }

  function createContentBriefSnapshot(product, favorite, contentBrief) {
    const details = productAiContext(product);
    const text = String(contentBrief && contentBrief.text || favorite?.content || "").trim();
    const seed = String(contentBrief && contentBrief.seed || "").trim();
    const sellingPoints = splitList(details.sellingPoints || seed || "产品实拍细节、真实使用卖点").slice(0, 5);
    const offer = details.offer || (text.match(/下单[^。；\n]*/) || [])[0] || "了解更多";
    const audienceInsight = details.audience || "由用户想法和产品图判断的目标用户";
    const painPoint = text || seed || "目标用户在真实使用场景里的具体不便";
    return {
      audienceInsight,
      painPoint,
      productPromise: sellingPoints.length ? sellingPoints.join("、") : "展示产品解决具体问题的方式",
      proofPoints: sellingPoints.length ? sellingPoints : ["产品外观", "使用动作", "场景结果"],
      offer,
      tone: details.brandTone || "真实测评，口语，弱广告感",
      riskNotes: ["不要夸大产品效果", "优惠、赠品和活动信息需人工确认仍有效"],
      seed,
      text,
    };
  }

  function requireProductMaterials(product) {
    const materials = productMaterials(product);
    if (!materials.length) {
      throw new Error("至少提供一张图片素材：填写图片 URL 或上传图片。");
    }
    return materials;
  }

  function addFavorite(state, input) {
    const name = String(input.name || "").trim();
    const content = String(input.content || "").trim();
    if (!name || !content) {
      throw new Error("收藏名称和内容不能为空");
    }
    const favorite = {
      id: uid("fav"),
      type: input.type || "分镜脚本",
      name,
      score: Number(input.score || 70),
      reuseCount: 0,
      tags: normalizeTags(input.tags),
      content,
    };
    if (input.sourceKey) favorite.sourceKey = String(input.sourceKey);
    state.favorites.unshift(favorite);
    state.selectedFavoriteId = favorite.id;
    state.newFavorite = { type: "分镜脚本", name: "", content: "", tags: "" };
    return favorite;
  }

  function buildVariation(index, strategy) {
    const hooks = ["痛点开场", "结果前置", "真实使用", "场景对比", "快速演示"];
    const tones = ["真实测评", "主播带货", "朋友安利", "功能解释", "快节奏种草"];
    if (strategy === "original") {
      return { hook: "真实场景演示", tone: "保持原内容节奏", angle: `参考内容版本 ${index + 1}` };
    }
    if (strategy === "hooks") {
      return { hook: hooks[index % hooks.length], tone: "保持卖点", angle: `开头变体 ${index + 1}` };
    }
    if (strategy === "platform") {
      return { hook: hooks[index % hooks.length], tone: platforms[index % platforms.length].name, angle: `平台风格 ${index + 1}` };
    }
    return { hook: hooks[index % hooks.length], tone: tones[index % tones.length], angle: `AI 改写版本 ${index + 1}` };
  }

  function generateStoryboard(product, favorite, variation, contentBrief) {
    const briefText = String(contentBrief && contentBrief.text || favorite?.content || "");
    const productName = productDisplayName(product);
    const brief = createContentBriefSnapshot(product, favorite, contentBrief);
    const proof = brief.proofPoints.slice(0, 3).join("、") || "产品核心卖点";
    const offer = brief.offer || "了解更多优惠";
    return [
      {
        time: "0-3s",
        title: variation.hook,
        visual: "用真实使用场景展示目标用户遇到的具体不便。",
        subtitle: "这个小麻烦，你可能也遇到过。",
        camera: "9:16 竖屏中近景，轻微推进到用户动作和产品",
        motion: "先展示使用前的不便，再切到产品出现",
        voiceover: "先看这个真实使用场景。",
        screenText: "真实痛点",
        imagePrompt: `${productName} 使用前场景，竖屏构图，自然光，真实短视频风格`,
        videoPrompt: `3 秒 9:16 竖屏，展示目标用户的使用痛点，镜头轻微推进，字幕短促清楚`,
        productFocus: "用户痛点",
        reviewChecklist: ["痛点是否一眼能看懂", "字幕是否短", "画面是否避免夸大效果"],
        riskNotes: [],
      },
      {
        time: "3-6s",
        title: "产品展示",
        visual: `${productName} 旋转展示，强调 ${proof}。`,
        subtitle: "核心卖点直接看得见。",
        camera: "产品 45 度侧前方特写，保持外观完整露出",
        motion: "手部演示关键功能，动作清楚连贯",
        voiceover: `这款 ${productName} 的重点是 ${proof}。`,
        screenText: proof,
        imagePrompt: `${productName} 产品展示，外观完整，关键结构清晰，竖屏电商短视频`,
        videoPrompt: `3 秒 9:16 竖屏，${productName} 完整展示，手部演示核心功能，镜头稳定，突出 ${proof}`,
        productFocus: proof,
        reviewChecklist: ["产品外观是否完整", "卖点是否来自已提供资料", "动作是否清楚"],
        riskNotes: [],
      },
      {
        time: "6-10s",
        title: "场景证明",
        visual: briefText || "连续展示两个到三个高频使用场景。",
        subtitle: "多个场景都能用得上。",
        camera: "三连切镜头，每个场景保持产品和手部动作清楚",
        motion: "快速切换不同使用动作和结果",
        voiceover: "把卖点放进真实场景里看。",
        screenText: "场景 1 / 场景 2 / 场景 3",
        imagePrompt: `${productName} 多个真实使用场景拼接感，竖屏，生活化`,
        videoPrompt: `4 秒 9:16 竖屏，连续展示 ${productName} 在不同场景里的使用，节奏快但真实`,
        productFocus: "多场景日常使用",
        reviewChecklist: ["场景是否符合目标用户", "是否避免暗示未经证实的功效", "切换节奏是否清晰"],
        riskNotes: ["避免承诺绝对效果"],
      },
      {
        time: "10-15s",
        title: "转化收尾",
        visual: "展示产品使用结果和结尾转化信息。",
        subtitle: offer.includes("了解更多") ? offer : `${offer}`,
        camera: "产品与使用结果同框，中景固定镜头",
        motion: "用户完成一次使用动作，画面停留在产品和转化文字",
        voiceover: offer.includes("了解更多") ? "想了解更多，可以点进来看看。" : offer,
        screenText: offer,
        imagePrompt: `${productName} 与使用结果同框，画面干净，竖屏收尾`,
        videoPrompt: `5 秒 9:16 竖屏，展示 ${productName} 使用后的整洁台面和优惠信息，镜头稳定，结尾 CTA 自然不过度营销`,
        productFocus: "转化优惠和使用结果",
        reviewChecklist: ["优惠是否仍有效", "CTA 是否自然", "是否避免过度承诺"],
        riskNotes: ["赠品、安装指导等活动信息需人工确认"],
      },
    ];
  }

  function parseSecond(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (text.includes(":")) {
      const parts = text.split(":").map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) return null;
      return parts.reduce((total, part) => (total * 60) + part, 0);
    }
    const match = text.match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const second = Number(match[0]);
    return Number.isFinite(second) ? second : null;
  }

  function parseTimeRange(value) {
    const parts = String(value || "").split(/[-~]/).map((part) => parseSecond(part));
    if (parts.length < 2 || parts.some((part) => part === null)) return null;
    const [start, end] = parts;
    if (end <= start) return null;
    return { start, end };
  }

  function formatSecond(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0$/, "");
  }

  function formatTimeRange(start, end) {
    return `${formatSecond(start)}-${formatSecond(end)}s`;
  }

  function markStoryboardTiming(scenes, status) {
    Object.defineProperty(scenes, "timingStatus", {
      value: status,
      enumerable: false,
      configurable: true,
    });
    return scenes;
  }

  function normalizeStoryboardTiming(scenes, targetDuration = 15) {
    const sourceScenes = Array.isArray(scenes) ? scenes : [];
    const target = Math.max(1, Number(targetDuration || 15));
    if (!sourceScenes.length) return markStoryboardTiming([], "invalid");
    let status = "ok";
    let previousEnd = 0;
    const fallbackDuration = target / sourceScenes.length;
    const normalized = sourceScenes.map((scene, index) => {
      const next = Object.assign({}, scene || {});
      const parsed = parseTimeRange(next.time);
      let start = parsed ? parsed.start : previousEnd;
      let end = parsed ? parsed.end : start + Number(next.durationSecond || next.duration || fallbackDuration);
      if (!Number.isFinite(start) || start < 0) {
        start = previousEnd;
        status = "auto_repaired";
      }
      if (!Number.isFinite(end) || end <= start) {
        end = start + fallbackDuration;
        status = "auto_repaired";
      }
      if (index > 0 && Math.abs(start - previousEnd) > 0.1) {
        start = previousEnd;
        if (end <= start) end = start + fallbackDuration;
        status = "auto_repaired";
      }
      next.startSecond = Math.round(start * 10) / 10;
      next.endSecond = Math.round(end * 10) / 10;
      next.durationSecond = Math.round((next.endSecond - next.startSecond) * 10) / 10;
      previousEnd = next.endSecond;
      return next;
    });
    const last = normalized[normalized.length - 1];
    if (last.endSecond < target || last.endSecond > target) {
      last.endSecond = target;
      last.durationSecond = Math.round((last.endSecond - last.startSecond) * 10) / 10;
      status = "auto_repaired";
    }
    normalized.forEach((scene) => {
      scene.time = formatTimeRange(scene.startSecond, scene.endSecond);
    });
    return markStoryboardTiming(normalized, status);
  }

  function frameDataUrl(frame) {
    const dataUrl = String(frame && frame.dataUrl || "").trim();
    return /^(data:image\/|https?:\/\/)/i.test(dataUrl) ? dataUrl : "";
  }

  function visionFrameInputs(userContent) {
    return (Array.isArray(userContent && userContent.frames) ? userContent.frames : [])
      .map((frame, index) => ({
        index,
        time: frame && frame.time || "",
        label: frame && frame.label || `frame-${index + 1}`,
        dataUrl: frameDataUrl(frame),
      }))
      .filter((frame) => frame.dataUrl);
  }

  function representativeVisionFrames(frames, limit = 4) {
    const source = Array.isArray(frames) ? frames : [];
    if (source.length <= limit) return source;
    const indexes = new Set();
    for (let slot = 0; slot < limit; slot += 1) {
      indexes.add(Math.round(slot * (source.length - 1) / (limit - 1)));
    }
    return Array.from(indexes).sort((a, b) => a - b).map((index) => source[index]).filter(Boolean);
  }

  function metadataWithoutInlineImages(userContent) {
    const next = clone(userContent || {});
    const frames = Array.isArray(next.frames) ? next.frames : [];
    next.frames = frames.map((frame) => {
      const copy = Object.assign({}, frame || {});
      if (copy.dataUrl) {
        delete copy.dataUrl;
        copy.inlineImageProvided = true;
      }
      return copy;
    });
    next.inlineFrameImageCount = frames.filter((frame) => frameDataUrl(frame)).length;
    return next;
  }

  function supportsReverseVisionModel(integration) {
    const model = String(integration && integration.model || "").trim().toLowerCase();
    // Includes GPT-5.5 and other OpenAI-compatible vision chat models used for reverse reconstruction.
    return /^gpt-(?:5(?:\.5)?|4o|4\.1|4\.5)(?:$|[-_.])/.test(model);
  }

  function buildLlmBody(integration, systemPrompt, userContent, schemaName, schema) {
    const apiStyle = integration.apiStyle || "openai-chat";
    const availableVisionFrames = visionFrameInputs(userContent);
    const usesVisionContent = availableVisionFrames.length && (/vision|multimodal/i.test(apiStyle) || supportsReverseVisionModel(integration));
    const visionFrames = usesVisionContent ? representativeVisionFrames(availableVisionFrames, 4) : [];
    const userContentForText = visionFrames.length ? metadataWithoutInlineImages(userContent) : userContent;
    if (apiStyle === "openai-responses") {
      const userContentParts = visionFrames.length
        ? [
          { type: "input_text", text: JSON.stringify(userContentForText) },
          ...visionFrames.map((frame) => ({
            type: "input_image",
            image_url: frame.dataUrl,
          })),
        ]
        : JSON.stringify(userContentForText);
      return {
        model: integration.model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContentParts },
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            schema,
            strict: false,
          },
        },
      };
    }

    const jsonInstruction = `请只返回 JSON，不要输出解释。JSON schema 名称：${schemaName}。`;
    if (visionFrames.length) {
      return {
        model: integration.model,
        messages: [
          { role: "system", content: `${systemPrompt}\n${jsonInstruction}` },
          {
            role: "user",
            content: [
              { type: "text", text: JSON.stringify(userContentForText) },
              ...visionFrames.map((frame) => ({
                type: "image_url",
                image_url: { url: frame.dataUrl },
              })),
            ],
          },
        ],
        response_format: { type: "json_object" },
      };
    }
    return {
      model: integration.model,
      messages: [
        { role: "system", content: `${systemPrompt}\n${jsonInstruction}` },
        { role: "user", content: JSON.stringify(userContentForText) },
      ],
      response_format: { type: "json_object" },
    };
  }

  function buildContentBriefProviderRequest(state, product, seedText) {
    const integration = state.integrations.llm;
    const materials = productMaterials(product);
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["brief"],
      properties: {
        brief: { type: "string" },
      },
    };
    const userContent = {
      product: productAiContext(product),
      materials,
      seed: String(seedText || state.contentBrief.seed || "").trim(),
      outputLanguage: readableChineseOutputSpec("content brief"),
      target: "生成一段可直接用于短视频分镜生成的内容策划文本，包含画面、节奏、场景、卖点和结尾转化。",
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, `你是短视频内容策划助手。根据产品资料、图片素材和用户要求，生成一段中文视频内容 brief。${readableChineseSystemInstruction("content brief")}只输出结构化 JSON。`, userContent, "content_brief", schema),
    };
  }

  function buildContentPlanProviderRequest(state) {
    const integration = state.integrations.llm;
    const product = getById(state.products, state.selectedProductId);
    const materials = requireProductMaterials(product);
    const idea = String(state.contentBrief && state.contentBrief.seed || "").trim();
    if (!idea) {
      throw new Error("请先输入产品想法。");
    }
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["contentPlan"],
      properties: {
        contentPlan: {
          type: "object",
          description: "内容规划必须中文为主；除少量面向美国观众的英文短句外，运营审核字段至少 80% 使用简体中文，不允许整段英文输出。",
          additionalProperties: true,
          required: ["keySellingPoints", "mainPainPoint", "videoThroughline", "mustShow", "mustAvoid"],
          properties: {
            productUnderstanding: { type: "string" },
            targetAudience: { type: "string" },
            keySellingPoints: { type: "array", items: { type: "string" } },
            mainPainPoint: { type: "string" },
            videoThroughline: { type: "string" },
            usageScenarios: { type: "array", items: { type: "string" } },
            painPoints: { type: "array", items: { type: "string" } },
            contentAngle: { type: "string" },
            hookOptions: { type: "array", items: { type: "string" } },
            coreMessage: { type: "string" },
            strategy: { type: "string" },
            hook: { type: "string" },
            visualStyle: { type: "string" },
            rhythm: { type: "string" },
            mustShow: { type: "array", items: { type: "string" } },
            mustAvoid: { type: "array", items: { type: "string" } },
            cta: { type: "string" },
            reviewSummary: { type: "string" },
            complianceNotes: { type: "array", items: { type: "string" } },
          },
        },
      },
    };
    const userContent = {
      product: productAiContext(product),
      materials,
      idea,
      targetPlatform: state.selectedPlatforms && state.selectedPlatforms[0] || "tiktok",
      market: "US",
      duration: 15,
      ratio: "9:16",
      outputLanguage: readableChineseOutputSpec("content plan"),
      lengthPolicy: "生成分镜前置摘要，不写完整营销策划案；总字数控制在 300-500 中文字以内。",
      fieldLimits: {
        keySellingPoints: "最多 3 条，只保留影响画面的核心卖点。",
        mainPainPoint: "只写 1 个主痛点。",
        videoThroughline: "只写 1 句话，说明视频从哪里切入、如何转到产品、如何收尾。",
        mustShow: "最多 5 条，必须是视频里必须出现的具体画面。",
        mustAvoid: "最多 3 条，合规和产品不跑偏约束合并在这里。",
      },
      outputFields: [
        "keySellingPoints",
        "mainPainPoint",
        "videoThroughline",
        "mustShow",
        "mustAvoid",
      ],
    };
    return {
      provider: integration.provider,
      mode: "http",
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, `你是跨境电商短视频分镜前置摘要助手。根据用户想法和产品图，只生成一份短摘要，帮助后续分镜抓住重点。不要写完整营销策划案，不要展开目标用户画像、使用场景、视觉风格、节奏长段落、CTA 长段落。总字数控制在 300-500 中文字以内。只输出 5 个字段：keySellingPoints 最多 3 条、mainPainPoint 1 句、videoThroughline 1 句、mustShow 最多 5 条、mustAvoid 最多 3 条。不要输出分镜、镜头拆分、时间轴、字幕字段或视频生成提示词。${readableChineseSystemInstruction("content plan 的所有可读字段")}只输出结构化 JSON，不要编造未经证实的功效。`, userContent, "content_plan", schema),
    };
  }

  function buildStoryboardFromIdeaProviderRequest(state, options = {}) {
    const integration = state.integrations.llm;
    const product = getById(state.products, state.selectedProductId);
    const materials = requireProductMaterials(product);
    const idea = String(state.contentBrief && state.contentBrief.seed || "").trim();
    if (!idea) {
      throw new Error("请先输入视频想法。");
    }
    const duration = Number(options.duration || 15);
    const configuredCount = options.sceneCount || state.contentBrief && state.contentBrief.storyboardSceneCount || "6";
    const sceneCount = storyboardSceneCountForDuration(duration, configuredCount);
    const detailLevel = options.detailLevel || state.contentBrief && state.contentBrief.storyboardDetailLevel || "detailed";
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["tasks"],
      properties: {
        tasks: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            description: "直接根据用户视频想法生成的分镜任务必须中文为主；title、angle、strategy、reviewSummary 使用简体中文，不允许纯英文段落。",
            additionalProperties: true,
            required: ["angle", "hook", "duration", "scenes"],
            properties: {
              title: { type: "string" },
              angle: { type: "string" },
              hook: { type: "string" },
              duration: { type: "number" },
              strategy: { type: "string" },
              reviewSummary: { type: "string" },
              scenes: {
                type: "array",
                minItems: sceneCount,
                maxItems: sceneCount,
                items: {
                  type: "object",
                  description: "单个镜头必须中文为主。只有 subtitle、screenText、voiceover 的观众短句可少量英文；visual、camera、motion、imagePrompt、videoPrompt、negativePrompt、productFocus 必须中文为主。",
                  additionalProperties: true,
                  required: ["time", "title", "visual", "subtitle", "videoPrompt"],
                  properties: {
                    time: { type: "string" },
                    startSecond: { type: "number" },
                    endSecond: { type: "number" },
                    durationSecond: { type: "number" },
                    title: { type: "string" },
                    visual: { type: "string" },
                    subtitle: { type: "string" },
                    camera: { type: "string" },
                    motion: { type: "string" },
                    voiceover: { type: "string" },
                    screenText: { type: "string" },
                    imagePrompt: { type: "string" },
                    videoPrompt: { type: "string" },
                    negativePrompt: { type: "string" },
                    productFocus: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const userContent = {
      product: productAiContext(product),
      materials,
      idea,
      source: "direct_idea_to_storyboard",
      targetPlatform: state.selectedPlatforms && state.selectedPlatforms[0] || "tiktok",
      market: "US",
      sceneCount,
      configuredSceneCount: configuredCount,
      detailLevel,
      detailInstruction: storyboardDetailLabel(detailLevel),
      duration,
      ratio: "9:16",
      outputLanguage: readableChineseOutputSpec("storyboard"),
      timingRequirements: {
        exactDurationSeconds: duration,
        sceneCount,
        mustCoverFullRange: `分镜必须从 0s 开始，最后一个镜头必须精确结束在 ${duration}s。`,
        preferredCut: `${duration}s 视频默认拆成 ${sceneCount} 个镜头，每个镜头只表达一个画面动作或信息点。`,
      },
      outputFields: [
        "time",
        "startSecond",
        "endSecond",
        "durationSecond",
        "title",
        "visual",
        "subtitle",
        "camera",
        "motion",
        "voiceover",
        "screenText",
        "imagePrompt",
        "videoPrompt",
        "negativePrompt",
        "productFocus",
      ],
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, `你是短视频分镜策划助手。根据用户的视频想法、产品资料和产品图，直接生成可执行分镜脚本。不要输出前置摘要、营销策划案或中间规划；只输出结构化 JSON。镜头数量必须等于请求的 sceneCount，且完整覆盖指定时长。${readableChineseSystemInstruction("直接生成的分镜脚本、镜头字段和视频提示词")}`, userContent, "video_storyboard_batch", schema),
    };
  }

  function buildReverseStoryboardProviderRequest(state) {
    const integration = state.integrations.llm;
    const reverseVideo = state.reverseVideo || {};
    const upload = reverseVideo.upload;
    const frames = Array.isArray(reverseVideo.frames) ? reverseVideo.frames : [];
    if (!upload || !upload.url) {
      throw new Error("请先上传一个参考视频。");
    }
    if (!frames.length) {
      throw new Error("请先从视频抽取关键帧。");
    }
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["reverseStoryboard"],
      properties: {
        reverseStoryboard: {
          type: "object",
          additionalProperties: true,
          required: ["title", "summary", "hook", "duration", "ratio", "scenes"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            hook: { type: "string" },
            duration: { type: "number" },
            ratio: { type: "string" },
            sourceReconstruction: {
              type: "object",
              additionalProperties: true,
              properties: {
                productIdentity: { type: "string" },
                environment: { type: "string" },
                cameraStyle: { type: "string" },
                copywriting: { type: "string" },
                voiceTone: { type: "string" },
                cameraAngles: { type: "string" },
                lighting: { type: "string" },
                composition: { type: "string" },
                motionRhythm: { type: "string" },
                visibleText: { type: "array", items: { type: "string" } },
                uncertaintyNotes: { type: "array", items: { type: "string" } },
              },
            },
            rewriteTemplate: {
              type: "object",
              additionalProperties: true,
              properties: {
                replaceableProductSlot: { type: "string" },
                lockedElements: { type: "array", items: { type: "string" } },
                adaptableElements: { type: "array", items: { type: "string" } },
                negativePrompt: { type: "string" },
              },
            },
            scenes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: true,
                required: ["time", "title", "visual", "subtitle", "videoPrompt"],
                properties: {
                  time: { type: "string" },
                  title: { type: "string" },
                  visual: { type: "string" },
                  subtitle: { type: "string" },
                  camera: { type: "string" },
                  motion: { type: "string" },
                  voiceover: { type: "string" },
                  screenText: { type: "string" },
                  imagePrompt: { type: "string" },
                  videoPrompt: { type: "string" },
                  negativePrompt: { type: "string" },
                  productFocus: { type: "string" },
                  reviewChecklist: { type: "array", items: { type: "string" } },
                  riskNotes: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    };
    const userContent = {
      upload,
      frames,
      notes: String(reverseVideo.notes || "").trim(),
      language: "zh-CN",
      promptTarget: "中文视频生成模型",
      fidelityMode: "source_reconstruction_first",
      visualInputMode: frames.some((frame) => String(frame.dataUrl || "").startsWith("data:image/")) ? "inline_frame_images_available" : "frame_urls_only_check_provider_visibility",
      reconstructionProtocol: [
        "先忠实复刻原视频：产品身份、外观颜色、使用环境、人物动作、镜头构图、光线、节奏、文案、语音、镜头角度和屏幕文字都必须来自关键帧证据。",
        "每个镜头的 videoPrompt 必须用中文写成可直接交给视频生成模型的提示词，重点保留原片角度、画面顺序、动作节奏、字幕文案和旁白语气。",
        "再给 rewriteTemplate：只把可替换的产品槽位、可保留的镜头结构、文案语气和负面约束拆出来，供后续二创。",
        "如果无法从画面确认，写入 uncertaintyNotes，不要脑补。",
      ],
      prohibitedBehavior: [
        "不要把原视频产品替换成备注里的新产品。",
        "不要输出 Generic product、Product Name、tangled cables 等占位模板。",
        "不要把二创目标混入 sourceReconstruction。",
      ],
      target: "最大程度反推原视频场景和中文生成提示词。输出必须先还原原片，再单独给可替换产品的二创模板；不能确定的音频、对话或语音语气要写成可替换建议。",
      targetPlatform: state.selectedPlatforms && state.selectedPlatforms[0] || "tiktok",
      market: "US",
      outputFields: [
        "title",
        "summary",
        "hook",
        "duration",
        "ratio",
        "sourceReconstruction",
        "rewriteTemplate",
        "scenes",
        "time",
        "visual",
        "subtitle",
        "camera",
        "motion",
        "voiceover",
        "screenText",
        "imagePrompt",
        "videoPrompt",
        "negativePrompt",
        "productFocus",
        "reviewChecklist",
        "riskNotes",
      ],
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, "你是短视频拆解和分镜反推助手。根据上传视频抽取的关键帧，输出中文反推脚本，目标是让后续视频模型再次生成时最大程度复刻原视频的画面、文案、语音语气、镜头角度、动作节奏和构图。只输出结构化 JSON；不能确定的音频或台词要写成可替换建议。", userContent, "reverse_storyboard", schema),
    };
  }

  function generateContentBrief(product, seedText) {
    const seed = String(seedText || "").trim();
    const details = productAiContext(product);
    const productName = details.name || productDisplayName(product);
    const audience = details.audience || "目标用户";
    const sellingPoints = details.sellingPoints || "图片素材和用户要求中的核心卖点";
    const offer = details.offer || "自然的下单或了解更多引导";
    const focus = seed || `${sellingPoints}，${offer}`;
    return `我想做一条 15 秒 9:16 短视频。开头用真实居家场景展示用户痛点：${audience} 在日常使用时遇到的不便。中段结合图片素材展示 ${productName}，突出 ${sellingPoints}。画面节奏要清楚、生活化，重点围绕 ${focus} 展开，不夸大功效。结尾带出 ${offer}，用自然口吻引导下单或了解更多。`;
  }

  function applyContentBriefProviderResult(response) {
    const result = providerResult(response);
    if (!result) return "";
    return String(result.brief || result.text || result.content || "").trim();
  }

  function buildStoryboardProviderRequest(state, product, favorite, options) {
    const integration = state.integrations.llm;
    const materials = requireProductMaterials(product);
    const contentBrief = Object.assign({}, state.contentBrief || {}, options.contentBrief || {});
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["tasks"],
      properties: {
        contentBrief: { type: "object" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            description: "分镜任务必须中文为主；title、angle、strategy、reviewSummary 使用简体中文，不允许纯英文段落。",
            additionalProperties: true,
            required: ["angle", "hook", "duration", "scenes"],
            properties: {
              title: { type: "string" },
              angle: { type: "string" },
              hook: { type: "string" },
              duration: { type: "number" },
              strategy: { type: "string" },
              reviewSummary: { type: "string" },
              qualityScore: { type: "number" },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  description: "单个镜头必须中文为主。只有 subtitle、screenText、voiceover 的观众短句可少量英文；visual、camera、motion、imagePrompt、videoPrompt、productFocus、reviewChecklist、riskNotes 必须中文为主。",
                  additionalProperties: true,
                  required: ["time", "title", "visual", "subtitle", "videoPrompt"],
                  properties: {
                    time: { type: "string" },
                    startSecond: { type: "number" },
                    endSecond: { type: "number" },
                    durationSecond: { type: "number" },
                    title: { type: "string" },
                    visual: { type: "string" },
                    subtitle: { type: "string" },
                    camera: { type: "string" },
                    motion: { type: "string" },
                    voiceover: { type: "string" },
                    screenText: { type: "string" },
                    imagePrompt: { type: "string" },
                    videoPrompt: { type: "string" },
                    productFocus: { type: "string" },
                    reviewChecklist: { type: "array", items: { type: "string" } },
                    riskNotes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const userContent = {
      product: productAiContext(product),
      materials,
      contentBrief: {
        seed: String(contentBrief.seed || "").trim(),
        text: String(contentBrief.text || "").trim(),
      },
      favorite: favorite || null,
      strategy: options.strategy,
      count: options.count,
      duration: 15,
      ratio: "9:16",
      outputLanguage: readableChineseOutputSpec("storyboard"),
      timingRequirements: {
        exactDurationSeconds: 15,
        mustCoverFullRange: "scenes must start at 0s and the final scene must end exactly at 15s",
        preferredRanges: ["0-3s", "3-7s", "7-11s", "11-15s"],
      },
      targetFields: [
        "contentBrief",
        "strategy",
        "reviewSummary",
        "camera",
        "motion",
        "voiceover",
        "screenText",
        "imagePrompt",
        "videoPrompt",
        "startSecond",
        "endSecond",
        "durationSecond",
        "productFocus",
        "reviewChecklist",
        "riskNotes",
      ],
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, `你是短视频分镜策划助手。输出结构化 JSON，不夸大产品功效。先给内容策略，再给可审核、可编辑、可提交视频模型的完整分镜。每个 task 必须是 15 秒，分镜从 0s 开始，最后一个镜头必须精确结束在 15s。${readableChineseSystemInstruction("分镜任务、镜头字段和视频提示词")}`, userContent, "video_storyboard_batch", schema),
    };
  }

  function storyboardSceneCountForDuration(duration, configuredCount) {
    if (configuredCount && configuredCount !== "auto") {
      const explicitCount = Number(configuredCount);
      if (Number.isFinite(explicitCount)) return Math.max(3, Math.min(Math.round(explicitCount), 12));
    }
    const seconds = Number(duration || 15);
    if (seconds <= 6) return 4;
    if (seconds <= 10) return 6;
    return 6;
  }

  function storyboardDetailLabel(level) {
    return {
      standard: "标准：每个镜头给出时间、画面、字幕和视频提示词。",
      detailed: "细致：每个镜头给出时间、画面、字幕、运镜、动作、旁白、屏幕字、产品重点和视频提示词。",
      dense: "高密度：镜头切分更细，每个镜头只承载一个信息点，并给出审核点和风险提示。",
    }[level] || "细致：每个镜头给出时间、画面、字幕、运镜、动作、旁白、屏幕字、产品重点和视频提示词。";
  }

  function buildStoryboardFromContentPlanProviderRequest(state, task, options = {}) {
    if (!task || !task.contentPlan) {
      throw new Error("请先生成并确认内容规划。");
    }
    const integration = state.integrations.llm;
    const product = getById(state.products, task.productId || state.selectedProductId);
    const materials = requireProductMaterials(product);
    const duration = Number(options.duration || task.duration || 15);
    const configuredCount = options.sceneCount || state.contentBrief && state.contentBrief.storyboardSceneCount || "auto";
    const sceneCount = storyboardSceneCountForDuration(duration, configuredCount);
    const detailLevel = options.detailLevel || state.contentBrief && state.contentBrief.storyboardDetailLevel || "detailed";
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["tasks"],
      properties: {
        tasks: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            description: "按已确认内容规划生成的分镜任务必须中文为主；title、angle、strategy、reviewSummary 使用简体中文，不允许纯英文段落。",
            additionalProperties: true,
            required: ["angle", "hook", "duration", "scenes"],
            properties: {
              title: { type: "string" },
              angle: { type: "string" },
              hook: { type: "string" },
              duration: { type: "number" },
              strategy: { type: "string" },
              reviewSummary: { type: "string" },
              scenes: {
                type: "array",
                minItems: sceneCount,
                maxItems: sceneCount,
                items: {
                  type: "object",
                  description: "按当前规划生成的单个镜头必须中文为主。只有 subtitle、screenText、voiceover 的观众短句可少量英文；visual、camera、motion、imagePrompt、videoPrompt、productFocus、reviewChecklist、riskNotes 必须中文为主。",
                  additionalProperties: true,
                  required: ["time", "title", "visual", "subtitle", "videoPrompt"],
                  properties: {
                    time: { type: "string" },
                    startSecond: { type: "number" },
                    endSecond: { type: "number" },
                    durationSecond: { type: "number" },
                    title: { type: "string" },
                    visual: { type: "string" },
                    subtitle: { type: "string" },
                    camera: { type: "string" },
                    motion: { type: "string" },
                    voiceover: { type: "string" },
                    screenText: { type: "string" },
                    imagePrompt: { type: "string" },
                    videoPrompt: { type: "string" },
                    negativePrompt: { type: "string" },
                    productFocus: { type: "string" },
                    reviewChecklist: { type: "array", items: { type: "string" } },
                    riskNotes: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const userContent = {
      product: productAiContext(product),
      materials,
      contentPlan: clone(task.contentPlan),
      contentPlanText: String(task.contentPlanText || task.contentPlan.rawText || "").trim(),
      sourceTaskId: task.id,
      sceneCount,
      configuredSceneCount: configuredCount,
      detailLevel,
      detailInstruction: storyboardDetailLabel(detailLevel),
      duration,
      ratio: task.ratio || "9:16",
      outputLanguage: readableChineseOutputSpec("storyboard from edited content plan"),
      timingRequirements: {
        exactDurationSeconds: duration,
        sceneCount,
        mustCoverFullRange: `分镜必须从 0s 开始，最后一个镜头必须精确结束在 ${duration}s。`,
        preferredCut: `${duration}s 视频默认拆成 ${sceneCount} 个镜头，每个镜头只表达一个画面动作或信息点。`,
      },
      outputFields: [
        "time",
        "startSecond",
        "endSecond",
        "durationSecond",
        "title",
        "visual",
        "subtitle",
        "camera",
        "motion",
        "voiceover",
        "screenText",
        "imagePrompt",
        "videoPrompt",
        "negativePrompt",
        "productFocus",
        "reviewChecklist",
        "riskNotes",
      ],
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, `你是短视频分镜策划助手。必须严格基于用户已经确认和修改过的 contentPlan 生成分镜，不要回到原始想法自由发挥。输出结构化 JSON。分镜要更细，镜头数量必须等于请求的 sceneCount，且完整覆盖指定时长。${readableChineseSystemInstruction("按当前内容规划生成的分镜脚本、镜头字段和视频提示词")}`, userContent, "video_storyboard_batch", schema),
    };
  }

  const toapisSupportedDurations = [6, 10, 15];

  function normalizeToApisDuration(duration) {
    const requested = Number(duration || 10);
    if (requested <= 6) return 6;
    if (requested <= 10) return 10;
    return 15;
  }

  function isViduQ3Model(model) {
    return /^viduq3(?:-|$)/i.test(String(model || ""));
  }

  function normalizeViduQ3Duration(duration) {
    const requested = Number(duration || 10);
    const wholeSeconds = Math.round(requested);
    return Math.max(1, Math.min(wholeSeconds, 16));
  }

  function productVisualIdentityPrompt(product, productName) {
    const materials = productMaterials(product);
    const videoMaterials = videoProductMaterials(product);
    const hasReferenceImage = Boolean(materials.length);
    const nameText = [productName, product && product.name].filter(Boolean).join(" ");
    const referenceLines = materials.map((material, index) => {
      const usage = material.useForVideo === false ? "仅用于场景理解，不作为产品外观参考" : "参与产品外观参考";
      return `${index + 1}. ${material.role || "参考图"}：${material.label || "产品参考图"}，${usage}`;
    });
    const genericLock = [
      "产品参考图为最高优先级：视频中的产品必须严格匹配所选产品参考图。",
      referenceLines.length ? `产品参考图组：\n${referenceLines.join("\n")}` : "",
      videoMaterials.length > 1 ? "主图决定整体外观；正面、侧面、背面和细节图只用于补全结构，不得互相混淆或生成另一款产品。" : "",
      materials.some((material) => material.role === "场景图" || material.useForVideo === false) ? "场景图只参考使用环境、手部动作和氛围，不得改变产品本体的颜色、轮廓、比例、材质和关键结构。" : "",
      "不得改变产品颜色、外观轮廓、比例、材质和关键结构；不得改成同类但不同款产品；不得自动美化成其他品牌或其他型号。",
      "允许改变镜头角度、光线和场景，但产品本体的形状、配色、部件位置、面板/按钮/出水口/托盘等关键细节必须保持一致。",
      hasReferenceImage ? "如果视频模型支持图生视频，必须把所选产品图作为产品身份参考，而不是只按文字想象产品。" : "",
    ].filter(Boolean);
    if (/aigerri|净饮|饮水|water\s*purifier|water\s*dispenser/i.test(nameText)) {
      genericLock.push(
        "净饮机外观锁定：乳白色圆角机身，整体为台式箱体比例，不能改成水壶、咖啡机、圆柱净水器或金属饮水机。",
        "必须保留黑色半透明水箱/侧面面板，位置在机身侧面或背侧可见区域，不能改成透明蓝色、全白或全金属外壳。",
        "必须保留前部突出的出水口罩/出水头结构、银色或亮面边缘、下方灰色接水托盘，以及机身正面 Aigerri 标识的位置和简洁风格。",
        "不要改变产品主色：机身为暖白/乳白，水箱和面板为黑色半透明，托盘为浅灰色。"
      );
    }
    return genericLock.join("\n");
  }

  function compactVideoPromptText(value, maxLength = 180) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).replace(/[，,；;。\s]+$/g, "")}。`;
  }

  function sceneVideoInstruction(scene, options = {}) {
    const includeAudienceCopy = Boolean(options.includeAudienceCopy);
    const visual = compactVideoPromptText(scene.videoPrompt || scene.visual || "", 180);
    const cameraMotion = compactVideoPromptText([scene.camera, scene.motion].filter(Boolean).join("；"), 140);
    const productFocus = compactVideoPromptText(scene.productFocus || "", 120);
    const negativePrompt = compactVideoPromptText(scene.negativePrompt || "", 120);
    const parts = [
      `${scene.time} ${scene.title || ""}`.trim(),
      visual ? `画面：${visual}` : "",
      cameraMotion ? `运镜动作：${cameraMotion}` : "",
      productFocus ? `产品要求：${productFocus}` : "",
      includeAudienceCopy && scene.subtitle ? `字幕：${compactVideoPromptText(scene.subtitle, 80)}` : "",
      includeAudienceCopy && scene.voiceover ? `旁白：${compactVideoPromptText(scene.voiceover, 100)}` : "",
      includeAudienceCopy && scene.screenText ? `屏幕字：${compactVideoPromptText(scene.screenText, 80)}` : "",
      negativePrompt ? `负面约束：${negativePrompt}` : "",
    ].filter(Boolean);
    return parts.join("；");
  }

  function buildVideoProviderRequest(state, task, product) {
    const integration = state.integrations.video;
    if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
      throw new Error("请先用当前内容规划生成分镜，再生成视频。");
    }
    const normalizedTaskDuration = integration.apiStyle === "jimeng-seedance-official" ? 15 : Number(task.duration || 15);
    const timedStoryboard = normalizeStoryboardTiming(task.storyboard, normalizedTaskDuration);
    task.storyboard = timedStoryboard;
    task.storyboardTimingStatus = timedStoryboard.timingStatus;
    task.duration = normalizedTaskDuration;
    task.videoResolution = normalizeVideoResolution(task.videoResolution || task.contentBrief?.videoResolution || state.contentBrief?.videoResolution);
    const details = productAiContext(product);
    const productName = details.name || productDisplayName(product);
    const videoMaterials = videoProductMaterials(product);
    const videoHttpUrls = httpMaterialUrls(videoMaterials);
    const officialJimengReferences = integration.apiStyle === "jimeng-seedance-official" ? jimengMaterialReferences(videoMaterials) : [];
    const referenceImageValidation = modelVisibleProductImageValidation(
      product,
      videoMaterials,
      integration.apiStyle === "jimeng-seedance-official" ? officialJimengReferences : videoHttpUrls
    );
    assertModelVisibleProductImages(referenceImageValidation);
    const visualIdentity = productVisualIdentityPrompt(product, productName);
    const productFacts = [
      `生成产品：${productName}`,
      `Product to render: ${productName}`,
      details.sellingPoints ? `产品卖点：${details.sellingPoints}` : "",
      details.sellingPoints ? `Product selling points: ${details.sellingPoints}` : "",
      details.audience ? `目标用户：${details.audience}` : "",
      details.audience ? `Target user: ${details.audience}` : "",
      details.offer ? `转化/CTA：${details.offer}` : "",
      details.offer ? `Offer or CTA: ${details.offer}` : "",
      "必须使用选中的产品作为主体，不要换成泛化产品或无关产品。",
      "Use the selected product as the subject. Do not replace it with a generic or unrelated product.",
      visualIdentity,
    ].filter(Boolean).join("\n");
    const sourceFidelityPrompt = task.source === "reverse-video"
      ? [
          "反推二创要求：最大程度复刻参考视频。",
          "保留原片的镜头角度、构图、运镜、动作节奏、字幕文案结构和旁白/语音语气。",
          "只替换为当前选中的产品与产品事实，不要改变原片的叙事顺序和转化收尾。",
          task.sourceFidelityInstruction || "",
        ].filter(Boolean).join("\n")
      : "";
    const includeAudienceCopy = task.source === "reverse-video";
    const prompt = task.storyboard.map((scene) => sceneVideoInstruction(scene, { includeAudienceCopy })).join("\n");
    const durationPrompt = `Target duration: exactly ${task.duration}s. The sequence starts at 0s and the final scene ends at ${task.duration}s.`;
    const stylePrompt = task.videoStyleInstruction || "";
    const fullPrompt = [productFacts, sourceFidelityPrompt, stylePrompt, durationPrompt, prompt].filter(Boolean).join("\n");
    if (integration.apiStyle === "dashscope-video") {
      const imageUrl = videoHttpUrls[0] || "";
      const isWan27 = /^wan2\.7-/i.test(String(integration.model || ""));
      const input = isWan27
        ? {
            prompt: fullPrompt,
            media: imageUrl ? [{ type: "first_frame", url: imageUrl }] : [],
          }
        : { prompt: fullPrompt };
      if (!isWan27 && imageUrl) input.img_url = imageUrl;
      return {
        provider: integration.provider,
        mode: integration.mode,
        apiStyle: integration.apiStyle,
        endpoint: integration.endpoint,
        statusEndpoint: integration.statusEndpoint,
        model: integration.model,
        apiKey: integration.apiKey,
        requiresReferenceImage: true,
        referenceImageValidation,
        headers: { "X-DashScope-Async": "enable" },
        body: {
          model: integration.model,
          input,
          parameters: {
            duration: isWan27 ? Math.max(2, Math.min(Number(task.duration || 5), 15)) : Math.min(Number(task.duration || 5), 5),
            ...(isWan27 ? { resolution: providerVideoResolution(task.videoResolution, true), watermark: false } : {}),
            prompt_extend: true,
          },
        },
      };
    }
    if (integration.apiStyle === "toapis-video") {
      const requestedDuration = Number(task.duration || 10);
      const viduQ3 = isViduQ3Model(integration.model);
      const submittedDuration = viduQ3 ? normalizeViduQ3Duration(requestedDuration) : normalizeToApisDuration(requestedDuration);
      const body = {
        model: integration.model,
        prompt: fullPrompt,
        duration: submittedDuration,
        aspect_ratio: task.ratio || "9:16",
        resolution: providerVideoResolution(task.videoResolution),
      };
      if (viduQ3) body.audio = true;
      if (videoHttpUrls.length) {
        body.image_urls = videoHttpUrls;
      }
      return {
        provider: integration.provider,
        mode: integration.mode,
        apiStyle: integration.apiStyle,
        endpoint: integration.endpoint,
        statusEndpoint: integration.statusEndpoint,
        model: integration.model,
        apiKey: integration.apiKey,
        requiresReferenceImage: true,
        referenceImageValidation,
        duration: {
          requested: requestedDuration,
          submitted: submittedDuration,
          supported: viduQ3 ? [1, 16] : toapisSupportedDurations.slice(),
        },
        body,
      };
    }
    if (integration.apiStyle === "jimeng-seedance-official") {
      const referenceImages = officialJimengReferences.slice(0, 9);
      return {
        provider: integration.provider,
        mode: integration.mode,
        apiStyle: integration.apiStyle,
        endpoint: integration.endpoint,
        statusEndpoint: integration.statusEndpoint,
        model: integration.model,
        apiKey: integration.apiKey,
        requiresReferenceImage: true,
        referenceImageValidation,
        duration: {
          requested: Number(task.duration || 15),
          submitted: 15,
          supported: [4, 15],
        },
        body: {
          model: integration.model,
          content: [
            { type: "text", text: fullPrompt },
            ...jimengReferenceImageContent(referenceImages),
          ],
          duration: Math.max(4, Math.min(Number(task.duration || 15), 15)),
          ratio: task.ratio || "9:16",
          resolution: normalizeVideoResolution(task.videoResolution),
          watermark: false,
          camera_fixed: false,
        },
      };
    }
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      requiresReferenceImage: true,
      referenceImageValidation,
      body: {
        model: integration.model,
        provider: integration.provider,
        duration: task.duration,
        ratio: task.ratio,
        resolution: normalizeVideoResolution(task.videoResolution),
        image: videoHttpUrls[0] || null,
        prompt: fullPrompt,
        negative_prompt: "blur, distorted product, wrong logo, unreadable text",
      },
    };
  }

  function taskJobId(task) {
    return task && task.video && (task.video.jobId || task.video.taskId || task.video.id);
  }

  function missingVideoJobMessage() {
    return "视频任务已进入生成中，但本地没有保存视频任务 ID，无法查询视频结果。请重新生成视频。";
  }

  function markVideoTaskMissingJob(task) {
    const message = missingVideoJobMessage();
    task.video = Object.assign({}, task.video || {}, {
      url: "",
      providerStatus: "NO_LOCAL_JOB",
      providerMessage: message,
    });
    task.reviewNote = message;
    const hasStoryboard = Array.isArray(task.storyboard) && task.storyboard.length;
    return setTaskStatus(task, hasStoryboard ? "storyboard_ready" : "content_plan_ready");
  }

  function buildVideoStatusProviderRequest(state, task) {
    const currentIntegration = state.integrations.video || {};
    const generationRequest = task && task.providerRequests && task.providerRequests.video || {};
    const integration = Object.assign({}, currentIntegration, {
      provider: generationRequest.provider || currentIntegration.provider,
      mode: generationRequest.mode || currentIntegration.mode,
      apiStyle: generationRequest.apiStyle || currentIntegration.apiStyle,
      endpoint: generationRequest.endpoint || currentIntegration.endpoint,
      statusEndpoint: generationRequest.statusEndpoint || currentIntegration.statusEndpoint,
      model: generationRequest.model || currentIntegration.model,
      apiKey: generationRequest.apiKey || currentIntegration.apiKey,
    });
    const jobId = taskJobId(task);
    if (!jobId) {
      throw new Error("当前任务还没有视频任务 ID");
    }
    const template = integration.statusEndpoint || "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}";
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      method: "GET",
      endpoint: template.replace("{task_id}", encodeURIComponent(jobId)),
      model: integration.model,
      apiKey: integration.apiKey,
    };
  }

  function buildPublishProviderRequest(state, task, options = {}) {
    const integration = state.integrations.publisher;
    const platformFilter = Array.isArray(options.platformIds) && options.platformIds.length ? new Set(options.platformIds) : null;
    const copies = Object.values(task.copies).filter((copy) => copy.approved && isPublishPlatformEnabled(copy.platformId) && (!platformFilter || platformFilter.has(copy.platformId)));
    const accountIds = publisherAccountIds(integration);
    const mediaIds = publishMediaIds(state, task, copies.map((copy) => copy.platformId));
    const copyContent = (copy) => {
      const hashtags = Array.isArray(copy.hashtags) ? copy.hashtags : splitList(copy.hashtags);
      return [
        sanitizePublishText(copy.title),
        sanitizePublishText(copy.hook),
        sanitizePublishText(copy.body),
        sanitizePublishText(copy.cta),
        hashtags.join(" "),
      ].filter(Boolean).join("\n\n");
    };
    const primaryCopy = copies[0];
    const platformContent = copies.reduce((acc, copy) => {
      const platformKey = copy.platformId === "instagram" ? "instagram" : copy.platformId;
      acc[platformKey] = { content: copyContent(copy) };
      if (copy.platformId === "instagram") acc[platformKey].contentType = "Reels";
      if (copy.platformId === "youtube") {
        acc[platformKey].settings = {
          title: sanitizePublishText(copy.title),
          tags: Array.isArray(copy.hashtags) ? copy.hashtags : splitList(copy.hashtags),
          privacyStatus: "public",
        };
      }
      return acc;
    }, {});
    const body = {
      content: primaryCopy ? copyContent(primaryCopy) : "",
      account_ids: accountIds,
      timezone: "UTC",
      platform_content: platformContent,
    };
    if (mediaIds.length) body.media_ids = mediaIds;
    if (options.scheduledAt) {
      body.scheduled_for = options.scheduledAt;
      body.timezone = "UTC";
    }
    return {
      provider: integration.provider,
      mode: integration.mode,
      endpoint: integration.endpoint,
      apiKey: integration.apiKey,
      body,
    };
  }

  function publisherPostEndpoint(endpoint, postId) {
    const base = String(endpoint || "").trim().replace(/\/+$/, "");
    if (!base) throw new Error("请先配置 PostEverywhere Endpoint。");
    if (!postId) throw new Error("缺少 PostEverywhere post_id，无法操作平台定时。");
    return `${base}/${encodeURIComponent(postId)}`;
  }

  function buildCancelScheduledPostProviderRequest(state, scheduledPost) {
    const integration = state && state.integrations && state.integrations.publisher || {};
    const preview = scheduledPost && scheduledPost.providerRequestPreview || {};
    const postId = scheduledPost && scheduledPost.platformPostId;
    return {
      provider: integration.provider || preview.provider,
      mode: integration.mode || preview.mode,
      method: "DELETE",
      endpoint: publisherPostEndpoint(integration.endpoint || preview.endpoint, postId),
      apiKey: integration.apiKey || preview.apiKey,
      body: null,
    };
  }

  function buildRescheduleScheduledPostProviderRequest(state, scheduledPost) {
    const integration = state && state.integrations && state.integrations.publisher || {};
    const preview = scheduledPost && scheduledPost.providerRequestPreview || {};
    const postId = scheduledPost && scheduledPost.platformPostId;
    return {
      provider: integration.provider || preview.provider,
      mode: integration.mode || preview.mode,
      method: "PATCH",
      endpoint: publisherPostEndpoint(integration.endpoint || preview.endpoint, postId),
      apiKey: integration.apiKey || preview.apiKey,
      body: {
        scheduled_for: scheduledPost && scheduledPost.scheduledAt,
        timezone: "UTC",
      },
    };
  }

  function buildCopyProviderRequest(state, task, platformIds) {
    const integration = state.integrations.llm;
    const schema = {
      type: "object",
      additionalProperties: true,
      required: ["copies"],
      properties: {
        videoSummary: { type: "string" },
        copies: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            required: ["platformId", "title", "hook", "body", "cta", "hashtags"],
            properties: {
              platformId: { type: "string" },
              platformName: { type: "string" },
              language: { type: "string" },
              copyStyle: { type: "string" },
              title: { type: "string" },
              hook: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              chineseTranslation: { type: "string" },
              coverTitle: { type: "string" },
              overlayText: { type: "array", items: { type: "string" } },
              firstComment: { type: "string" },
              postingNotes: { type: "string" },
              complianceWarnings: { type: "array", items: { type: "string" } },
              rationale: { type: "string" },
            },
          },
        },
      },
    };
    const style = copyStyleById(state.copyStyle);
    const userContent = {
      task: {
        title: task.title,
        productName: task.productName,
        hook: task.variation && task.variation.hook,
        angle: task.variation && task.variation.angle,
        strategySummary: task.strategySummary,
        reviewSummary: task.reviewSummary,
        contentBrief: task.contentBrief,
        storyboard: task.storyboard,
        video: task.video,
      },
      platforms: publishPlatforms.filter((platform) => normalizePublishPlatformIds(platformIds).includes(platform.id)),
      copyStyle: style,
      language: {
        publish: "English",
        referenceTranslation: "Chinese",
        internalReviewFields: "Chinese",
        rules: [
          "实际发布的 title、hook、body、cta、hashtags 必须使用英文，可保留英文产品名或不写产品名。",
          "chineseTranslation 只给审核人员参考，不会发布，必须完整翻译成中文，不要夹杂英文句子。",
          "postingNotes、complianceWarnings、rationale 是内部审核字段，必须使用中文。",
          "不要输出视频概述；要写成真实 TikTok/Reels/Shorts caption。",
        ],
      },
      outputFields: [
        "platformId",
        "language",
        "copyStyle",
        "title",
        "hook",
        "body",
        "cta",
        "hashtags",
        "chineseTranslation",
        "coverTitle",
        "overlayText",
        "firstComment",
        "postingNotes",
        "complianceWarnings",
        "rationale",
      ],
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, "你是跨平台短视频文案助手。根据已审核的视频分镜，为每个平台生成可人工审核、可编辑、可发布的完整文案详情。实际发布字段 title、hook、body、cta、hashtags 必须是英文。chineseTranslation、postingNotes、complianceWarnings、rationale 等内部审核字段必须使用中文。不要输出视频概述，要写成平台上的真实 caption。只输出结构化 JSON。", userContent, "platform_copy_batch", schema),
    };
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    const source = value.trim();
    const tryParse = (candidate) => {
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    };
    const direct = tryParse(source);
    if (direct) return direct;

    const fenced = source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
    for (const match of fenced) {
      const parsed = tryParse(String(match[1] || "").trim());
      if (parsed) return parsed;
    }

    const balancedJsonCandidates = [];
    for (let start = 0; start < source.length; start += 1) {
      const first = source[start];
      if (first !== "{" && first !== "[") continue;
      const stack = [first];
      let inString = false;
      let escaped = false;
      for (let index = start + 1; index < source.length; index += 1) {
        const char = source[index];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === "\"") {
            inString = false;
          }
          continue;
        }
        if (char === "\"") {
          inString = true;
          continue;
        }
        if (char === "{" || char === "[") {
          stack.push(char);
          continue;
        }
        if (char !== "}" && char !== "]") continue;
        const open = stack.pop();
        const matched = open === "{" && char === "}" || open === "[" && char === "]";
        if (!matched) break;
        if (!stack.length) {
          balancedJsonCandidates.push(source.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
    for (const candidate of balancedJsonCandidates) {
      const parsed = tryParse(candidate);
      if (parsed) return parsed;
    }
    return null;
  }

  function providerRequestUserContent(providerRequest) {
    const body = providerRequest && providerRequest.body || {};
    if (Array.isArray(body.input)) {
      const input = body.input.find((item) => item && item.role === "user") || body.input[1];
      return parseMaybeJson(input && input.content) || {};
    }
    if (Array.isArray(body.messages)) {
      const userMessages = body.messages.filter((item) => item && item.role === "user");
      const message = userMessages[userMessages.length - 1];
      if (!message) return {};
      if (Array.isArray(message.content)) {
        const textPart = message.content.find((part) => part && part.type === "text");
        return parseMaybeJson(textPart && textPart.text) || {};
      }
      return parseMaybeJson(message.content) || {};
    }
    return {};
  }

  function requestedStoryboardSceneCount(task, remote) {
    const remoteCount = Number(firstValue(remote, ["sceneCount", "scene_count"], 0));
    if (Number.isFinite(remoteCount) && remoteCount > 0) return Math.round(remoteCount);
    const requestContent = providerRequestUserContent(task && task.providerRequests && task.providerRequests.storyboard);
    const requestCount = Number(requestContent && requestContent.sceneCount);
    if (Number.isFinite(requestCount) && requestCount > 0) return Math.round(requestCount);
    return 0;
  }

  function normalizeStoryboardSceneCount(scenes, targetCount) {
    const sourceScenes = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
    const count = Math.max(0, Math.min(Math.round(Number(targetCount) || 0), 12));
    if (!count || !sourceScenes.length || sourceScenes.length === count) return sourceScenes;
    const withoutTiming = (scene) => {
      const next = clone(scene);
      next.time = "";
      delete next.startSecond;
      delete next.endSecond;
      delete next.durationSecond;
      return next;
    };
    if (sourceScenes.length > count) return sourceScenes.slice(0, count).map(withoutTiming);
    return Array.from({ length: count }, (_, index) => {
      const sourceIndex = Math.min(Math.floor(index * sourceScenes.length / count), sourceScenes.length - 1);
      return withoutTiming(sourceScenes[sourceIndex] || sourceScenes[sourceScenes.length - 1]);
    });
  }

  function extractOpenAiJson(data) {
    if (!data || typeof data !== "object") return null;
    if (data.output_parsed) return data.output_parsed;
    if (data.output_text) return parseMaybeJson(data.output_text);
    if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;
        for (const content of item.content) {
          if (content.parsed) return content.parsed;
          const parsed = parseMaybeJson(content.text);
          if (parsed) return parsed;
        }
      }
    }
    if (Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        const parsed = parseMaybeJson(choice.message && choice.message.content);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  function providerResult(response) {
    if (!response) return null;
    if (response.result) return response.result;
    if (response.upstream && response.upstream.data) {
      return extractOpenAiJson(response.upstream.data) || response.upstream.data;
    }
    if (response.data) return extractOpenAiJson(response.data) || response.data;
    return response;
  }

  function collectProviderIssueText(value, parts = [], seen = new Set(), depth = 0) {
    if (value === undefined || value === null || depth > 4) return parts;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(String(value));
      return parts;
    }
    if (value instanceof Error) {
      parts.push(value.message || String(value));
      return parts;
    }
    if (Array.isArray(value)) {
      value.slice(0, 12).forEach((item) => collectProviderIssueText(item, parts, seen, depth + 1));
      return parts;
    }
    if (typeof value !== "object" || seen.has(value)) return parts;
    seen.add(value);
    [
      "error",
      "message",
      "code",
      "type",
      "status",
      "task_status",
      "providerStatus",
      "providerCode",
      "providerMessage",
      "contentType",
      "mimeType",
      "raw",
    ].forEach((key) => {
      if (value[key] !== undefined) collectProviderIssueText(value[key], parts, seen, depth + 1);
    });
    Object.keys(value).forEach((key) => {
      if (/apikey|api_key|authorization|token|secret/i.test(key)) return;
      if (["error", "message", "code", "type", "status", "task_status", "providerStatus", "providerCode", "providerMessage", "contentType", "mimeType", "raw"].includes(key)) return;
      collectProviderIssueText(value[key], parts, seen, depth + 1);
    });
    return parts;
  }

  function cleanProviderIssueText(value) {
    return collectProviderIssueText(value)
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function providerIssue(category, title, reason, action, rawMessage) {
    return {
      category,
      title,
      reason,
      action,
      rawMessage: String(rawMessage || "").slice(0, 260),
    };
  }

  function explainProviderIssue(value, context = {}) {
    const rawMessage = cleanProviderIssueText(value);
    const text = rawMessage.toLowerCase();
    const status = String(context.status || "").toLowerCase();
    const kind = String(context.kind || "").toLowerCase();

    if (/quota|quota_not_enough|insufficient|余额|套餐|credit/.test(text)) {
      return providerIssue("quota", "余额不足", "当前模型或发布服务返回额度不足，任务没有继续执行。", "去对应 provider 后台充值，或在集成设置里切换到还有额度的模型后重试。", rawMessage);
    }
    if (/524|timeout|timed out|超时|deadline|etimedout/.test(text)) {
      return providerIssue("timeout", "接口超时", "上游服务响应太慢或网关超时，本次结果不可靠。", "稍后重试；如果连续出现，先减少批量、缩短输入，或切换更稳定的 provider。", rawMessage);
    }
    if (/没有返回内容|空的流式响应|no content|empty|no usable|message\.content|output_text/.test(text)) {
      return providerIssue("empty_response", "模型无返回", "模型请求成功到达上游，但没有返回可解析的内容。", "重新生成一次；如果连续出现，缩短内容规划、换模型，或检查响应格式是否要求 JSON。", rawMessage);
    }
    if (/modelnotopen|not activated the model|activate the model|model service|模型未开通|模型没有开通|未开通.*模型|模型服务未开通/.test(text)) {
      return providerIssue("model_not_open", "模型未开通", "当前视频模型没有在对应 provider 账号里开通，任务没有创建成功。", "到 provider 控制台开通该模型，或在“集成设置”里切换到已开通的视频模型后重试。", rawMessage);
    }
    if (/invalidparameter\.bodyformat|invalid ratio|invalid .*ratio|bodyformat|参数格式|请求体格式/.test(text)) {
      return providerIssue("request_format", "请求参数格式错误", "视频 provider 拒绝了本次请求体，常见原因是比例、分辨率或时长字段不符合当前模型接口要求。", "检查视频比例、分辨率和模型配置；保存配置后重新生成视频。", rawMessage);
    }
    if (/image_url|参考图|产品图|图片/.test(text) && /resource not found|not found|无法访问|读取不到|找不到/.test(text)) {
      return providerIssue("image_resource", "参考图无法访问", "视频模型收到了图片字段，但上游拉取图片资源失败。常见原因是图床防盗链、临时链接失效，或上游网络无法访问该图床。", "系统会优先改用本地上传图的 base64 提交；刷新页面后重新生成视频。若仍失败，请重新上传产品图。", rawMessage);
    }
    if (status === "video_generating" || /pending|processing|running|in_progress|queued|submitted|生成中|排队/.test(text)) {
      return providerIssue("video_pending", "视频仍在生成", "视频任务已经提交，但上游还没有给出最终视频地址。", "稍后点击“查询视频结果”，不要重复提交同一个视频任务。", rawMessage);
    }
    if (/account_ids|account ids|账号 id|账号ID|workspace|缺少 posteverywhere 账号|publisher account/.test(text) || kind === "publisher" && /账号/.test(text)) {
      return providerIssue("publisher_account", "发布账号没配置", "PostEverywhere 没有可用账号 ID，平台无法知道要发布到哪个账号。", "到“集成设置”填写 PostEverywhere 账号 ID，保存后回到发布页重试。", rawMessage);
    }
    if (/media_id|media ids|requires media|缺少 posteverywhere 媒体|缺媒体|未上传/.test(text)) {
      return providerIssue("publisher_media", "发布媒体没上传", "TikTok 发布需要先把视频上传到 PostEverywhere 并拿到 media_id。", "在发布页点击“上传媒体”，成功后再确认发布。", rawMessage);
    }
    if (/mp4|video\/quicktime|video\/webm|content-type|mime|格式/.test(text) && /只支持|not supported|unsupported|不是|当前类型|requires|必须/.test(text)) {
      return providerIssue("video_format", "视频格式不是 MP4", "发布接口当前只接受 MP4 视频，本次文件类型不符合要求。", "先把视频转成 MP4，或重新下载/上传 MP4 文件后再发布。", rawMessage);
    }
    if (/401|403|unauthorized|forbidden|invalid api key|api key|鉴权|权限|无权限/.test(text)) {
      return providerIssue("auth", "接口权限异常", "上游拒绝了请求，常见原因是 API Key、模型权限或账号权限不正确。", "检查集成设置里的 API Key、endpoint、model 和账号权限，然后重新测试连接。", rawMessage);
    }
    if (/fetch failed|econnreset|enotfound|network|dns|getaddrinfo|连接失败|无法连接/.test(text)) {
      return providerIssue("network", "网络或本地服务不可达", "请求没有稳定到达上游，可能是本地服务未启动、网络或网关连接失败。", "先确认本地服务健康，再检查 endpoint 是否完整、网络是否可访问。", rawMessage);
    }
    return providerIssue("unknown", "接口调用失败", "上游返回了未归类错误，系统已保留原始信息。", "查看错误详情；如果重复出现，把原始错误发给技术同事检查 provider 配置和返回格式。", rawMessage);
  }

  function firstValue(object, keys, fallback = "") {
    if (!object || typeof object !== "object") return fallback;
    for (const key of keys) {
      if (object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
    }
    return fallback;
  }

  function sceneFromProvider(scene, fallback) {
    const source = scene || {};
    return {
      time: firstValue(source, ["time"], fallback && fallback.time || "0-3s"),
      title: firstValue(source, ["title", "sceneTitle", "scene_title", "name", "hook"], fallback && fallback.title || "分镜"),
      visual: firstValue(source, ["visual", "description", "sceneDescription", "scene_description", "visualDescription", "visual_description", "shotDescription", "shot_description", "video_prompt", "videoPrompt", "prompt"], fallback && fallback.visual || ""),
      subtitle: firstValue(source, ["subtitle", "caption", "captions", "screenText", "screen_text", "onScreenText", "on_screen_text"], fallback && fallback.subtitle || ""),
      camera: firstValue(source, ["camera", "framing"], fallback && fallback.camera || ""),
      motion: firstValue(source, ["motion", "action"], fallback && fallback.motion || ""),
      voiceover: firstValue(source, ["voiceover", "voice_over"], fallback && fallback.voiceover || ""),
      screenText: firstValue(source, ["screenText", "screen_text"], fallback && fallback.screenText || ""),
      imagePrompt: firstValue(source, ["imagePrompt", "image_prompt"], fallback && fallback.imagePrompt || ""),
      videoPrompt: firstValue(source, ["videoPrompt", "video_prompt"], fallback && fallback.videoPrompt || ""),
      negativePrompt: firstValue(source, ["negativePrompt", "negative_prompt"], fallback && fallback.negativePrompt || ""),
      startSecond: Number(firstValue(source, ["startSecond", "start_second"], fallback && fallback.startSecond || 0)) || undefined,
      endSecond: Number(firstValue(source, ["endSecond", "end_second"], fallback && fallback.endSecond || 0)) || undefined,
      durationSecond: Number(firstValue(source, ["durationSecond", "duration_second"], fallback && fallback.durationSecond || 0)) || undefined,
      productFocus: firstValue(source, ["productFocus", "product_focus"], fallback && fallback.productFocus || ""),
      reviewChecklist: splitList(firstValue(source, ["reviewChecklist", "review_checklist"], fallback && fallback.reviewChecklist || [])),
      riskNotes: splitList(firstValue(source, ["riskNotes", "risk_notes"], fallback && fallback.riskNotes || [])),
    };
  }

  function normalizeContentPlan(source) {
    const plan = source && typeof source === "object" ? source : {};
    const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
    const keySellingPoints = splitList(firstValue(plan, ["keySellingPoints", "key_selling_points", "sellingPoints", "selling_points"], []));
    const painPoints = splitList(firstValue(plan, ["painPoints", "pain_points", "painpoints"], []));
    const mainPainPoint = firstValue(plan, ["mainPainPoint", "main_pain_point", "primaryPainPoint", "primary_pain_point"], painPoints[0] || "");
    const videoThroughline = firstValue(plan, ["videoThroughline", "video_throughline", "storyline", "throughline"], firstValue(plan, ["strategy", "contentStrategy", "content_strategy"], ""));
    return {
      productUnderstanding: firstValue(plan, ["productUnderstanding", "product_understanding", "productSummary", "product_summary"], ""),
      targetAudience: firstValue(plan, ["targetAudience", "target_audience", "audience"], ""),
      keySellingPoints,
      mainPainPoint,
      videoThroughline,
      usageScenarios: splitList(firstValue(plan, ["usageScenarios", "usage_scenarios", "scenarios"], [])),
      painPoints: painPoints.length ? painPoints : splitList(mainPainPoint),
      contentAngle: firstValue(plan, ["contentAngle", "content_angle", "angle"], ""),
      hookOptions: splitList(firstValue(plan, ["hookOptions", "hook_options", "hooks"], [])),
      coreMessage: firstValue(plan, ["coreMessage", "core_message", "message"], ""),
      strategy: videoThroughline,
      hook: firstValue(plan, ["hook", "title"], mainPainPoint),
      visualStyle: firstValue(plan, ["visualStyle", "visual_style", "style"], ""),
      rhythm: firstValue(plan, ["rhythm", "pace", "pacing"], ""),
      mustShow: splitList(firstValue(plan, ["mustShow", "must_show", "requiredVisuals", "required_visuals"], [])),
      mustAvoid: splitList(firstValue(plan, ["mustAvoid", "must_avoid", "avoid", "prohibitedClaims", "prohibited_claims"], [])),
      cta: firstValue(plan, ["cta", "callToAction", "call_to_action"], ""),
      storyboardGuidance: firstValue(plan, ["storyboardGuidance", "storyboard_guidance", "storyboardNotes", "storyboard_notes"], ""),
      reviewSummary: firstValue(plan, ["reviewSummary", "review_summary"], ""),
      complianceNotes: splitList(firstValue(plan, ["complianceNotes", "compliance_notes", "riskNotes", "risk_notes"], [])),
      scenes: scenes.map((scene, index) => sceneFromProvider(scene, {
        time: index === 0 ? "0-3s" : "",
        title: "分镜",
        visual: "",
        subtitle: "",
      })),
    };
  }

  function normalizeReverseStoryboard(source, upload) {
    const root = source && typeof source === "object" ? source : {};
    const story = root.reverseStoryboard || root.reverse_storyboard || root.storyboard || root.result || root;
    const scenes = Array.isArray(story.scenes)
      ? story.scenes
      : (Array.isArray(story.storyboard) ? story.storyboard : (Array.isArray(root.scenes) ? root.scenes : []));
    return {
      title: firstValue(story, ["title", "name"], firstValue(root, ["title", "name"], upload && upload.fileName ? `反推分镜 · ${upload.fileName}` : "反推分镜")),
      summary: firstValue(story, ["summary", "reviewSummary", "review_summary", "strategy"], firstValue(root, ["summary", "reviewSummary", "review_summary", "strategy"], "")),
      hook: firstValue(story, ["hook", "opening"], ""),
      duration: Number(firstValue(story, ["duration"], 15)) || 15,
      ratio: firstValue(story, ["ratio", "aspectRatio", "aspect_ratio"], "9:16"),
      sourceReconstruction: clone(firstValue(story, ["sourceReconstruction", "source_reconstruction"], firstValue(root, ["sourceReconstruction", "source_reconstruction"], {}))),
      rewriteTemplate: clone(firstValue(story, ["rewriteTemplate", "rewrite_template"], firstValue(root, ["rewriteTemplate", "rewrite_template"], {}))),
      scenes: scenes.map((scene, index) => sceneFromProvider(scene, {
        time: index === 0 ? "0-3s" : "",
        title: "分镜",
        visual: "",
        subtitle: "",
      })),
    };
  }

  function hasUsableValue(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && value !== "";
  }

  function mergeSceneFields(existing, normalized) {
    const scene = Object.assign({}, existing || {});
    const fields = ["time", "title", "visual", "subtitle", "camera", "motion", "voiceover", "screenText", "imagePrompt", "videoPrompt", "productFocus", "reviewChecklist", "riskNotes"];
    fields.forEach((field) => {
      const shouldReplaceDefaultTitle = field === "title" && scene[field] === "分镜" && normalized[field] && normalized[field] !== "分镜";
      if ((!hasUsableValue(scene[field]) || shouldReplaceDefaultTitle) && hasUsableValue(normalized[field])) {
        scene[field] = normalized[field];
      }
    });
    return scene;
  }

  function contentPlanFromProviderResponse(response) {
    const result = providerResult(response);
    return result && (result.contentPlan || result.content_plan || result.plan || result);
  }

  function repairSavedContentPlanTask(task) {
    if (!task || typeof task !== "object") return task;
    const responsePlan = contentPlanFromProviderResponse(task.providerResponses && task.providerResponses.contentPlan);
    const sourcePlan = responsePlan && Array.isArray(responsePlan.scenes) && responsePlan.scenes.length ? responsePlan : task.contentPlan;
    const normalized = normalizeContentPlan(sourcePlan);
    if (!normalized.scenes.length) return task;
    const existingPlan = task.contentPlan && typeof task.contentPlan === "object" ? task.contentPlan : {};
    const existingScenes = Array.isArray(task.storyboard) && task.storyboard.length ? task.storyboard : (Array.isArray(existingPlan.scenes) ? existingPlan.scenes : []);
    const repairedScenes = normalized.scenes.map((scene, index) => mergeSceneFields(existingScenes[index], scene));
    const timedScenes = normalizeStoryboardTiming(repairedScenes, task.duration || 15);
    task.storyboard = timedScenes;
    task.storyboardTimingStatus = timedScenes.timingStatus;
    task.contentPlan = Object.assign({}, existingPlan, { scenes: timedScenes });
    ["productUnderstanding", "targetAudience", "keySellingPoints", "mainPainPoint", "videoThroughline", "usageScenarios", "painPoints", "contentAngle", "hookOptions", "coreMessage", "strategy", "hook", "visualStyle", "rhythm", "mustShow", "mustAvoid", "cta", "storyboardGuidance", "reviewSummary", "complianceNotes"].forEach((field) => {
      if (!hasUsableValue(task.contentPlan[field]) && hasUsableValue(normalized[field])) {
        task.contentPlan[field] = normalized[field];
      }
    });
    return task;
  }

  function repairSavedVideoTask(task) {
    if (!task || typeof task !== "object") return task;
    if (task.video && task.video.url) return task;
    const responses = task.providerResponses || {};
    const response = responses.videoStatus || responses.video;
    if (response) applyVideoProviderResult(task, response);
    const missingJobReview = String(task.reviewNote || task.video && task.video.providerMessage || "").includes("本地没有保存视频任务 ID");
    const shouldRecoverMissingJob = task.status === "video_generating" || (task.status === "rejected" && missingJobReview);
    if (shouldRecoverMissingJob && !taskJobId(task) && !(task.video && task.video.url)) {
      markVideoTaskMissingJob(task);
    }
    return task;
  }

  function repairSavedCopyTask(task) {
    if (!task || typeof task !== "object" || !task.copies || typeof task.copies !== "object") return task;
    Object.values(task.copies).forEach((copy) => {
      if (!copy || typeof copy !== "object") return;
      const body = String(copy.body || "");
      const cta = String(copy.cta || "");
      const styleLabel = copyStyleById(copy.copyStyle).label;
      if (containsChineseText(copy.title)) {
        copy.title = englishCopyTitle(copy.platformId);
      }
      if (!String(copy.chineseTranslation || "").trim() || /[A-Za-z]{4,}/.test(String(copy.chineseTranslation || ""))) {
        copy.chineseTranslation = [
          "中文参考译文：",
          "夏季使用文案参考",
          body.includes("Hot kitchen, sweaty face")
            ? "厨房很热、满脸是汗，真的很容易没耐心。这款免手持风扇可以在做饭、清洁或户外走动时持续送风，佩戴起来比较轻，不太妨碍动作，风感也比较明显。"
            : "这条文案用于参考发布正文含义，实际发布内容保持英文。",
          cta.includes("kitchen") ? "你会在厨房用，还是出门用？" : "你会在室内用，还是户外用？",
        ].join("\n");
      }
      if (!String(copy.postingNotes || "").trim() || /[A-Za-z]{4,}/.test(String(copy.postingNotes || ""))) {
        copy.postingNotes = `使用「${styleLabel}」风格。实际发布文案保持英文，避免医疗暗示、孕期专用暗示和绝对降温承诺。`;
      }
      if (!Array.isArray(copy.complianceWarnings) || copy.complianceWarnings.some((item) => /[A-Za-z]{4,}/.test(String(item || "")))) {
        copy.complianceWarnings = ["发布前确认风力强劲、重量轻等卖点与真实产品一致", "避免医疗、孕期专用或保证降温效果等未经证实的表述"];
      }
      if (!String(copy.rationale || "").trim() || /[A-Za-z]{4,}/.test(String(copy.rationale || ""))) {
        copy.rationale = "当前平台使用英文发布正文，内部审核采用中文说明；文案用短句和低压互动提问替代视频概述。";
      }
    });
    return task;
  }

  function repairSavedTaskTimestamps(task) {
    if (!task || typeof task !== "object") return task;
    const fallback = task.updatedAt || task.createdAt || task.video?.generatedAt || new Date().toISOString();
    task.createdAt = task.createdAt || fallback;
    task.updatedAt = task.updatedAt || task.createdAt;
    task.videoResolution = normalizeVideoResolution(task.videoResolution || task.contentBrief?.videoResolution);
    return task;
  }

  function createContentPlanTask(state, input) {
    const product = getById(state.products, state.selectedProductId);
    const contentPlan = normalizeContentPlan(input && input.contentPlan);
    if (!hasUsableValue(contentPlan.productUnderstanding) && !hasUsableValue(contentPlan.strategy) && !hasUsableValue(contentPlan.hook) && !hasUsableValue(contentPlan.keySellingPoints) && !hasUsableValue(contentPlan.mainPainPoint)) return null;
    contentPlan.scenes = [];
    const now = new Date().toISOString();
    const task = {
      id: uid("task"),
      productId: product.id,
      productName: productDisplayName(product),
      favoriteId: "",
      favoriteName: "未使用收藏",
      strategy: "content-plan",
      variation: {
        hook: contentPlan.hook || "内容规划",
        tone: "真实内容规划",
        angle: contentPlan.strategy || "单条内容规划",
      },
      title: `${productDisplayName(product)} · ${contentPlan.hook || "内容规划"}`,
      status: "content_plan_ready",
      owner: "运营",
      createdAt: now,
      updatedAt: now,
      duration: 15,
      ratio: "9:16",
      videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
      contentPlanSeed: String(state.contentBrief && state.contentBrief.seed || "").trim(),
      contentPlan,
      contentBrief: {
        audienceInsight: contentPlan.targetAudience,
        painPoint: state.contentBrief && state.contentBrief.seed || "",
        productPromise: contentPlan.keySellingPoints.join("、"),
        proofPoints: contentPlan.keySellingPoints,
        offer: "了解更多",
        tone: "真实测评，口语，弱广告感",
        riskNotes: contentPlan.complianceNotes,
        seed: state.contentBrief && state.contentBrief.seed || "",
        text: contentPlan.strategy || "",
        videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
      },
      strategySummary: contentPlan.strategy,
      reviewSummary: contentPlan.reviewSummary || contentPlan.complianceNotes.join("、"),
      qualityScore: undefined,
      storyboard: [],
      storyboardTimingStatus: "not_started",
      video: null,
      reviewNote: "",
      copies: {},
      publishResults: {},
      providerRequests: {},
      providerResponses: {},
    };
    if (input && input.providerRequest) task.providerRequests.contentPlan = input.providerRequest;
    if (input && input.providerResponse) task.providerResponses.contentPlan = input.providerResponse;
    state.tasks.unshift(task);
    state.selectedTaskId = task.id;
    state.contentBrief.text = [
      contentPlan.productUnderstanding,
      contentPlan.strategy,
      contentPlan.reviewSummary,
    ].filter(Boolean).join("\n");
    return task;
  }

  function createStoryboardTaskFromIdea(state, input = {}) {
    const product = getById(state.products, state.selectedProductId);
    const seed = String(state.contentBrief && state.contentBrief.seed || "").trim();
    const now = new Date().toISOString();
    const task = {
      id: uid("task"),
      productId: product.id,
      productName: productDisplayName(product),
      favoriteId: "",
      favoriteName: "未使用收藏",
      source: "idea-storyboard",
      strategy: "direct-storyboard",
      variation: {
        hook: seed ? seed.slice(0, 28) : "直接分镜",
        tone: "真实分镜",
        angle: "用户想法直接生成",
      },
      title: `${productDisplayName(product)} · 直接分镜`,
      status: "storyboard_ready",
      owner: "运营",
      createdAt: now,
      updatedAt: now,
      duration: 15,
      ratio: "9:16",
      videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
      contentBrief: {
        seed,
        text: seed,
        painPoint: seed,
        videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
      },
      strategySummary: "",
      reviewSummary: "",
      qualityScore: undefined,
      storyboard: [],
      storyboardTimingStatus: "not_started",
      video: null,
      reviewNote: "",
      copies: {},
      publishResults: {},
      providerRequests: {},
      providerResponses: {},
    };
    if (input.providerRequest) task.providerRequests.storyboard = input.providerRequest;
    if (input.providerResponse) task.providerResponses.storyboard = input.providerResponse;
    state.tasks.unshift(task);
    state.selectedTaskId = task.id;
    return task;
  }

  function applyContentPlanProviderResult(state, request, response) {
    const contentPlan = contentPlanFromProviderResponse(response);
    if (!contentPlan || typeof contentPlan !== "object") {
      return null;
    }
    return createContentPlanTask(state, {
      contentPlan,
      providerRequest: request,
      providerResponse: response,
    });
  }

  function reverseStoryboardFromProviderResponse(response) {
    const result = providerResult(response);
    if (!result || typeof result !== "object") return result;
    if ((result.reverseStoryboard || result.reverse_storyboard) && (Array.isArray(result.scenes) || result.sourceReconstruction || result.source_reconstruction || result.rewriteTemplate || result.rewrite_template)) {
      return result;
    }
    return result.reverseStoryboard || result.reverse_storyboard || result.storyboard || result;
  }

  function applyReverseStoryboardProviderResult(state, request, response) {
    state.reverseVideo = Object.assign({}, createInitialState().reverseVideo, state.reverseVideo || {});
    const source = reverseStoryboardFromProviderResponse(response);
    const normalized = normalizeReverseStoryboard(source, state.reverseVideo.upload);
    if (!normalized.scenes.length) {
      state.reverseVideo.status = "error";
      state.reverseVideo.error = "大模型没有返回可用的 scenes，请检查响应 JSON。";
      return null;
    }
    state.reverseVideo.result = normalized;
    state.reverseVideo.status = "ready";
    state.reverseVideo.error = "";
    state.reverseVideo.providerRequest = request;
    state.reverseVideo.providerResponse = response;
    return normalized;
  }

  function reverseSourceKey(state) {
    const uploadId = state.reverseVideo && state.reverseVideo.upload && state.reverseVideo.upload.id;
    return uploadId ? `reverse-video:${uploadId}` : "";
  }

  function reverseStoryboardText(result) {
    if (!result || !Array.isArray(result.scenes)) return "";
    if (String(result.storyboardScriptText || "").trim()) return String(result.storyboardScriptText).trim();
    const reconstruction = result.sourceReconstruction && typeof result.sourceReconstruction === "object" ? result.sourceReconstruction : {};
    const template = result.rewriteTemplate && typeof result.rewriteTemplate === "object" ? result.rewriteTemplate : {};
    const lockedElements = splitList(template.lockedElements).join("、");
    const adaptableElements = splitList(template.adaptableElements).join("、");
    const visibleText = splitList(reconstruction.visibleText).join("、");
    const uncertaintyNotes = splitList(reconstruction.uncertaintyNotes).join("、");
    const header = [
      `# ${result.title || "反推分镜"}`,
      result.summary ? `原片摘要：${result.summary}` : "",
      result.hook ? `开头钩子：${result.hook}` : "",
      "复刻目标：再次生成时最大程度复刻原视频的画面、文案/语音、镜头角度、动作节奏、构图和转化收尾；只替换为当前选中的产品。",
      "适配模型：中文提示词优先，适合后续视频生成模型复用。",
    ].filter(Boolean).join("\n");
    const source = [
      "## 原片复刻要点",
      reconstruction.productIdentity ? `产品身份：${reconstruction.productIdentity}` : "",
      reconstruction.environment ? `环境：${reconstruction.environment}` : "",
      reconstruction.cameraStyle ? `镜头风格：${reconstruction.cameraStyle}` : "",
      reconstruction.cameraAngles ? `镜头角度：${reconstruction.cameraAngles}` : "",
      reconstruction.composition ? `构图：${reconstruction.composition}` : "",
      reconstruction.lighting ? `光线：${reconstruction.lighting}` : "",
      reconstruction.motionRhythm ? `动作节奏：${reconstruction.motionRhythm}` : "",
      reconstruction.copywriting ? `文案：${reconstruction.copywriting}` : "",
      reconstruction.voiceTone ? `语音/旁白语气：${reconstruction.voiceTone}` : "",
      visibleText ? `屏幕文字：${visibleText}` : "",
      uncertaintyNotes ? `不确定点：${uncertaintyNotes}` : "",
    ].filter(Boolean).join("\n");
    const rewrite = [
      "## 二创替换规则",
      template.replaceableProductSlot ? `可替换产品槽位：${template.replaceableProductSlot}` : "",
      lockedElements ? `必须保留：${lockedElements}` : "",
      adaptableElements ? `可适配：${adaptableElements}` : "",
      template.negativePrompt ? `通用负面提示词：${template.negativePrompt}` : "",
    ].filter(Boolean).join("\n");
    const body = result.scenes.map((scene, index) => {
      return [
        `## 第 ${index + 1} 镜｜${scene.time || ""}｜${scene.title || "分镜"}`,
        scene.visual ? `画面：${scene.visual}` : "",
        scene.subtitle ? `字幕：${scene.subtitle}` : "",
        scene.camera ? `运镜/角度：${scene.camera}` : "",
        scene.motion ? `动作节奏：${scene.motion}` : "",
        scene.voiceover ? `旁白/语音：${scene.voiceover}` : "",
        scene.screenText ? `屏幕字：${scene.screenText}` : "",
        scene.videoPrompt ? `中文视频提示词：${scene.videoPrompt}` : "",
        scene.negativePrompt ? `负面提示词：${scene.negativePrompt}` : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n");
    return [header, source, rewrite, body].filter(Boolean).join("\n\n");
  }

  function saveReverseStoryboardFavorite(state) {
    const result = state.reverseVideo && state.reverseVideo.result;
    if (!result || !Array.isArray(result.scenes) || !result.scenes.length) {
      throw new Error("当前没有可保存的分镜结果。");
    }
    const sourceKey = reverseSourceKey(state);
    if (sourceKey) {
      const existing = state.favorites.find((favorite) => favorite.sourceKey === sourceKey);
      if (existing) {
        state.selectedFavoriteId = existing.id;
        state.reverseVideo.selectedFavoriteId = existing.id;
        return existing;
      }
    }
    const favorite = addFavorite(state, {
      type: "分镜脚本",
      name: result.title || (state.reverseVideo.upload && `反推分镜 · ${state.reverseVideo.upload.fileName}`) || "反推分镜",
      content: reverseStoryboardText(result),
      tags: ["反推分镜", "视频拆解"],
      score: 80,
      sourceKey,
    });
    state.reverseVideo.selectedFavoriteId = favorite.id;
    return favorite;
  }

  function cloneScenes(scenes) {
    return clone(Array.isArray(scenes) ? scenes : []);
  }

  function createTasksFromReverseFavorite(state, options = {}) {
    const result = state.reverseVideo && state.reverseVideo.result;
    const favoriteId = options.favoriteId || (state.reverseVideo && state.reverseVideo.selectedFavoriteId) || state.selectedFavoriteId;
    const favorite = getById(state.favorites, favoriteId);
    if (!favorite) {
      throw new Error("请先保存或选择一个反推分镜收藏。");
    }
    const workspace = state.reverseVideo || {};
    const productId = options.productId || workspace.selectedProductId || state.selectedProductId;
    const product = getById(state.products, productId) || getById(state.products, state.selectedProductId);
    const productContext = productAiContext(product);
    const scenes = result && Array.isArray(result.scenes) && result.scenes.length
      ? result.scenes
      : generateStoryboard(product, favorite, buildVariation(0, options.strategy || "rewrite"), { text: favorite.content });
    const taskDuration = result && result.duration || 15;
    const timedScenes = normalizeStoryboardTiming(scenes, taskDuration);
    const count = Math.max(1, Math.min(Number(options.count || workspace.secondaryCount || 3), 10));
    const strategy = options.strategy || workspace.creationStrategy || "rewrite";
    const now = new Date().toISOString();
    const tasks = Array.from({ length: count }, (_, index) => {
      const variation = buildVariation(index, strategy);
      const task = {
        id: uid("task"),
        productId: product.id,
        productName: productDisplayName(product),
        favoriteId: favorite.id,
        favoriteName: favorite.name,
        source: "reverse-video",
        sourceKey: favorite.sourceKey || "",
        strategy,
        variation,
        title: `${productDisplayName(product)} · ${favorite.name} · ${variation.angle}`,
        status: "storyboard_ready",
        owner: "运营",
        createdAt: now,
        updatedAt: now,
        duration: taskDuration,
        ratio: result && result.ratio || "9:16",
        videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
        contentPlan: result ? {
          productUnderstanding: productContext.name || productDisplayName(product),
          targetAudience: productContext.audience || "",
          keySellingPoints: splitList(productContext.sellingPoints),
          usageScenarios: [],
          strategy: [
            result.summary || "",
            "最大程度复刻参考视频的画面、文案/语音、镜头角度、动作节奏、构图和转化收尾。",
            favorite.content,
          ].filter(Boolean).join("\n"),
          hook: result.hook || variation.hook,
          reviewSummary: result.summary || "",
          complianceNotes: [],
          scenes: cloneScenes(timedScenes),
        } : null,
        contentBrief: Object.assign(createContentBriefSnapshot(product, favorite, { text: favorite.content }), {
          videoResolution: normalizeVideoResolution(state.contentBrief && state.contentBrief.videoResolution),
        }),
        strategySummary: result && result.summary || "基于反推分镜二次创作",
        sourceFidelityInstruction: "最大程度复刻参考视频的文案、语音、镜头角度、运镜节奏、构图和转化收尾。",
        reviewSummary: result && result.summary ? `${result.summary}\n最大程度复刻参考视频的文案、语音、镜头角度和动作节奏。` : "最大程度复刻参考视频的文案、语音、镜头角度和动作节奏。",
        storyboard: cloneScenes(timedScenes),
        storyboardTimingStatus: timedScenes.timingStatus,
        video: null,
        reviewNote: "",
        copies: {},
        publishResults: {},
        providerRequests: {},
        providerResponses: {},
      };
      return task;
    });
    state.tasks = tasks.concat(state.tasks);
    state.selectedTaskId = tasks[0] && tasks[0].id || state.selectedTaskId;
    if (favorite) favorite.reuseCount += tasks.length;
    return tasks;
  }

  function createTasksFromContentPlanStoryboard(state, sourceTask, options = {}) {
    if (!sourceTask || !Array.isArray(sourceTask.storyboard) || !sourceTask.storyboard.length) {
      throw new Error("请先生成分镜脚本，再批量生成视频任务。");
    }
    const count = Math.max(1, Math.min(Number(options.count || state.contentBrief && state.contentBrief.videoBatchCount || 1), 10));
    const strategy = options.strategy || state.contentBrief && state.contentBrief.videoCreationStrategy || "original";
    const videoResolution = normalizeVideoResolution(options.videoResolution || sourceTask.videoResolution || sourceTask.contentBrief?.videoResolution || state.contentBrief && state.contentBrief.videoResolution);
    const now = new Date().toISOString();
    const tasks = Array.from({ length: count }, (_, index) => {
      const variation = buildVariation(index, strategy);
      return {
        id: uid("task"),
        productId: sourceTask.productId,
        productName: sourceTask.productName,
        favoriteId: sourceTask.favoriteId || "",
        favoriteName: sourceTask.favoriteName || "当前分镜",
        source: "content-plan-batch",
        sourceTaskId: sourceTask.id,
        strategy,
        variation,
        title: `${sourceTask.productName || "产品"} · ${sourceTask.contentPlan?.hook || sourceTask.variation?.hook || "分镜视频"} · ${variation.angle}`,
        status: "storyboard_ready",
        owner: sourceTask.owner || "运营",
        createdAt: now,
        updatedAt: now,
        duration: sourceTask.duration || 15,
        ratio: sourceTask.ratio || "9:16",
        videoResolution,
        contentPlan: clone(sourceTask.contentPlan || null),
        contentBrief: Object.assign(clone(sourceTask.contentBrief || {}), { videoResolution }),
        strategySummary: sourceTask.strategySummary || sourceTask.contentPlan?.strategy || "",
        reviewSummary: sourceTask.reviewSummary || "",
        storyboard: cloneScenes(sourceTask.storyboard),
        storyboardScriptText: sourceTask.storyboardScriptText || "",
        storyboardTimingStatus: sourceTask.storyboardTimingStatus || sourceTask.storyboard.timingStatus || "ok",
        videoStyleInstruction: `按「${strategyLabel(strategy)}」生成视频变体：${variation.angle}。保持同一套已确认分镜，不重新生成分镜。`,
        video: null,
        reviewNote: "",
        copies: {},
        publishResults: {},
        providerRequests: {},
        providerResponses: {},
      };
    });
    state.tasks = tasks.concat(state.tasks);
    state.selectedTaskId = tasks[0] && tasks[0].id || state.selectedTaskId;
    return tasks;
  }

  function storyboardTasksFromProviderResult(result) {
    if (!result) return [];
    if (Array.isArray(result.tasks)) return result.tasks;

    const taskFromSceneContainer = (source, scenes) => {
      const config = source && typeof source === "object" && source.videoConfiguration && typeof source.videoConfiguration === "object"
        ? source.videoConfiguration
        : {};
      return {
        title: firstValue(source, ["title"], ""),
        angle: firstValue(source, ["angle"], ""),
        hook: firstValue(source, ["hook"], ""),
        duration: Number(firstValue(source, ["duration", "durationSecond", "duration_second"], firstValue(config, ["totalDurationSeconds", "durationSecond", "duration_second"], 15))) || 15,
        sceneCount: Number(firstValue(source, ["sceneCount", "scene_count"], firstValue(config, ["sceneCount", "scene_count"], 0))) || undefined,
        strategy: firstValue(source, ["strategy"], ""),
        reviewSummary: firstValue(source, ["reviewSummary", "review_summary"], ""),
        scenes,
      };
    };

    const direct = Array.isArray(result)
      ? result
      : firstValue(result, ["video_storyboard_batch", "videoStoryboardBatch", "scenes", "storyboard", "storyboards"], []);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) {
      const nestedScenes = firstValue(direct, ["scenes", "storyboard"], []);
      return Array.isArray(nestedScenes) && nestedScenes.length ? [taskFromSceneContainer(direct, nestedScenes)] : [];
    }
    if (!Array.isArray(direct) || !direct.length) return [];
    if (direct.some((item) => item && Array.isArray(item.scenes))) return direct;

    return [taskFromSceneContainer(result, direct)];
  }

  function applyStoryboardProviderResult(tasks, response) {
    const result = providerResult(response);
    const providerTasks = storyboardTasksFromProviderResult(result);
    if (!providerTasks.length) return false;
    tasks.forEach((task, index) => {
      const remote = providerTasks[index] || providerTasks[0];
      if (!remote) return;
      if (result.contentBrief && typeof result.contentBrief === "object") {
        task.contentBrief = Object.assign({}, task.contentBrief || {}, result.contentBrief);
      }
      task.variation.angle = remote.angle || task.variation.angle;
      task.variation.hook = remote.hook || task.variation.hook;
      task.strategySummary = remote.strategy || task.strategySummary || "";
      task.reviewSummary = remote.reviewSummary || remote.review_summary || task.reviewSummary || "";
      task.qualityScore = Number(remote.qualityScore || remote.quality_score || task.qualityScore || 0) || undefined;
      task.title = remote.title || `${task.productName} · ${task.variation.angle}`;
      task.duration = Number(remote.duration || task.duration || 15) || 15;
      if (Array.isArray(remote.scenes) && remote.scenes.length) {
        const remoteScenes = remote.scenes.map((scene, sceneIndex) => sceneFromProvider(scene, task.storyboard[sceneIndex]));
        const requestedCount = requestedStoryboardSceneCount(task, remote);
        const countedScenes = normalizeStoryboardSceneCount(remoteScenes, requestedCount);
        const timedScenes = normalizeStoryboardTiming(countedScenes, task.duration);
        task.storyboard = timedScenes;
        task.storyboardTimingStatus = timedScenes.timingStatus;
        task.storyboardSceneCountStatus = requestedCount && remoteScenes.length !== countedScenes.length
          ? `auto_repaired_${remoteScenes.length}_to_${countedScenes.length}`
          : "matched";
        if (task.contentPlan && typeof task.contentPlan === "object") task.contentPlan.scenes = timedScenes;
      }
    });
    return true;
  }

  function videoUrlFromProviderResult(result, output) {
    const resultContent = result.content && typeof result.content === "object" ? result.content : {};
    const outputContent = output.content && typeof output.content === "object" ? output.content : {};
    const direct = result.video_url || result.videoUrl || result.url
      || output.video_url || output.videoUrl || output.url
      || resultContent.video_url || resultContent.videoUrl || resultContent.url
      || outputContent.video_url || outputContent.videoUrl || outputContent.url;
    if (direct) return direct;
    const resultData = result.result && Array.isArray(result.result.data) ? result.result.data : null;
    const outputData = Array.isArray(output.data) ? output.data : null;
    const videoItem = (resultData || outputData || []).find((item) => item && item.url);
    return videoItem ? videoItem.url : "";
  }

  function applyVideoProviderResult(task, response) {
    const result = providerResult(response);
    if (!result) return false;
    const output = result.output || result.data || {};
    const url = videoUrlFromProviderResult(result, output);
    const jobId = result.job_id || result.jobId || result.task_id || output.task_id || result.id;
    const providerStatus = result.status || result.task_status || output.task_status || (url ? "SUCCEEDED" : "PENDING");
    const providerMessage = result.message || output.message || "";
    const providerCode = result.code || output.code || "";
    task.video = Object.assign({}, task.video || {}, {
      url: url || (task.video && task.video.url) || "",
      jobId: jobId || (task.video && task.video.jobId) || "",
      providerStatus,
      providerCode,
      providerMessage,
      providerCost: result.cost,
      providerResult: result,
    });
    if (!task.video.url && !task.video.jobId) {
      markVideoTaskMissingJob(task);
    } else if (["FAILED", "failed", "CANCELED", "canceled"].includes(providerStatus)) {
      const issue = explainProviderIssue(response || { providerStatus, providerMessage, providerCode }, { kind: "video", status: providerStatus });
      task.reviewNote = `${issue.title}：${issue.action}`;
      setTaskStatus(task, "rejected");
    } else if (url || ["SUCCEEDED", "succeeded", "success", "completed"].includes(providerStatus)) {
      setTaskStatus(task, "video_review");
    } else {
      setTaskStatus(task, "video_generating");
    }
    return true;
  }

  function applyCopyProviderResult(task, response) {
    const result = providerResult(response);
    if (!result || !Array.isArray(result.copies)) return false;
    task.copySummary = result.videoSummary || result.video_summary || task.copySummary || "";
    result.copies.forEach((copy) => {
      const platform = platforms.find((item) => item.id === copy.platformId) || platforms.find((item) => item.name === copy.platformName);
      const platformId = copy.platformId || (platform && platform.id);
      if (!platformId) return;
      task.copies[platformId] = {
        platformId,
        platformName: copy.platformName || (platform && platform.name) || platformId,
        language: copy.language || "en",
        copyStyle: copy.copyStyle || copy.copy_style || "",
        title: containsChineseText(copy.title) ? englishCopyTitle(platformId) : copy.title || englishCopyTitle(platformId),
        hook: copy.hook || "",
        body: copy.body || "",
        cta: copy.cta || "",
        hashtags: splitList(copy.hashtags),
        chineseTranslation: copy.chineseTranslation || copy.chinese_translation || copy.translationZh || copy.translation_zh || "",
        coverTitle: copy.coverTitle || copy.cover_title || "",
        overlayText: splitList(copy.overlayText || copy.overlay_text),
        firstComment: copy.firstComment || copy.first_comment || "",
        postingNotes: copy.postingNotes || copy.posting_notes || "",
        complianceWarnings: splitList(copy.complianceWarnings || copy.compliance_warnings),
        rationale: copy.rationale || "",
        approved: false,
        limit: platform ? platform.limit : 500,
      };
    });
    return Object.keys(task.copies).length > 0;
  }

  function applyPublishProviderResult(task, response) {
    const result = providerResult(response);
    if (!result || !Array.isArray(result.results)) return false;
    task.publishResults = result.results.reduce((acc, item) => {
      const platformId = item.platform || item.platformId;
      if (!platformId) return acc;
      acc[platformId] = {
        platformName: item.platformName || platformId,
        status: item.status || "published",
        url: item.url || "",
        publishedAt: item.publishedAt || new Date().toISOString(),
      };
      return acc;
    }, {});
    return Object.keys(task.publishResults).length > 0;
  }

  function providerPostResult(response) {
    const result = providerResult(response);
    const data = result && result.data || result;
    if (!data) return null;
    if (Array.isArray(data.posts) && data.posts[0]) return data.posts[0];
    if (data.post) return data.post;
    if (data.result && data.result.post) return data.result.post;
    if (data.post_id || data.id || data.status || data.post_status || data.scheduled_for) return data;
    return null;
  }

  function applyScheduledPostProviderResult(scheduledPost, response) {
    if (!scheduledPost) return null;
    scheduledPost.providerResponse = response;
    const post = providerPostResult(response) || {};
    scheduledPost.platformPostId = post.post_id || post.id || "";
    scheduledPost.platformStatus = post.post_status || post.status || "";
    scheduledPost.platformScheduledFor = post.scheduled_for || scheduledPost.scheduledAt;
    scheduledPost.platformTimezone = post.timezone || "UTC";
    scheduledPost.status = /fail|error|reject/i.test(String(scheduledPost.platformStatus)) ? "failed" : "platform_scheduled";
    scheduledPost.updatedAt = new Date().toISOString();
    return scheduledPost;
  }

  function applyCancelScheduledPostProviderResult(scheduledPost, response) {
    if (!scheduledPost) return null;
    const now = new Date().toISOString();
    const post = providerPostResult(response) || {};
    scheduledPost.providerCancelResponse = response;
    scheduledPost.platformStatus = post.post_status || post.status || "cancelled";
    scheduledPost.status = response && response.ok === false ? "failed" : "cancelled";
    scheduledPost.platformCancelledAt = now;
    scheduledPost.updatedAt = now;
    return scheduledPost;
  }

  function applyRescheduleScheduledPostProviderResult(scheduledPost, response) {
    if (!scheduledPost) return null;
    const post = providerPostResult(response) || {};
    scheduledPost.providerRescheduleResponse = response;
    scheduledPost.platformStatus = post.post_status || post.status || "scheduled";
    scheduledPost.platformScheduledFor = post.scheduled_for || scheduledPost.scheduledAt;
    scheduledPost.platformTimezone = post.timezone || "UTC";
    scheduledPost.status = response && response.ok === false || /fail|error|reject/i.test(String(scheduledPost.platformStatus))
      ? "failed"
      : "platform_scheduled";
    scheduledPost.updatedAt = new Date().toISOString();
    return scheduledPost;
  }

  function createBatchTasks(state, options) {
    throw new Error("批量分镜入口已移除，请使用真实内容规划入口。");
  }

  function setTaskStatus(task, status) {
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  function simulateVideoGeneration(state, task) {
    const product = getById(state.products, task.productId);
    task.providerRequests = task.providerRequests || {};
    try {
      task.providerRequests.video = buildVideoProviderRequest(state, task, product);
    } catch (error) {
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.video = { ok: false, error: error.message, code: error.code || "" };
      task.reviewNote = error.message;
      task.video = null;
      setTaskStatus(task, "rejected");
      throw error;
    }
    task.video = {
      url: "",
      provider: state.integrations.video.provider,
      cost: 3.2,
      duration: task.duration,
      generatedAt: new Date().toISOString(),
    };
    return setTaskStatus(task, "video_generating");
  }

  function approveVideo(task, note) {
    task.reviewNote = note || "视频通过，可进入平台文案生成。";
    return setTaskStatus(task, "copy_review");
  }

  function generateCopy(task, platformId) {
    const platform = platforms.find((item) => item.id === platformId) || platforms[0];
    const hook = sanitizePublishText(task.variation.hook);
    const offer = sanitizePublishText(task.contentBrief && task.contentBrief.offer || "了解更多优惠");
    const proof = task.contentBrief && Array.isArray(task.contentBrief.proofPoints)
      ? task.contentBrief.proofPoints.slice(0, 3).map(sanitizePublishText)
      : ["核心卖点", "使用场景", "产品外观"];
    const style = copyStyleById(task.copyStyle);
    const productName = sanitizePublishText(task.productName || "this find");
    const englishProof = proof.map((item) => {
      const text = String(item || "").toLowerCase();
      if (/风/.test(text)) return "strong airflow";
      if (/轻|weight/.test(text)) return "lightweight feel";
      if (/免提|hands/.test(text)) return "hands-free use";
      if (/便携|portable/.test(text)) return "easy to wear";
      return "real everyday use";
    });
    const title = englishCopyTitle(platform.id);
    const styleBodies = {
      "problem-solution": `Hot kitchen, sweaty face, zero patience. This hands-free fan keeps air moving while you cook, clean, or walk outside. It feels light, stays out of the way, and the airflow is easy to notice.`,
      "soft-sell": `If you get hot while cooking, walking, or running errands, this is worth checking out. It sits around your neck, feels lightweight, and keeps your hands free.`,
      funny: `When the kitchen is too hot and you need an emergency rescue. This neck fan is lightweight, hands-free, and the airflow actually makes the scene feel less chaotic.`,
      comparison: `Before: stuck in a hot kitchen with no hands free. After: wearing a neck fan while still cooking and moving around. Simple, lightweight, and easy to notice on camera.`,
      "ugc-real": `Cooking in a hot kitchen is no joke. This hands-free neck fan keeps the air moving while I’m busy, and I don’t have to hold anything. Lightweight, simple, and way more useful than I expected.`,
    };
    const body = styleBodies[style.id] || styleBodies["ugc-real"];
    const cta = platform.id === "threads" ? "Would you use this indoors or outside?" : "Would you use this in the kitchen or outside?";
    const hashtags = platform.id === "threads"
      ? ["NeckFan", "SummerFinds"]
      : ["NeckFan", "StayCool", "KitchenHack", "SummerFinds", "TikTokShop"];
    const chineseBodies = {
      "problem-solution": "厨房很热、满脸是汗，真的很容易没耐心。这款免手持风扇可以在做饭、清洁或户外走动时持续送风，佩戴起来比较轻，不太妨碍动作，风感也比较明显。",
      "soft-sell": "如果你在做饭、散步或出门办事时容易觉得热，这款挂脖风扇可以看看。它戴在脖子上，体感比较轻，也不用占用双手。",
      funny: "当厨房热到需要一个救场小工具时，这款挂脖风扇可以制造轻松的剧情反差。它比较轻、免手持，风感在画面里也容易被看见。",
      comparison: "使用前是在闷热厨房里忙到腾不出手；使用后是戴着挂脖风扇继续做饭和走动。表达重点是轻便、免手持和可见的风感，不做绝对效果承诺。",
      "ugc-real": "在很热的厨房做饭真的不轻松。这款免手持挂脖风扇可以在忙的时候持续送风，不需要手拿。整体比较轻，使用方式简单，比预想中更实用。",
    };
    const chineseTitle = `${productName} 夏季使用文案参考`;
    const chineseHook = platform.id === "instagram" ? "真实夏季使用场景，不像精修广告。" : "厨房很热、双手很忙，但还是需要有风。";
    const chineseCta = cta === "Would you use this in the kitchen or outside?" ? "你会在厨房用，还是出门用？" : "你会在室内用，还是户外用？";
    const chineseTranslation = [
      "中文参考译文：",
      chineseTitle,
      chineseHook,
      chineseBodies[style.id] || chineseBodies["ugc-real"],
      chineseCta,
    ].join("\n");
    return {
      platformId,
      platformName: platform.name,
      language: "en",
      copyStyle: style.id,
      title: sanitizePublishText(title),
      hook: sanitizePublishText(platform.id === "instagram" ? "Real summer use, no polished ad vibe." : "Hot kitchen, hands full, still need airflow."),
      body: sanitizePublishText(body),
      cta,
      hashtags,
      chineseTranslation: sanitizePublishText(chineseTranslation),
      coverTitle: platform.id === "youtube" ? `${productName} in 15 sec` : "Too hot to cook?",
      overlayText: englishProof.slice(0, 3),
      firstComment: cta,
      postingNotes: sanitizePublishText(`使用「${style.label}」风格。实际发布文案保持英文，避免医疗暗示、孕期专用暗示和绝对降温承诺。`),
      complianceWarnings: ["发布前确认风力强劲、重量轻等卖点与真实产品一致", "避免医疗、孕期专用或保证降温效果等未经证实的表述"],
      rationale: "当前平台使用英文发布正文，内部审核采用中文说明；文案用短句和低压互动提问替代视频概述。",
      approved: false,
      limit: platform.limit,
    };
  }

  function generateCopies(task, platformIds, options = {}) {
    task.copyStyle = options.style || task.copyStyle || "ugc-real";
    task.copySummary = `${task.productName} short-video captions are generated in English with Chinese reference translations for review.`;
    normalizePublishPlatformIds(platformIds).forEach((platformId) => {
      task.copies[platformId] = generateCopy(task, platformId);
    });
    return task;
  }

  function approveCopy(task, platformId) {
    if (task.copies[platformId]) {
      task.copies[platformId].approved = true;
    }
    const publishCopies = Object.values(task.copies).filter((copy) => isPublishPlatformEnabled(copy.platformId));
    const allApproved = publishCopies.length > 0 && publishCopies.every((copy) => copy.approved);
    if (allApproved) {
      setTaskStatus(task, "ready_to_publish");
    }
    return task;
  }

  function publishTask(state, task) {
    const approvedCopies = Object.values(task.copies).filter((copy) => copy.approved && isPublishPlatformEnabled(copy.platformId));
    task.providerRequests = task.providerRequests || {};
    task.providerRequests.publisher = buildPublishProviderRequest(state, task);
    task.publishResults = approvedCopies.reduce((acc, copy) => {
      acc[copy.platformId] = {
        platformName: copy.platformName,
        status: "published",
        url: `https://posteverywhere.example/${copy.platformId}/${task.id}`,
        publishedAt: new Date().toISOString(),
      };
      return acc;
    }, {});
    return setTaskStatus(task, "published");
  }

  function createScheduledPost(state, task, platformId, options) {
    if (!state || !task) throw new Error("缺少可定时发布的任务");
    const copy = task.copies && task.copies[platformId];
    if (!copy || !copy.approved) throw new Error("请先通过要定时发布的平台文案");
    if (!task.video || !task.video.url) throw new Error("请先生成并审核视频");
    const timezone = (options && options.timezone) || state.scheduleTimezone || "Asia/Shanghai";
    const scheduledAt = scheduledLocalToIso((options && options.scheduledAt) || `${state.scheduleDate}T${state.scheduleTime}`, timezone);
    const copySnapshot = clone(copy);
    const previewTask = Object.assign({}, task, { copies: { [platformId]: copySnapshot } });
    const providerRequestPreview = buildPublishProviderRequest(state, previewTask, {
      platformIds: [platformId],
      scheduledAt,
      timezone,
    });
    const now = new Date().toISOString();
    const scheduledPost = {
      id: uid("scheduled-post"),
      taskId: task.id,
      taskTitle: task.title || "",
      productName: task.productName || "",
      platformId,
      platformName: copy.platformName || platformId,
      copySnapshot,
      videoSnapshot: clone(task.video),
      accountIds: publisherAccountIds(state.integrations.publisher),
      mediaIds: publishMediaIds(state, task, [platformId]),
      scheduledAt,
      timezone,
      status: "scheduled",
      schedulingMode: "posteverywhere",
      providerRequestPreview,
      createdAt: now,
      updatedAt: now,
    };
    state.scheduledPosts = Array.isArray(state.scheduledPosts) ? state.scheduledPosts : [];
    state.scheduledPosts.unshift(scheduledPost);
    return scheduledPost;
  }

  function scheduledPostById(state, id) {
    return (state.scheduledPosts || []).find((item) => item.id === id) || null;
  }

  function cancelScheduledPost(state, id) {
    const scheduledPost = scheduledPostById(state, id);
    if (!scheduledPost) return null;
    scheduledPost.status = "cancelled";
    scheduledPost.updatedAt = new Date().toISOString();
    return scheduledPost;
  }

  function reschedulePost(state, id, localDateTime, timezone) {
    const scheduledPost = scheduledPostById(state, id);
    if (!scheduledPost) return null;
    scheduledPost.timezone = timezone || scheduledPost.timezone || "Asia/Shanghai";
    scheduledPost.scheduledAt = scheduledLocalToIso(localDateTime, scheduledPost.timezone);
    scheduledPost.status = "scheduled";
    scheduledPost.schedulingMode = "posteverywhere";
    if (scheduledPost.providerRequestPreview && scheduledPost.providerRequestPreview.body) {
      scheduledPost.providerRequestPreview.body.scheduled_for = scheduledPost.scheduledAt;
      scheduledPost.providerRequestPreview.body.timezone = "UTC";
    }
    scheduledPost.updatedAt = new Date().toISOString();
    return scheduledPost;
  }

  function dueScheduledPosts(state, nowIso) {
    const now = new Date(nowIso || new Date().toISOString()).getTime();
    return (state.scheduledPosts || []).filter((item) => item.status === "scheduled" && new Date(item.scheduledAt).getTime() <= now);
  }

  function markDueScheduledPosts(state, nowIso) {
    const due = dueScheduledPosts(state, nowIso);
    const now = new Date().toISOString();
    due.forEach((item) => {
      item.status = "due";
      item.updatedAt = now;
    });
    return due;
  }

  function scheduledPostStatusLabel(status) {
    return {
      scheduled: "已定时",
      due: "待发布",
      platform_scheduled: "平台托管",
      publishing: "发布中",
      published: "已发布",
      failed: "发布失败",
      cancelled: "已取消",
    }[status] || status;
  }

  function deleteTask(state, taskId) {
    const index = state.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return null;
    const deleted = state.tasks.splice(index, 1)[0];
    if (state.selectedTaskId === taskId) {
      const nextTask = state.tasks[index] || state.tasks[index - 1] || state.tasks[0] || null;
      state.selectedTaskId = nextTask ? nextTask.id : null;
    }
    return deleted;
  }

  function deleteFavorite(state, favoriteId) {
    if (!Array.isArray(state.favorites) || !state.favorites.length) return null;
    const index = state.favorites.findIndex((favorite) => favorite.id === favoriteId);
    if (index < 0) return null;
    const deleted = state.favorites.splice(index, 1)[0];
    if (state.selectedFavoriteId === favoriteId) {
      const nextFavorite = state.favorites[index] || state.favorites[index - 1] || state.favorites[0] || null;
      state.selectedFavoriteId = nextFavorite ? nextFavorite.id : null;
    }
    return deleted;
  }

  function clearProductImage(state, productId) {
    const product = getById(state.products, productId || state.selectedProductId);
    if (!product) return null;
    product.imageData = "";
    product.imageLabel = "产品图";
    product.images = [];
    return product;
  }

  function clearIntegrationKey(state, key) {
    if (!state.integrations || !state.integrations[key]) return null;
    state.integrations[key].apiKey = "";
    return state.integrations[key];
  }

  function taskStatusLabel(status) {
    return {
      content_plan_ready: "内容规划已生成",
      storyboard_ready: "分镜脚本已生成",
      video_generating: "视频生成中",
      video_review: "待视频审核",
      copy_review: "待文案审核",
      ready_to_publish: "待发布",
      published: "已发布",
      rejected: "已退回",
    }[status] || status;
  }

  function computeStats(state) {
    return {
      tasks: state.tasks.length,
      storyboard: state.tasks.filter((task) => ["content_plan_ready", "storyboard_ready"].includes(task.status)).length,
      videoReview: state.tasks.filter((task) => task.status === "video_review").length,
      copyReview: state.tasks.filter((task) => task.status === "copy_review").length,
      ready: state.tasks.filter((task) => task.status === "ready_to_publish").length,
      published: state.tasks.filter((task) => task.status === "published").length,
      favorites: state.favorites.length,
    };
  }

  return {
    platforms,
    publishPlatforms,
    normalizePublishPlatformIds,
    copyStyles,
    llmProviders,
    videoProviders,
    createInitialState,
    migrateState,
    getProviderPreset,
    rememberIntegrationProviderConfig,
    applyIntegrationPreset,
    switchIntegrationProvider,
    saveIntegrationProfile,
    applyIntegrationProfile,
    deleteIntegrationProfile,
    getById,
    strategyLabel,
    productImageRoles,
    productImageRolePurposes,
    productMaterials,
    videoProductMaterials,
    addProductImage,
    updateProductImage,
    removeProductImage,
    addFavorite,
    generateContentBrief,
    normalizeReverseStoryboard,
    buildReverseStoryboardProviderRequest,
    buildStoryboardProviderRequest,
    buildStoryboardFromIdeaProviderRequest,
    buildStoryboardFromContentPlanProviderRequest,
    buildContentPlanProviderRequest,
    buildContentBriefProviderRequest,
    buildVideoProviderRequest,
    buildVideoStatusProviderRequest,
    buildPublishProviderRequest,
    buildCancelScheduledPostProviderRequest,
    buildRescheduleScheduledPostProviderRequest,
    publishMediaIds,
    buildCopyProviderRequest,
    sanitizePublishText,
    explainProviderIssue,
    normalizeStoryboardTiming,
    applyContentBriefProviderResult,
    applyContentPlanProviderResult,
    applyReverseStoryboardProviderResult,
    applyStoryboardProviderResult,
    applyVideoProviderResult,
    applyCopyProviderResult,
    applyPublishProviderResult,
    applyScheduledPostProviderResult,
    applyCancelScheduledPostProviderResult,
    applyRescheduleScheduledPostProviderResult,
    createContentPlanTask,
    createStoryboardTaskFromIdea,
    reverseStoryboardText,
    saveReverseStoryboardFavorite,
    createTasksFromReverseFavorite,
    createTasksFromContentPlanStoryboard,
    createBatchTasks,
    simulateVideoGeneration,
    approveVideo,
    generateCopies,
    approveCopy,
    publishTask,
    createScheduledPost,
    cancelScheduledPost,
    reschedulePost,
    dueScheduledPosts,
    markDueScheduledPosts,
    scheduledPostStatusLabel,
    scheduledIsoToLocal,
    deleteTask,
    deleteFavorite,
    clearProductImage,
    clearIntegrationKey,
    taskStatusLabel,
    computeStats,
  };
});
