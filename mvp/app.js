const Core = window.VideoWorkbenchCore;
const STORE_KEY = "ai-video-workbench-mvp";

let state = loadState();
let view = initialView();
let selectedTaskIds = new Set();
let pendingActions = new Set();
let dashboardFilter = "all";
let storyboardEditorOpen = false;
let storyboardEditorSceneIndex = 0;
let copyDetailPlatformId = "";
let lastProfileSave = null;

function initialView() {
  const requested = location.hash.replace("#", "");
  return ["dashboard", "create", "reverse", "favorites", "review", "publish", "settings"].includes(requested) ? requested : "dashboard";
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return applyLocalConfig(saved ? Core.migrateState(JSON.parse(saved)) : Core.createInitialState());
  } catch (error) {
    return applyLocalConfig(Core.createInitialState());
  }
}

function applyLocalConfig(nextState) {
  const localConfig = window.AI_VIDEO_LOCAL_CONFIG;
  if (!localConfig || typeof localConfig !== "object") return nextState;
  if (localConfig.integrations && typeof localConfig.integrations === "object") {
    ["llm", "video", "publisher"].forEach((key) => {
      if (!localConfig.integrations[key]) return;
      nextState.integrations[key] = Object.assign({}, nextState.integrations[key] || {}, localConfig.integrations[key]);
    });
  }
  if (localConfig.integrationProfiles && typeof localConfig.integrationProfiles === "object") {
    nextState.integrationProfiles = nextState.integrationProfiles || {};
    ["llm", "video", "publisher"].forEach((key) => {
      const localProfiles = Array.isArray(localConfig.integrationProfiles[key]) ? localConfig.integrationProfiles[key] : [];
      if (!localProfiles.length) return;
      const existingProfiles = Array.isArray(nextState.integrationProfiles[key]) ? nextState.integrationProfiles[key] : [];
      const localIds = new Set(localProfiles.map((profile) => profile.id).filter(Boolean));
      nextState.integrationProfiles[key] = localProfiles.concat(existingProfiles.filter((profile) => !localIds.has(profile.id)));
    });
  }
  if (localConfig.activeIntegrationProfileIds && typeof localConfig.activeIntegrationProfileIds === "object") {
    nextState.activeIntegrationProfileIds = Object.assign({}, nextState.activeIntegrationProfileIds || {}, localConfig.activeIntegrationProfileIds);
  }
  if (Array.isArray(localConfig.selectedPlatforms) && localConfig.selectedPlatforms.length) {
    const valid = new Set(Core.platforms.map((platform) => platform.id));
    nextState.selectedPlatforms = localConfig.selectedPlatforms.filter((id) => valid.has(id));
  }
  return Core.migrateState(nextState);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function toast(message) {
  const el = document.querySelector(".toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function selectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) || state.tasks[0];
}

function selectedTasks(source = state.tasks) {
  return source.filter((task) => selectedTaskIds.has(task.id));
}

function pruneSelectedTasks() {
  const validIds = new Set(state.tasks.map((task) => task.id));
  selectedTaskIds = new Set([...selectedTaskIds].filter((id) => validIds.has(id)));
}

function statusClass(status) {
  if (status === "published") return "success";
  if (status === "rejected") return "danger";
  if (status === "video_generating") return "info";
  if (status === "ready_to_publish") return "info";
  return "warning";
}

function reviewQueueTasks() {
  const reviewStatuses = new Set(["content_plan_ready", "video_review", "copy_review", "ready_to_publish", "rejected"]);
  return state.tasks.filter((task) => reviewStatuses.has(task.status));
}

function reviewCount(status) {
  return state.tasks.filter((task) => task.status === status).length;
}

function dashboardFilterOptions(stats = Core.computeStats(state)) {
  return [
    { id: "all", label: "全部任务", count: stats.tasks, statuses: null },
    { id: "storyboard", label: "分镜就绪", count: stats.storyboard, statuses: ["content_plan_ready", "storyboard_ready"] },
    { id: "videoReview", label: "待视频审核", count: stats.videoReview, statuses: ["video_review"] },
    { id: "copyReview", label: "待文案审核", count: stats.copyReview, statuses: ["copy_review"] },
    { id: "ready", label: "待发布", count: stats.ready, statuses: ["ready_to_publish"] },
    { id: "published", label: "已发布", count: stats.published, statuses: ["published"] },
  ];
}

function activeDashboardFilter(stats) {
  return dashboardFilterOptions(stats).find((item) => item.id === dashboardFilter) || dashboardFilterOptions(stats)[0];
}

function dashboardTasksForFilter(filter = activeDashboardFilter()) {
  if (!filter.statuses) return state.tasks;
  const statuses = new Set(filter.statuses);
  return state.tasks.filter((task) => statuses.has(task.status));
}

function formatTaskDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function taskTimeText(task) {
  return {
    created: formatTaskDate(task.createdAt),
    updated: formatTaskDate(task.updatedAt || task.createdAt),
  };
}

function h(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function favoriteSourceKey(source) {
  const task = selectedTask();
  if (source === "content-brief") return `content-brief:${state.selectedProductId}`;
  if (source === "storyboard") return task ? `storyboard:${task.id}` : "";
  if (source === "video") return task ? `video:${task.id}` : "";
  return "";
}

function favoriteForSource(source) {
  const key = favoriteSourceKey(source);
  return key ? state.favorites.find((favorite) => favorite.sourceKey === key) : null;
}

function isPending(action) {
  return pendingActions.has(action);
}

function pendingAttr(action, disabled = false) {
  return disabled || isPending(action) ? "disabled" : "";
}

function pendingLabel(action, idleText, pendingText) {
  return isPending(action) ? `<span class="loading-spinner" aria-hidden="true"></span>${pendingText}` : idleText;
}

function startPending(action) {
  if (isPending(action)) return false;
  pendingActions.add(action);
  renderShell();
  return true;
}

function finishPending(action) {
  pendingActions.delete(action);
  saveState();
  renderShell();
}

function favoriteHeart(source) {
  const active = Boolean(favoriteForSource(source));
  const label = active ? "已加入我的收藏" : "加入我的收藏";
  return `
    <button class="icon-button heart-button ${active ? "active" : ""}" data-action="save-section-favorite" data-favorite-source="${source}" title="${label}" aria-label="${label}">
      <span>${active ? "♥" : "♡"}</span>
    </button>
  `;
}

function storyboardText(task) {
  return (task?.storyboard || []).map((scene) => `${scene.time} ${scene.title}\n画面：${scene.visual}\n字幕：${scene.subtitle}`).join("\n\n");
}

function storyboardScriptText(task) {
  if (task?.storyboardScriptText) return task.storyboardScriptText;
  const scenes = Array.isArray(task?.storyboard) ? task.storyboard : [];
  if (!scenes.length) return "";
  return [
    `# 分镜脚本（${scenes.length} 镜）`,
    ...scenes.map((scene, index) => [
      `第 ${index + 1} 镜｜${scene.time || ""}｜${scene.title || "分镜"}`,
      `画面：${scene.visual || ""}`,
      `字幕：${scene.subtitle || ""}`,
      scene.voiceover ? `旁白：${scene.voiceover}` : "",
      scene.screenText ? `屏幕字：${scene.screenText}` : "",
      scene.camera || scene.motion ? `运镜/动作：${[scene.camera, scene.motion].filter(Boolean).join("；")}` : "",
      scene.productFocus ? `产品重点：${scene.productFocus}` : "",
      scene.videoPrompt ? `视频提示词：${scene.videoPrompt}` : "",
      scene.reviewChecklist?.length ? `审核点：${listText(scene.reviewChecklist)}` : "",
      scene.riskNotes?.length ? `风险提示：${listText(scene.riskNotes)}` : "",
    ].filter(Boolean).join("\n")),
  ].join("\n\n");
}

function storyboardScriptDraftText(task) {
  return String(task?.storyboardScriptText || state.storyboardStream?.rawText || storyboardScriptText(task) || "");
}

function lineValue(block, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(block || "").match(new RegExp(`^${escaped}[：:]\\s*([\\s\\S]*?)(?=\\n[^\\n：:]{1,12}[：:]|$)`, "m"));
  return match ? match[1].trim() : "";
}

function parseStoryboardScriptText(text, existingScenes = []) {
  const source = String(text || "").trim();
  if (!source) return [];
  const blocks = source.split(/\n(?=第\s*\d+\s*镜)/).filter((block) => /^第\s*\d+\s*镜/m.test(block.trim()));
  if (!blocks.length) return [];
  return blocks.map((block, index) => {
    const fallback = existingScenes[index] || {};
    const firstLine = block.trim().split(/\n/)[0] || "";
    const firstMatch = firstLine.match(/^第\s*\d+\s*镜\s*[｜|:：-]?\s*([^｜|\n]*)\s*[｜|]?\s*(.*)$/);
    const firstTime = firstMatch && /s|秒|:|-/.test(firstMatch[1] || "") ? firstMatch[1].trim() : "";
    const firstTitle = firstMatch ? (firstTime ? firstMatch[2] : [firstMatch[1], firstMatch[2]].filter(Boolean).join("｜")).trim() : "";
    const motionText = lineValue(block, "运镜/动作");
    const [camera, motion] = motionText.split(/[；;]/).map((item) => item.trim());
    return Object.assign({}, fallback, {
      time: lineValue(block, "时间") || firstTime || fallback.time || "",
      title: lineValue(block, "标题") || firstTitle || fallback.title || `分镜 ${index + 1}`,
      visual: lineValue(block, "画面") || fallback.visual || "",
      subtitle: lineValue(block, "字幕") || fallback.subtitle || "",
      voiceover: lineValue(block, "旁白") || fallback.voiceover || "",
      screenText: lineValue(block, "屏幕字") || fallback.screenText || "",
      camera: camera || lineValue(block, "运镜") || fallback.camera || "",
      motion: motion || lineValue(block, "动作") || fallback.motion || "",
      productFocus: lineValue(block, "产品重点") || fallback.productFocus || "",
      videoPrompt: lineValue(block, "视频提示词") || fallback.videoPrompt || "",
    });
  });
}

function syncStoryboardScriptText(task, text) {
  if (!task) return false;
  const scriptText = String(text || "").trim();
  if (!scriptText) return false;
  task.storyboardScriptText = scriptText;
  const parsedScenes = parseStoryboardScriptText(scriptText, task.storyboard || []);
  if (parsedScenes.length) {
    const timedScenes = Core.normalizeStoryboardTiming(parsedScenes, task.duration || 15);
    task.storyboard = timedScenes;
    task.storyboardTimingStatus = timedScenes.timingStatus;
    if (task.contentPlan && typeof task.contentPlan === "object") task.contentPlan.scenes = timedScenes;
  }
  task.updatedAt = new Date().toISOString();
  return Boolean(parsedScenes.length);
}

function listText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  return String(value || "");
}

function copyHashtagText(value) {
  const tags = Array.isArray(value) ? value : String(value || "").split(/[，,\s#]+/).filter(Boolean);
  return tags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ");
}

function sanitizePublishText(text) {
  return Core.sanitizePublishText ? Core.sanitizePublishText(text) : String(text || "");
}

function sanitizedCopy(copy) {
  if (!copy) return copy;
  return Object.assign({}, copy, {
    language: sanitizePublishText(copy.language),
    copyStyle: sanitizePublishText(copy.copyStyle),
    title: sanitizePublishText(copy.title),
    hook: sanitizePublishText(copy.hook),
    body: sanitizePublishText(copy.body),
    cta: sanitizePublishText(copy.cta),
    chineseTranslation: sanitizePublishText(copy.chineseTranslation),
    coverTitle: sanitizePublishText(copy.coverTitle),
    overlayText: Array.isArray(copy.overlayText) ? copy.overlayText.map(sanitizePublishText) : sanitizePublishText(copy.overlayText),
    firstComment: sanitizePublishText(copy.firstComment),
    postingNotes: sanitizePublishText(copy.postingNotes),
    complianceWarnings: Array.isArray(copy.complianceWarnings) ? copy.complianceWarnings.map(sanitizePublishText) : sanitizePublishText(copy.complianceWarnings),
    rationale: sanitizePublishText(copy.rationale),
  });
}

function renderCopyStyleSelect() {
  const styles = Array.isArray(Core.copyStyles) ? Core.copyStyles : [];
  const active = state.copyStyle || "ugc-real";
  return `
    <label class="storyboard-inline-settings">
      <span>文案风格</span>
      <select data-field="copyStyle">
        ${styles.map((style) => `<option value="${h(style.id)}" ${active === style.id ? "selected" : ""}>${h(style.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function copyPublishBadge(label, type = "review") {
  return `<span class="copy-publish-badge ${type}">${h(label)}</span>`;
}

function renderSceneExtra(scene) {
  const extras = [
    scene.camera || scene.motion ? ["运镜", [scene.camera, scene.motion].filter(Boolean).join("；")] : null,
    scene.voiceover ? ["旁白", scene.voiceover] : null,
    scene.screenText ? ["屏幕字", scene.screenText] : null,
    scene.productFocus ? ["产品重点", scene.productFocus] : null,
    scene.imagePrompt || scene.videoPrompt ? ["生成提示词", [scene.imagePrompt, scene.videoPrompt].filter(Boolean).join(" / ")] : null,
    scene.reviewChecklist?.length ? ["审核点", listText(scene.reviewChecklist)] : null,
    scene.riskNotes?.length ? ["风险", listText(scene.riskNotes)] : null,
  ].filter(Boolean);
  if (!extras.length) return "";
  return `<div class="storyboard-read-extra">${extras.map(([label, value]) => `<span><strong>${h(label)}</strong>${h(value)}</span>`).join("")}</div>`;
}

function clampStoryboardIndex(task, index = storyboardEditorSceneIndex) {
  const sceneCount = task?.storyboard?.length || 0;
  if (!sceneCount) return 0;
  return Math.max(0, Math.min(Number.isFinite(index) ? index : 0, sceneCount - 1));
}

function emptyStoryboardScene() {
  return {
    time: "0-3s",
    title: "新镜头",
    visual: "",
    subtitle: "",
    camera: "",
    motion: "",
    voiceover: "",
    screenText: "",
    imagePrompt: "",
    videoPrompt: "",
    reviewChecklist: [],
    riskNotes: [],
  };
}

function buildSectionFavorite(source) {
  const product = Core.getById(state.products, state.selectedProductId);
  const task = selectedTask();
  if (source === "content-brief") {
    const content = String(state.contentBrief?.text || "").trim();
    return {
      type: "内容策划",
      name: `内容规划 · ${product?.name || "产品"}`,
      content,
      tags: ["内容规划", product?.name, state.contentBrief?.seed].filter(Boolean),
      score: 86,
      sourceKey: favoriteSourceKey(source),
    };
  }
  if (source === "storyboard" && task) {
    return {
      type: "分镜脚本",
      name: `分镜脚本 · ${task.title}`,
      content: storyboardText(task),
      tags: ["分镜脚本", task.productName, task.variation?.hook].filter(Boolean),
      score: 88,
      sourceKey: favoriteSourceKey(source),
    };
  }
  if (source === "video" && task) {
    const videoUrl = task.video?.url ? `视频地址：${task.video.url}` : "视频尚未生成，收藏当前视频任务和生成参数。";
    return {
      type: "视频",
      name: `视频任务 · ${task.title}`,
      content: `${videoUrl}\n产品：${task.productName}\n开头：${task.variation?.hook || ""}\n状态：${Core.taskStatusLabel(task.status)}`,
      tags: ["视频", task.productName, Core.taskStatusLabel(task.status)].filter(Boolean),
      score: 82,
      sourceKey: favoriteSourceKey(source),
    };
  }
  return null;
}

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/apikey|api_key|authorization|token|secret/i.test(key)) {
      return [key, item ? "已隐藏" : ""];
    }
    return [key, redactSecrets(item)];
  }));
}

function latestProviderPreview(task) {
  if (!task) return { message: "先创建一个任务后查看请求预览" };
  const requests = task.providerRequests || {};
  const responses = task.providerResponses || {};
  const responseKeys = Object.keys(responses).filter((key) => responses[key] !== undefined);
  const requestKeys = Object.keys(requests).filter((key) => requests[key] !== undefined);
  const kind = responseKeys[responseKeys.length - 1] || requestKeys[requestKeys.length - 1];
  if (!kind) return { message: "当前任务还没有 provider 请求或响应。" };
  return redactSecrets({
    kind,
    request: requests[kind] || null,
    response: responses[kind] || null,
  });
}

function navIcon(name) {
  const icons = {
    video: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h7A2.5 2.5 0 0 1 16 7.5v9A2.5 2.5 0 0 1 13.5 19h-7A2.5 2.5 0 0 1 4 16.5z"/><path d="m16 10 4-2.5v9L16 14z"/>',
    create: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    reverse: '<path d="M4 5h16v14H4z"/><path d="m10 9 5 3-5 3z"/><path d="M8 21h8"/><path d="M12 19v2"/>',
    favorites: '<path d="M19.5 12.6 12 20l-7.5-7.4A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 7.5 6.6z"/>',
    review: '<path d="M4 5h16v12H7l-3 3z"/><path d="m8 11 2.2 2.2L15.5 8"/>',
    publish: '<path d="M4 12 20 4l-5.2 16-3.1-7.1z"/><path d="m11.7 12.9 8.3-8.9"/>',
    settings: '<path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2 3.4-.2-.1a1.8 1.8 0 0 0-2.1.3 1.8 1.8 0 0 0-.6 1.7V22H9v-.3a1.8 1.8 0 0 0-.6-1.7 1.8 1.8 0 0 0-2.1-.3l-.2.1-2-3.4.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.5-1.1H3V8.8h.1a1.8 1.8 0 0 0 1.5-1.1 1.8 1.8 0 0 0-.4-2l-.1-.1 2-3.4.2.1a1.8 1.8 0 0 0 2.1-.3A1.8 1.8 0 0 0 9 .3V0h6v.3a1.8 1.8 0 0 0 .6 1.7 1.8 1.8 0 0 0 2.1.3l.2-.1 2 3.4-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.5 1.1h.1v4.4h-.1a1.8 1.8 0 0 0-1.5 1.1z"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.video}</svg>`;
}

function renderShell() {
  const nav = [
    ["dashboard", "视频", "video"],
    ["create", "新建", "create"],
    ["reverse", "反推", "reverse"],
    ["review", "审核", "review"],
    ["publish", "发布", "publish"],
    ["settings", "设置", "settings"],
  ];
  const titles = {
    dashboard: "视频任务看板",
    create: "新建视频任务",
    reverse: "视频反推分镜",
    favorites: "我的收藏",
    review: "视频审核",
    publish: "文案发布",
    settings: "集成设置",
  };
  document.getElementById("app").innerHTML = `
    <div class="app">
      <aside class="sidebar-shell">
        <div class="icon-rail">
          <div class="mark">AI</div>
          <nav class="icon-nav" aria-label="主导航">
            ${nav.map(([id, label, icon]) => `
              <button class="${view === id ? "active" : ""}" data-view="${id}" title="${label}">
                <span class="nav-icon">${navIcon(icon)}</span>
                <span>${label}</span>
              </button>
            `).join("")}
          </nav>
        </div>
      </aside>
      <main class="main">
        <div class="content">${renderView()}</div>
      </main>
    </div>
    <div class="toast"></div>
  `;
  bindEvents();
}

function isServerMode() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function syncIntegrationForm(connectionKey) {
  if (!connectionKey || !state.integrations[connectionKey]) return;
  document.querySelectorAll(`[data-field^="integrations.${connectionKey}."]`).forEach((el) => {
    const [, group, key] = el.dataset.field.split(".");
    state.integrations[group] = state.integrations[group] || {};
    state.integrations[group][key] = el.value;
  });
  Core.rememberIntegrationProviderConfig(state.integrations[connectionKey]);
}

function syncDraftForm() {
  document.querySelectorAll('[data-field="contentBrief.seed"], [data-field="product.imageUrl"]').forEach((el) => {
    const field = el.dataset.field;
    if (field === "contentBrief.seed") {
      state.contentBrief = state.contentBrief || { seed: "", text: "" };
      state.contentBrief.seed = el.value;
    } else if (field === "product.imageUrl") {
      const product = Core.getById(state.products, state.selectedProductId);
      if (product) product.imageUrl = el.value;
    }
  });
  document.querySelectorAll("[data-storyboard-script-text]").forEach((el) => {
    const task = Core.getById(state.tasks, el.dataset.storyboardScriptTaskId) || latestContentPlanTask();
    syncStoryboardScriptText(task, el.value);
  });
}

async function callProvider(kind, providerRequest) {
  if (!isServerMode()) {
    throw new Error("真实测试需要先启动本地服务并通过 http://127.0.0.1:4188 打开。");
  }
  const response = await fetch(`/api/provider/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerRequest }),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `provider ${kind} failed`);
  }
  return data;
}

function parseProviderStreamText(text) {
  const source = String(text || "").trim();
  if (!source) return { events: [], fallbackJson: null };
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
      return { events: [parsed], fallbackJson: null };
    }
    return { events: [], fallbackJson: parsed };
  } catch {
    const events = [];
    const lines = String(text || "").split("\n");
    lines.forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return;
      events.push(JSON.parse(trimmed));
    });
    return { events, fallbackJson: null };
  }
}

function parseJsonFromReceivedText(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const start = source.search(/[\[{]/);
    if (start < 0) return null;
    const candidate = source.slice(start);
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function streamResponseFromRecoveredJson(kind, providerRequest, text) {
  const parsed = parseJsonFromReceivedText(text);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    ok: true,
    mode: "http",
    provider: providerRequest && providerRequest.provider || "",
    recoveredFromStreamText: true,
    result: parsed,
    upstream: {
      ok: true,
      status: 200,
      data: {
        recoveredFromStreamText: true,
        kind,
      },
    },
  };
}

async function callProviderStream(kind, providerRequest, onEvent) {
  if (!isServerMode()) {
    throw new Error("真实测试需要先启动本地服务并通过 http://127.0.0.1:4188 打开。");
  }
  const response = await fetch(`/api/provider/${kind}-stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerRequest }),
  });
  if (!response.body || !window.TextDecoder) {
    return callProvider(kind, providerRequest);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let finalEvent = null;
  let streamedText = "";
  const emitEvent = (event) => {
    if (event.type === "chunk") streamedText += event.text || "";
    if (typeof onEvent === "function") onEvent(event);
    if (event.type === "done") finalEvent = event;
    if (event.type === "error") throw new Error(event.error || "流式生成失败。");
  };
  const contentType = String(response.headers.get("content-type") || "");
  try {
    if (!contentType.includes("application/x-ndjson")) {
      let responseText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseText += decoder.decode(value, { stream: true });
      }
      responseText += decoder.decode();
      const parsed = parseProviderStreamText(responseText);
      if (parsed.fallbackJson) {
        if (!response.ok || parsed.fallbackJson.ok === false) {
          throw new Error(parsed.fallbackJson.error || `provider ${kind} failed`);
        }
        return parsed.fallbackJson;
      }
      parsed.events.forEach(emitEvent);
    } else {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach((line) => {
          const parsed = parseProviderStreamText(line);
          parsed.events.forEach(emitEvent);
        });
      }
      buffer += decoder.decode();
      const parsed = parseProviderStreamText(buffer);
      parsed.events.forEach(emitEvent);
    }
  } catch (error) {
    const recovered = streamResponseFromRecoveredJson(kind, providerRequest, streamedText);
    if (recovered) return recovered;
    throw error;
  }
  if (finalEvent && finalEvent.upstream) {
    return {
      ok: finalEvent.upstream.ok,
      mode: "http",
      provider: providerRequest.provider,
      error: finalEvent.error,
      upstream: finalEvent.upstream,
    };
  }
  const recovered = streamResponseFromRecoveredJson(kind, providerRequest, streamedText);
  if (recovered) return recovered;
  return callProvider(kind, providerRequest);
}

