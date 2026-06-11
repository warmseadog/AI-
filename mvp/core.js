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
    { id: "seedfast2", name: "小云雀 SeedFast2", endpoint: "", model: "SeedFast2" },
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
    contentBrief: {
      seed: "",
      text: "",
      storyboardSceneCount: "auto",
      storyboardDetailLevel: "detailed",
      videoBatchCount: 1,
      videoCreationStrategy: "original",
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
        provider: "seedfast2",
        apiStyle: "generic-video",
        endpoint: "",
        model: "SeedFast2",
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

  function migrateState(input) {
    const base = createInitialState();
    const incoming = input && typeof input === "object" ? input : {};
    const legacy = incoming.schemaVersion !== 2;
    const state = legacy ? base : Object.assign(base, incoming);
    state.schemaVersion = 2;
    state.products = legacy ? base.products : (Array.isArray(state.products) && state.products.length ? state.products : base.products);
    state.favorites = legacy ? [] : (Array.isArray(state.favorites) ? state.favorites : []);
    state.tasks = legacy ? [] : (Array.isArray(state.tasks) ? state.tasks : []);
    state.tasks = state.tasks.map((task) => repairSavedTaskTimestamps(repairSavedVideoTask(repairSavedContentPlanTask(task))));
    state.selectedPlatforms = Array.isArray(state.selectedPlatforms) && state.selectedPlatforms.length ? state.selectedPlatforms : base.selectedPlatforms;
    state.copyStyle = copyStyles.some((style) => style.id === state.copyStyle) ? state.copyStyle : base.copyStyle;
    state.products = state.products.map((product) => Object.assign({ detailsSaved: false }, product));
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
    return String(product && (product.name || product.imageLabel) || "").trim() || "产品";
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

  function productMaterials(product) {
    const materials = [];
    const imageUrl = String(product && product.imageUrl || "").trim();
    if (imageUrl) {
      materials.push({ type: "url", label: "图片 URL", url: imageUrl });
    }
    const imageData = String(product && product.imageData || "").trim();
    if (imageData) {
      materials.push({
        type: "upload",
        label: product.imageLabel || product.name || "上传图片",
        dataUrl: imageData,
      });
    }
    return materials;
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    return String(value || "")
      .split(/[，,\n#]+/)
      .map((item) => item.trim())
      .filter(Boolean);
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
    return /^data:image\//i.test(dataUrl) ? dataUrl : "";
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
      return {
        model: integration.model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userContentForText) },
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
      target: "生成一段可直接用于短视频分镜生成的内容策划文本，包含画面、节奏、场景、卖点和结尾转化。",
    };
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, "你是短视频内容策划助手。根据产品资料、图片素材和用户要求，生成一段中文视频内容 brief。只输出结构化 JSON。", userContent, "content_brief", schema),
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
          additionalProperties: true,
          required: ["productUnderstanding", "targetAudience", "keySellingPoints", "strategy", "hook"],
          properties: {
            productUnderstanding: { type: "string" },
            targetAudience: { type: "string" },
            keySellingPoints: { type: "array", items: { type: "string" } },
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
      outputFields: [
        "productUnderstanding",
        "targetAudience",
        "keySellingPoints",
        "usageScenarios",
        "painPoints",
        "contentAngle",
        "hookOptions",
        "coreMessage",
        "strategy",
        "hook",
        "visualStyle",
        "rhythm",
        "mustShow",
        "mustAvoid",
        "cta",
        "reviewSummary",
        "complianceNotes",
      ],
    };
    return {
      provider: integration.provider,
      mode: "http",
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: buildLlmBody(integration, "你是跨境电商短视频内容规划助手。根据用户想法和产品图生成完整、可审核、可人工修改的短视频内容规划。规划必须细到目标用户、痛点、卖点、视觉风格、节奏、必拍画面、禁用夸张表达和 CTA。不要输出分镜、镜头拆分、时间轴、字幕字段或视频生成提示词。只输出结构化 JSON，不要编造未经证实的功效。", userContent, "content_plan", schema),
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
      body: buildLlmBody(integration, "你是短视频分镜策划助手。输出结构化 JSON，不夸大产品功效。先给内容策略，再给可审核、可编辑、可提交视频模型的完整分镜。每个 task 必须是 15 秒，分镜从 0s 开始，最后一个镜头必须精确结束在 15s。", userContent, "video_storyboard_batch", schema),
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
    return 8;
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
      body: buildLlmBody(integration, "你是短视频分镜策划助手。必须严格基于用户已经确认和修改过的 contentPlan 生成分镜，不要回到原始想法自由发挥。输出结构化 JSON。分镜要更细，镜头数量必须等于请求的 sceneCount，且完整覆盖指定时长。", userContent, "video_storyboard_batch", schema),
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
    const hasReferenceImage = Boolean(product && String(product.imageUrl || product.imageData || "").trim());
    const nameText = [productName, product && product.name, product && product.imageLabel].filter(Boolean).join(" ");
    const genericLock = [
      "产品参考图为最高优先级：视频中的产品必须严格匹配所选产品参考图。",
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

  function buildVideoProviderRequest(state, task, product) {
    const integration = state.integrations.video;
    if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
      throw new Error("请先用当前内容规划生成分镜，再生成视频。");
    }
    const timedStoryboard = normalizeStoryboardTiming(task.storyboard, task.duration || 15);
    task.storyboard = timedStoryboard;
    task.storyboardTimingStatus = timedStoryboard.timingStatus;
    task.duration = Number(task.duration || 15);
    const details = productAiContext(product);
    const productName = details.name || productDisplayName(product);
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
    const prompt = task.storyboard.map((scene) => {
      const parts = [
        `${scene.time} ${scene.title || ""}`.trim(),
        `画面：${scene.videoPrompt || scene.visual || ""}`,
        scene.camera ? `镜头：${scene.camera}` : "",
        scene.motion ? `动作：${scene.motion}` : "",
        scene.subtitle ? `字幕：${scene.subtitle}` : "",
        scene.voiceover ? `旁白：${scene.voiceover}` : "",
        scene.screenText ? `屏幕字：${scene.screenText}` : "",
        scene.negativePrompt ? `负面约束：${scene.negativePrompt}` : "",
      ].filter(Boolean);
      return parts.join("；");
    }).join("\n");
    const durationPrompt = `Target duration: exactly ${task.duration}s. The sequence starts at 0s and the final scene ends at ${task.duration}s.`;
    const stylePrompt = task.videoStyleInstruction || "";
    const fullPrompt = [productFacts, sourceFidelityPrompt, stylePrompt, durationPrompt, prompt].filter(Boolean).join("\n");
    if (integration.apiStyle === "dashscope-video") {
      const imageUrl = product && String(product.imageUrl || product.imageData || "").trim();
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
        headers: { "X-DashScope-Async": "enable" },
        body: {
          model: integration.model,
          input,
          parameters: {
            duration: isWan27 ? Math.max(2, Math.min(Number(task.duration || 5), 15)) : Math.min(Number(task.duration || 5), 5),
            ...(isWan27 ? { resolution: "1080P", watermark: false } : {}),
            prompt_extend: true,
          },
        },
      };
    }
    if (integration.apiStyle === "toapis-video") {
      const imageUrl = product && String(product.imageUrl || "").trim();
      const requestedDuration = Number(task.duration || 10);
      const viduQ3 = isViduQ3Model(integration.model);
      const submittedDuration = viduQ3 ? normalizeViduQ3Duration(requestedDuration) : normalizeToApisDuration(requestedDuration);
      const body = {
        model: integration.model,
        prompt: fullPrompt,
        duration: submittedDuration,
        aspect_ratio: task.ratio || "9:16",
        resolution: viduQ3 ? "720p" : "720P",
      };
      if (viduQ3) body.audio = true;
      if (/^https?:\/\//i.test(imageUrl)) {
        body.image_urls = [imageUrl];
      }
      return {
        provider: integration.provider,
        mode: integration.mode,
        apiStyle: integration.apiStyle,
        endpoint: integration.endpoint,
        statusEndpoint: integration.statusEndpoint,
        model: integration.model,
        apiKey: integration.apiKey,
        duration: {
          requested: requestedDuration,
          submitted: submittedDuration,
          supported: viduQ3 ? [1, 16] : toapisSupportedDurations.slice(),
        },
        body,
      };
    }
    return {
      provider: integration.provider,
      mode: integration.mode,
      apiStyle: integration.apiStyle,
      endpoint: integration.endpoint,
      model: integration.model,
      apiKey: integration.apiKey,
      body: {
        model: integration.model,
        provider: integration.provider,
        duration: task.duration,
        ratio: task.ratio,
        image: product && product.imageData ? "local-product-image-data-url" : null,
        prompt: fullPrompt,
        negative_prompt: "blur, distorted product, wrong logo, unreadable text",
      },
    };
  }

  function taskJobId(task) {
    return task && task.video && (task.video.jobId || task.video.taskId || task.video.id);
  }

  function buildVideoStatusProviderRequest(state, task) {
    const integration = state.integrations.video || {};
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

  function buildPublishProviderRequest(state, task) {
    const integration = state.integrations.publisher;
    const copies = Object.values(task.copies).filter((copy) => copy.approved);
    const accountIds = splitList(integration.accountIds || integration.account_ids)
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    const mediaIds = splitList(integration.mediaIds || integration.media_ids || task.video?.posteverywhereMediaId || task.video?.mediaId);
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
    return {
      provider: integration.provider,
      mode: integration.mode,
      endpoint: integration.endpoint,
      apiKey: integration.apiKey,
      body,
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
      platforms: platforms.filter((platform) => platformIds.includes(platform.id)),
      copyStyle: style,
      language: {
        publish: "English",
        referenceTranslation: "Chinese",
        rules: [
          "实际发布的 title、hook、body、cta、hashtags 必须使用英文，可保留英文产品名或不写产品名。",
          "chineseTranslation 只给审核人员参考，不会发布。",
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
      body: buildLlmBody(integration, "你是跨平台短视频文案助手。根据已审核的视频分镜，为每个平台生成可人工审核、可编辑、可发布的完整文案详情。实际发布字段必须是英文。中文只放在 chineseTranslation 供审核参考。不要输出视频概述，要写成平台上的真实 caption。只输出结构化 JSON。", userContent, "platform_copy_batch", schema),
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
    return {
      productUnderstanding: firstValue(plan, ["productUnderstanding", "product_understanding", "productSummary", "product_summary"], ""),
      targetAudience: firstValue(plan, ["targetAudience", "target_audience", "audience"], ""),
      keySellingPoints: splitList(firstValue(plan, ["keySellingPoints", "key_selling_points", "sellingPoints", "selling_points"], [])),
      usageScenarios: splitList(firstValue(plan, ["usageScenarios", "usage_scenarios", "scenarios"], [])),
      painPoints: splitList(firstValue(plan, ["painPoints", "pain_points", "painpoints"], [])),
      contentAngle: firstValue(plan, ["contentAngle", "content_angle", "angle"], ""),
      hookOptions: splitList(firstValue(plan, ["hookOptions", "hook_options", "hooks"], [])),
      coreMessage: firstValue(plan, ["coreMessage", "core_message", "message"], ""),
      strategy: firstValue(plan, ["strategy", "contentStrategy", "content_strategy"], ""),
      hook: firstValue(plan, ["hook", "title"], ""),
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
    const scenes = Array.isArray(story.scenes) ? story.scenes : (Array.isArray(story.storyboard) ? story.storyboard : []);
    return {
      title: firstValue(story, ["title", "name"], upload && upload.fileName ? `反推分镜 · ${upload.fileName}` : "反推分镜"),
      summary: firstValue(story, ["summary", "reviewSummary", "review_summary", "strategy"], ""),
      hook: firstValue(story, ["hook", "opening"], ""),
      duration: Number(firstValue(story, ["duration"], 15)) || 15,
      ratio: firstValue(story, ["ratio", "aspectRatio", "aspect_ratio"], "9:16"),
      sourceReconstruction: clone(firstValue(story, ["sourceReconstruction", "source_reconstruction"], {})),
      rewriteTemplate: clone(firstValue(story, ["rewriteTemplate", "rewrite_template"], {})),
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
    ["productUnderstanding", "targetAudience", "keySellingPoints", "usageScenarios", "painPoints", "contentAngle", "hookOptions", "coreMessage", "strategy", "hook", "visualStyle", "rhythm", "mustShow", "mustAvoid", "cta", "storyboardGuidance", "reviewSummary", "complianceNotes"].forEach((field) => {
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
    if (!response) return task;
    applyVideoProviderResult(task, response);
    return task;
  }

  function repairSavedTaskTimestamps(task) {
    if (!task || typeof task !== "object") return task;
    const fallback = task.updatedAt || task.createdAt || task.video?.generatedAt || new Date().toISOString();
    task.createdAt = task.createdAt || fallback;
    task.updatedAt = task.updatedAt || task.createdAt;
    return task;
  }

  function createContentPlanTask(state, input) {
    const product = getById(state.products, state.selectedProductId);
    const contentPlan = normalizeContentPlan(input && input.contentPlan);
    if (!hasUsableValue(contentPlan.productUnderstanding) && !hasUsableValue(contentPlan.strategy) && !hasUsableValue(contentPlan.hook)) return null;
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
    return result && (result.reverseStoryboard || result.reverse_storyboard || result.storyboard || result);
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
        contentBrief: createContentBriefSnapshot(product, favorite, { text: favorite.content }),
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
        contentPlan: clone(sourceTask.contentPlan || null),
        contentBrief: clone(sourceTask.contentBrief || {}),
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
    const direct = result.video_url || result.videoUrl || result.url || output.video_url || output.videoUrl || output.url;
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
    if (["FAILED", "failed", "CANCELED", "canceled"].includes(providerStatus)) {
      task.reviewNote = providerMessage ? `视频生成失败：${providerMessage}` : `视频生成失败：${providerStatus}`;
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
        title: copy.title || "",
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
    task.providerRequests.video = buildVideoProviderRequest(state, task, product);
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
    const title = platform.id === "youtube"
      ? `${productName} in real use`
      : `${productName} summer check`;
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
    const chineseTranslation = [
      "中文参考译文：",
      `${title}`,
      body
        .replace("Cooking in a hot kitchen is no joke.", "在很热的厨房做饭真的不轻松。")
        .replace("Hot kitchen, sweaty face, zero patience.", "厨房很热、满脸是汗，真的很容易没耐心。")
        .replace("If you get hot while cooking, walking, or running errands, this is worth checking out.", "如果你做饭、散步或出门办事时容易热，这个可以看看。")
        .replace("When the kitchen is too hot and you need an emergency rescue.", "当厨房热到需要一个救场小工具。")
        .replace("Before: stuck in a hot kitchen with no hands free. After: wearing a neck fan while still cooking and moving around.", "使用前：厨房很热还腾不出手。使用后：戴着挂脖风扇也能继续做饭和走动。"),
      cta === "Would you use this in the kitchen or outside?" ? "你会在厨房用，还是出门用？" : "你会在室内用，还是户外用？",
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
      postingNotes: sanitizePublishText(`Use ${style.label} style. Keep the final caption in English and avoid making medical or guaranteed cooling claims.`),
      complianceWarnings: ["Confirm product airflow and lightweight claims are true", "Avoid medical, pregnancy-specific, or guaranteed cooling claims"],
      rationale: `${platform.name} uses English ${style.label} style, short caption lines, and a low-pressure question CTA instead of a video summary.`,
      approved: false,
      limit: platform.limit,
    };
  }

  function generateCopies(task, platformIds, options = {}) {
    task.copyStyle = options.style || task.copyStyle || "ugc-real";
    task.copySummary = `${task.productName} short-video captions are generated in English with Chinese reference translations for review.`;
    platformIds.forEach((platformId) => {
      task.copies[platformId] = generateCopy(task, platformId);
    });
    return task;
  }

  function approveCopy(task, platformId) {
    if (task.copies[platformId]) {
      task.copies[platformId].approved = true;
    }
    const allApproved = Object.values(task.copies).length > 0 && Object.values(task.copies).every((copy) => copy.approved);
    if (allApproved) {
      setTaskStatus(task, "ready_to_publish");
    }
    return task;
  }

  function publishTask(state, task) {
    const approvedCopies = Object.values(task.copies).filter((copy) => copy.approved);
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
      storyboard_ready: "内容规划已生成",
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
    addFavorite,
    generateContentBrief,
    normalizeReverseStoryboard,
    buildReverseStoryboardProviderRequest,
    buildStoryboardProviderRequest,
    buildStoryboardFromContentPlanProviderRequest,
    buildContentPlanProviderRequest,
    buildContentBriefProviderRequest,
    buildVideoProviderRequest,
    buildVideoStatusProviderRequest,
    buildPublishProviderRequest,
    buildCopyProviderRequest,
    sanitizePublishText,
    normalizeStoryboardTiming,
    applyContentBriefProviderResult,
    applyContentPlanProviderResult,
    applyReverseStoryboardProviderResult,
    applyStoryboardProviderResult,
    applyVideoProviderResult,
    applyCopyProviderResult,
    applyPublishProviderResult,
    createContentPlanTask,
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
    deleteTask,
    deleteFavorite,
    clearProductImage,
    clearIntegrationKey,
    taskStatusLabel,
    computeStats,
  };
});