async function uploadReverseVideo(file) {
  if (!isServerMode()) {
    throw new Error("上传需要先启动本地服务。");
  }
  const response = await fetch(`/api/uploads/video?filename=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": file.type || "video/mp4" },
    body: file,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "视频上传失败。");
  }
  return data.upload;
}

async function extractReverseFrames(upload) {
  if (!isServerMode()) {
    throw new Error("抽帧需要先启动本地服务。");
  }
  const response = await fetch("/api/video/frames", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploadId: upload.id, url: upload.url, count: 8 }),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "视频抽帧失败。");
  }
  return data.frames || [];
}

function shouldInlineReverseFrames() {
  // Set LLM apiStyle to "openai-vision-chat" for frame-aware reverse reconstruction.
  const integration = state.integrations?.llm || {};
  const apiStyle = String(integration.apiStyle || "");
  return /vision|multimodal/i.test(apiStyle) || supportsReverseVisionModel(integration);
}

function reverseVisionRequirementMessage() {
  return "反推需要支持图片输入的通用大模型。请在接口设置里把通用大模型切到视觉模型，或把 apiStyle 设为 openai-vision-chat / multimodal；当前文本模型只能看到本地帧 URL，无法识别画面。";
}

function supportsReverseVisionModel(integration) {
  const model = String(integration && integration.model || "").trim().toLowerCase();
  // Includes gpt-5.5 for OpenAI-compatible providers that accept image_url chat content.
  return /^gpt-(?:5(?:\.5)?|4o|4\.1|4\.5)(?:$|[-_.])/.test(model);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("关键帧读取失败。"));
    reader.readAsDataURL(blob);
  });
}

async function loadReverseFrameData(frames) {
  const source = Array.isArray(frames) ? frames : [];
  return Promise.all(source.map(async (frame) => {
    if (frame.dataUrl) return frame;
    try {
      const response = await fetch(frame.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!/^image\//i.test(blob.type || "")) throw new Error("关键帧不是图片。");
      return Object.assign({}, frame, { dataUrl: await blobToDataUrl(blob) });
    } catch (error) {
      return Object.assign({}, frame, { inlineImageError: error.message });
    }
  }));
}

function reverseProviderStateWithVisionFrames(frames) {
  return Object.assign({}, state, {
    reverseVideo: Object.assign({}, state.reverseVideo || {}, {
      frames,
    }),
  });
}

async function downloadGeneratedVideo(task) {
  if (!isServerMode()) {
    throw new Error("下载需要先启动本地服务。");
  }
  const videoUrl = String(task?.video?.url || "").trim();
  if (!/^https?:\/\//i.test(videoUrl)) {
    throw new Error("当前任务没有可下载的远端视频地址。");
  }
  const response = await fetch("/api/video/download", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: task.id,
      url: videoUrl,
      fileName: `${task.productName || "video"}-${task.id}.mp4`,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "视频下载失败。");
  }
  task.video = Object.assign({}, task.video || {}, {
    localPath: data.localPath,
    localUrl: data.localUrl,
    localSize: data.size,
    downloadedAt: data.downloadedAt || new Date().toISOString(),
  });
  return data;
}

function renderView() {
  if (view === "create") return renderCreate();
  if (view === "reverse") return renderReverse();
  if (view === "favorites") return renderFavorites();
  if (view === "review") return renderReview();
  if (view === "publish") return renderPublish();
  if (view === "settings") return renderSettings();
  return renderDashboard();
}

function renderDashboard() {
  pruneSelectedTasks();
  const stats = Core.computeStats(state);
  const filterOptions = dashboardFilterOptions(stats);
  const filter = activeDashboardFilter(stats);
  const visibleTasks = dashboardTasksForFilter(filter);
  const selected = selectedTasks(visibleTasks);
  const selectedCount = selected.length;
  const canGenerateCount = selected.filter((task) => ["content_plan_ready", "storyboard_ready", "rejected"].includes(task.status)).length;
  const canRefreshCount = selected.filter((task) => task.status === "video_generating").length;
  const allSelected = visibleTasks.length > 0 && selectedCount === visibleTasks.length;
  return `
    <section>
      <div class="section-head">
        <div><h1>视频任务看板</h1><p class="muted">从真实内容规划开始，追踪视频生成、审核、文案和发布状态。</p></div>
        <button class="button primary" data-view="create">新建内容规划</button>
      </div>
      <div class="stats">
        ${filterOptions.map((item) => `
          <button class="stat ${filter.id === item.id ? "active" : ""}" data-dashboard-filter="${item.id}" type="button" aria-pressed="${filter.id === item.id ? "true" : "false"}">
            <span>${item.label}</span>
            <strong>${item.count}</strong>
          </button>
        `).join("")}
      </div>
      <div class="panel dashboard-queue-panel">
        <div class="panel-head">
          <h2>任务列表</h2>
          <div class="actions">
            ${filter.id !== "all" ? `<span class="tag">筛选：${filter.label}</span>` : ""}
            ${selectedCount ? `<span class="tag">已选 ${selectedCount} 条</span>` : `<span class="tag">${visibleTasks.length} 条任务</span>`}
          </div>
        </div>
        ${selectedCount ? `
          <div class="batch-toolbar">
            <span>已选 ${selectedCount} 条任务</span>
            <div class="actions">
              <button class="button" data-action="batch-generate-video" ${pendingAttr("batch-generate-video", !canGenerateCount)}>${pendingLabel("batch-generate-video", `批量生成视频 (${canGenerateCount})`, "提交中")}</button>
              <button class="button" data-action="batch-refresh-video" ${pendingAttr("batch-refresh-video", !canRefreshCount)}>${pendingLabel("batch-refresh-video", `批量查询结果 (${canRefreshCount})`, "查询中")}</button>
              <button class="button danger" data-action="batch-delete-tasks">批量删除</button>
            </div>
          </div>
        ` : ""}
        <table class="task-table queue-table">
          <thead><tr><th class="select-col"><input type="checkbox" data-batch-select-all ${allSelected ? "checked" : ""} ${visibleTasks.length ? "" : "disabled"} /></th><th>任务</th><th>时间</th><th>内容来源</th><th>生成方式</th><th>状态</th><th>负责人</th><th>操作</th></tr></thead>
          <tbody>
            ${visibleTasks.length ? visibleTasks.map(task => {
              const taskTime = taskTimeText(task);
              return `
              <tr>
                <td><input type="checkbox" data-batch-task-id="${task.id}" ${selectedTaskIds.has(task.id) ? "checked" : ""} /></td>
                <td>
                  <div class="task-title-block">
                    <strong class="task-title" title="${h(task.title)}">${h(task.title)}</strong>
                    <p class="task-summary muted" title="${h(task.variation.hook)}">${h(task.variation.hook)}</p>
                    <p class="task-meta-line"><span>${task.duration}s</span><span>${h(task.ratio)}</span></p>
                  </div>
                </td>
                <td>
                  <div class="task-time-block">
                    <span>创建 ${h(taskTime.created)}</span>
                    <span>更新 ${h(taskTime.updated)}</span>
                  </div>
                </td>
                <td><span class="task-source-chip" title="${h(task.favoriteName)}">${h(task.favoriteName)}</span></td>
                <td><span class="task-source-chip strategy-chip" title="${h(Core.strategyLabel(task.strategy))}">${h(Core.strategyLabel(task.strategy))}</span></td>
                <td><span class="status ${statusClass(task.status)}">${Core.taskStatusLabel(task.status)}</span></td>
                <td><span class="task-owner">${h(task.owner)}</span></td>
                <td>
                  <div class="actions task-actions">
                    <button class="button compact" data-select-task="${task.id}" data-view="${task.status === "published" ? "publish" : "review"}">查看</button>
                    <button class="button compact danger ghost-danger" data-action="delete-task" data-task-id="${task.id}">删除</button>
                  </div>
                </td>
              </tr>
            `}).join("") : `<tr><td colspan="8"><p class="muted">${state.tasks.length ? "当前筛选下没有任务。" : "还没有任务。先输入产品想法和产品图，生成一条真实内容规划。"}</p></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function latestContentPlanTask() {
  return state.tasks.find((task) => task.status === "content_plan_ready") || selectedTask();
}

function readablePlanValue(value) {
  if (Array.isArray(value)) return value.map(readablePlanValue).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${readablePlanValue(item)}`)
      .filter((line) => !line.endsWith(": "))
      .join("\n");
  }
  return String(value || "");
}

function planArrayValue(value) {
  return readablePlanValue(value);
}

function contentPlanText(task) {
  if (!task || !task.contentPlan) return "";
  if (String(task.contentPlanText || "").trim()) return String(task.contentPlanText);
  const plan = task.contentPlan;
  const sections = [
    ["产品理解", plan.productUnderstanding],
    ["目标用户", plan.targetAudience],
    ["内容角度", plan.contentAngle],
    ["核心信息", plan.coreMessage],
    ["内容策略", plan.strategy],
    ["主开头钩子", plan.hook],
    ["视觉风格", plan.visualStyle],
    ["视频节奏", plan.rhythm],
    ["结尾 CTA", plan.cta],
    ["核心痛点", planArrayValue(plan.painPoints)],
    ["使用场景", planArrayValue(plan.usageScenarios)],
    ["主要卖点", planArrayValue(plan.keySellingPoints)],
    ["开头钩子备选", planArrayValue(plan.hookOptions)],
    ["必须出现的画面", planArrayValue(plan.mustShow)],
    ["禁止夸大的内容", planArrayValue(plan.mustAvoid)],
    ["合规提醒", planArrayValue(plan.complianceNotes)],
  ].filter(([, value]) => String(value || "").trim());
  return sections.map(([label, value]) => `# ${label}\n${readablePlanValue(value)}`).join("\n\n");
}

function displayContentPlanStreamState(value) {
  const stream = value && typeof value === "object" ? value : {};
  const text = String(stream.text || "");
  if (stream.status === "error" && /Expected property name|JSON at position 1/i.test(text)) {
    return { status: "idle", label: "等待生成", text: "" };
  }
  return stream;
}

function renderContentPlanGenerationLog(streamState) {
  const stateForDisplay = streamState || {};
  const label = stateForDisplay.label || "等待生成";
  const text = stateForDisplay.text || "生成内容规划时，这里会显示模型返回过程。";
  const statusClass = stateForDisplay.status === "error" ? "danger" : stateForDisplay.status === "streaming" ? "warning" : "info";
  return `
    <div class="content-plan-generation-log" aria-live="polite">
      <div class="stream-head">
        <strong>生成状态</strong>
        <span class="status ${statusClass}">${h(label)}</span>
      </div>
      <pre>${h(text)}</pre>
    </div>
  `;
}

function renderContentPlanEditor(task, streamState, actionsHtml = "") {
  if (!task || !task.contentPlan) {
    return `
      <div class="content-plan-editor content-plan-big-editor empty-inline">
        <div class="editor-head">
          <div class="editor-title-block">
            <strong>等待内容规划</strong>
            <p class="muted">先生成内容规划，再在这里调整中文提示词、节奏和分镜要求。</p>
            ${actionsHtml}
          </div>
        </div>
        ${renderContentPlanGenerationLog(streamState)}
      </div>
    `;
  }
  return `
    <div class="content-plan-editor content-plan-big-editor" data-content-plan-task-id="${h(task.id)}">
      <div class="editor-head">
        <div class="editor-title-block">
          <strong>可编辑中文内容规划</strong>
          <span class="muted">直接改这一整段中文，下一步会严格按这里的内容生成分镜。</span>
          ${actionsHtml}
        </div>
        <span class="status success">自动保存</span>
      </div>
      <textarea rows="24" data-content-plan-task-id="${h(task.id)}" data-content-plan-text placeholder="AI 生成后会在这里形成一段完整中文内容规划。">${h(contentPlanText(task))}</textarea>
      ${renderContentPlanGenerationLog(streamState)}
    </div>
  `;
}

function renderStoryboardGenerationLog(streamState) {
  const stateForDisplay = streamState || {};
  const label = stateForDisplay.label || "等待生成";
  const text = stateForDisplay.text || "生成分镜时，这里会显示模型返回过程。";
  const statusClass = stateForDisplay.status === "error" ? "danger" : stateForDisplay.status === "streaming" ? "warning" : stateForDisplay.status === "done" ? "success" : "info";
  return `
    <div class="content-plan-generation-log storyboard-generation-log" aria-live="polite">
      <div class="stream-head">
        <strong>分镜生成状态</strong>
        <span class="status ${statusClass}">${h(label)}</span>
      </div>
      <pre>${h(text)}</pre>
    </div>
  `;
}

function renderStoryboardScriptEditor(task, streamState, actionsHtml = "") {
  const stateForDisplay = streamState || {};
  const isStreaming = stateForDisplay.status === "streaming";
  const scriptText = isStreaming
    ? String(stateForDisplay.text || "")
    : String(stateForDisplay.rawText || "") || storyboardScriptDraftText(task);
  if (!task || !task.contentPlan) {
    return `
      <div class="content-plan-editor content-plan-big-editor storyboard-script-editor empty-inline">
        <div class="editor-head">
          <div class="editor-title-block">
            <strong>等待分镜脚本</strong>
            <p class="muted">先生成内容规划，再按分镜设置输出可编辑分镜脚本。</p>
            ${actionsHtml}
          </div>
        </div>
        ${renderStoryboardGenerationLog(streamState)}
      </div>
    `;
  }
  const sceneCount = Array.isArray(task.storyboard) ? task.storyboard.length : 0;
  return `
    <div class="content-plan-editor content-plan-big-editor storyboard-script-editor" data-storyboard-script-task-id="${h(task.id)}">
      <div class="editor-head">
        <div class="editor-title-block">
          <strong>可编辑中文分镜脚本</strong>
          <span class="muted">按当前分镜设置生成；直接改这一整段中文，下一步会按这里同步后的镜头生成视频。</span>
          ${actionsHtml}
        </div>
        <span class="status ${sceneCount ? "success" : "info"}">${sceneCount ? `${sceneCount} 镜` : "等待生成"}</span>
      </div>
      <textarea rows="24" data-storyboard-script-task-id="${h(task.id)}" data-storyboard-script-text placeholder="点击“用当前规划生成分镜”后，模型流式返回的分镜脚本会出现在这里。">${h(scriptText)}</textarea>
      ${renderStoryboardGenerationLog(streamState)}
    </div>
  `;
}

function renderCreateStoryboardPreview(task) {
  if (!task || !Array.isArray(task.storyboard) || !task.storyboard.length) return "";
  return `
    <div class="create-storyboard-preview">
      <div class="editor-head">
        <div>
          <strong>已生成分镜</strong>
          <span class="muted">先在当前页检查镜头内容，确认后再进入审核生成视频。</span>
        </div>
        <span class="status success">${task.storyboard.length} 镜</span>
      </div>
      <div class="storyboard-read-list">
        <div class="storyboard-read-head">
          <span>时间</span>
          <span>镜头标题</span>
          <span>画面描述</span>
          <span>字幕</span>
        </div>
        <div class="storyboard-list">${task.storyboard.map((scene, index) => `
          <article class="storyboard-read-row">
            <strong>${h(scene.time)}</strong>
            <span>${h(scene.title)}</span>
            <p>${h(scene.visual)}${renderSceneExtra(scene)}</p>
            <em>${h(scene.subtitle)}<button class="inline-edit-button" data-action="open-storyboard-editor" data-storyboard-index="${index}">编辑第 ${index + 1} 镜</button></em>
          </article>
        `).join("")}</div>
      </div>
    </div>
  `;
}

function storyboardPresetValue(contentBrief) {
  const count = contentBrief.storyboardSceneCount || "auto";
  const detail = contentBrief.storyboardDetailLevel || "detailed";
  return `${count}:${detail}`;
}

function renderStoryboardPresetSelect(contentBrief) {
  const value = storyboardPresetValue(contentBrief);
  const option = (preset, label) => `<option value="${preset}" ${value === preset ? "selected" : ""}>${label}</option>`;
  return `
    <label class="storyboard-inline-settings">
      <span>分镜设置</span>
      <select data-storyboard-preset>
        ${option("auto:detailed", "自动 · 细致")}
        ${option("6:standard", "6 镜 · 标准")}
        ${option("8:detailed", "8 镜 · 细致")}
        ${option("10:dense", "10 镜 · 高密度")}
      </select>
    </label>
  `;
}

function renderCreationStrategyOptions(value) {
  const option = (strategy, label) => `<option value="${strategy}" ${value === strategy ? "selected" : ""}>${label}</option>`;
  return [
    option("rewrite", "AI 改写后批量生成"),
    option("original", "原内容直接生成多条"),
    option("hooks", "原内容 + 不同开头"),
    option("platform", "原内容 + 平台风格"),
  ].join("");
}

function renderVideoBatchControls(contentBrief) {
  const batchCount = Math.max(1, Math.min(Number(contentBrief.videoBatchCount || 1), 10));
  const strategy = contentBrief.videoCreationStrategy || "original";
  const countOption = (count) => `<option value="${count}" ${batchCount === count ? "selected" : ""}>${count} 条</option>`;
  return `
    <label class="storyboard-inline-settings">
      <span>生成数量</span>
      <select data-field="contentBrief.videoBatchCount">
        ${Array.from({ length: 10 }, (_, index) => index + 1).map(countOption).join("")}
      </select>
    </label>
    <label class="storyboard-inline-settings">
      <span>生成方式</span>
      <select data-field="contentBrief.videoCreationStrategy">
        ${renderCreationStrategyOptions(strategy)}
      </select>
    </label>
  `;
}

function renderCreate() {
  const product = Core.getById(state.products, state.selectedProductId);
  const contentBrief = state.contentBrief || { seed: "", text: "" };
  const hasUrlMaterial = Boolean(String(product.imageUrl || "").trim());
  const hasUploadMaterial = Boolean(product.imageData);
  const imagePreview = product.imageData
    ? `<img src="${product.imageData}" alt="${h(product.name || product.imageLabel || "产品")} 产品图" />`
    : `<div><span>${h(product.imageLabel || "图")}</span><strong>产品图</strong></div>`;
  const latestPlan = latestContentPlanTask();
  const streamState = displayContentPlanStreamState(state.contentPlanStream);
  const storyboardStream = state.storyboardStream || {};
  const hasPreviousPlan = Boolean(latestPlan && String(latestPlan.previousContentPlanText || "").trim());
  const hasStoryboard = Boolean(latestPlan && (Array.isArray(latestPlan.storyboard) && latestPlan.storyboard.length || String(storyboardScriptDraftText(latestPlan)).trim()));
  const contentPlanActions = `
    <div class="editor-actions content-plan-editor-actions">
      <button class="button" data-action="generate-content-plan" ${pendingAttr("generate-content-plan")}>${pendingLabel("generate-content-plan", "生成内容规划", "生成中")}</button>
      <button class="button" data-action="regenerate-content-plan" ${pendingAttr("regenerate-content-plan", !latestPlan)}>${pendingLabel("regenerate-content-plan", "重新生成", "重新生成中")}</button>
      <button class="button" data-action="restore-previous-content-plan" ${hasPreviousPlan ? "" : "disabled"}>恢复上一版</button>
    </div>
  `;
  const storyboardActions = `
    <div class="editor-actions storyboard-editor-actions">
      ${renderStoryboardPresetSelect(contentBrief)}
      <button class="button" data-action="generate-storyboard-from-plan" ${latestPlan && latestPlan.contentPlan ? pendingAttr("generate-storyboard-from-plan") : "disabled"}>${pendingLabel("generate-storyboard-from-plan", "用当前规划生成分镜", "生成分镜中")}</button>
      ${renderVideoBatchControls(contentBrief)}
      <button class="button primary" data-action="enter-review-video" ${hasStoryboard ? "" : "disabled"}>进入审核生成视频</button>
    </div>
  `;
  return `
    <section class="create-screen">
      <div class="section-head">
        <div><h1>新建内容规划</h1><p class="muted">输入一个大概想法和产品图，调用真实大模型返回完整视频内容规划。</p></div>
        <div class="actions">
          <button class="button" data-view="settings">接口设置</button>
        </div>
      </div>

      <div class="create-layout create-layout-vertical">
        <div class="create-main stack">
          <div class="panel">
            <div class="panel-head"><h2>输入</h2><span class="status ${state.integrations.llm.apiKey ? "success" : "warning"}">${state.integrations.llm.apiKey ? "LLM 已配置" : "需要配置 LLM"}</span></div>
            <div class="panel-body stack">
              <div class="field">
                <label>产品想法</label>
                <textarea data-field="contentBrief.seed" rows="4" placeholder="例如：我想在 TikTok 美国地区售卖一款挂脖风扇，主打夏天通勤、户外排队和露营降温。">${h(contentBrief.seed || "")}</textarea>
              </div>
            </div>
          </div>

          <div class="panel product-panel">
            <div class="panel-head"><h2>产品图</h2><div class="actions"><span class="status ${hasUrlMaterial || hasUploadMaterial ? "success" : "danger"}">${hasUrlMaterial || hasUploadMaterial ? "图片已就绪" : "缺少图片"}</span><button class="button" data-action="clear-product-image">清空上传图</button><span class="status info">草稿自动保存</span></div></div>
            <div class="panel-body">
            <div class="product-input product-image-compact">
              <label class="image-uploader compact ${product.imageData ? "has-image" : ""}">
                ${imagePreview}
                <input type="file" accept="image/*" data-file="product-image" hidden />
              </label>
              <div class="compact-image-fields">
                <div class="field full"><label>图片 URL</label><input data-field="product.imageUrl" value="${h(product.imageUrl || "")}" placeholder="https://... 可填写公网图片地址" /></div>
                <div class="compact-image-meta">
                  <span class="button">上传图片</span>
                  <div class="chips">${hasUrlMaterial ? `<span class="chip">图片 URL</span>` : ""}${hasUploadMaterial ? `<span class="chip">上传图：${h(product.imageLabel || "本地图片")}</span>` : ""}${!hasUrlMaterial && !hasUploadMaterial ? `<span class="chip">未添加产品图</span>` : ""}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div class="panel">
            <div class="panel-head"><h2>规划结果</h2><span class="tag">真实返回</span></div>
            <div class="panel-body stack">
              ${renderContentPlanEditor(latestPlan, streamState, contentPlanActions)}
              ${renderStoryboardScriptEditor(latestPlan, storyboardStream, storyboardActions)}
              ${renderCreateStoryboardPreview(latestPlan)}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderReverseSceneRows(result) {
  if (!result || !Array.isArray(result.scenes) || !result.scenes.length) {
    return `
      <div class="content-plan-editor content-plan-big-editor reverse-script-editor empty-inline">
        <div class="editor-title-row">
          <div>
            <strong>可编辑中文反推脚本</strong>
            <p class="muted">上传视频并点击反推后，这里会展示适合后续视频生成复用的中文脚本。</p>
          </div>
        </div>
        <textarea rows="18" data-reverse-script-text disabled placeholder="反推完成后会生成一整段中文脚本，强调最大程度复刻原视频的画面、文案、语音、镜头角度和动作节奏。"></textarea>
      </div>
    `;
  }
  const scriptText = Core.reverseStoryboardText(result);
  return `
    <div class="reverse-script-stack">
      <div class="content-plan-editor content-plan-big-editor reverse-script-editor">
        <div class="editor-title-row">
          <div>
            <strong>可编辑中文反推脚本</strong>
            <span class="muted">直接改这一整段中文；二创生成会按这里最大程度复刻原视频的文案、语音、角度和节奏。</span>
          </div>
        </div>
        <textarea rows="24" data-reverse-script-text placeholder="反推完成后会生成一整段中文脚本。">${h(scriptText)}</textarea>
      </div>
    </div>
  `;
}

function renderReverse() {
  const reverse = state.reverseVideo || { upload: null, frames: [], result: null, notes: "", status: "idle", error: "" };
  const upload = reverse.upload;
  const result = reverse.result;
  const secondaryCount = Math.max(1, Math.min(Number(reverse.secondaryCount || 3), 10));
  const creationStrategy = reverse.creationStrategy || "rewrite";
  const canReverse = Boolean(upload);
  const canSave = Boolean(result && result.scenes && result.scenes.length);
  const selectedFavorite = reverse.selectedFavoriteId ? Core.getById(state.favorites, reverse.selectedFavoriteId) : null;
  const selectedProductId = reverse.selectedProductId || state.selectedProductId;
  const selectedProduct = Core.getById(state.products, selectedProductId) || Core.getById(state.products, state.selectedProductId);
  const selectedProductHasMaterial = Boolean(selectedProduct && (selectedProduct.imageUrl || selectedProduct.imageData));
  const selectedProductUploadLabel = selectedProduct && selectedProduct.imageData ? `已上传：${selectedProduct.imageLabel || "本地图片"}` : "上传产品图";
  return `
    <section class="reverse-screen stack">
      <div class="section-head">
        <div><h1>视频反推分镜</h1><p class="muted">上传参考视频，抽取关键帧后反推出可复用的分镜脚本，再保存到我的收藏用于二创。</p></div>
        <div class="actions">
          <button class="button" data-view="settings">接口设置</button>
          <button class="button primary" data-action="reverse-storyboard" ${pendingAttr("reverse-storyboard", !canReverse)}>${pendingLabel("reverse-storyboard", "反推分镜", "反推中")}</button>
          <button class="button" data-action="save-reverse-favorite" ${!canSave ? "disabled" : ""}>保存到我的收藏</button>
        </div>
      </div>

      <div class="reverse-layout">
        <div class="panel">
          <div class="panel-head"><h2>参考视频</h2><span class="status ${upload ? "success" : "warning"}">${upload ? "已上传" : "等待上传"}</span></div>
          <div class="panel-body stack">
            <label class="reverse-uploader">
              <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" data-file="reverse-video" hidden />
              <strong>${upload ? h(upload.fileName) : "上传参考视频"}</strong>
              <span>${upload ? `${Math.round((upload.size || 0) / 1024 / 1024 * 10) / 10} MB` : "支持 mp4、mov、webm。上传需要通过本地服务打开。"}</span>
            </label>
            ${upload ? `<video class="reverse-video-player" controls playsinline preload="metadata" src="${h(upload.url)}"></video>` : ""}
            <div class="field">
              <label>反推备注</label>
              <textarea data-field="reverseVideo.notes" rows="4" placeholder="例如：保留原视频节奏，后续替换成我的产品；重点拆开头钩子和转化收尾。">${h(reverse.notes || "")}</textarea>
            </div>
          </div>
        </div>

        <aside class="panel">
          <div class="panel-head"><h2>处理状态</h2><span class="tag">${h(reverse.status || "idle")}</span></div>
          <div class="panel-body stack">
            <div class="settings-summary">
              <div><span>关键帧</span><strong>${(reverse.frames || []).length} 张</strong></div>
              <div>
                <span>二创产品</span>
                <select class="summary-control" data-field="reverseVideo.selectedProductId">
                  ${state.products.map((product) => `<option value="${h(product.id)}" ${product.id === (selectedProduct && selectedProduct.id) ? "selected" : ""}>${h(product.name || product.imageLabel || "产品")}</option>`).join("")}
                </select>
              </div>
              <div><span>产品素材</span><strong>${selectedProductHasMaterial ? "已配置" : "未配置"}</strong></div>
              <div>
                <span>产品名称</span>
                <input class="summary-control" data-product-field="name" data-product-id="${h(selectedProduct && selectedProduct.id || "")}" value="${h(selectedProduct && selectedProduct.name || "")}" placeholder="例如：可折叠挂脖风扇" />
              </div>
              <div>
                <span>图片 URL</span>
                <input class="summary-control" data-product-field="imageUrl" data-product-id="${h(selectedProduct && selectedProduct.id || "")}" value="${h(selectedProduct && selectedProduct.imageUrl || "")}" placeholder="https://..." />
              </div>
              <div>
                <span>上传图片</span>
                <label class="button summary-control">
                  ${h(selectedProductUploadLabel)}
                  <input type="file" accept="image/*" data-file="product-image" data-product-id="${h(selectedProduct && selectedProduct.id || "")}" hidden />
                </label>
              </div>
              <div><span>收藏</span><strong>${selectedFavorite ? selectedFavorite.name : "未保存"}</strong></div>
              <div>
                <span>二创数量</span>
                <input class="summary-control" type="number" min="1" max="10" step="1" data-field="reverseVideo.secondaryCount" value="${h(secondaryCount)}" />
              </div>
              <div>
                <span>生成方式</span>
                <select class="summary-control" data-field="reverseVideo.creationStrategy">
                  ${renderCreationStrategyOptions(creationStrategy)}
                </select>
              </div>
            </div>
            ${reverse.error ? `<div class="risk-box"><strong>处理失败</strong><p>${h(reverse.error)}</p></div>` : ""}
            <button class="button wide" data-action="save-reverse-favorite" ${!canSave ? "disabled" : ""}>保存到我的收藏</button>
            <button class="button primary wide" data-action="create-reverse-tasks" ${selectedFavorite || canSave ? "" : "disabled"}>用这个脚本二创</button>
          </div>
        </aside>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div><h2>反推结果</h2><p class="muted">${result ? h([result.title, result.summary].filter(Boolean).join(" · ")) : "结果会自动保存，可以先人工修改再收藏。"}</p></div>
          ${result?.hook ? `<span class="tag">${h(result.hook)}</span>` : ""}
        </div>
        <div class="panel-body">
          ${renderReverseSceneRows(result)}
        </div>
      </div>
    </section>
  `;
}

function renderFavorites() {
  const draft = state.newFavorite || { type: "分镜脚本", name: "", content: "", tags: "" };
  return `
    <section class="stack">
      <div class="section-head">
        <div><h1>我的收藏</h1><p class="muted">收藏好的分镜脚本、内容策划、分镜和视频，可以直接复用或让 AI 改写后批量生成。</p></div>
        <button class="button primary" data-view="create">用收藏生成视频</button>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>新增收藏</h2><span class="status info">本地保存</span></div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="field">
              <label>类型</label>
              <select data-field="newFavorite.type">
                <option ${draft.type === "分镜脚本" ? "selected" : ""}>分镜脚本</option>
                <option ${draft.type === "内容策划" ? "selected" : ""}>内容策划</option>
              </select>
            </div>
            <div class="field">
              <label>名称</label>
              <input data-field="newFavorite.name" value="${h(draft.name)}" placeholder="例如：喝水等待痛点开场" />
            </div>
            <div class="field full">
              <label>内容</label>
              <textarea data-field="newFavorite.content" placeholder="粘贴你认为值得复用的分镜脚本或策划。">${h(draft.content)}</textarea>
            </div>
            <div class="field full">
              <label>标签</label>
              <input data-field="newFavorite.tags" value="${h(draft.tags)}" placeholder="痛点开场, UGC, 产品演示" />
            </div>
          </div>
          <div class="actions" style="margin-top:12px;">
            <button class="button primary" data-action="add-favorite">保存到我的收藏</button>
          </div>
        </div>
      </div>
      <div class="grid three">
        ${state.favorites.map(fav => `
          <article class="favorite-card">
            <div class="favorite-card-head">
              <div class="actions"><span class="tag">${fav.type}</span><span class="status success">评分 ${fav.score}</span><span class="status info">复用 ${fav.reuseCount}</span></div>
              <button class="icon-button heart-button active" data-action="unfavorite" data-favorite-id="${fav.id}" title="取消收藏" aria-label="取消收藏 ${h(fav.name)}"><span>♥</span></button>
            </div>
            <h2>${h(fav.name)}</h2>
            <p>${h(fav.content)}</p>
            <div class="chips">${fav.tags.map(tag => `<span class="chip">${h(tag)}</span>`).join("")}</div>
            <div class="actions">
              <button class="button primary" data-use-favorite="${fav.id}" data-view="create">使用这个收藏</button>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderReview() {
  const queue = reviewQueueTasks();
  const task = queue.find((item) => item.id === state.selectedTaskId) || selectedTask();
  const stats = [
    ["待视频审核", reviewCount("video_review")],
    ["待文案审核", reviewCount("copy_review")],
    ["待发布确认", reviewCount("ready_to_publish")],
    ["生成失败", reviewCount("rejected")],
  ];
  if (!task) return emptyState("还没有可审核任务", "先批量生成一组分镜任务。", "create");
  return `
    <section class="review-screen">
      <div class="section-head">
        <div><h1>审核中心</h1><p class="muted">全局审核所有需要人工处理的视频、文案、发布确认和失败任务。</p></div>
        <div class="actions">
          <span class="tag">${queue.length} 条待处理</span>
          <button class="button" data-view="dashboard">返回看板</button>
        </div>
      </div>

      <div class="review-stats">
        ${stats.map(([label, count]) => `<div class="stat"><span>${label}</span><strong>${count}</strong></div>`).join("")}
      </div>

      <div class="review-center">
        <div class="review-queue panel">
          <div class="panel-head">
            <div><h2>审核队列</h2><p class="muted">先扫全局待办，再进入右侧逐条确认。</p></div>
            <span class="tag">${state.tasks.length} 条任务</span>
          </div>
          <div class="panel-body">
            ${queue.length ? `
              <div class="review-task-list">
                ${queue.map((item) => renderReviewQueueItem(item, item.id === task.id)).join("")}
              </div>
            ` : `
              <div class="empty-inline">
                <strong>暂无待人工审核任务</strong>
                <p class="muted">视频、文案、发布确认或失败任务出现后会集中在这里。</p>
              </div>
            `}
          </div>
        </div>

        <div class="review-detail">
          ${renderReviewDetail(task)}
        </div>
      </div>
    </section>
  `;
}

function renderReviewQueueItem(task, active) {
  const copyCount = Object.values(task.copies || {}).length;
  const approvedCopyCount = Object.values(task.copies || {}).filter((copy) => copy.approved).length;
  const note = task.status === "rejected"
    ? task.reviewNote || task.video?.providerMessage || "需要重新生成视频"
    : task.status === "copy_review"
      ? `${approvedCopyCount}/${copyCount || state.selectedPlatforms.length} 平台文案已审核`
      : task.status === "ready_to_publish"
        ? "文案已审核，等待发布确认"
        : task.video?.url ? "视频已生成，等待人工确认" : "等待视频结果";
  return `
    <article class="review-task-card ${active ? "active" : ""}">
      <button class="review-task-button" data-select-task="${task.id}" data-view="review">
        <span class="review-task-thumb">${task.video?.url ? "▶" : "..."}</span>
        <span class="review-task-copy">
          <strong>${h(task.title)}</strong>
          <small>${h(task.productName)} · ${h(task.favoriteName)}</small>
          <em>${h(note)}</em>
        </span>
        <span class="status ${statusClass(task.status)}">${Core.taskStatusLabel(task.status)}</span>
      </button>
    </article>
  `;
}

function renderReviewDetail(task) {
  const canApprove = task.video && task.status === "video_review";
  const isGenerating = task.status === "video_generating";
  const isFailed = task.status === "rejected";
  const videoUrl = task.video && task.video.url ? String(task.video.url) : "";
  const canPreviewVideo = /^(https?:|blob:|data:video\/)/.test(videoUrl);
  const localVideoUrl = task.video && task.video.localUrl ? String(task.video.localUrl) : "";
  const progress = [
    ["分镜", true],
    ["视频", Boolean(task.video) && !["content_plan_ready", "storyboard_ready"].includes(task.status)],
    ["审核", !["content_plan_ready", "storyboard_ready"].includes(task.status)],
    ["文案", ["copy_review", "ready_to_publish", "published"].includes(task.status)],
    ["发布", task.status === "published"],
  ];
  return `
      <div class="review-layout">
        <div class="review-main stack">
          <div class="panel">
            <div class="panel-head">
              <div><h2>视频预览</h2><p class="muted">${h(task.variation.hook)} / ${task.duration}s / ${h(task.ratio)}</p></div>
              <div class="actions">${favoriteHeart("video")}<span class="status ${statusClass(task.status)}">${Core.taskStatusLabel(task.status)}</span></div>
            </div>
            <div class="panel-body">
              <div class="video-box ${canPreviewVideo ? "has-video" : ""}">
                ${canPreviewVideo ? `
                  <video class="video-player" controls playsinline preload="metadata" src="${h(videoUrl)}"></video>
                  <div class="video-meta">
                    <strong>${localVideoUrl ? "视频已保存到本地" : "视频已生成，等待审核"}</strong>
                    <span class="video-links">
                      ${localVideoUrl ? `<a href="${h(localVideoUrl)}" target="_blank" rel="noreferrer">打开本地视频</a>` : ""}
                      <a href="${h(videoUrl)}" target="_blank" rel="noreferrer">打开原始视频</a>
                      <button class="button compact ghost" data-action="download-video">下载到本地</button>
                    </span>
                  </div>
                  ${task.video?.localPath ? `<p class="video-local-path">已保存：${h(task.video.localPath)}</p>` : ""}
                ` : `
                  <div class="video-placeholder">
                    <div class="play">▶</div>
                    <strong>${isFailed ? "视频生成失败" : task.status === "video_generating" ? "视频正在生成" : task.video && task.video.url ? "视频已生成，等待审核" : "还未生成视频"}</strong>
                    <p>${isFailed ? h(task.reviewNote || task.video?.providerMessage || "请检查图片 URL、模型权限和接口参数后重新生成。") : task.status === "video_generating" ? h(`任务 ID：${task.video?.jobId || "等待接口返回"}。点击“查询视频结果”获取真实视频地址。`) : task.video && task.video.url ? h(task.video.url) : "点击右上角生成视频，生成完成后再审核。"}</p>
                  </div>
                `}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div><h2>分镜脚本</h2><p class="muted">按时间顺序检查画面、字幕和产品卖点；生成后仍可人工修改。</p></div>
              <div class="actions"><button class="button" data-action="open-storyboard-editor">编辑分镜</button>${favoriteHeart("storyboard")}<button class="button" data-view="publish">查看文案</button></div>
            </div>
            <div class="panel-body">
              <div class="storyboard-read-list">
                <div class="storyboard-read-head">
                  <span>时间</span>
                  <span>镜头标题</span>
                  <span>画面描述</span>
                  <span>字幕</span>
                </div>
                <div class="storyboard-list">${task.storyboard.map((scene, index) => `
                  <article class="storyboard-read-row">
                    <strong>${h(scene.time)}</strong>
                    <span>${h(scene.title)}</span>
                    <p>${h(scene.visual)}${renderSceneExtra(scene)}</p>
                    <em>${h(scene.subtitle)}<button class="inline-edit-button" data-action="open-storyboard-editor" data-storyboard-index="${index}">编辑第 ${index + 1} 镜</button></em>
                  </article>
                `).join("")}</div>
              </div>
            </div>
          </div>
        </div>

        <aside class="review-side stack">
          <div class="panel">
            <div class="panel-head"><h2>审核摘要</h2></div>
            <div class="panel-body stack">
              <div class="review-progress">
                ${progress.map(([label, done]) => `<span class="${done ? "done" : ""}">${label}</span>`).join("")}
              </div>
              <div class="settings-summary">
                <div><span>产品</span><strong>${h(task.productName)}</strong></div>
                <div><span>内容来源</span><strong>${h(task.contentPlan ? "产品想法 + 产品图" : task.favoriteName)}</strong></div>
                <div><span>生成方式</span><strong>${h(Core.strategyLabel(task.strategy))}</strong></div>
                <div><span>负责人</span><strong>${h(task.owner)}</strong></div>
              </div>
              <button class="button wide" data-action="generate-video" ${pendingAttr("generate-video", task.video && !isFailed)}>${pendingLabel("generate-video", "生成视频", "生成中")}</button>
              <button class="button wide" data-action="refresh-video" ${pendingAttr("refresh-video", !isGenerating)}>${pendingLabel("refresh-video", "查询视频结果", "查询中")}</button>
              <button class="button primary wide" data-action="approve-video" ${pendingAttr("approve-video", !canApprove)}>${pendingLabel("approve-video", "通过并生成文案", "生成文案中")}</button>
            </div>
          </div>
        </aside>
      </div>
      ${storyboardEditorOpen ? renderStoryboardEditor(task) : ""}
  `;
}

function renderStoryboardEditor(task) {
  const scenes = task.storyboard || [];
  const activeIndex = clampStoryboardIndex(task);
  const activeScene = scenes[activeIndex] || emptyStoryboardScene();
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="storyboard-editor-modal" role="dialog" aria-modal="true" aria-label="编辑分镜脚本">
        <div class="modal-head">
          <div><h2>编辑分镜脚本</h2><p class="muted">${h(task.title)} · 第 ${scenes.length ? activeIndex + 1 : 0} / ${scenes.length} 镜 · 已自动保存。</p></div>
          <button class="button" data-action="close-storyboard-editor">完成</button>
        </div>
        <div class="storyboard-editor storyboard-editor-shell">
          <aside class="storyboard-scene-list" aria-label="镜头列表">
            <div class="storyboard-scene-list-head">
              <strong>镜头</strong>
              <button class="button subtle" data-action="insert-storyboard-scene" data-storyboard-index="${activeIndex}">新增</button>
            </div>
            ${scenes.length ? scenes.map((scene, index) => `
              <button class="storyboard-scene-tab ${index === activeIndex ? "active" : ""}" data-action="select-storyboard-scene" data-storyboard-index="${index}">
                <span>${String(index + 1).padStart(2, "0")}</span>
                <strong>${h(scene.time || "未设置时间")} · ${h(scene.title || "未命名镜头")}</strong>
                <em>${h(scene.visual || scene.subtitle || "还没有画面描述")}</em>
              </button>
            `).join("") : `<div class="empty-inline">还没有镜头。</div>`}
          </aside>

          <article class="storyboard-detail-editor">
            <div class="storyboard-detail-head">
              <div>
                <span class="eyebrow">当前镜头</span>
                <h3>第 ${activeIndex + 1} 镜</h3>
              </div>
              <div class="actions">
                <button class="button subtle" data-action="move-storyboard-scene" data-storyboard-index="${activeIndex}" data-direction="up" ${activeIndex <= 0 ? "disabled" : ""}>上移</button>
                <button class="button subtle" data-action="move-storyboard-scene" data-storyboard-index="${activeIndex}" data-direction="down" ${activeIndex >= scenes.length - 1 ? "disabled" : ""}>下移</button>
                <button class="button subtle" data-action="duplicate-storyboard-scene" data-storyboard-index="${activeIndex}">复制</button>
                <button class="button subtle" data-action="insert-storyboard-scene" data-storyboard-index="${activeIndex}">插入</button>
                <button class="button danger subtle" data-action="delete-storyboard-scene" data-storyboard-index="${activeIndex}" ${scenes.length <= 1 ? "disabled" : ""}>删除</button>
              </div>
            </div>

            <div class="storyboard-primary-fields">
              <label>时间
                <input class="storyboard-time-input" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="time" value="${h(activeScene.time)}" aria-label="第 ${activeIndex + 1} 镜时间" />
              </label>
              <label>镜头标题
                <input class="storyboard-title-input" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="title" value="${h(activeScene.title)}" aria-label="第 ${activeIndex + 1} 镜标题" />
              </label>
            </div>

            <label class="storyboard-main-visual">画面描述
              <textarea class="storyboard-visual-input" rows="8" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="visual" aria-label="第 ${activeIndex + 1} 镜画面描述">${h(activeScene.visual)}</textarea>
            </label>

            <div class="storyboard-secondary-fields">
              <label>字幕
                <textarea class="storyboard-subtitle-input" rows="3" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="subtitle" aria-label="第 ${activeIndex + 1} 镜字幕">${h(activeScene.subtitle)}</textarea>
              </label>
              <label>旁白
                <textarea rows="3" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="voiceover" aria-label="第 ${activeIndex + 1} 镜旁白">${h(activeScene.voiceover || "")}</textarea>
              </label>
              <label>屏幕字
                <input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="screenText" value="${h(activeScene.screenText || "")}" aria-label="第 ${activeIndex + 1} 镜屏幕字" />
              </label>
            </div>

            <details class="storyboard-advanced-fields">
              <summary>高级字段</summary>
              <div class="storyboard-edit-extra">
                <label>运镜<input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="camera" value="${h(activeScene.camera || "")}" aria-label="第 ${activeIndex + 1} 镜运镜" /></label>
                <label>动作<input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="motion" value="${h(activeScene.motion || "")}" aria-label="第 ${activeIndex + 1} 镜动作" /></label>
                <label>产品重点<input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="productFocus" value="${h(activeScene.productFocus || "")}" aria-label="第 ${activeIndex + 1} 镜产品重点" /></label>
                <label>图片提示词<textarea rows="3" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="imagePrompt" aria-label="第 ${activeIndex + 1} 镜图片提示词">${h(activeScene.imagePrompt || "")}</textarea></label>
                <label>视频提示词<textarea rows="3" data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="videoPrompt" aria-label="第 ${activeIndex + 1} 镜视频提示词">${h(activeScene.videoPrompt || "")}</textarea></label>
                <label>审核点<input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="reviewChecklist" value="${h(listText(activeScene.reviewChecklist))}" aria-label="第 ${activeIndex + 1} 镜审核点" /></label>
                <label>风险提示<input data-storyboard-task-id="${task.id}" data-storyboard-index="${activeIndex}" data-storyboard-field="riskNotes" value="${h(listText(activeScene.riskNotes))}" aria-label="第 ${activeIndex + 1} 镜风险提示" /></label>
              </div>
            </details>
          </article>
        </div>
      </section>
    </div>
  `;
}

function renderCopyCard(task, platformId) {
  const platform = Core.platforms.find((item) => item.id === platformId);
  const copy = sanitizedCopy(task.copies[platformId]);
  const publisherResponse = task.providerResponses && task.providerResponses.publisher;
  const hasFailedRealPublish = publisherResponse && publisherResponse.ok === false;
  const result = hasFailedRealPublish ? null : task.publishResults[platformId];
  const warningCount = copy?.complianceWarnings?.length || 0;
  return `<article class="copy-card">
    <div class="copy-card-head">
      <div class="actions"><span class="tag">${h(platform?.name || platformId)}</span>${copy?.approved ? `<span class="status success">已审核</span>` : `<span class="status warning">待审核</span>`}</div>
      ${warningCount ? `<span class="status warning">合规提醒 ${warningCount}</span>` : ""}
    </div>
    ${copy ? `
      <h3>${h(copy.title)}</h3>
      <p class="copy-hook">${h(copy.hook || "")}</p>
      <p class="muted">${h(copy.body)}</p>
      <p class="muted">${h(copyHashtagText(copy.hashtags))}</p>
      <div class="actions">
        <button class="button" data-action="open-copy-detail" data-platform="${platformId}">查看文案详情</button>
        ${result ? `<a href="${result.url}" target="_blank">${h(result.platformName)} 发布链接</a>` : `<button class="button" data-action="approve-copy" data-platform="${platformId}">通过文案</button>`}
        <button class="button subtle" data-action="delete-copy" data-platform="${platformId}">移除</button>
      </div>
    ` : `
      <p class="muted">尚未生成文案。</p>
      <button class="button" data-action="open-copy-detail" data-platform="${platformId}" disabled>查看文案详情</button>
    `}
  </article>`;
}

function finalPlatformCopy(copy) {
  if (!copy) return "";
  const safeCopy = sanitizedCopy(copy);
  return [
    safeCopy.title,
    safeCopy.hook,
    safeCopy.body,
    safeCopy.cta,
    copyHashtagText(safeCopy.hashtags),
  ].filter(Boolean).join("\n\n");
}

function publisherRequestPreview(task, platformId) {
  const originalCopy = task.copies[platformId];
  if (!originalCopy) return {};
  const copy = Object.assign({}, sanitizedCopy(originalCopy), { approved: true });
  const previewTask = Object.assign({}, task, { copies: { [platformId]: copy } });
  const request = Core.buildPublishProviderRequest(state, previewTask);
  return {
    endpoint: request.endpoint || "",
    body: request.body || {},
  };
}

function renderCopyDetailModal(task) {
  if (!copyDetailPlatformId) return "";
  const copy = sanitizedCopy(task.copies[copyDetailPlatformId]);
  const platform = Core.platforms.find((item) => item.id === copyDetailPlatformId);
  if (!copy) return "";
  const previewText = finalPlatformCopy(copy);
  const requestPreview = publisherRequestPreview(task, copyDetailPlatformId);
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="copy-detail-modal" role="dialog" aria-modal="true" aria-label="文案详情">
        <div class="modal-head">
          <div><h2>文案详情</h2><p class="muted">${h(platform?.name || copyDetailPlatformId)} · ${h(task.title)} · 输入时自动保存。</p></div>
          <button class="button" data-action="close-copy-detail">完成</button>
        </div>
        <div class="copy-detail-body">
          <div class="platform-copy-preview">
            <div>
              <strong>实际发布正文</strong>
              <span>会发送为 ${h(platform?.name || copyDetailPlatformId)} 的 content 字段</span>
            </div>
            <pre>${h(previewText)}</pre>
          </div>
          <div class="platform-copy-preview">
            <div>
              <strong>中文参考译文</strong>
              <span>仅用于人工审核，不会发布到平台</span>
            </div>
            <pre>${h(copy.chineseTranslation || "暂无中文参考译文，请重新生成文案。")}</pre>
          </div>
          <div class="publisher-request-preview">
            <div>
              <strong>PostEverywhere 请求预览</strong>
              <span>不包含 API Key，发布前可核对真实请求体</span>
            </div>
            <pre>${h(JSON.stringify(requestPreview, null, 2))}</pre>
          </div>
          <div class="field"><label>标题 ${copyPublishBadge("会发布", "sent")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="title" value="${h(copy.title || "")}" /></div>
          <div class="field"><label>Hook ${copyPublishBadge("会发布", "sent")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="hook" value="${h(copy.hook || "")}" /></div>
          <div class="field"><label>正文 ${copyPublishBadge("会发布", "sent")}</label><textarea rows="5" data-copy-platform="${copyDetailPlatformId}" data-copy-field="body">${h(copy.body || "")}</textarea></div>
          <div class="field"><label>中文参考译文 ${copyPublishBadge("仅内部审核")}</label><textarea rows="4" data-copy-platform="${copyDetailPlatformId}" data-copy-field="chineseTranslation">${h(copy.chineseTranslation || "")}</textarea></div>
          <div class="form-grid">
            <div class="field"><label>CTA ${copyPublishBadge("会发布", "sent")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="cta" value="${h(copy.cta || "")}" /></div>
            <div class="field"><label>封面标题 ${copyPublishBadge("暂未接入发布", "pending")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="coverTitle" value="${h(copy.coverTitle || "")}" /></div>
            <div class="field"><label>Hashtags ${copyPublishBadge("会发布", "sent")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="hashtags" value="${h(copyHashtagText(copy.hashtags))}" /></div>
            <div class="field"><label>首条评论 ${copyPublishBadge("暂未接入发布", "pending")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="firstComment" value="${h(copy.firstComment || "")}" /></div>
          </div>
          <div class="field"><label>屏幕叠字 ${copyPublishBadge("暂未接入发布", "pending")}</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="overlayText" value="${h(listText(copy.overlayText))}" /></div>
          <div class="field"><label>投放建议 ${copyPublishBadge("仅内部审核")}</label><textarea rows="3" data-copy-platform="${copyDetailPlatformId}" data-copy-field="postingNotes">${h(copy.postingNotes || "")}</textarea></div>
          <div class="field"><label>合规提醒 ${copyPublishBadge("仅内部审核")}</label><textarea rows="3" data-copy-platform="${copyDetailPlatformId}" data-copy-field="complianceWarnings">${h(listText(copy.complianceWarnings))}</textarea></div>
          <div class="field"><label>生成理由 ${copyPublishBadge("仅内部审核")}</label><textarea rows="3" data-copy-platform="${copyDetailPlatformId}" data-copy-field="rationale">${h(copy.rationale || "")}</textarea></div>
        </div>
      </section>
    </div>
  `;
}

function renderPublisherFeedback(task) {
  const response = task.providerResponses && task.providerResponses.publisher;
  if (!response) return "";
  const ok = response.ok !== false;
  const upstream = response.upstream || {};
  const status = upstream.status || response.status || "";
  const error = response.error || upstream.error || "";
  const data = upstream.data || upstream.upstream?.data || response.result || response.results || null;
  const summary = data ? JSON.stringify(redactSecrets(data), null, 2) : "";
  return `
    <div class="publisher-feedback ${ok ? "success" : "danger"}">
      <div>
        <strong>后台发布反馈</strong>
        <span>${ok ? "提交成功" : "提交失败"}${status ? ` · HTTP ${h(status)}` : ""}</span>
      </div>
      ${error ? `<p>${h(error)}</p>` : ""}
      ${summary ? `<pre>${h(summary)}</pre>` : ""}
    </div>
  `;
}

function publishReadiness(task, platformIds) {
  const copyIds = platformIds.filter((platformId) => task.copies[platformId]);
  const activeIds = copyIds.length ? copyIds : platformIds;
  const total = activeIds.length;
  const approvedIds = activeIds.filter((platformId) => task.copies[platformId]?.approved);
  const approved = approvedIds.length;
  const missing = copyIds.length ? [] : activeIds.filter((platformId) => !task.copies[platformId]);
  const pending = activeIds.filter((platformId) => task.copies[platformId] && !task.copies[platformId].approved);
  const publisher = state.integrations.publisher || {};
  const accountIds = String(publisher.accountIds || publisher.account_ids || "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  const missingPublisherAccounts = publisher.mode === "http" && publisher.provider === "posteverywhere" && accountIds.length === 0;
  const ready = approved > 0 && !pending.length && !missing.length && !missingPublisherAccounts;
  const published = task.status === "published";
  let message = "当前保留的平台文案已通过，可以发布到 PostEverywhere。";
  if (published) {
    message = "当前任务已发布，下面可查看各平台发布反馈。";
  } else if (missingPublisherAccounts) {
    message = "还没有配置 PostEverywhere 账号 IDs。请到设置页填写 GET /accounts 返回的 account_id，多个用逗号分隔。";
  } else if (!copyIds.length) {
    message = "还没有可发布的平台文案，请先生成平台文案。";
  } else if (missing.length) {
    message = `还差 ${missing.length} 个平台文案未生成，请先生成平台文案。`;
  } else if (pending.length) {
    message = `还差 ${pending.length} 个平台文案未通过，先逐个平台点击“通过文案”。`;
  }
  return { total, approved, approvedIds, activeIds, missing, pending, missingPublisherAccounts, ready, published, message };
}

function syncPublishStatus(task) {
  const readiness = publishReadiness(task, state.selectedPlatforms);
  if (task.status !== "published") {
    task.status = readiness.ready ? "ready_to_publish" : "copy_review";
  }
  return readiness;
}

function renderPublish() {
  const task = selectedTask();
  if (!task) return emptyState("还没有可发布任务", "先完成视频审核。", "create");
  const platformIds = state.selectedPlatforms;
  const readiness = publishReadiness(task, platformIds);
  const cardPlatformIds = readiness.activeIds.length ? readiness.activeIds : platformIds;
  return `
    <section class="stack">
      <div class="section-head">
        <div><h1>文案与发布</h1><p class="muted">${h(task.title)} · ${Core.taskStatusLabel(task.status)}</p></div>
        <div class="actions">
          ${renderCopyStyleSelect()}
          <button class="button" data-action="generate-copies" ${pendingAttr("generate-copies")}>${pendingLabel("generate-copies", "生成平台文案", "生成中")}</button>
          <button class="button primary" data-action="publish-task" ${pendingAttr("publish-task")}>${pendingLabel("publish-task", "发布到 PostEverywhere", "发布中")}</button>
        </div>
      </div>
      <div class="publish-readiness ${readiness.ready || readiness.published ? "ready" : "blocked"}">
        <div class="publish-readiness-copy">
          <strong>${readiness.published ? "发布反馈" : readiness.ready ? "可以发布" : "暂不能发布"}</strong>
          <span>${h(readiness.message)}</span>
        </div>
        <div class="publish-management-actions">
          <em>${readiness.approved}/${readiness.total} 平台文案已通过</em>
          <button class="button subtle" data-action="approve-remaining-copies" ${readiness.pending.length ? "" : "disabled"}>批量通过剩余</button>
          <button class="button subtle" data-action="clear-pending-copies" ${readiness.pending.length ? "" : "disabled"}>清空未通过</button>
        </div>
      </div>
      ${renderPublisherFeedback(task)}
      ${task.copySummary ? `<div class="panel"><div class="panel-body"><strong>文案摘要</strong><p class="muted">${h(task.copySummary)}</p></div></div>` : ""}
      <div class="grid four">
        ${cardPlatformIds.map(platformId => renderCopyCard(task, platformId)).join("")}
      </div>
      ${renderCopyDetailModal(task)}
    </section>
  `;
}

function renderSettings() {
  const llm = state.integrations.llm;
  const video = state.integrations.video;
  const publisher = state.integrations.publisher;
  const task = selectedTask();
  const preview = latestProviderPreview(task);
  return `
    <section class="stack">
      <div class="section-head">
        <div><h1>集成设置</h1><p class="muted">大模型支持 DeepSeek、OpenAI 兼容接口和自定义接口；视频模型支持多 provider。静态页面不建议长期保存生产密钥。</p></div>
        <button class="button primary" data-view="create">返回生成任务</button>
      </div>
      <div class="settings-block">
        <div class="settings-block-head">
          <div><h2>接口配置</h2><p class="muted">按调用链配置：内容生成、视频生成、发布分发。当前版本只走 http 真实接口，并由本地 server 代理。</p></div>
          <span class="status ${isServerMode() ? "success" : "warning"}">${isServerMode() ? "server" : "file"}</span>
        </div>
        <div class="settings-config-grid">
          <div class="stack compact-stack">
            ${renderIntegrationProfilePanel("video", video)}
            ${renderVideoIntegrationCard(video)}
          </div>
          <div class="stack compact-stack">
            ${renderIntegrationProfilePanel("llm", llm)}
            ${renderLlmIntegrationCard(llm)}
          </div>
        </div>
        <div class="settings-config-grid publisher-row">
          <div class="stack compact-stack">
            ${renderIntegrationProfilePanel("publisher", publisher)}
            ${renderPublisherIntegrationCard(publisher)}
          </div>
          ${renderPlatformSettingsCard()}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>当前请求/响应预览</h2><span class="tag">只显示最近一次</span></div>
        <div class="panel-body">
          <pre class="request-preview">${h(JSON.stringify(preview, null, 2))}</pre>
        </div>
      </div>
    </section>
  `;
}

function renderLlmIntegrationCard(value) {
  return renderIntegrationCard({
    title: "通用大模型",
    description: "用于生成完整内容规划、分镜脚本和平台文案。",
    key: "llm",
    value,
    providerOptions: Core.llmProviders,
    endpointLabel: "生成 Endpoint",
    modelLabel: "文本模型",
  });
}

function providerName(providerId) {
  const provider = Core.llmProviders.concat(Core.videoProviders).find((item) => item.id === providerId);
  return provider ? provider.name : providerId;
}

const profileTitles = {
  llm: ["模型配置", "保存常用大模型接口，下次一键启用。", "例如：DeepSeek、Bailian、OpenRouter Claude"],
  video: ["视频模型配置", "保存常用视频生成接口，下次一键启用。", "例如：通义万相、Seedance、可灵"],
  publisher: ["发布配置", "保存常用发布接口和账号配置，下次一键启用。", "例如：PostEverywhere 主账号"],
};

function renderIntegrationProfilePanel(key, integration) {
  const profiles = state.integrationProfiles && Array.isArray(state.integrationProfiles[key]) ? state.integrationProfiles[key] : [];
  const activeId = state.activeIntegrationProfileIds && state.activeIntegrationProfileIds[key] || "";
  const [title, description, placeholder] = profileTitles[key] || ["配置", "保存常用接口配置，下次一键启用。", "配置名称"];
  const suggestedName = (profiles.find((profile) => profile.id === activeId) || {}).name || integration.model || providerName(integration.provider || "") || "我的配置";
  const draftField = `${key}ProfileDraftName`;
  const justSaved = lastProfileSave && lastProfileSave.key === key;
  return `
    <div class="panel model-switch-card">
      <div class="panel-head">
        <div><h2>${title}</h2><p class="muted">${description}</p></div>
        <span class="tag">${profiles.length} 个</span>
      </div>
      <div class="panel-body stack">
        ${justSaved ? `<div class="inline-success"><strong>已保存配置</strong><span>${h(lastProfileSave.name)} 已加入上方配置列表并设为使用中。</span></div>` : ""}
        <div class="model-profile-save">
          <input data-field="${draftField}" value="${h(state[draftField] || suggestedName)}" placeholder="${h(placeholder)}" />
          <button class="button primary" data-action="save-integration-profile" data-profile-key="${key}">${justSaved ? "已保存" : activeId ? "保存为当前配置" : "保存配置"}</button>
        </div>
        <div class="model-profile-list">
          ${profiles.length ? profiles.map((profile) => renderIntegrationProfileItem(key, profile)).join("") : `<div class="empty-profile">还没有配置。填好下方接口信息后，点击保存配置。</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderIntegrationProfileItem(key, profile) {
  const active = profile.id === (state.activeIntegrationProfileIds && state.activeIntegrationProfileIds[key]);
  const subtitle = profile.endpoint ? profile.endpoint.replace(/^https?:\/\//, "") : providerName(profile.provider);
  return `
    <div class="model-profile-item ${active ? "active" : ""}">
      <div class="drag-dots" aria-hidden="true">⋮⋮</div>
      <div class="model-avatar">${h((profile.name || "?").slice(0, 1).toUpperCase())}</div>
      <div class="model-profile-main">
        <strong>${h(profile.name)}</strong>
        <span>${h(subtitle)}</span>
        <small>${h(providerName(profile.provider))} · ${h(profile.apiStyle || "custom")}${profile.model ? ` · ${h(profile.model)}` : ""}</small>
      </div>
      <div class="model-profile-actions">
        <button class="button ${active ? "subtle" : "primary"}" data-action="apply-integration-profile" data-profile-key="${key}" data-profile-id="${profile.id}" ${active ? "disabled" : ""}>${active ? "使用中" : "启用"}</button>
        <button class="icon-button" data-action="delete-integration-profile" data-profile-key="${key}" data-profile-id="${profile.id}" title="删除配置" aria-label="删除 ${h(profile.name)}">×</button>
      </div>
    </div>
  `;
}

function renderVideoIntegrationCard(value) {
  return renderIntegrationCard({
    title: "视频生成模型",
    description: "用于提交图片转视频任务，并按任务 ID 查询生成结果。",
    key: "video",
    value,
    providerOptions: Core.videoProviders,
    endpointLabel: "生成 Endpoint",
    modelLabel: "视频模型",
    extraFields: `
      <div class="field">
        <label>查询 Endpoint</label>
        <input data-field="integrations.video.statusEndpoint" value="${h(value.statusEndpoint || "")}" placeholder="https://.../{task_id}" />
      </div>
    `,
  });
}

function renderPublisherIntegrationCard(value) {
  return renderIntegrationCard({
    title: "PostEverywhere 发布",
    description: "用于把审核通过的视频和多平台文案提交到发布系统。",
    key: "publisher",
    value,
    providerOptions: [{ id: "posteverywhere", name: "PostEverywhere" }, { id: "custom-publisher", name: "自定义发布接口" }],
    endpointLabel: "发布 Endpoint",
    extraFields: `
      <div class="field">
        <label>工作区 ID</label>
        <input data-field="integrations.publisher.workspaceId" value="${h(value.workspaceId || "")}" placeholder="例如：workspace_xxx，可为空" />
      </div>
      <div class="field">
        <label>PostEverywhere 账号 IDs</label>
        <input data-field="integrations.publisher.accountIds" value="${h(value.accountIds || "")}" placeholder="例如：2280,2282；来自 GET /accounts" />
      </div>
      <div class="field">
        <label>Media IDs（可选）</label>
        <input data-field="integrations.publisher.mediaIds" value="${h(value.mediaIds || "")}" placeholder="视频上传到 PostEverywhere 后返回的 media_ids" />
      </div>
    `,
  });
}

function renderPlatformSettingsCard() {
  return `
    <div class="panel platform-card">
      <div class="panel-head">
        <div><h2>默认发布平台</h2><p class="muted">生成文案和发布请求会使用这里选中的平台。</p></div>
        <span class="tag">${state.selectedPlatforms.length} 个</span>
      </div>
      <div class="panel-body stack">
        <div class="platform-options">
          ${Core.platforms.map((platform) => `
            <label class="platform-option">
              <input type="checkbox" data-platform-toggle="${platform.id}" ${state.selectedPlatforms.includes(platform.id) ? "checked" : ""} />
              <span>
                <strong>${h(platform.name)}</strong>
                <small>${h(platform.tone)}</small>
              </span>
            </label>
          `).join("")}
        </div>
        <p class="muted">至少保留一个平台；如果只做单平台投放，可以先取消其他平台。</p>
      </div>
    </div>
  `;
}

function renderIntegrationCard(config) {
  const { title, description, key, value, providerOptions, endpointLabel = "Endpoint", modelLabel = "模型", extraFields = "" } = config;
  const currentProvider = providerOptions.find((provider) => provider.id === value.provider);
  const testResult = state.connectionTests && state.connectionTests[key];
  return `
    <div class="panel integration-card">
      <div class="panel-head">
        <div><h2>${title}</h2><p class="muted">${description}</p></div>
        <span class="status info">http</span>
      </div>
      <div class="panel-body stack">
        <div class="field">
          <label>模式</label>
          <select data-field="integrations.${key}.mode">
            <option value="http" selected>http 真实接口</option>
          </select>
        </div>
        <div class="field">
          <label>Provider</label>
          <select data-field="integrations.${key}.provider" data-provider-group="${key}">
            ${providerOptions.map(provider => `<option value="${provider.id}" ${provider.id === value.provider ? "selected" : ""}>${h(provider.name || provider.id)}</option>`).join("")}
          </select>
        </div>
        ${key === "llm" && value.apiStyle !== undefined ? `<div class="field"><label>接口格式</label><select data-field="integrations.${key}.apiStyle"><option value="openai-chat" ${value.apiStyle === "openai-chat" ? "selected" : ""}>OpenAI Chat Completions</option><option value="openai-responses" ${value.apiStyle === "openai-responses" ? "selected" : ""}>OpenAI Responses</option><option value="custom-json" ${value.apiStyle === "custom-json" ? "selected" : ""}>自定义 JSON</option></select></div>` : ""}
        <div class="field">
          <label>${endpointLabel}</label>
          <input data-field="integrations.${key}.endpoint" value="${h(value.endpoint || "")}" placeholder="https://..." />
        </div>
        ${value.model !== undefined ? `<div class="field"><label>${modelLabel}</label><input data-field="integrations.${key}.model" value="${h(value.model)}" placeholder="${h((currentProvider && currentProvider.model) || "model name")}" /></div>` : ""}
        ${extraFields}
        <div class="field">
          <label>API Key</label>
          <input type="password" data-field="integrations.${key}.apiKey" value="${h(value.apiKey || "")}" placeholder="${key === "llm" ? "DeepSeek/OpenAI-compatible key" : key === "publisher" ? "PostEverywhere API Key" : "视频生成 API Key"}" autocomplete="off" />
        </div>
        <div class="connection-test">
          <div class="actions connection-actions">
            <button class="button" data-action="save-integration" data-connection-key="${key}">保存配置</button>
            <button class="button" data-action="test-connection" data-connection-key="${key}">测试连接</button>
            <button class="button danger" data-action="clear-api-key" data-connection-key="${key}">清空 Key</button>
          </div>
          ${testResult ? `<div class="test-result ${testResult.ok ? "success" : "danger"}"><strong>${testResult.ok ? "连接正常" : "连接失败"}</strong><span>${h(testResult.message || testResult.error || "")}</span></div>` : `<p class="muted">测试前请先保存当前输入框变更。</p>`}
        </div>
      </div>
    </div>
  `;
}

function emptyState(title, description, targetView) {
  return `<section class="panel"><div class="panel-body stack"><h1>${title}</h1><p class="muted">${description}</p><button class="button primary" data-view="${targetView}">去处理</button></div></section>`;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.selectTask) state.selectedTaskId = el.dataset.selectTask;
      if (el.dataset.useFavorite) state.selectedFavoriteId = el.dataset.useFavorite;
      storyboardEditorOpen = false;
      copyDetailPlatformId = "";
      view = el.dataset.view;
      history.replaceState(null, "", `#${view}`);
      saveState();
      renderShell();
    });
  });

  document.querySelectorAll("[data-batch-task-id]").forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) selectedTaskIds.add(el.dataset.batchTaskId);
      else selectedTaskIds.delete(el.dataset.batchTaskId);
      renderShell();
    });
  });

  document.querySelectorAll("[data-batch-select-all]").forEach((el) => {
    el.addEventListener("change", () => {
      selectedTaskIds = el.checked ? new Set(dashboardTasksForFilter().map((task) => task.id)) : new Set();
      renderShell();
    });
  });

  document.querySelectorAll("[data-dashboard-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      dashboardFilter = el.dataset.dashboardFilter || "all";
      selectedTaskIds = new Set();
      renderShell();
    });
  });

  document.querySelectorAll("[data-platform-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      const platformId = el.dataset.platformToggle;
      const selected = new Set(state.selectedPlatforms);
      if (el.checked) {
        selected.add(platformId);
      } else if (selected.size > 1) {
        selected.delete(platformId);
      } else {
        el.checked = true;
        toast("至少保留一个发布平台。");
        return;
      }
      state.selectedPlatforms = Core.platforms.map((platform) => platform.id).filter((id) => selected.has(id));
      saveState();
      renderShell();
    });
  });

  document.querySelectorAll("[data-storyboard-field]").forEach((el) => {
    const saveStoryboardField = () => {
      const task = Core.getById(state.tasks, el.dataset.storyboardTaskId) || selectedTask();
      const index = Number(el.dataset.storyboardIndex);
      const field = el.dataset.storyboardField;
      const allowedFields = ["time", "title", "visual", "subtitle", "camera", "motion", "voiceover", "screenText", "productFocus", "imagePrompt", "videoPrompt", "reviewChecklist", "riskNotes"];
      if (!task || !task.storyboard[index] || !allowedFields.includes(field)) return;
      if (["reviewChecklist", "riskNotes"].includes(field)) {
        task.storyboard[index][field] = String(el.value || "").split(/[，,\n]+/).map((item) => item.trim()).filter(Boolean);
      } else {
        task.storyboard[index][field] = el.value;
      }
      task.updatedAt = new Date().toISOString();
      saveState();
    };
    el.addEventListener("input", saveStoryboardField);
    el.addEventListener("change", saveStoryboardField);
  });

  document.querySelectorAll("[data-reverse-scene-field]").forEach((el) => {
    const saveReverseSceneField = () => {
      const reverse = state.reverseVideo || {};
      const result = reverse.result;
      const index = Number(el.dataset.reverseSceneIndex);
      const field = el.dataset.reverseSceneField;
      const allowedFields = ["time", "title", "visual", "subtitle", "camera", "motion", "voiceover", "screenText", "imagePrompt", "videoPrompt", "productFocus"];
      if (!result || !result.scenes || !result.scenes[index] || !allowedFields.includes(field)) return;
      result.scenes[index][field] = el.value;
      delete result.storyboardScriptText;
      saveState();
    };
    el.addEventListener("input", saveReverseSceneField);
    el.addEventListener("change", saveReverseSceneField);
  });

  document.querySelectorAll("[data-reverse-script-text]").forEach((el) => {
    const saveReverseScriptText = () => {
      const result = state.reverseVideo && state.reverseVideo.result;
      if (!result || el.disabled) return;
      result.storyboardScriptText = el.value;
      saveState();
    };
    el.addEventListener("input", saveReverseScriptText);
    el.addEventListener("change", saveReverseScriptText);
  });

  document.querySelectorAll("[data-copy-field]").forEach((el) => {
    const saveCopyField = () => {
      const task = selectedTask();
      const copy = task && task.copies && task.copies[el.dataset.copyPlatform];
      const field = el.dataset.copyField;
      const arrayFields = ["hashtags", "overlayText", "complianceWarnings"];
      const allowedFields = ["title", "hook", "body", "cta", "hashtags", "chineseTranslation", "coverTitle", "overlayText", "firstComment", "postingNotes", "complianceWarnings", "rationale"];
      if (!copy || !allowedFields.includes(field)) return;
      if (arrayFields.includes(field)) {
        copy[field] = String(el.value || "").split(/[，,\n#]+/).map((item) => item.trim()).filter(Boolean);
      } else {
        copy[field] = el.value;
      }
      task.updatedAt = new Date().toISOString();
      saveState();
    };
    el.addEventListener("input", saveCopyField);
    el.addEventListener("change", saveCopyField);
  });

  document.querySelectorAll("[data-content-plan-field]").forEach((el) => {
    const saveContentPlanField = () => {
      const task = Core.getById(state.tasks, el.dataset.contentPlanTaskId) || latestContentPlanTask();
      const field = el.dataset.contentPlanField;
      const allowedFields = [
        "productUnderstanding",
        "targetAudience",
        "painPoints",
        "usageScenarios",
        "keySellingPoints",
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
        "storyboardGuidance",
        "complianceNotes",
      ];
      if (!task || !task.contentPlan || !allowedFields.includes(field)) return;
      if (el.dataset.contentPlanArray === "true") {
        task.contentPlan[field] = String(el.value || "").split(/[，,\n]+/).map((item) => item.trim()).filter(Boolean);
      } else {
        task.contentPlan[field] = el.value;
      }
      task.updatedAt = new Date().toISOString();
      saveState();
    };
    el.addEventListener("input", saveContentPlanField);
    el.addEventListener("change", saveContentPlanField);
  });

  document.querySelectorAll("[data-content-plan-text]").forEach((el) => {
    const saveContentPlanText = () => {
      const task = Core.getById(state.tasks, el.dataset.contentPlanTaskId) || latestContentPlanTask();
      if (!task || !task.contentPlan) return;
      task.contentPlanText = el.value;
      task.contentPlan.rawText = el.value;
      task.updatedAt = new Date().toISOString();
      saveState();
    };
    el.addEventListener("input", saveContentPlanText);
    el.addEventListener("change", saveContentPlanText);
  });

  document.querySelectorAll("[data-storyboard-script-text]").forEach((el) => {
    const saveStoryboardScriptText = () => {
      const task = Core.getById(state.tasks, el.dataset.storyboardScriptTaskId) || latestContentPlanTask();
      syncStoryboardScriptText(task, el.value);
      saveState();
    };
    el.addEventListener("input", saveStoryboardScriptText);
    el.addEventListener("change", saveStoryboardScriptText);
  });

  document.querySelectorAll("[data-storyboard-preset]").forEach((el) => {
    el.addEventListener("change", () => {
      const [sceneCount, detailLevel] = String(el.value || "auto:detailed").split(":");
      state.contentBrief = state.contentBrief || { seed: "", text: "" };
      state.contentBrief.storyboardSceneCount = sceneCount || "auto";
      state.contentBrief.storyboardDetailLevel = detailLevel || "detailed";
      saveState();
      renderShell();
    });
  });

  document.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("change", () => {
      const field = el.dataset.field;
      if (field.startsWith("product.")) {
        const product = Core.getById(state.products, state.selectedProductId);
        product[field.split(".")[1]] = el.value;
      } else if (field.startsWith("contentBrief.")) {
        state.contentBrief = state.contentBrief || { seed: "", text: "" };
        state.contentBrief[field.split(".")[1]] = el.value;
      } else if (field.startsWith("reverseVideo.")) {
        state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
        state.reverseVideo[field.split(".")[1]] = el.value;
      } else if (field.startsWith("newFavorite.")) {
        state.newFavorite = state.newFavorite || { type: "分镜脚本", name: "", content: "", tags: "" };
        state.newFavorite[field.split(".")[1]] = el.value;
      } else if (field.endsWith("ProfileDraftName")) {
        state[field] = el.value;
      } else if (field.startsWith("integrations.")) {
        const [, group, key] = field.split(".");
        state.integrations[group] = state.integrations[group] || {};
        if (key === "provider") {
          const presets = group === "llm" ? Core.llmProviders : group === "video" ? Core.videoProviders : null;
          if (presets) {
            const preset = Core.getProviderPreset(presets, el.value);
            Core.switchIntegrationProvider(state.integrations[group], preset);
          } else {
            state.integrations[group][key] = el.value;
          }
        } else {
          state.integrations[group][key] = el.value;
        }
        if (state.activeIntegrationProfileIds) state.activeIntegrationProfileIds[group] = "";
      } else if (field === "count") {
        const nextCount = Math.round(Number(el.value || 1));
        state.count = Math.max(1, Math.min(nextCount, 10));
      } else {
        state[field] = el.value;
      }
      saveState();
      renderShell();
    });
  });

  document.querySelectorAll("[data-product-field]").forEach((el) => {
    const saveProductField = () => {
      const productId = el.dataset.productId || state.selectedProductId;
      const product = Core.getById(state.products, productId);
      if (!product) return;
      product[el.dataset.productField] = el.value;
      saveState();
      renderShell();
    };
    el.addEventListener("change", saveProductField);
  });

  document.querySelectorAll("[data-file]").forEach((el) => {
    el.addEventListener("change", () => {
      const file = el.files && el.files[0];
      if (!file) return;
      if (el.dataset.file === "import-state") {
        importStateFile(file);
        return;
      }
      if (el.dataset.file === "reverse-video") {
        handleReverseVideoUpload(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const productId = el.dataset.productId || state.selectedProductId;
        const product = Core.getById(state.products, productId);
        if (!product) return;
        product.imageData = String(reader.result || "");
        product.imageLabel = file.name.slice(0, 12);
        saveState();
        renderShell();
        toast("产品图已保存到本地浏览器。");
      };
      reader.readAsDataURL(file);
    });
  });

  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => handleAction(el.dataset));
  });
}

async function handleAction(dataset) {
  const { action, platform: platformId, connectionKey, taskId, favoriteId, favoriteSource, profileId, profileKey, direction, productId } = dataset;
  const task = selectedTask();
  if (action === "save-state") {
    saveState();
    toast("当前数据已保存到本地浏览器。");
    return;
  }
  if (action === "export-state") {
    exportState();
    toast("已导出当前项目数据。");
    return;
  }
  if (action === "test-connection") {
    syncIntegrationForm(connectionKey);
    saveState();
    await testConnection(connectionKey);
    return;
  }
  if (action === "save-product") {
    const product = Core.getById(state.products, state.selectedProductId);
    if (product) product.detailsSaved = true;
    saveState();
    renderShell();
    toast("产品资料已保存，并会提供给 AI。");
    return;
  }
  if (action === "clear-product-image") {
    Core.clearProductImage(state, productId || (view === "reverse" && state.reverseVideo && state.reverseVideo.selectedProductId) || state.selectedProductId);
    saveState();
    renderShell();
    toast("产品图已清空。");
    return;
  }
  if (action === "save-integration") {
    syncIntegrationForm(connectionKey);
    saveState();
    renderShell();
    toast("接口配置已保存到本地。");
    return;
  }
  if (action === "save-integration-profile") {
    syncIntegrationForm(profileKey);
    const draftField = `${profileKey}ProfileDraftName`;
    const profile = Core.saveIntegrationProfile(state, profileKey, state[draftField]);
    state[draftField] = profile.name;
    lastProfileSave = { key: profileKey, id: profile.id, name: profile.name };
    saveState();
    renderShell();
    toast(`配置已保存：${profile.name}`);
    setTimeout(() => {
      if (lastProfileSave && lastProfileSave.id === profile.id) {
        lastProfileSave = null;
        renderShell();
      }
    }, 3200);
    return;
  }
  if (action === "apply-integration-profile") {
    const profile = Core.applyIntegrationProfile(state, profileKey, profileId);
    if (!profile) {
      toast("配置不存在。");
      return;
    }
    state[`${profileKey}ProfileDraftName`] = profile.name;
    if (state.connectionTests) delete state.connectionTests[profileKey];
    saveState();
    renderShell();
    toast(`已启用配置：${profile.name}`);
    return;
  }
  if (action === "delete-integration-profile") {
    const deleted = Core.deleteIntegrationProfile(state, profileKey, profileId);
    if (!deleted) {
      toast("配置不存在。");
      return;
    }
    saveState();
    renderShell();
    toast("模型配置已删除。");
    return;
  }
  if (action === "clear-api-key") {
    Core.clearIntegrationKey(state, connectionKey);
    if (state.connectionTests) delete state.connectionTests[connectionKey];
    saveState();
    renderShell();
    toast("API Key 已清空。");
    return;
  }
  if (action === "reverse-storyboard") {
    if (!startPending(action)) return;
    try {
      state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
      if (!state.reverseVideo.frames || !state.reverseVideo.frames.length) {
        state.reverseVideo.status = "extracting";
        saveState();
        state.reverseVideo.frames = await extractReverseFrames(state.reverseVideo.upload);
      }
      if (!shouldInlineReverseFrames()) {
        throw new Error(reverseVisionRequirementMessage());
      }
      state.reverseVideo.status = "reversing";
      saveState();
      let providerState = state;
      if (shouldInlineReverseFrames()) {
        state.reverseVideo.status = "preparing_vision_frames";
        renderShell();
        const visionFrames = await loadReverseFrameData(state.reverseVideo.frames);
        providerState = reverseProviderStateWithVisionFrames(visionFrames);
        state.reverseVideo.status = "reversing";
      }
      const request = Core.buildReverseStoryboardProviderRequest(providerState);
      const response = await callProvider("reverse-storyboard", request);
      const storedRequest = providerState === state ? request : Core.buildReverseStoryboardProviderRequest(state);
      Core.applyReverseStoryboardProviderResult(state, storedRequest, response);
      view = "reverse";
      finishPending(action);
      toast("反推分镜已生成，可以编辑后收藏。");
    } catch (error) {
      state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
      state.reverseVideo.status = "error";
      state.reverseVideo.error = error.message;
      finishPending(action);
      toast(`反推失败：${error.message}`);
    }
    return;
  }
  if (action === "save-reverse-favorite") {
    try {
      const favorite = Core.saveReverseStoryboardFavorite(state);
      saveState();
      renderShell();
      toast(favorite.sourceKey ? "已保存反推脚本到我的收藏。" : "已保存收藏。");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === "create-reverse-tasks") {
    try {
      if (!state.reverseVideo?.selectedFavoriteId && state.reverseVideo?.result) {
        Core.saveReverseStoryboardFavorite(state);
      }
      const tasks = Core.createTasksFromReverseFavorite(state);
      view = "dashboard";
      saveState();
      renderShell();
      toast(`已创建 ${tasks.length} 条二创任务。`);
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === "open-storyboard-editor") {
    const requestedIndex = Number(dataset.storyboardIndex);
    storyboardEditorSceneIndex = clampStoryboardIndex(task, Number.isFinite(requestedIndex) ? requestedIndex : storyboardEditorSceneIndex);
    storyboardEditorOpen = true;
    renderShell();
    return;
  }
  if (action === "close-storyboard-editor") {
    storyboardEditorOpen = false;
    renderShell();
    return;
  }
  if (action === "select-storyboard-scene") {
    storyboardEditorSceneIndex = clampStoryboardIndex(task, Number(dataset.storyboardIndex));
    renderShell();
    return;
  }
  if (action === "insert-storyboard-scene") {
    if (!task) return;
    task.storyboard = task.storyboard || [];
    const index = clampStoryboardIndex(task, Number(dataset.storyboardIndex));
    const insertAt = task.storyboard.length ? index + 1 : 0;
    task.storyboard.splice(insertAt, 0, emptyStoryboardScene());
    storyboardEditorSceneIndex = insertAt;
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    return;
  }
  if (action === "duplicate-storyboard-scene") {
    if (!task || !task.storyboard?.length) return;
    const index = clampStoryboardIndex(task, Number(dataset.storyboardIndex));
    const copy = JSON.parse(JSON.stringify(task.storyboard[index] || emptyStoryboardScene()));
    copy.title = `${copy.title || "镜头"} 副本`;
    task.storyboard.splice(index + 1, 0, copy);
    storyboardEditorSceneIndex = index + 1;
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    return;
  }
  if (action === "delete-storyboard-scene") {
    if (!task || !task.storyboard || task.storyboard.length <= 1) return;
    const index = clampStoryboardIndex(task, Number(dataset.storyboardIndex));
    task.storyboard.splice(index, 1);
    storyboardEditorSceneIndex = clampStoryboardIndex(task, index);
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    return;
  }
  if (action === "move-storyboard-scene") {
    if (!task || !task.storyboard?.length) return;
    const index = clampStoryboardIndex(task, Number(dataset.storyboardIndex));
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= task.storyboard.length) return;
    const [scene] = task.storyboard.splice(index, 1);
    task.storyboard.splice(targetIndex, 0, scene);
    storyboardEditorSceneIndex = targetIndex;
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    return;
  }
  if (action === "open-copy-detail") {
    copyDetailPlatformId = platformId || "";
    renderShell();
    return;
  }
  if (action === "close-copy-detail") {
    copyDetailPlatformId = "";
    renderShell();
    return;
  }
  if (action === "delete-task") {
    const target = state.tasks.find((item) => item.id === taskId);
    if (!target) {
      toast("任务不存在或已被删除。");
      return;
    }
    if (!window.confirm(`确认删除任务「${target.title}」？删除后将从本地任务列表移除。`)) return;
    Core.deleteTask(state, taskId);
    selectedTaskIds.delete(taskId);
    saveState();
    renderShell();
    toast("任务已删除。");
    return;
  }
  if (action === "batch-delete-tasks") {
    const targets = selectedTasks();
    if (!targets.length) {
      toast("请先选择要处理的任务。");
      return;
    }
    if (!window.confirm(`确认删除已选 ${targets.length} 条任务？`)) return;
    targets.forEach((item) => Core.deleteTask(state, item.id));
    selectedTaskIds = new Set();
    view = "dashboard";
    saveState();
    renderShell();
    toast(`已删除 ${targets.length} 条任务。`);
    return;
  }
  if (action === "unfavorite") {
    const target = state.favorites.find((item) => item.id === favoriteId);
    if (!target) {
      toast("收藏不存在或已被删除。");
      return;
    }
    if (!window.confirm(`确认取消收藏「${target.name}」？取消后会从我的收藏中移除，历史任务不受影响。`)) return;
    try {
      Core.deleteFavorite(state, favoriteId);
      saveState();
      renderShell();
      toast("已取消收藏。");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === "create-batch") {
    toast("批量分镜入口已移除，请使用新建页生成真实内容规划。");
    return;
  }
  if (action === "generate-content-plan") {
    await generateContentPlanWithUi(action);
    return;
  }
  if (action === "regenerate-content-plan") {
    await generateContentPlanWithUi(action, { keepPrevious: true });
    return;
  }
  if (action === "restore-previous-content-plan") {
    const planTask = latestContentPlanTask();
    if (!planTask || !String(planTask.previousContentPlanText || "").trim()) {
      toast("没有可恢复的上一版内容规划。");
      return;
    }
    const currentText = contentPlanText(planTask);
    planTask.contentPlanText = planTask.previousContentPlanText;
    planTask.previousContentPlanText = currentText;
    planTask.contentPlan = planTask.contentPlan || {};
    planTask.contentPlan.rawText = planTask.contentPlanText;
    planTask.updatedAt = new Date().toISOString();
    updateContentPlanStream({ status: "done", label: "已恢复上一版", text: planTask.contentPlanText });
    toast("已恢复上一版内容规划。");
    return;
  }
  if (action === "generate-storyboard-from-plan") {
    await generateStoryboardFromPlanWithUi(action);
    return;
  }
  if (action === "enter-review-video") {
    syncDraftForm();
    const planTask = latestContentPlanTask();
    if (planTask && (!Array.isArray(planTask.storyboard) || !planTask.storyboard.length)) {
      syncStoryboardScriptText(planTask, storyboardScriptDraftText(planTask));
    }
    if (!planTask || !Array.isArray(planTask.storyboard) || !planTask.storyboard.length) {
      toast("请先生成分镜脚本，再进入审核生成视频。");
      return;
    }
    const batchCount = Math.max(1, Math.min(Number(state.contentBrief?.videoBatchCount || 1), 10));
    const creationStrategy = state.contentBrief?.videoCreationStrategy || "original";
    if (batchCount > 1 || creationStrategy !== "original") {
      const tasks = Core.createTasksFromContentPlanStoryboard(state, planTask, {
        count: batchCount,
        strategy: creationStrategy,
      });
      selectedTaskIds = new Set(tasks.map((item) => item.id));
      state.selectedTaskId = tasks[0] && tasks[0].id || planTask.id;
    } else {
      state.selectedTaskId = planTask.id;
    }
    storyboardEditorOpen = false;
    copyDetailPlatformId = "";
    view = "review";
    history.replaceState(null, "", "#review");
    saveState();
    renderShell();
    toast(batchCount > 1 || creationStrategy !== "original" ? `已创建 ${batchCount} 条同分镜视频任务，可以逐条生成。` : "已进入审核页，可以生成视频。");
    return;
  }
  if (action === "generate-content-brief") {
    toast("内容文本入口已移除，请直接生成完整内容规划。");
    return;
  }
  if (action === "batch-generate-video") {
    const targets = selectedTasks().filter((item) => ["content_plan_ready", "storyboard_ready", "rejected"].includes(item.status));
    if (!targets.length) {
      toast("已选任务里没有可生成视频的任务。");
      return;
    }
    if (!startPending(action)) return;
    const results = [];
    for (const item of targets) {
      results.push(await generateVideoForTask(item));
    }
    view = "dashboard";
    const failed = results.filter((item) => !item.ok).length;
    finishPending(action);
    toast(failed ? `已提交 ${targets.length - failed} 条，${failed} 条调用失败。` : `已提交 ${targets.length} 条视频生成任务。`);
    return;
  }
  if (action === "batch-refresh-video") {
    const targets = selectedTasks().filter((item) => item.status === "video_generating");
    if (!targets.length) {
      toast("已选任务里没有正在生成的视频。");
      return;
    }
    if (!startPending(action)) return;
    const results = [];
    for (const item of targets) {
      results.push(await refreshVideoForTask(item));
    }
    view = "dashboard";
    const failed = results.filter((item) => !item.ok).length;
    const ready = targets.filter((item) => item.status === "video_review").length;
    finishPending(action);
    toast(failed ? `已查询 ${targets.length - failed} 条，${failed} 条失败。` : `已查询 ${targets.length} 条结果，${ready} 条可审核。`);
    return;
  }
  if (action === "add-favorite") {
    try {
      Core.addFavorite(state, state.newFavorite || {});
      view = "favorites";
      saveState();
      renderShell();
      toast("已保存收藏，可直接用于批量生成。");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (action === "save-section-favorite") {
    const existing = favoriteForSource(favoriteSource);
    if (existing) {
      state.selectedFavoriteId = existing.id;
      saveState();
      renderShell();
      toast("这个内容已在我的收藏里。");
      return;
    }
    const input = buildSectionFavorite(favoriteSource);
    if (!input || !input.content.trim()) {
      toast("当前内容为空，先补充内容后再收藏。");
      return;
    }
    try {
      const favorite = Core.addFavorite(state, input);
      state.selectedFavoriteId = favorite.id;
      saveState();
      renderShell();
      toast("已加入我的收藏。");
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  if (!task) return;
  if (action === "generate-video") {
    if (!startPending(action)) return;
    const result = await generateVideoForTask(task);
  const message = result.ok
      ? task.status === "video_generating" ? "视频任务已提交，等待生成完成后查询结果。" : "视频已生成，进入审核。"
      : `视频 provider 调用失败：${result.error.message}`;
    finishPending(action);
    toast(message);
    return;
  }
  if (action === "refresh-video") {
    if (!startPending(action)) return;
    const result = await refreshVideoForTask(task);
    const message = result.ok
      ? task.status === "video_review" ? "视频已生成，可以审核。" : task.status === "rejected" ? "视频生成失败，已显示失败原因。" : "视频仍在生成中，请稍后再查询。"
      : `查询视频结果失败：${result.error.message}`;
    finishPending(action);
    toast(message);
    return;
  }
  if (action === "download-video") {
    if (!startPending(action)) return;
    try {
      const result = await downloadGeneratedVideo(task);
      saveState();
      finishPending(action);
      toast(`视频已下载到本地：${result.localPath}`);
    } catch (error) {
      finishPending(action);
      toast(`下载失败：${error.message}`);
    }
    return;
  }
  if (action === "approve-video") {
    if (!startPending(action)) return;
    Core.approveVideo(task);
    await generateCopiesForTask(task);
    view = "publish";
    finishPending(action);
    toast("视频已通过，平台文案已生成。");
    return;
  }
  if (action === "generate-copies") {
    if (!startPending(action)) return;
    await generateCopiesForTask(task);
    finishPending(action);
    toast("平台文案已生成。");
    return;
  }
  if (action === "approve-copy") {
    Core.approveCopy(task, platformId);
    saveState();
    renderShell();
    toast("文案已通过。");
    return;
  }
  if (action === "delete-copy") {
    const copy = task.copies && task.copies[platformId];
    const platform = Core.platforms.find((item) => item.id === platformId);
    if (!copy) {
      toast("这条平台文案已经不存在。");
      return;
    }
    if (!window.confirm(`确认移除 ${platform?.name || platformId} 的文案？移除后可重新生成平台文案。`)) return;
    delete task.copies[platformId];
    if (copyDetailPlatformId === platformId) copyDetailPlatformId = "";
    syncPublishStatus(task);
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    toast("平台文案已移除，可重新生成。");
    return;
  }
  if (action === "approve-remaining-copies") {
    const readiness = publishReadiness(task, state.selectedPlatforms);
    if (!readiness.pending.length) {
      toast("没有待通过的平台文案。");
      return;
    }
    readiness.pending.forEach((id) => Core.approveCopy(task, id));
    syncPublishStatus(task);
    saveState();
    renderShell();
    toast(`已通过 ${readiness.pending.length} 个剩余平台文案。`);
    return;
  }
  if (action === "clear-pending-copies") {
    const readiness = publishReadiness(task, state.selectedPlatforms);
    if (!readiness.pending.length) {
      toast("没有待清空的平台文案。");
      return;
    }
    if (!window.confirm(`确认清空 ${readiness.pending.length} 个未通过的平台文案？已审核文案会保留。`)) return;
    readiness.pending.forEach((id) => {
      delete task.copies[id];
    });
    if (copyDetailPlatformId && !task.copies[copyDetailPlatformId]) copyDetailPlatformId = "";
    syncPublishStatus(task);
    task.updatedAt = new Date().toISOString();
    saveState();
    renderShell();
    toast("未通过的平台文案已清空，可重新生成。");
    return;
  }
  if (action === "publish-task") {
    const readiness = publishReadiness(task, state.selectedPlatforms);
    if (!readiness.ready) {
      toast(`还不能发布：${readiness.message}`);
      return;
    }
    if (!startPending(action)) return;
    Core.publishTask(state, task);
    let published = true;
    try {
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisher = await callProvider("publisher", task.providerRequests.publisher);
      Core.applyPublishProviderResult(task, task.providerResponses.publisher);
    } catch (error) {
      published = false;
      task.status = "ready_to_publish";
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisher = { ok: false, error: error.message };
      toast(`发布 provider 调用失败，已保留本地发布结果：${error.message}`);
    }
    finishPending(action);
    if (published) toast(state.integrations.publisher.mode === "http" ? "已提交到 PostEverywhere。" : "已模拟发布到 PostEverywhere。");
  }
}

async function handleReverseVideoUpload(file) {
  if (!file) return;
  if (!/\.(mp4|mov|webm)$/i.test(file.name) && !["video/mp4", "video/quicktime", "video/webm"].includes(file.type)) {
    toast("请上传 mp4、mov 或 webm 视频。");
    return;
  }
  if (!startPending("reverse-upload")) return;
  try {
    const upload = await uploadReverseVideo(file);
    const previousReverse = state.reverseVideo || {};
    state.reverseVideo = Object.assign({}, Core.createInitialState().reverseVideo, {
      upload,
      frames: [],
      result: null,
      selectedFavoriteId: "",
      selectedProductId: previousReverse.selectedProductId || state.selectedProductId,
      secondaryCount: previousReverse.secondaryCount || 3,
      creationStrategy: previousReverse.creationStrategy || "rewrite",
      notes: previousReverse.notes || "",
      status: "uploaded",
      error: "",
    });
    view = "reverse";
    finishPending("reverse-upload");
    toast("参考视频已上传。");
  } catch (error) {
    state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
    state.reverseVideo.status = "error";
    state.reverseVideo.error = error.message;
    finishPending("reverse-upload");
    toast(`上传失败：${error.message}`);
  }
}

async function testConnection(connectionKey) {
  try {
    if (!connectionKey || !state.integrations[connectionKey]) {
      throw new Error("未知的连接配置");
    }
    const config = Object.assign({ kind: connectionKey }, state.integrations[connectionKey]);
    const response = await fetch("/api/provider/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const result = await response.json();
    state.connectionTests = state.connectionTests || {};
    state.connectionTests[connectionKey] = {
      ok: Boolean(response.ok && result.ok),
      message: result.message || "",
      error: result.error || "",
      checkedAt: result.checkedAt || new Date().toISOString(),
      provider: result.provider || config.provider,
    };
    saveState();
    renderShell();
    toast(state.connectionTests[connectionKey].ok ? "连接测试通过。" : `连接测试失败：${state.connectionTests[connectionKey].error || state.connectionTests[connectionKey].message}`);
  } catch (error) {
    state.connectionTests = state.connectionTests || {};
    state.connectionTests[connectionKey] = { ok: false, error: error.message, checkedAt: new Date().toISOString() };
    saveState();
    renderShell();
    toast(`连接测试失败：${error.message}`);
  }
}

async function generateCopiesForTask(task) {
  task.providerRequests = task.providerRequests || {};
  task.providerResponses = task.providerResponses || {};
  task.copyStyle = state.copyStyle || "ugc-real";
  task.providerRequests.copy = Core.buildCopyProviderRequest(state, task, state.selectedPlatforms);
  try {
    task.providerResponses.copy = await callProvider("copy", task.providerRequests.copy);
    const applied = Core.applyCopyProviderResult(task, task.providerResponses.copy);
    if (!applied) {
      Core.generateCopies(task, state.selectedPlatforms, { style: state.copyStyle });
      task.providerResponses.copyFallback = "provider returned no usable copies";
    }
  } catch (error) {
    task.providerResponses.copy = { ok: false, error: error.message };
    Core.generateCopies(task, state.selectedPlatforms, { style: state.copyStyle });
  }
}

function updateContentPlanStream(patch) {
  state.contentPlanStream = Object.assign({
    status: "idle",
    label: "等待生成",
    text: "",
  }, state.contentPlanStream || {}, patch || {});
  saveState();
  renderShell();
}

function updateStoryboardStream(patch) {
  state.storyboardStream = Object.assign({
    status: "idle",
    label: "等待生成",
    text: "",
  }, state.storyboardStream || {}, patch || {});
  saveState();
  renderShell();
}

async function generateContentPlanWithUi(action, options = {}) {
  syncDraftForm();
  const previousTask = latestContentPlanTask();
  const previousText = previousTask ? contentPlanText(previousTask) : "";
  if (!startPending(action)) return;
  try {
    updateContentPlanStream({ status: "streaming", label: "正在请求大模型", text: "正在提交产品想法和产品图...\n" });
    const request = Core.buildContentPlanProviderRequest(state);
    const response = await callProviderStream("content-plan", request, (event) => {
      if (event.type === "start") {
        updateContentPlanStream({ status: "streaming", label: "正在连接上游模型" });
      } else if (event.type === "chunk") {
        const current = state.contentPlanStream || {};
        updateContentPlanStream({
          status: "streaming",
          label: "模型正在返回内容",
          text: `${current.text || ""}${event.text || ""}`,
        });
      } else if (event.type === "done") {
        updateContentPlanStream({ status: "streaming", label: "正在整理结构化结果" });
      }
    });
    const task = Core.applyContentPlanProviderResult(state, request, response);
    if (!task) {
      throw new Error("大模型没有返回可用的 contentPlan，请检查响应 JSON。");
    }
    if (options.keepPrevious && previousText) {
      task.previousContentPlanText = previousText;
    }
    task.contentPlanText = contentPlanText(task);
    if (task.contentPlan) task.contentPlan.rawText = task.contentPlanText;
    state.storyboardStream = { status: "idle", label: "等待生成", text: "" };
    state.selectedTaskId = task.id;
    view = "create";
    const streamedLength = String(state.contentPlanStream?.text || "").length;
    updateContentPlanStream({
      status: "done",
      label: "内容规划已生成",
      text: `已收到模型返回${streamedLength ? `（流式片段约 ${streamedLength} 字符）` : ""}，内容规划已写入下方可编辑中文规划框。`,
      rawText: task.contentPlanText,
    });
    finishPending(action);
    toast(options.keepPrevious ? "内容规划已重新生成，可恢复上一版。" : "内容规划已生成，可以继续生成分镜。");
  } catch (error) {
    updateContentPlanStream({ status: "error", label: "生成失败", text: `${state.contentPlanStream?.text || ""}\n\n错误：${error.message}`.trim() });
    finishPending(action);
    toast(`内容规划生成失败：${error.message}`);
  }
}

async function generateStoryboardFromPlanWithUi(action) {
  syncDraftForm();
  const task = latestContentPlanTask();
  if (!task || !task.contentPlan) {
    toast("请先生成并确认内容规划。");
    return;
  }
  if (!startPending(action)) return;
  try {
    updateStoryboardStream({ status: "streaming", label: "正在请求大模型", text: "正在按当前分镜设置提交内容规划...\n" });
    const request = Core.buildStoryboardFromContentPlanProviderRequest(state, task);
    task.providerRequests = task.providerRequests || {};
    task.providerRequests.storyboard = request;
    const response = await callProviderStream("storyboard", request, (event) => {
      if (event.type === "start") {
        updateStoryboardStream({ status: "streaming", label: "正在连接上游模型" });
      } else if (event.type === "chunk") {
        const current = state.storyboardStream || {};
        updateStoryboardStream({
          status: "streaming",
          label: "模型正在返回分镜",
          text: `${current.text || ""}${event.text || ""}`,
        });
      } else if (event.type === "done") {
        updateStoryboardStream({ status: "streaming", label: "正在整理结构化分镜" });
      }
    });
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.storyboard = response;
    Core.applyStoryboardProviderResult([task], response);
    if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
      throw new Error("大模型没有返回可用的分镜 scenes，请检查响应 JSON。");
    }
    task.storyboardScriptText = storyboardScriptText(task);
    task.status = "storyboard_ready";
    state.selectedTaskId = task.id;
    const streamedLength = String(state.storyboardStream?.text || "").length;
    updateStoryboardStream({
      status: "done",
      label: "分镜脚本已生成",
      text: `已收到模型返回${streamedLength ? `（流式片段约 ${streamedLength} 字符）` : ""}，分镜脚本已写入上方可编辑中文分镜框。`,
      rawText: task.storyboardScriptText,
    });
    finishPending(action);
    saveState();
    renderShell();
    toast(`已生成 ${task.storyboard.length} 镜分镜，可在当前页检查后再进入审核生成视频。`);
  } catch (error) {
    finishPending(action);
    task.status = "content_plan_ready";
    task.reviewNote = error.message;
    updateStoryboardStream({ status: "error", label: "生成失败", text: `${state.storyboardStream?.text || ""}\n\n错误：${error.message}`.trim() });
    saveState();
    renderShell();
    toast(`分镜生成失败：${error.message}`);
  }
}

async function generateVideoForTask(task) {
  if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
    const error = new Error("请先用当前内容规划生成分镜，再生成视频。");
    task.reviewNote = error.message;
    return { ok: false, task, error };
  }
  if (task.status === "rejected") {
    task.video = null;
    task.reviewNote = "";
  }
  Core.simulateVideoGeneration(state, task);
  try {
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.video = await callProvider("video", task.providerRequests.video);
    Core.applyVideoProviderResult(task, task.providerResponses.video);
    return { ok: true, task };
  } catch (error) {
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.video = { ok: false, error: error.message };
    return { ok: false, task, error };
  }
}

async function refreshVideoForTask(task) {
  try {
    task.providerRequests = task.providerRequests || {};
    task.providerResponses = task.providerResponses || {};
    task.providerRequests.videoStatus = Core.buildVideoStatusProviderRequest(state, task);
    task.providerResponses.videoStatus = await callProvider("video", task.providerRequests.videoStatus);
    Core.applyVideoProviderResult(task, task.providerResponses.videoStatus);
    return { ok: true, task };
  } catch (error) {
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.videoStatus = { ok: false, error: error.message };
    return { ok: false, task, error };
  }
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ai-video-workbench-state.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importStateFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result || "{}"));
      if (!Array.isArray(imported.products) || !Array.isArray(imported.favorites) || !Array.isArray(imported.tasks)) {
        throw new Error("导入文件缺少 products/favorites/tasks");
      }
      state = imported;
      view = "dashboard";
      saveState();
      renderShell();
      toast("项目数据已导入。");
    } catch (error) {
      toast(`导入失败：${error.message}`);
    }
  };
  reader.readAsText(file);
}

window.addEventListener("hashchange", () => {
  const nextView = initialView();
  if (nextView !== view) {
    view = nextView;
    renderShell();
  }
});

renderShell();
