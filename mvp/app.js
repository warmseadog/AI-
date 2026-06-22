const Core = window.VideoWorkbenchCore;
const STORE_KEY = "ai-video-workbench-mvp";

let state = loadState();
let view = initialView();
let selectedTaskIds = new Set();
let pendingActions = new Set();
let dashboardFilter = "all";
let dashboardDateRange = "today";
let dashboardCustomStart = "";
let dashboardCustomEnd = "";
let dashboardDetailTaskId = "";
let storyboardEditorOpen = false;
let storyboardEditorSceneIndex = 0;
let copyDetailPlatformId = "";
let lastProfileSave = null;
let favoritesSearch = "";
let favoritesType = "all";
let reviewStatusFilter = "all";
let publishDialog = null;

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

function sameIntegrationProfileTarget(profile, candidate) {
  const profileConfig = profile && profile.config || {};
  const candidateConfig = candidate && candidate.config || candidate || {};
  if (profile && candidate && profile.id && candidate.id && profile.id === candidate.id) return true;
  return Boolean(
    profileConfig.provider &&
    profileConfig.provider === candidateConfig.provider &&
    profileConfig.apiStyle === candidateConfig.apiStyle &&
    profileConfig.model === candidateConfig.model &&
    profileConfig.endpoint === candidateConfig.endpoint
  );
}

function hydrateLocalProfileSecrets(localProfiles, existingProfiles, existingIntegration) {
  return localProfiles.map((profile) => {
    if (!profile || !profile.config || profile.config.apiKey) return profile;
    const savedProfile = existingProfiles.find((candidate) =>
      candidate && candidate.config && candidate.config.apiKey && sameIntegrationProfileTarget(profile, candidate)
    );
    let apiKey = savedProfile && savedProfile.config && savedProfile.config.apiKey || "";
    if (!apiKey && existingIntegration && existingIntegration.apiKey && sameIntegrationProfileTarget(profile, { config: existingIntegration })) {
      apiKey = existingIntegration.apiKey;
    }
    if (!apiKey) return profile;
    return Object.assign({}, profile, {
      config: Object.assign({}, profile.config, { apiKey }),
    });
  });
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
      const hydratedLocalProfiles = hydrateLocalProfileSecrets(localProfiles, existingProfiles, nextState.integrations && nextState.integrations[key]);
      const localIds = new Set(hydratedLocalProfiles.map((profile) => profile.id).filter(Boolean));
      nextState.integrationProfiles[key] = hydratedLocalProfiles.concat(existingProfiles.filter((profile) => !localIds.has(profile.id)));
    });
  }
  if (localConfig.activeIntegrationProfileIds && typeof localConfig.activeIntegrationProfileIds === "object") {
    nextState.activeIntegrationProfileIds = Object.assign({}, nextState.activeIntegrationProfileIds || {}, localConfig.activeIntegrationProfileIds);
  }
  if (Array.isArray(localConfig.selectedPlatforms) && localConfig.selectedPlatforms.length) {
    const valid = new Set(Core.platforms.map((platform) => platform.id));
    nextState.selectedPlatforms = localConfig.selectedPlatforms.filter((id) => valid.has(id));
  }
  const migrated = Core.migrateState(nextState);
  ["llm", "video", "publisher"].forEach((key) => {
    const profileId = migrated.activeIntegrationProfileIds && migrated.activeIntegrationProfileIds[key];
    if (profileId) Core.applyIntegrationProfile(migrated, key, profileId);
  });
  return Core.migrateState(migrated);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

const STREAM_UI_UPDATE_MS = 160;
const streamUiUpdateTimers = {};

function streamLogStatusClass(kind, status) {
  if (status === "error") return "danger";
  if (status === "streaming") return "warning";
  if (kind === "storyboard" && status === "done") return "success";
  return "info";
}

function streamLogText(kind, streamState) {
  const stateForDisplay = streamState || {};
  if (kind === "content-plan" && stateForDisplay.status === "streaming") {
    return "模型正在后台生成内容规划，完成后会继续生成分镜脚本。";
  }
  return stateForDisplay.text || (kind === "storyboard" ? "生成分镜时，这里会显示模型返回过程。" : "生成内容规划时，这里会显示模型返回过程。");
}

function flushStreamUi(kind) {
  if (view !== "create") return;
  const streamState = kind === "storyboard" ? state.storyboardStream : displayContentPlanStreamState(state.contentPlanStream);
  if (!streamState) return;
  const log = document.querySelector(`[data-stream-log="${kind}"]`);
  if (!log) return;
  const status = log.querySelector("[data-stream-status]");
  const text = log.querySelector("[data-stream-text]");
  if (status) {
    status.className = `status ${streamLogStatusClass(kind, streamState.status)}`;
    status.textContent = streamState.label || "等待生成";
  }
  if (text) text.textContent = streamLogText(kind, streamState);
  if (kind === "storyboard" && streamState.status === "streaming") {
    const editor = document.querySelector("[data-storyboard-script-text]");
    if (editor) editor.value = String(streamState.text || "");
  }
}

function scheduleStreamUiUpdate(kind) {
  if (view !== "create") return;
  if (streamUiUpdateTimers[kind]) return;
  streamUiUpdateTimers[kind] = setTimeout(() => {
    streamUiUpdateTimers[kind] = null;
    flushStreamUi(kind);
  }, STREAM_UI_UPDATE_MS);
}

function updateStreamState(kind, stateKey, patch) {
  state[stateKey] = Object.assign({
    status: "idle",
    label: "等待生成",
    text: "",
  }, state[stateKey] || {}, patch || {});
  if (state[stateKey].status === "streaming") {
    scheduleStreamUiUpdate(kind);
    return;
  }
  saveState();
  if (view === "create") renderShell();
}

function safeImageLabel(value, fallback = "本地上传图片") {
  const raw = String(value || "").trim();
  const stem = raw.replace(/\.[^.]+$/, "").trim();
  if (!stem) return fallback;
  const compact = stem.replace(/[\s_.-]+/g, "");
  const looksLikeCameraName = /^(img|image|dsc|pxl|screenshot|screen shot|wechat|wx|微信图片)[\s_.-]*/i.test(stem);
  const hasUuidSegment = /[a-f0-9]{8}[\s_.-]*[a-f0-9]{4}/i.test(stem);
  const hasLongHex = /[a-f0-9]{10,}/i.test(compact);
  const hasLongOpaqueToken = compact.length > 18 && /^[a-z0-9]+$/i.test(compact);
  const isSingleOpaqueToken = compact === stem && compact.length >= 8 && /^[a-z0-9]+$/i.test(compact) && !/[\u3400-\u9fff]/.test(compact);
  if (looksLikeCameraName || hasUuidSegment || hasLongHex || hasLongOpaqueToken || isSingleOpaqueToken) return fallback;
  return stem.slice(0, 18);
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
  const reviewStatuses = new Set(["content_plan_ready", "storyboard_ready", "video_generating", "video_review", "copy_review", "ready_to_publish", "rejected"]);
  return state.tasks.filter((task) => reviewStatuses.has(task.status));
}

function reviewCount(statuses) {
  const accepted = new Set(Array.isArray(statuses) ? statuses : [statuses]);
  return state.tasks.filter((task) => accepted.has(task.status)).length;
}

function reviewFilterOptions() {
  return [
    { id: "all", label: "全部待办", count: reviewQueueTasks().length, statuses: null },
    { id: "videoGenerate", label: "待生成视频", count: reviewCount(["content_plan_ready", "storyboard_ready"]), statuses: ["content_plan_ready", "storyboard_ready"] },
    { id: "videoReview", label: "待视频确认", count: reviewCount(["video_generating", "video_review"]), statuses: ["video_generating", "video_review"] },
    { id: "copyReview", label: "待文案审核", count: reviewCount("copy_review"), statuses: ["copy_review"] },
    { id: "ready", label: "待发布确认", count: reviewCount("ready_to_publish"), statuses: ["ready_to_publish"] },
    { id: "failed", label: "生成失败", count: reviewCount("rejected"), statuses: ["rejected"] },
  ];
}

function activeReviewFilter() {
  return reviewFilterOptions().find((item) => item.id === reviewStatusFilter) || reviewFilterOptions()[0];
}

function reviewTasksForFilter(filter = activeReviewFilter()) {
  const queue = reviewQueueTasks();
  if (!filter.statuses) return queue;
  const statuses = new Set(filter.statuses);
  return queue.filter((task) => statuses.has(task.status));
}

function reviewFilterIdForTask(task) {
  if (!task) return "all";
  if (task.status === "content_plan_ready" || task.status === "storyboard_ready") return "videoGenerate";
  if (task.status === "ready_to_publish") return "ready";
  if (task.status === "copy_review") return "copyReview";
  if (task.status === "video_review" || task.status === "video_generating") return "videoReview";
  if (task.status === "rejected") return "failed";
  return "all";
}

function syncReviewFilterForTask(task) {
  reviewStatusFilter = reviewFilterIdForTask(task);
}

function isTaskArchived(task) {
  return Boolean(task && task.archivedAt);
}

function isCompletedTask(task) {
  return ["published"].includes(task && task.status);
}

function dashboardTaskBlockers(task) {
  const blockers = [];
  const productName = displayText(task && task.productName).trim();
  if (!productName || productName === "产品") blockers.push("缺产品名");
  if (["copy_review", "ready_to_publish"].includes(task && task.status) && isMissingCopyReviewTask(task)) blockers.push("缺文案");
  if (["copy_review", "ready_to_publish", "published"].includes(task && task.status) && !(task && task.video && task.video.url)) blockers.push("缺媒体");
  if (task && task.status === "rejected") blockers.push(displayText(task.reviewNote) || "需要处理失败");
  return blockers;
}

function dashboardTaskStage(task) {
  if (isTaskArchived(task)) return { label: "已归档", detail: "默认隐藏" };
  if (task.status === "content_plan_ready") return { label: "待生成分镜", detail: "内容规划" };
  if (task.status === "storyboard_ready") return { label: "待生成视频", detail: "分镜已就绪" };
  if (task.status === "video_generating") return { label: "视频生成中", detail: "等待查询结果" };
  if (task.status === "video_review") return { label: "待视频审核", detail: "视频结果" };
  if (task.status === "copy_review") return { label: isMissingCopyReviewTask(task) ? "待补文案" : "待文案审核", detail: "TikTok 文案" };
  if (task.status === "ready_to_publish") return { label: "待发布", detail: "账号和内容" };
  if (task.status === "published") return { label: "已发布", detail: "可归档" };
  if (task.status === "rejected") return { label: "失败处理", detail: "需要恢复" };
  return { label: Core.taskStatusLabel(task.status), detail: "任务状态" };
}

function dashboardNextAction(task) {
  if (isTaskArchived(task)) return { label: "恢复", action: "restore-task", primary: false };
  if (task.status === "content_plan_ready") return { label: "生成分镜", view: "create", primary: true };
  if (task.status === "storyboard_ready" || task.status === "rejected") return { label: "生成视频", action: "generate-video", primary: true };
  if (task.status === "video_generating") return { label: "查询结果", action: "refresh-video", primary: true };
  if (task.status === "video_review") return { label: "审核视频", view: "review", primary: true };
  if (task.status === "copy_review") return { label: isMissingCopyReviewTask(task) ? "补文案" : "审核文案", view: "publish", primary: true };
  if (task.status === "ready_to_publish") return { label: "发布/定时", view: "publish", primary: true };
  if (task.status === "published") return { label: "归档", action: "archive-task", primary: false };
  return { label: "查看", view: "review", primary: false };
}

function dashboardTasksForFilterId(filterId, source = dashboardDateScopedTasks()) {
  const tasks = Array.isArray(source) ? source : [];
  if (filterId === "archived") return tasks.filter(isTaskArchived);
  const activeTasks = tasks.filter((task) => !isTaskArchived(task));
  if (filterId === "needsInput") return activeTasks.filter((task) => dashboardTaskBlockers(task).length > 0);
  if (filterId === "videoGenerate") return activeTasks.filter((task) => ["content_plan_ready", "storyboard_ready", "rejected"].includes(task.status));
  if (filterId === "videoReview") return activeTasks.filter((task) => task.status === "video_review" || task.status === "video_generating");
  if (filterId === "copyReview") return activeTasks.filter((task) => task.status === "copy_review");
  if (filterId === "ready") return activeTasks.filter((task) => task.status === "ready_to_publish");
  if (filterId === "completed") return activeTasks.filter(isCompletedTask);
  return activeTasks;
}

function dashboardFilterOptions(source = dashboardDateScopedTasks()) {
  const tasks = Array.isArray(source) ? source : state.tasks;
  return [
    { id: "all", label: "全部任务", count: dashboardTasksForFilterId("all", tasks).length },
    { id: "needsInput", label: "待补信息", count: dashboardTasksForFilterId("needsInput", tasks).length },
    { id: "videoGenerate", label: "待生成视频", count: dashboardTasksForFilterId("videoGenerate", tasks).length },
    { id: "videoReview", label: "待视频审核", count: dashboardTasksForFilterId("videoReview", tasks).length },
    { id: "copyReview", label: "待文案审核", count: dashboardTasksForFilterId("copyReview", tasks).length },
    { id: "ready", label: "待发布", count: dashboardTasksForFilterId("ready", tasks).length },
    { id: "completed", label: "已完成", count: dashboardTasksForFilterId("completed", tasks).length },
    { id: "archived", label: "已归档", count: dashboardTasksForFilterId("archived", tasks).length },
  ];
}

function activeDashboardFilter(source = dashboardDateScopedTasks()) {
  return dashboardFilterOptions(source).find((item) => item.id === dashboardFilter) || dashboardFilterOptions(source)[0];
}

function dashboardDateRangeOptions() {
  return [
    { id: "today", label: "今日" },
    { id: "3d", label: "近 3 天" },
    { id: "7d", label: "近 7 天" },
    { id: "all", label: "全部" },
    { id: "custom", label: "自定义" },
  ];
}

function dateInputValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDateInput(value, endOfDay = false) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  return endOfDay
    ? new Date(year, month - 1, day + 1, 0, 0, 0, 0)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

function dashboardDateBounds(rangeId = dashboardDateRange) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rangeId === "all") return { start: null, end: null };
  if (rangeId === "3d") return { start: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - 2), end: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1) };
  if (rangeId === "7d") return { start: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - 6), end: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1) };
  if (rangeId === "custom") {
    return {
      start: parseLocalDateInput(dashboardCustomStart, false),
      end: parseLocalDateInput(dashboardCustomEnd, true),
    };
  }
  return { start: todayStart, end: new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1) };
}

function dashboardDateRangeLabel() {
  if (dashboardDateRange === "custom") {
    const start = dashboardCustomStart || "不限";
    const end = dashboardCustomEnd || "不限";
    return `自定义 ${start} 至 ${end}`;
  }
  const option = dashboardDateRangeOptions().find((item) => item.id === dashboardDateRange);
  return option ? option.label : "今日";
}

function taskDashboardDate(task) {
  const date = new Date(task.createdAt || task.updatedAt || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dashboardDateScopedTasks(source = state.tasks) {
  const { start, end } = dashboardDateBounds();
  if (!start && !end) return source;
  return source.filter((task) => {
    const date = taskDashboardDate(task);
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date >= end) return false;
    return true;
  });
}

function dashboardTasksForFilter(filter = activeDashboardFilter(), source = dashboardDateScopedTasks()) {
  return dashboardTasksForFilterId(filter.id, source);
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

function shortText(value, maxLength = 84) {
  const text = displayText(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function taskProductName(task) {
  const productName = displayText(task && task.productName).trim();
  return productName || "产品";
}

function taskHookText(task) {
  return displayText(task && task.variation && (task.variation.hook || task.variation.angle)) || displayText(task && task.strategySummary) || displayText(task && task.contentPlan && task.contentPlan.hook);
}

function taskCardTitle(task) {
  const rawTitle = displayText(task && task.title).replace(/\s+/g, " ").trim();
  const productName = taskProductName(task);
  const hook = taskHookText(task);
  if (rawTitle.length <= 90) return rawTitle || productName;
  const composed = [productName !== "产品" ? productName : "", hook].filter(Boolean).join(" · ");
  return shortText(composed || rawTitle, 90);
}

function taskCardSummary(task) {
  return shortText(taskHookText(task) || displayText(task && task.favoriteName) || "未补充摘要", 96);
}

function renderDashboardActionButton(task, action) {
  const className = `button compact ${action.primary ? "primary" : ""}`.trim();
  if (action.view) {
    return `<button class="${className}" data-select-task="${h(task.id)}" data-view="${h(action.view)}">继续处理</button>`;
  }
  return `<button class="${className}" data-action="${h(action.action)}" data-task-id="${h(task.id)}">${h(action.label)}</button>`;
}

function renderDashboardTaskCard(task) {
  const taskTime = taskTimeText(task);
  const stage = dashboardTaskStage(task);
  const nextAction = dashboardNextAction(task);
  const blockers = dashboardTaskBlockers(task);
  const source = displayText(task.favoriteName) || "未使用收藏";
  const strategy = Core.strategyLabel(task.strategy);
  const selected = selectedTaskIds.has(task.id);
  return `
    <article class="dashboard-task-card ${selected ? "selected" : ""} ${isTaskArchived(task) ? "archived" : ""}" data-dashboard-task-card="${h(task.id)}">
      <div class="dashboard-task-check">
        <input type="checkbox" data-batch-task-id="${h(task.id)}" ${selected ? "checked" : ""} />
      </div>
      <div class="dashboard-task-main">
        <div class="dashboard-task-title-row">
          <span class="status ${statusClass(task.status)}">${h(stage.label)}</span>
          <strong title="${h(displayText(task.title))}">${h(taskCardTitle(task))}</strong>
        </div>
        <p class="dashboard-task-summary" title="${h(taskCardSummary(task))}">${h(taskCardSummary(task))}</p>
        <div class="dashboard-task-meta">
          <span>${h(taskProductName(task))}</span>
          <span>${h(source)}</span>
          <span>${h(strategy)}</span>
          <span>${h(task.duration || 15)}s / ${h(task.ratio || "9:16")}</span>
          <span>创建 ${h(taskTime.created)}</span>
          <span>更新 ${h(taskTime.updated)}</span>
        </div>
        <div class="dashboard-task-blockers">
          ${blockers.length ? blockers.map((item) => `<span class="status warning">${h(item)}</span>`).join("") : `<span class="tag">${h(stage.detail)}</span>`}
        </div>
      </div>
      <div class="dashboard-task-next">
        <span>下一步：${h(nextAction.label)}</span>
        <div class="actions">
          ${renderDashboardActionButton(task, nextAction)}
          <button class="button compact" data-action="open-dashboard-task" data-task-id="${h(task.id)}">查看</button>
          ${isTaskArchived(task)
            ? `<button class="button compact" data-action="restore-task" data-task-id="${h(task.id)}">恢复</button>`
            : isCompletedTask(task) ? `<button class="button compact" data-action="archive-task" data-task-id="${h(task.id)}">归档</button>` : ""}
          <button class="button compact danger ghost-danger" data-action="delete-task" data-task-id="${h(task.id)}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderDashboardDetailDrawer(task) {
  if (!task) return "";
  const stage = dashboardTaskStage(task);
  const blockers = dashboardTaskBlockers(task);
  const taskTime = taskTimeText(task);
  const contentPlan = task.contentPlan && typeof task.contentPlan === "object" ? task.contentPlan : {};
  const sellingPoints = listText(contentPlan.keySellingPoints || task.contentBrief?.proofPoints || []);
  return `
    <aside class="dashboard-task-drawer">
      <div class="drawer-head">
        <div>
          <span class="tag">任务详情</span>
          <h2>${h(taskCardTitle(task))}</h2>
        </div>
        <button class="icon-button" data-action="close-dashboard-task" aria-label="关闭任务详情">×</button>
      </div>
      <div class="drawer-section">
        <dl class="detail-list">
          <div><dt>阶段</dt><dd>${h(stage.label)} · ${h(stage.detail)}</dd></div>
          <div><dt>产品</dt><dd>${h(taskProductName(task))}</dd></div>
          <div><dt>来源</dt><dd>${h(displayText(task.favoriteName) || "未使用收藏")}</dd></div>
          <div><dt>生成方式</dt><dd>${h(Core.strategyLabel(task.strategy))}</dd></div>
          <div><dt>时间</dt><dd>创建 ${h(taskTime.created)}；更新 ${h(taskTime.updated)}</dd></div>
          <div><dt>规格</dt><dd>${h(task.duration || 15)}s / ${h(task.ratio || "9:16")} / ${h(task.videoResolution || "720p")}</dd></div>
        </dl>
      </div>
      <div class="drawer-section">
        <h3>下一步</h3>
        <p>${h(dashboardNextAction(task).label)}</p>
        ${blockers.length ? `<div class="dashboard-task-blockers">${blockers.map((item) => `<span class="status warning">${h(item)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="drawer-section">
        <h3>内容摘要</h3>
        <p>${h(taskCardSummary(task))}</p>
        ${sellingPoints ? `<p class="muted">卖点：${h(sellingPoints)}</p>` : ""}
      </div>
      <div class="drawer-section">
        <h3>完整标题</h3>
        <p>${h(displayText(task.title) || "未命名任务")}</p>
      </div>
    </aside>
  `;
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

function finishPending(action, options = {}) {
  pendingActions.delete(action);
  saveState();
  if (options.render !== false) renderShell();
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
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join("、");
  return displayText(value);
}

function copyHashtagText(value) {
  const tags = Array.isArray(value) ? value : String(value || "").split(/[，,\s#]+/).filter(Boolean);
  return tags.map((tag) => tag.startsWith("#") ? tag : `#${tag}`).join(" ");
}

function displayText(value) {
  if (value === undefined || value === null || value === false) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join("、");
  if (typeof value === "object") {
    const preferredKeys = ["text", "title", "value", "content", "label", "name", "caption", "copy"];
    for (const key of preferredKeys) {
      const text = displayText(value[key]);
      if (text) return text;
    }
    return Object.values(value).map(displayText).filter(Boolean).join("、");
  }
  return String(value || "");
}

function selectedPlatformName(platformId) {
  return Core.platforms.find((platform) => platform.id === platformId)?.name || platformId;
}

function selectedCopyGenerationLabel() {
  const selected = state.selectedPlatforms || [];
  if (!selected.length) return "先选择平台";
  if (selected.length === 1) return `生成 ${selectedPlatformName(selected[0])} 文案`;
  return `生成 ${selected.length} 个平台文案`;
}

function selectedPublishPlatformIds() {
  const enabled = new Set((Core.publishPlatforms || Core.platforms).map((platform) => platform.id));
  return (state.selectedPlatforms || []).filter((platformId) => enabled.has(platformId));
}

function missingSelectedCopyPlatformIds(task) {
  if (!task || task.status !== "copy_review") return [];
  return selectedPublishPlatformIds().filter((platformId) => !(task.copies && task.copies[platformId]));
}

function isMissingCopyReviewTask(task) {
  return missingSelectedCopyPlatformIds(task).length > 0;
}

function enabledCopyProgress(task) {
  const platformIds = selectedPublishPlatformIds();
  const activePlatformIds = platformIds.length ? platformIds : (Core.publishPlatforms || Core.platforms).map((platform) => platform.id);
  const copyIds = activePlatformIds.filter((platformId) => task.copies && task.copies[platformId]);
  const total = activePlatformIds.length || copyIds.length;
  const approved = activePlatformIds.filter((platformId) => task.copies && task.copies[platformId]?.approved).length;
  return { approved, total: total || 0, copyIds, activePlatformIds };
}

function setPlatformSelected(platformId, checked) {
  const publishPlatforms = Core.publishPlatforms || Core.platforms;
  if (!publishPlatforms.some((platform) => platform.id === platformId)) {
    toast("当前只支持 TikTok 发布。");
    return false;
  }
  const selected = new Set(state.selectedPlatforms);
  if (checked) {
    selected.add(platformId);
  } else if (selected.size > 1) {
    selected.delete(platformId);
  } else {
    toast("至少保留一个发布平台。");
    return false;
  }
  state.selectedPlatforms = publishPlatforms.map((platform) => platform.id).filter((id) => selected.has(id));
  saveState();
  renderShell();
  return true;
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
  const cameraMotion = [displayText(scene.camera), displayText(scene.motion)].filter(Boolean).join("；");
  const generatedPrompt = [displayText(scene.imagePrompt), displayText(scene.videoPrompt)].filter(Boolean).join(" / ");
  const screenText = displayText(scene.screenText);
  const productFocus = displayText(scene.productFocus);
  const extras = [
    cameraMotion ? ["运镜", cameraMotion] : null,
    displayText(scene.voiceover) ? ["旁白", displayText(scene.voiceover)] : null,
    screenText ? ["屏幕字", screenText] : null,
    productFocus ? ["产品重点", productFocus] : null,
    generatedPrompt ? ["生成提示词", generatedPrompt] : null,
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

function renderOperatorIssue(issue, options = {}) {
  if (!issue || !issue.title) return "";
  const raw = options.showRaw && issue.rawMessage ? `<small title="${h(issue.rawMessage)}">原始信息：${h(issue.rawMessage)}</small>` : "";
  return `
    <div class="operator-issue ${h(issue.category || "unknown")}">
      <strong>${h(issue.title)}</strong>
      <p>${h(issue.reason || "")}</p>
      <em>${h(issue.action || "")}</em>
      ${raw}
    </div>
  `;
}

function taskVideoOperatorIssue(task) {
  if (!task) return null;
  const responses = task.providerResponses || {};
  if (task.status === "rejected") {
    return Core.explainProviderIssue(responses.videoStatus || responses.video || task.reviewNote || task.video || "", { kind: "video", status: task.status });
  }
  if (task.status === "video_generating") {
    return Core.explainProviderIssue(responses.videoStatus || responses.video || task.video || { status: "PENDING" }, { kind: "video", status: task.status });
  }
  return null;
}

function providerIssueInline(value, context = {}) {
  const issue = Core.explainProviderIssue(value, context);
  return [issue.title, issue.action].filter(Boolean).join("：");
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
    ["favorites", "收藏", "favorites"],
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

async function uploadProductImageBlob(blob, filename) {
  if (!isServerMode()) {
    return { url: "", dataUrl: await blobToDataUrl(blob), fileName: filename };
  }
  const response = await fetch(`/api/uploads/image?filename=${encodeURIComponent(filename || "product-image.png")}`, {
    method: "POST",
    headers: { "content-type": blob.type || "image/png" },
    body: blob,
  });
  const data = await response.json();
  if (!response.ok || data.ok === false || !data.upload) {
    throw new Error(data.error || "图片上传失败。");
  }
  return data.upload;
}

async function uploadProductImageFile(file) {
  return uploadProductImageBlob(file, file.name || "product-image.png");
}

function isHttpImageUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isModelVisibleImageError(error) {
  const message = String(error && error.message || error || "");
  return /模型无法接收产品图|模型没有收到产品图|IMGBB_API_KEY|公网|publicUrl|HTTPS 图片/.test(message);
}

function modelVisibleImagePreflightMessage(error) {
  const raw = String(error && error.message || error || "");
  if (/IMGBB_API_KEY/.test(raw)) {
    return "需要先配置 ImgBB 图床：当前产品图只有本地文件，视频模型访问不到。配置 IMGBB_API_KEY 后再生成视频，分镜已保留。";
  }
  return "需要公网产品图：当前产品图只有本地路径或本地上传数据，视频模型无法访问。请先配置 ImgBB/公网图床，或填写公网 HTTPS 图片链接后再生成视频，分镜已保留。";
}

function productHasModelVisibleVideoImage(product) {
  if (!product) return false;
  if (isHttpImageUrl(product.imageUrl)) return true;
  return (Array.isArray(product.images) ? product.images : []).some((image) => {
    if (!image || image.useForVideo === false) return false;
    return isHttpImageUrl(image.publicUrl || image.url);
  });
}

function productImageUploadFilename(image, index) {
  const source = String(image && (image.fileName || image.label || image.url) || "").trim();
  const tail = source.split("/").filter(Boolean).pop() || `product-reference-${index + 1}.png`;
  const label = safeImageLabel(tail, `product-reference-${index + 1}`);
  const extension = /\.[a-z0-9]{2,5}$/i.test(tail) ? tail.match(/\.[a-z0-9]{2,5}$/i)[0] : ".png";
  return `${label}${extension}`;
}

async function ensureProductImagesHostedForVideo(product) {
  if (!product || !isServerMode() || productHasModelVisibleVideoImage(product)) return;
  const images = Array.isArray(product.images) ? product.images : [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    if (!image || image.useForVideo === false || isHttpImageUrl(image.publicUrl || image.url)) continue;
    let blob = null;
    if (image.url) {
      const response = await fetch(image.url);
      if (response.ok) blob = await response.blob();
    } else if (image.dataUrl) {
      const response = await fetch(image.dataUrl);
      blob = await response.blob();
    }
    if (!blob) continue;
    const upload = await uploadProductImageBlob(blob, productImageUploadFilename(image, index));
    if (upload.publicUrl) {
      image.publicUrl = upload.publicUrl;
      image.modelVisible = true;
      image.type = "hosted";
      if (!image.url && upload.url) image.url = upload.url;
      if (!isHttpImageUrl(product.imageUrl)) product.imageUrl = upload.publicUrl;
    }
  }
}

async function uploadLegacyProductImageIfNeeded(product) {
  if (!product || !product.imageData || (Array.isArray(product.images) && product.images.length)) return;
  if (!isServerMode()) return;
  const response = await fetch(product.imageData);
  const blob = await response.blob();
  const label = safeImageLabel(product.imageLabel, "上传产品图");
  const upload = await uploadProductImageBlob(blob, `${label || "product-image"}.png`);
  Core.addProductImage(product, {
    type: upload.publicUrl ? "hosted" : "url",
    url: upload.url,
    publicUrl: upload.publicUrl || "",
    modelVisible: Boolean(upload.modelVisible),
    label,
    role: "主图",
    useForVideo: true,
  });
  product.imageData = "";
  product.imageLabel = "产品图";
}

async function handleProductReferenceImagesUpload(input, files) {
  const imageFiles = (files || []).filter((file) => /^image\//i.test(file.type || "") || /\.(png|jpe?g|webp|gif)$/i.test(file.name || ""));
  if (!imageFiles.length) {
    toast("请选择图片文件。");
    return;
  }
  const productId = input.dataset.productId || state.selectedProductId;
  const product = Core.getById(state.products, productId);
  if (!product) return;
  await uploadLegacyProductImageIfNeeded(product);
  const uploads = await Promise.all(imageFiles.map(uploadProductImageFile));
  uploads.forEach((upload, index) => {
    const file = imageFiles[index];
    Core.addProductImage(product, {
      type: upload.publicUrl ? "hosted" : (upload.url ? "url" : "upload"),
      url: upload.url || "",
      publicUrl: upload.publicUrl || "",
      modelVisible: Boolean(upload.modelVisible),
      dataUrl: upload.dataUrl || "",
      label: safeImageLabel(file.name, "上传产品图"),
      role: productImageFallbackRole(product.images && product.images.length || 0),
      useForVideo: true,
    });
  });
  saveState();
  renderShell();
  toast(`${imageFiles.length} 张产品参考图已保存。`);
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

async function uploadTaskMediaToPublisher(task) {
  if (!isServerMode()) {
    throw new Error("上传 PostEverywhere 媒体需要通过 http://127.0.0.1:4188 打开本地服务。");
  }
  const video = task && task.video || {};
  const sourceUrl = video.localUrl || video.url;
  if (!sourceUrl) {
    throw new Error("当前任务没有可上传的视频。");
  }
  const response = await fetch("/api/publisher/media-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: state.integrations.publisher.endpoint,
      apiKey: state.integrations.publisher.apiKey,
      sourceUrl,
      filename: video.fileName || `${task.id}.mp4`,
      contentType: video.mimeType || "video/mp4",
    }),
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "PostEverywhere 媒体上传失败");
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
    if (finalEvent.upstream.ok === false) {
      throw new Error(finalEvent.error || `provider ${kind} failed`);
    }
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

async function extractGeneratedVideoFrames(task) {
  if (!isServerMode()) {
    throw new Error("抽帧需要先启动本地服务。");
  }
  if (!task.video || !task.video.localUrl) {
    await downloadGeneratedVideo(task);
  }
  const response = await fetch("/api/video/frames", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uploadId: task.id, url: task.video.localUrl, count: 3 }),
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
  const dateScopedTasks = dashboardDateScopedTasks();
  const filterOptions = dashboardFilterOptions(dateScopedTasks);
  const filter = activeDashboardFilter(dateScopedTasks);
  const visibleTasks = dashboardTasksForFilter(filter, dateScopedTasks);
  const selected = selectedTasks(visibleTasks);
  const selectedCount = selected.length;
  const canGenerateCount = selected.filter((task) => ["content_plan_ready", "storyboard_ready", "rejected"].includes(task.status)).length;
  const canRefreshCount = selected.filter((task) => task.status === "video_generating").length;
  const allSelected = visibleTasks.length > 0 && selectedCount === visibleTasks.length;
  const customStart = dashboardCustomStart || dateInputValue();
  const customEnd = dashboardCustomEnd || dateInputValue();
  const detailTask = dashboardDetailTaskId ? state.tasks.find((item) => item.id === dashboardDetailTaskId) : null;
  return `
    <section>
      <div class="section-head">
        <div><h1>视频任务看板</h1><p class="muted">从真实分镜脚本开始，追踪视频生成、审核、文案和发布状态。</p></div>
        <button class="button primary" data-view="create">新建分镜脚本</button>
      </div>
      <div class="dashboard-date-bar" aria-label="任务时间筛选">
        <div class="segmented-control">
          ${dashboardDateRangeOptions().map((item) => `
            <button class="segment ${dashboardDateRange === item.id ? "active" : ""}" data-dashboard-date-range="${item.id}" type="button" aria-pressed="${dashboardDateRange === item.id ? "true" : "false"}">${h(item.label)}</button>
          `).join("")}
        </div>
        <div class="date-inputs">
          <label>开始 <input class="summary-control" type="date" data-dashboard-date-field="start" value="${h(customStart)}" /></label>
          <label>结束 <input class="summary-control" type="date" data-dashboard-date-field="end" value="${h(customEnd)}" /></label>
        </div>
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
            <span class="tag">日期：${h(dashboardDateRangeLabel())}</span>
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
        <div class="dashboard-task-select-row">
          <label><input type="checkbox" data-batch-select-all ${allSelected ? "checked" : ""} ${visibleTasks.length ? "" : "disabled"} /> 全选当前队列</label>
          <span>${visibleTasks.length ? `当前队列 ${visibleTasks.length} 条` : "当前筛选下没有任务"}</span>
        </div>
        <div class="dashboard-task-layout ${detailTask ? "has-detail" : ""}">
          <div class="dashboard-task-board">
            ${visibleTasks.length
              ? visibleTasks.map(renderDashboardTaskCard).join("")
              : `<div class="empty-list"><strong>${state.tasks.length ? "当前筛选下没有任务。" : "还没有任务。"}</strong><p class="muted">${state.tasks.length ? "换一个时间范围或队列查看。" : "先输入视频想法和产品图，生成一条真实分镜脚本。"}</p></div>`}
          </div>
          ${renderDashboardDetailDrawer(detailTask)}
        </div>
      </div>
    </section>
  `;
}

function latestContentPlanTask() {
  const selected = selectedTask();
  if (selected && ["content_plan_ready", "storyboard_ready"].includes(selected.status)) return selected;
  return state.tasks.find((task) => ["storyboard_ready", "content_plan_ready"].includes(task.status)) || selected;
}

function contentPlanSeedSnapshot(task) {
  return String(task && (task.contentBrief?.seed || task.contentPlanSeed || task.seed || "") || "").trim();
}

function currentContentPlanSeed() {
  return String(state.contentBrief?.seed || "").trim();
}

function hasFreshContentPlan(task) {
  return Boolean(task && task.contentPlan && contentPlanSeedSnapshot(task) === currentContentPlanSeed());
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

function contentPlanTextFromPlan(plan) {
  const mainPainPoint = plan.mainPainPoint || (Array.isArray(plan.painPoints) ? plan.painPoints[0] : plan.painPoints);
  const videoThroughline = plan.videoThroughline || plan.strategy || plan.coreMessage;
  const sections = [
    ["核心卖点", planArrayValue((plan.keySellingPoints || []).slice ? plan.keySellingPoints.slice(0, 3) : plan.keySellingPoints)],
    ["主痛点", mainPainPoint],
    ["视频主线", videoThroughline],
    ["必须出现的画面", planArrayValue(plan.mustShow)],
    ["禁止偏离", planArrayValue(plan.mustAvoid)],
  ].filter(([, value]) => String(value || "").trim());
  return sections.map(([label, value]) => `# ${label}\n${readablePlanValue(value)}`).join("\n\n");
}

function contentPlanText(task) {
  if (!task || !task.contentPlan) return "";
  const savedText = String(task.contentPlanText || "").trim();
  if (savedText && !savedText.includes("[object Object]")) return savedText;
  return contentPlanTextFromPlan(task.contentPlan);
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
  const text = streamLogText("content-plan", stateForDisplay);
  const statusClass = stateForDisplay.status === "error" ? "danger" : stateForDisplay.status === "streaming" ? "warning" : "info";
  return `
    <div class="content-plan-generation-log" data-stream-log="content-plan" aria-live="polite">
      <div class="stream-head">
        <strong>生成状态</strong>
        <span class="status ${statusClass}" data-stream-status>${h(label)}</span>
      </div>
      <pre data-stream-text>${h(text)}</pre>
    </div>
  `;
}

function renderStoryboardGenerationLog(streamState) {
  const stateForDisplay = streamState || {};
  const label = stateForDisplay.label || "等待生成";
  const text = stateForDisplay.text || "生成分镜时，这里会显示模型返回过程。";
  const statusClass = stateForDisplay.status === "error" ? "danger" : stateForDisplay.status === "streaming" ? "warning" : stateForDisplay.status === "done" ? "success" : "info";
  return `
    <div class="content-plan-generation-log storyboard-generation-log" data-stream-log="storyboard" aria-live="polite">
      <div class="stream-head">
        <strong>分镜生成状态</strong>
        <span class="status ${statusClass}" data-stream-status>${h(label)}</span>
      </div>
      <pre data-stream-text>${h(text)}</pre>
    </div>
  `;
}

function renderStoryboardScriptEditor(task, streamState, actionsHtml = "") {
  const stateForDisplay = streamState || {};
  const isStreaming = stateForDisplay.status === "streaming";
  const scriptText = isStreaming
    ? String(stateForDisplay.text || "")
    : String(stateForDisplay.rawText || "") || storyboardScriptDraftText(task);
  if (!task) {
    return `
      <div class="content-plan-editor content-plan-big-editor storyboard-script-editor empty-inline">
        <div class="editor-head">
          <div class="editor-title-block">
            <strong>等待分镜脚本</strong>
            <p class="muted">输入视频想法和产品图后，点击生成分镜脚本。</p>
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
      <textarea rows="24" data-storyboard-script-task-id="${h(task.id)}" data-storyboard-script-text placeholder="点击“生成分镜脚本”后，模型流式返回的分镜脚本会出现在这里。">${h(scriptText)}</textarea>
      ${renderStoryboardGenerationLog(streamState)}
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
        ${option("6:detailed", "6 镜 · 细致")}
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
  const resolution = ["480p", "720p", "1080p"].includes(String(contentBrief.videoResolution || "").toLowerCase())
    ? String(contentBrief.videoResolution).toLowerCase()
    : "720p";
  const countOption = (count) => `<option value="${count}" ${batchCount === count ? "selected" : ""}>${count} 条</option>`;
  const resolutionOption = (value, label) => `<option value="${value}" ${resolution === value ? "selected" : ""}>${label}</option>`;
  return `
    <label class="storyboard-inline-settings">
      <span>生成数量</span>
      <select data-field="contentBrief.videoBatchCount">
        ${Array.from({ length: 10 }, (_, index) => index + 1).map(countOption).join("")}
      </select>
    </label>
    <label class="storyboard-inline-settings">
      <span>清晰度</span>
      <select data-field="contentBrief.videoResolution">
        ${resolutionOption("480p", "480p")}
        ${resolutionOption("720p", "720p")}
        ${resolutionOption("1080p", "1080p")}
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

function renderProductImageRoleOptions(value) {
  return Core.productImageRoles.map((role) => `<option value="${h(role)}" ${role === value ? "selected" : ""}>${h(role)}</option>`).join("");
}

function productImageFallbackRole(index) {
  return Core.productImageRoles[Math.min(index, Core.productImageRoles.length - 1)] || "细节";
}

function renderProductReferenceGroup(product, options = {}) {
  const productId = product && product.id || "";
  const images = Array.isArray(product && product.images) ? product.images : [];
  const materials = Core.productMaterials(product || {});
  const videoMaterials = Core.videoProductMaterials(product || {});
  const hasMaterials = Boolean(materials.length);
  const title = options.title || "产品参考图组";
  const guidance = Core.productImageRoles.map((role) => `
    <span class="reference-role-chip">
      <strong>${h(role)}</strong>
      <em>${h(Core.productImageRolePurposes[role] || "")}</em>
    </span>
  `).join("");
  const rows = images.map((image) => {
    const preview = image.dataUrl || image.url
      ? `<img src="${h(image.dataUrl || image.url)}" alt="${h(image.label || image.role || "产品参考图")}" />`
      : `<span>${h(image.role || "图")}</span>`;
    return `
      <div class="reference-image-row">
        <div class="reference-image-thumb">${preview}</div>
        <div class="reference-image-main">
          <input class="reference-label-input" data-product-image-field="label" data-product-id="${h(productId)}" data-product-image-id="${h(image.id)}" value="${h(image.label || "")}" aria-label="产品参考图名称" />
          <div class="reference-image-controls">
            <label>
              <span>角色</span>
              <select data-product-image-field="role" data-product-id="${h(productId)}" data-product-image-id="${h(image.id)}">
                ${renderProductImageRoleOptions(image.role || "细节")}
              </select>
            </label>
            <label class="reference-checkbox">
              <input type="checkbox" data-product-image-field="useForVideo" data-product-id="${h(productId)}" data-product-image-id="${h(image.id)}" ${image.useForVideo === false ? "" : "checked"} />
              <span>参与视频</span>
            </label>
          </div>
          <p class="reference-purpose">${h(Core.productImageRolePurposes[image.role] || "用于补充产品视觉参考。")}</p>
        </div>
        <button class="button icon-button" data-action="remove-product-reference-image" data-product-id="${h(productId)}" data-product-image-id="${h(image.id)}" title="移除参考图">×</button>
      </div>
    `;
  }).join("");
  const legacyRows = !images.length && hasMaterials
    ? materials.map((material) => {
        const preview = material.dataUrl || material.url
          ? `<img src="${h(material.dataUrl || material.url)}" alt="${h(material.label || "产品参考图")}" />`
          : `<span>${h(material.role || "图")}</span>`;
        return `
          <div class="reference-image-row reference-legacy-row">
            <div class="reference-image-thumb">${preview}</div>
            <div class="reference-image-main">
              <strong>${h(material.label || "单图主图")}</strong>
              <span class="muted">${h(material.role || "主图")} · 参与视频</span>
            </div>
          </div>
        `;
      }).join("")
    : "";
  return `
    <div class="product-reference-group">
      <div class="reference-group-head">
        <div>
          <strong>${h(title)}</strong><span class="muted"> ${hasMaterials ? `${materials.length} 张 · ${videoMaterials.length || 0} 参与视频` : "一张也可开始"}</span>
          <p class="reference-guidance-copy">推荐 5-7 张产品图：主图、正面、侧面、背面、45 度、细节、场景图；主图锁定整体外观，场景图只参考环境。</p>
        </div>
        <span class="status ${hasMaterials ? "success" : "danger"}">${hasMaterials ? "图片已就绪" : "缺少图片"}</span>
      </div>
      <div class="reference-role-guide">${guidance}</div>
      <div class="reference-actions">
        <label class="button">
          上传参考图
          <input type="file" accept="image/*" data-file="product-reference-images" data-product-id="${h(productId)}" multiple hidden />
        </label>
        <input type="file" accept="image/*" data-file="product-image" data-product-id="${h(productId)}" hidden />
        <button class="button" data-action="clear-product-image" data-product-id="${h(productId)}">清空上传图</button>
      </div>
      <div class="reference-image-list">
        ${rows || legacyRows || `<div class="reference-empty">上传主图即可进入流程；推荐补齐正面、侧面、背面、45 度、细节和场景图。</div>`}
      </div>
    </div>
  `;
}

function renderCreate() {
  const product = Core.getById(state.products, state.selectedProductId);
  const contentBrief = state.contentBrief || { seed: "", text: "" };
  const productMaterials = Core.productMaterials(product);
  const hasProductMaterials = Boolean(productMaterials.length);
  const latestPlan = latestContentPlanTask();
  const storyboardStream = state.storyboardStream || {};
  const hasStoryboard = Boolean(latestPlan && (Array.isArray(latestPlan.storyboard) && latestPlan.storyboard.length || String(storyboardScriptDraftText(latestPlan)).trim()));
  const storyboardActions = `
    <div class="editor-actions storyboard-editor-actions">
      ${renderStoryboardPresetSelect(contentBrief)}
      <button class="button" data-action="generate-storyboard-script" ${pendingAttr("generate-storyboard-script")}>${pendingLabel("generate-storyboard-script", "生成分镜脚本", "生成分镜中")}</button>
      ${renderVideoBatchControls(contentBrief)}
      <button class="button primary" data-action="enter-review-video" ${hasStoryboard ? "" : "disabled"}>进入审核生成视频</button>
    </div>
  `;
  return `
    <section class="create-screen">
      <div class="section-head">
        <div><h1>新建分镜脚本</h1><p class="muted">输入一个视频想法和产品图，直接生成可编辑分镜脚本。</p></div>
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
                <label>视频想法</label>
                <textarea data-field="contentBrief.seed" rows="4" placeholder="例如：我想在 TikTok 美国地区售卖一款挂脖风扇，主打夏天通勤、户外排队和露营降温。">${h(contentBrief.seed || "")}</textarea>
              </div>
            </div>
          </div>

          <div class="panel product-panel">
            <div class="panel-head"><h2>产品图</h2><div class="actions"><span class="status ${hasProductMaterials ? "success" : "danger"}">${hasProductMaterials ? "图片已就绪" : "缺少图片"}</span><span class="status info">草稿自动保存</span></div></div>
            <div class="panel-body">
              <div class="product-image-simplified">
                <div class="field full"><label>图片 URL</label><input data-field="product.imageUrl" value="${h(product.imageUrl || "")}" placeholder="https://... 可填写公网图片地址" /></div>
                ${renderProductReferenceGroup(product)}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>分镜脚本</h2><span class="tag">真实返回</span></div>
            <div class="panel-body stack">
              ${renderStoryboardScriptEditor(latestPlan, storyboardStream, storyboardActions)}
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
          </div>
        </div>
        <textarea rows="18" data-reverse-script-text disabled placeholder="反推完成后会生成一整段中文脚本。"></textarea>
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
  return `
    <section class="reverse-screen stack">
      <div class="section-head">
        <div><h1>视频反推分镜</h1></div>
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
            ${upload ? `<video class="reverse-video-player" controls playsinline preload="metadata" src="${h(upload.url)}"></video>` : `
              <label class="reverse-uploader">
                <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" data-file="reverse-video" hidden />
                <strong>上传参考视频</strong>
              </label>
            `}
            <div class="field">
              <label>反推备注</label>
              <textarea data-field="reverseVideo.notes" rows="4" placeholder="例如：保留原视频节奏，后续替换成我的产品；重点拆开头钩子和转化收尾。">${h(reverse.notes || "")}</textarea>
            </div>
          </div>
        </div>

        <aside class="panel">
          <div class="panel-head"><h2>二创设置</h2></div>
          <div class="panel-body stack">
            <div class="settings-summary">
              <div>
                <span>二创产品</span>
                <select class="summary-control" data-field="reverseVideo.selectedProductId">
                  ${state.products.map((product) => `<option value="${h(product.id)}" ${product.id === (selectedProduct && selectedProduct.id) ? "selected" : ""}>${h(product.name || "产品")}</option>`).join("")}
                </select>
              </div>
              <div>
                <span>图片 URL</span>
                <input class="summary-control" data-product-field="imageUrl" data-product-id="${h(selectedProduct && selectedProduct.id || "")}" value="${h(selectedProduct && selectedProduct.imageUrl || "")}" placeholder="https://..." />
              </div>
              <div class="settings-summary-full">
                ${renderProductReferenceGroup(selectedProduct, { title: "产品参考图组" })}
              </div>
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
          <div><h2>反推结果</h2></div>
        </div>
        <div class="panel-body">
          ${renderReverseSceneRows(result)}
        </div>
      </div>
    </section>
  `;
}

function favoriteExcerpt(favorite, max = 180) {
  const text = String(favorite && favorite.content || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function favoriteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function favoriteLibraryStats(favorites) {
  const items = Array.isArray(favorites) ? favorites : [];
  const typeCount = (pattern) => items.filter((favorite) => pattern.test(String(favorite.type || ""))).length;
  return {
    total: items.length,
    storyboard: typeCount(/分镜/),
    plan: typeCount(/内容|策划|规划/),
    video: typeCount(/视频/),
    reuse: items.reduce((sum, favorite) => sum + favoriteNumber(favorite.reuseCount), 0),
  };
}

function favoriteUseProfile(favorite) {
  const type = String(favorite?.type || "");
  const tags = Array.isArray(favorite?.tags) ? favorite.tags.join(" ") : "";
  const content = String(favorite?.content || "");
  const text = `${type} ${tags} ${content}`;
  if (/视频/.test(type)) {
    return {
      label: "视频任务",
      intent: "适合回看生成结果、复盘素材来源，或作为下一条内容规划的参考。",
      primaryLabel: "带入新建规划",
      secondaryLabel: "查看任务看板",
      secondaryView: "dashboard",
    };
  }
  if (/内容|策划|规划/.test(type)) {
    return {
      label: "内容规划",
      intent: "适合复用受众、卖点、开头和转化逻辑，继续生成新的分镜。",
      primaryLabel: "带入新建规划",
      secondaryLabel: "去生成分镜",
      secondaryView: "create",
    };
  }
  if (/反推|复刻|原片|视频拆解/.test(text)) {
    return {
      label: "反推分镜",
      intent: "适合保留原视频节奏、镜头和转化结构，再替换成当前产品做二创。",
      primaryLabel: "进入反推二创",
      primaryAction: "use-favorite-for-reverse",
      secondaryLabel: "带入新建规划",
      secondaryAction: "use-favorite-for-create",
    };
  }
  return {
    label: "分镜脚本",
    intent: "适合直接复用镜头顺序、口播节奏和画面提示，再进入审核生成视频。",
    primaryLabel: "带入新建规划",
    secondaryLabel: "进入反推二创",
    secondaryAction: "use-favorite-for-reverse",
  };
}

function favoriteReferenceText(favorite) {
  if (!favorite) return "";
  const body = favoriteExcerpt(favorite, 1200);
  return [
    `参考收藏：${favorite.name || "未命名收藏"}`,
    `收藏类型：${favorite.type || "未分类"}`,
    body,
  ].filter(Boolean).join("\n");
}

function favoriteActionButton(favorite, profile, slot = "primary") {
  if (!favorite) return "";
  const action = slot === "secondary" ? profile.secondaryAction : profile.primaryAction;
  const viewTarget = slot === "secondary" ? profile.secondaryView : profile.primaryView;
  const label = slot === "secondary" ? profile.secondaryLabel : profile.primaryLabel;
  const buttonClass = slot === "primary" ? "button primary" : "button";
  if (action) {
    return `<button class="${buttonClass}" data-action="${h(action)}" data-favorite-id="${h(favorite.id)}">${h(label)}</button>`;
  }
  if (viewTarget && viewTarget !== "create") {
    return `<button class="${buttonClass}" data-view="${h(viewTarget)}" data-use-favorite="${h(favorite.id)}">${h(label)}</button>`;
  }
  return `<button class="${buttonClass}" data-action="use-favorite-for-create" data-favorite-id="${h(favorite.id)}" ${viewTarget ? `data-target-view="${h(viewTarget)}"` : ""}>${h(label || "带入新建规划")}</button>`;
}

function renderFavorites() {
  const draft = state.newFavorite || { type: "分镜脚本", name: "", content: "", tags: "" };
  const query = String(favoritesSearch || "").trim().toLowerCase();
  const types = Array.from(new Set(state.favorites.map((favorite) => favorite.type).filter(Boolean)));
  const visibleFavorites = state.favorites.filter((favorite) => {
    const matchesType = favoritesType === "all" || favorite.type === favoritesType;
    const haystack = [
      favorite.name,
      favorite.type,
      favorite.content,
      ...(Array.isArray(favorite.tags) ? favorite.tags : []),
    ].join(" ").toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });
  const stats = favoriteLibraryStats(state.favorites);
  const defaultReusableFavorite = visibleFavorites.find((favorite) => !/视频/.test(String(favorite.type || ""))) || visibleFavorites[0] || null;
  const selectedFavorite = (state.selectedFavoriteId && visibleFavorites.find((favorite) => favorite.id === state.selectedFavoriteId))
    || defaultReusableFavorite
    || state.favorites.find((favorite) => favorite.id === state.selectedFavoriteId)
    || state.favorites[0]
    || null;
  const selectedProfile = favoriteUseProfile(selectedFavorite);
  return `
    <section class="favorite-workbench-screen favorite-library-screen stack">
      <div class="section-head">
        <div><h1>收藏库</h1><p class="muted">把反推分镜、内容规划和视频任务整理成可直接复用的生产资产。</p></div>
        <div class="actions">
          <span class="tag">${visibleFavorites.length}/${state.favorites.length} 条</span>
          <button class="button primary" data-action="use-favorite-for-create" ${selectedFavorite ? `data-favorite-id="${h(selectedFavorite.id)}"` : "disabled"}>带入新建规划</button>
        </div>
      </div>
      <div class="favorite-insight-strip">
        <div><span>全部资产</span><strong>${stats.total}</strong></div>
        <div><span>分镜脚本</span><strong>${stats.storyboard}</strong></div>
        <div><span>内容规划</span><strong>${stats.plan}</strong></div>
        <div><span>视频任务</span><strong>${stats.video}</strong></div>
        <div><span>累计复用</span><strong>${stats.reuse}</strong></div>
      </div>
      <div class="panel favorite-command-bar favorite-library-toolbar">
        <div class="panel-body">
          <div class="form-grid">
            <div class="field">
              <label>搜索</label>
              <input data-favorites-search value="${h(favoritesSearch)}" placeholder="搜索名称、标签、内容" />
            </div>
            <div class="field">
              <label>类型</label>
              <select data-favorites-type>
                <option value="all" ${favoritesType === "all" ? "selected" : ""}>全部类型</option>
                ${types.map((type) => `<option value="${h(type)}" ${favoritesType === type ? "selected" : ""}>${h(type)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="favorite-workbench-layout favorite-library-layout">
        <div class="panel favorite-asset-list-panel">
          <div class="panel-head">
            <div><h2>收藏资产</h2><p class="muted">按用途扫描，先选资产，再决定下一步。</p></div>
            <span class="status info">${h(favoritesType === "all" ? "全部类型" : favoritesType)}</span>
          </div>
          <div class="panel-body">
            ${visibleFavorites.length ? `
              <div class="favorite-asset-list">
                ${visibleFavorites.map(fav => {
                  const profile = favoriteUseProfile(fav);
                  const selected = selectedFavorite && fav.id === selectedFavorite.id;
                  return `
                  <button class="favorite-asset-row ${selected ? "selected" : ""}" data-action="select-favorite" data-favorite-id="${h(fav.id)}" type="button" aria-pressed="${selected ? "true" : "false"}">
                    <div class="favorite-asset-main">
                      <div class="favorite-row-kicker">
                        <span class="tag">${h(profile.label)}</span>
                        <span class="status success">评分 ${h(favoriteNumber(fav.score, 0))}</span>
                        <span class="status info">复用 ${h(favoriteNumber(fav.reuseCount, 0))}</span>
                      </div>
                      <strong>${h(fav.name)}</strong>
                      <p>${h(favoriteExcerpt(fav, 150))}</p>
                    </div>
                    <div class="favorite-asset-side">
                      <span>${h(fav.type || "未分类")}</span>
                      <small>${h((fav.tags || []).slice(0, 3).join(" / ") || "未打标签")}</small>
                    </div>
                  </button>
                `}).join("")}
              </div>
            ` : `
              <div class="empty-inline">
                <strong>还没有收藏内容</strong>
                <p class="muted">你可以在反推分镜、内容规划和视频审核页点击收藏按钮，把好用的脚本保存到这里。</p>
              </div>
            `}
          </div>
        </div>
        <aside class="favorite-usage-panel stack">
          <div class="panel">
            <div class="panel-head">
              <div><h2>资产用法</h2><p class="muted">选中收藏后，直接进入对应生产步骤。</p></div>
              ${selectedFavorite ? `<span class="tag">${h(selectedProfile.label)}</span>` : ""}
            </div>
            <div class="panel-body stack">
              ${selectedFavorite ? `
                <div class="selected-favorite favorite-usage-card">
                  <div><span class="status success">评分 ${h(favoriteNumber(selectedFavorite.score, 0))}</span><span class="status info">复用 ${h(favoriteNumber(selectedFavorite.reuseCount, 0))}</span></div>
                  <h3>${h(selectedFavorite.name)}</h3>
                  <p>${h(selectedProfile.intent)}</p>
                  <div class="favorite-next-actions">
                    <strong>下一步动作</strong>
                    <div class="actions">
                      ${favoriteActionButton(selectedFavorite, selectedProfile, "primary")}
                      ${favoriteActionButton(selectedFavorite, selectedProfile, "secondary")}
                    </div>
                  </div>
                  <div class="favorite-content-brief">
                    <span>内容线索</span>
                    <p>${h(favoriteExcerpt(selectedFavorite, 260))}</p>
                  </div>
                  <div class="chips">${(selectedFavorite.tags || []).map(tag => `<span class="chip">${h(tag)}</span>`).join("")}</div>
                  <div class="actions">
                    <button class="button danger ghost-danger" data-action="unfavorite" data-favorite-id="${h(selectedFavorite.id)}">取消收藏</button>
                  </div>
                </div>
              ` : `
                <div class="empty-inline"><strong>暂无可用收藏</strong><p class="muted">新增或保存收藏后，会在这里给出最合适的下一步。</p></div>
              `}
            </div>
          </div>
          <details class="panel favorite-add-panel">
            <summary>新增收藏</summary>
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
                  <input data-field="newFavorite.name" value="${h(draft.name)}" placeholder="例如：痛点开场模板" />
                </div>
                <div class="field full">
                  <label>内容</label>
                  <textarea data-field="newFavorite.content" rows="5" placeholder="粘贴你认为值得复用的分镜脚本或策划。">${h(draft.content)}</textarea>
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
          </details>
        </aside>
      </div>
    </section>
  `;
}

function renderReview() {
  const allQueue = reviewQueueTasks();
  const activeFilter = activeReviewFilter();
  const queue = reviewTasksForFilter(activeFilter);
  const selectedReviewTask = allQueue.find((item) => item.id === state.selectedTaskId);
  const task = queue.find((item) => item.id === state.selectedTaskId) || selectedReviewTask || queue[0] || null;
  if (!allQueue.length) return emptyState("还没有可审核任务", "先批量生成一组分镜任务。", "create");
  return `
    <section class="review-screen">
      <div class="section-head">
        <div><h1>审核中心</h1><p class="muted">全局审核所有需要人工处理的视频、文案、发布确认和失败任务。</p></div>
        <div class="actions">
          <span class="tag">${allQueue.length} 条待处理</span>
          <button class="button" data-view="dashboard">返回看板</button>
        </div>
      </div>

      <div class="review-stats">
        ${reviewFilterOptions().map((filter) => `
          <button class="stat review-stat-filter ${activeFilter.id === filter.id ? "active" : ""}" data-review-filter="${filter.id}" type="button" aria-pressed="${activeFilter.id === filter.id ? "true" : "false"}">
            <span>${h(filter.label)}</span>
            <strong>${h(filter.count)}</strong>
          </button>
        `).join("")}
      </div>

      <div class="review-center review-triage-board">
        <div class="review-worklist-panel review-queue panel">
          <div class="panel-head">
            <div><h2>审核队列</h2><p class="muted">先看阶段和卡点，再处理行尾主操作。</p></div>
            <span class="tag">${activeFilter.label} · ${queue.length} 条</span>
          </div>
          <div class="panel-body">
            ${queue.length ? `
              <div class="review-worklist">
                <div class="review-worklist-head">
                  <span>阶段</span>
                  <span>任务</span>
                  <span>当前卡点</span>
                  <span>更新</span>
                  <span>主操作</span>
                </div>
                ${queue.map((item) => renderReviewQueueItem(item, task && item.id === task.id)).join("")}
              </div>
            ` : `
              <div class="empty-inline">
                <strong>这个状态下暂无任务</strong>
                <p class="muted">点击上方其它状态卡片切换审核队列。</p>
              </div>
            `}
          </div>
        </div>

        <div class="review-detail">
          ${task ? renderReviewDetail(task) : `
            <div class="panel">
              <div class="panel-body empty-inline">
                <strong>请选择其它状态</strong>
                <p class="muted">当前筛选没有可审核任务。</p>
              </div>
            </div>
          `}
        </div>
      </div>
    </section>
  `;
}

function renderReviewQueueItem(task, active) {
  const copyProgress = enabledCopyProgress(task);
  const missingCopy = isMissingCopyReviewTask(task);
  const canApprove = task.video && task.status === "video_review";
  const isGenerating = task.status === "video_generating";
  const isFailed = task.status === "rejected";
  const decision = reviewDecisionModel(task, canApprove, isGenerating, isFailed);
  const stage = reviewQueueStage(task, missingCopy);
  const note = task.status === "rejected"
    ? task.reviewNote || task.video?.providerMessage || "需要重新生成视频"
    : task.status === "copy_review"
      ? missingCopy ? "文案已被移除，需要重新生成" : `${copyProgress.approved}/${copyProgress.total || state.selectedPlatforms.length} 平台文案已审核`
      : task.status === "ready_to_publish"
        ? "文案已审核，等待发布确认"
        : task.status === "content_plan_ready" || task.status === "storyboard_ready"
          ? "分镜已就绪，下一步生成视频"
          : task.video?.url ? "视频已生成，等待人工确认" : "等待视频结果";
  return `
    <article class="review-worklist-row review-task-card ${active ? "active" : ""}">
      <button class="review-worklist-select" data-select-task="${task.id}" data-view="review">
        <span class="review-stage-cell">
          <strong>${h(stage.label)}</strong>
          <small>${h(stage.detail)}</small>
        </span>
        <span class="review-title-cell">
          <strong title="${h(task.title)}">${h(task.title)}</strong>
          <small>${h(task.productName)} · ${h(task.favoriteName || "未使用收藏")}</small>
        </span>
        <span class="review-blocker-cell">
          <em>${h(decision.title)}</em>
          <small>${h(note)}</small>
        </span>
        <span class="review-updated-cell">${h(formatTaskDate(task.updatedAt || task.createdAt))}</span>
      </button>
      <div class="review-row-actions">
        ${reviewQueueActionButton(decision.primary, task)}
        <button class="icon-button review-task-delete" data-action="delete-task" data-task-id="${task.id}" title="删除任务" aria-label="删除任务 ${h(task.title)}">×</button>
      </div>
    </article>
  `;
}

function reviewQueueStage(task, missingCopy = false) {
  if (task.status === "rejected") return { label: "生成失败", detail: "需要处理异常" };
  if (task.status === "video_generating") return { label: "视频生成中", detail: "等待结果" };
  if (task.status === "video_review") return { label: "待视频确认", detail: "看完再通过" };
  if (task.status === "copy_review") return { label: missingCopy ? "待补文案" : "待文案审核", detail: "TikTok 文案" };
  if (task.status === "ready_to_publish") return { label: "待发布确认", detail: "账号和内容" };
  if (task.status === "published") return { label: "已发布", detail: "流程完成" };
  return { label: "待生成视频", detail: "内容规划已生成" };
}

function reviewQueueActionButton(action, task) {
  const className = `button compact review-primary-action ${action.primary ? "primary" : ""}`.replace(/\s+/g, " ").trim();
  if (action.view) {
    return `<button class="${className}" data-select-task="${h(task.id)}" data-view="${h(action.view)}">${h(action.label)}</button>`;
  }
  const pendingKey = action.pendingKey || action.action;
  const label = action.pendingText ? pendingLabel(pendingKey, action.label, action.pendingText) : h(action.label);
  return `<button class="${className}" data-action="${h(action.action)}" data-task-id="${h(task.id)}" ${pendingAttr(pendingKey, action.disabled)}>${label}</button>`;
}

function reviewPublishSummary(task) {
  const platformIds = selectedPublishPlatformIds();
  const readiness = publishReadiness(task, platformIds);
  const platformNames = readiness.activeIds.map(selectedPlatformName).join("、") || "未选择平台";
  let label = "文案待生成";
  let statusType = "warning";
  if (readiness.published) {
    label = "已发布";
    statusType = "success";
  } else if (readiness.ready) {
    label = "文案已通过，待发布确认";
    statusType = "info";
  } else if (readiness.pending.length) {
    label = "文案待审核";
    statusType = "warning";
  } else if (readiness.missing.length) {
    label = "文案缺失";
    statusType = "warning";
  }
  return {
    label,
    statusType,
    platformNames,
    readiness,
    updated: task.updatedAt || task.createdAt,
  };
}

function reviewStepState(step, task) {
  if (step === "video") {
    if (["copy_review", "ready_to_publish", "published"].includes(task.status)) return "done";
    if (["video_review", "video_generating", "rejected"].includes(task.status)) return "current";
    return "pending";
  }
  if (step === "copy") {
    if (["ready_to_publish", "published"].includes(task.status)) return "done";
    if (task.status === "copy_review") return "current";
    return "pending";
  }
  if (step === "publish") {
    if (task.status === "published") return "done";
    if (task.status === "ready_to_publish") return "current";
    return "pending";
  }
  return "pending";
}

function reviewActionButton(action) {
  const className = `button ${action.primary ? "primary" : action.danger ? "danger subtle" : ""} wide`.replace(/\s+/g, " ").trim();
  if (action.view) return `<button class="${className}" data-view="${h(action.view)}">${h(action.label)}</button>`;
  const pendingKey = action.pendingKey || action.action;
  const label = action.pendingText ? pendingLabel(pendingKey, action.label, action.pendingText) : h(action.label);
  return `<button class="${className}" data-action="${h(action.action)}" ${pendingAttr(pendingKey, action.disabled)}>${label}</button>`;
}

function reviewDecisionModel(task, canApprove, isGenerating, isFailed) {
  const summary = reviewPublishSummary(task);
  const copyCountText = `${summary.readiness.approved}/${summary.readiness.total} 已通过`;
  if (task.status === "rejected" || isFailed) {
    return {
      badge: ["danger", "生成失败"],
      title: "重新生成视频",
      description: task.reviewNote || task.video?.providerMessage || "视频没有生成成功。先重新生成或检查 provider 返回，再继续审核。",
      primary: { label: "重新生成视频", action: "generate-video", primary: true, pendingText: "生成中", disabled: task.video && !isFailed },
      secondary: { label: "查询视频结果", action: "refresh-video", pendingText: "查询中", disabled: !isGenerating },
      summary,
      copyCountText,
    };
  }
  if (task.status === "video_generating") {
    return {
      badge: ["info", "视频生成中"],
      title: "等待视频结果",
      description: "视频任务已提交。查询到可播放视频后，再进入人工审核。",
      primary: { label: "查询视频结果", action: "refresh-video", primary: true, pendingText: "查询中", disabled: false },
      secondary: { label: "生成视频", action: "generate-video", pendingText: "生成中", disabled: true },
      summary,
      copyCountText,
    };
  }
  if (task.status === "video_review") {
    return {
      badge: ["warning", "待视频审核"],
      title: "先确认视频能用",
      description: "看完视频后点击通过，系统会进入平台文案生成与审核。",
      primary: { label: "通过并生成文案", action: "approve-video", primary: true, pendingText: "生成文案中", disabled: !canApprove },
      secondary: { label: "查询视频结果", action: "refresh-video", pendingText: "查询中", disabled: !isGenerating },
      summary,
      copyCountText,
    };
  }
  if (task.status === "ready_to_publish") {
    return {
      badge: ["info", "待发布确认"],
      title: "最后确认发布",
      description: "视频和文案都已通过。进入发布页检查账号、发布时间和最终提交内容。",
      primary: { label: "去发布确认", view: "publish", primary: true },
      secondary: { label: "刷新审核状态", action: "refresh-review-status" },
      summary,
      copyCountText,
    };
  }
  if (task.status === "published") {
    return {
      badge: ["success", "已发布"],
      title: "流程已完成",
      description: "这个任务已经发布完成，可以在发布页查看发布结果和返回链接。",
      primary: { label: "查看发布结果", view: "publish", primary: true },
      secondary: { label: "返回看板", view: "dashboard" },
      summary,
      copyCountText,
    };
  }
  if (isMissingCopyReviewTask(task)) {
    return {
      badge: ["warning", "待补文案"],
      title: "补齐平台文案",
      description: "文案已被移除，需要重新生成。补齐后再进入文案页审核，通过后才会进入发布确认。",
      primary: { label: "重新生成文案", action: "recover-missing-copies", primary: true, pendingText: "生成中" },
      secondary: { label: "查看文案页", view: "publish" },
      tertiary: { label: "删除此任务", action: "delete-current-task", danger: true },
      summary,
      copyCountText,
    };
  }
  if (task.status === "copy_review") {
    return {
      badge: ["warning", "文案待审核"],
      title: "审核 TikTok 文案",
      description: "视频已经通过。去文案页检查标题、正文和 CTA，文案通过后会自动进入发布确认。",
      primary: { label: "查看并审核文案", view: "publish", primary: true },
      secondary: { label: "重新生成文案", action: "generate-copies", pendingText: "生成中" },
      summary,
      copyCountText,
    };
  }
  return {
    badge: ["warning", Core.taskStatusLabel(task.status)],
    title: "继续完成当前步骤",
    description: "这个任务还没有进入发布闭环。先完成视频审核，再处理文案和发布确认。",
    primary: { label: "生成视频", action: "generate-video", primary: true, pendingText: "生成中" },
    secondary: { label: "刷新审核状态", action: "refresh-review-status" },
    summary,
    copyCountText,
  };
}

function renderReviewDecisionPanel(task, canApprove, isGenerating, isFailed) {
  const decision = reviewDecisionModel(task, canApprove, isGenerating, isFailed);
  const steps = [
    ["video", "视频确认", "视频可播放并已留档"],
    ["copy", "文案审核", "TikTok 文案通过"],
    ["publish", "发布确认", "账号和内容最终确认"],
  ];
  return `
    <div class="review-decision-card review-active-decision">
      <div class="review-decision-head">
        <span class="status ${decision.badge[0]}">${h(decision.badge[1])}</span>
        <h3>${h(decision.title)}</h3>
        <p>${h(decision.description)}</p>
      </div>
      <div class="review-flow">
        ${steps.map(([id, label, note], index) => `
          <div class="review-flow-step ${reviewStepState(id, task)}">
            <span>${index + 1}</span>
            <strong>${h(label)}</strong>
            <small>${h(note)}</small>
          </div>
        `).join("")}
      </div>
      <div class="review-fact-grid">
        <div><span>产品</span><strong>${h(task.productName)}</strong></div>
        <div><span>平台</span><strong>${h(decision.summary.platformNames)}</strong></div>
        <div><span>文案</span><strong>${h(decision.copyCountText)}</strong></div>
        <div><span>更新</span><strong>${h(formatTaskDate(decision.summary.updated))}</strong></div>
      </div>
      <div class="review-decision-actions">
        ${reviewActionButton(decision.primary)}
        ${decision.secondary ? reviewActionButton(decision.secondary) : ""}
        ${decision.tertiary ? reviewActionButton(decision.tertiary) : ""}
      </div>
      <p class="review-decision-note">${h(decision.summary.readiness.message)}</p>
    </div>
  `;
}

function videoQualityReviewStatusLabel(status) {
  return {
    pass: ["success", "通过"],
    warning: ["warning", "需人工确认"],
    fail: ["danger", "不通过"],
  }[status] || ["muted", "未审查"];
}

function renderVideoQualityReviewPanel(task) {
  const review = task.videoQualityReview || null;
  const [statusClassName, statusLabel] = videoQualityReviewStatusLabel(review && review.status);
  const issues = review && Array.isArray(review.issues) ? review.issues : [];
  const canReview = Boolean(task.video && task.video.url && task.status === "video_review");
  return `
    <div class="panel video-quality-review-panel">
      <div class="panel-head">
        <div>
          <h2>AI 审查结果</h2>
          <p class="muted">GPT-5.5 对比产品图和视频关键帧，给出一致性判断和下次生成建议。</p>
        </div>
        <button class="button compact ${review ? "" : "primary"}" data-action="review-video-quality" ${canReview ? "" : "disabled"}>${review ? "重新审查" : "执行 AI 审查"}</button>
      </div>
      <div class="panel-body">
        ${review ? `
          <div class="review-fact-grid">
            <div><span>审查状态</span><strong><span class="status ${statusClassName}">${h(statusLabel)}</span></strong></div>
            <div><span>一致性分数</span><strong>${h(String(review.score ?? "-"))}</strong></div>
            <div><span>建议重试</span><strong>${review.shouldRetry ? "是" : "否"}</strong></div>
            <div><span>审查时间</span><strong>${h(formatTaskDate(review.reviewedAt))}</strong></div>
          </div>
          ${issues.length ? `<div class="mini-list"><strong>主要问题</strong><ul>${issues.map((issue) => `<li>${h(issue)}</li>`).join("")}</ul></div>` : `<p class="muted">没有记录明显问题。</p>`}
          ${review.suggestion ? `<p><strong>审查建议：</strong>${h(review.suggestion)}</p>` : ""}
          ${review.retryPrompt ? `<p><strong>重试提示词：</strong>${h(review.retryPrompt)}</p>` : ""}
        ` : `
          <p class="muted">视频生成完成后，可以执行一次轻量 AI 审查；系统会抽取关键帧并把结果写回这里。</p>
        `}
      </div>
    </div>
  `;
}

function renderReviewDetail(task) {
  const canApprove = task.video && task.status === "video_review";
  const isGenerating = task.status === "video_generating";
  const isFailed = task.status === "rejected";
  const videoUrl = task.video && task.video.url ? String(task.video.url) : "";
  const canPreviewVideo = /^(https?:|blob:|data:video\/)/.test(videoUrl);
  const localVideoUrl = task.video && task.video.localUrl ? String(task.video.localUrl) : "";
  const localVideoPath = task.video && task.video.localPath ? String(task.video.localPath) : "";
  const videoIssue = taskVideoOperatorIssue(task);
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
                  <div class="video-meta video-storage-status">
                    <span class="video-meta-copy">
                      <strong>${localVideoUrl ? "视频已保存到本地" : "视频已生成，等待审核"}</strong>
                      <span>${localVideoUrl ? "本地文件已可用于审核留档。" : "需要留档时可下载到本地。"}</span>
                    </span>
                    <button class="button compact ghost" data-action="download-video">${localVideoUrl ? "重新下载" : "下载到本地"}</button>
                  </div>
                  ${localVideoPath ? `<p class="video-local-path" title="${h(localVideoPath)}"><span>本地路径</span><code>${h(localVideoPath)}</code></p>` : ""}
                ` : `
                  <div class="video-placeholder">
                    <div class="play">▶</div>
                    <strong>${isFailed ? "视频生成失败" : task.status === "video_generating" ? "视频正在生成" : task.video && task.video.url ? "视频已生成，等待审核" : "还未生成视频"}</strong>
                    ${videoIssue ? renderOperatorIssue(videoIssue, { showRaw: isFailed }) : `<p>${isFailed ? h(task.reviewNote || task.video?.providerMessage || "请检查图片 URL、模型权限和接口参数后重新生成。") : task.status === "video_generating" ? h(`任务 ID：${task.video?.jobId || "等待接口返回"}。点击“查询视频结果”获取真实视频地址。`) : task.video && task.video.url ? h(task.video.url) : "点击右上角生成视频，生成完成后再审核。"}</p>`}
                  </div>
                `}
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div><h2>分镜脚本</h2><p class="muted">按时间顺序检查画面、字幕和产品卖点；生成后仍可人工修改。</p></div>
              <div class="actions"><button class="button" data-action="open-storyboard-editor">编辑分镜</button>${favoriteHeart("storyboard")}</div>
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
            <div class="panel-head"><h2>当前决策</h2></div>
            <div class="panel-body">
              ${renderReviewDecisionPanel(task, canApprove, isGenerating, isFailed)}
            </div>
          </div>
          ${renderVideoQualityReviewPanel(task)}
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

function renderCopyCard(task, platformId, options = {}) {
  const platform = Core.platforms.find((item) => item.id === platformId);
  const platformName = platform?.name || platformId;
  const copy = sanitizedCopy(task.copies[platformId]);
  const selected = state.selectedPlatforms.includes(platformId);
  const publisherResponse = task.providerResponses && task.providerResponses.publisher;
  const hasFailedRealPublish = publisherResponse && publisherResponse.ok === false;
  const result = hasFailedRealPublish ? null : task.publishResults[platformId];
  const warningCount = copy?.complianceWarnings?.length || 0;
  const platformReady = copy?.approved && publishReadiness(task, [platformId]).ready;
  const platformBlocked = copy?.approved && !platformReady;
  const taskIdAttr = options.includeTaskId ? ` data-task-id="${h(task.id)}"` : "";
  const regenerateKey = options.includeTaskId ? `regenerate-copy-${task.id}-${platformId}` : `regenerate-copy-${platformId}`;
  return `<article class="copy-card selectable-copy-card ${selected ? "selected" : ""}" data-platform-card="${platformId}">
    <div class="copy-card-head">
      <div class="actions"><input type="checkbox" data-platform-toggle="${platformId}" aria-label="选择 ${h(platformName)}" ${selected ? "checked" : ""} /><span class="tag">${h(platformName)}</span>${copy ? copy.approved ? `<span class="status success">已审核</span>` : `<span class="status warning">待审核</span>` : `<span class="status muted">未生成</span>`}</div>
      ${warningCount ? `<span class="status warning">合规提醒 ${warningCount}</span>` : ""}
    </div>
    ${copy ? `
      <h3>${h(copy.title)}</h3>
      <p class="copy-hook">${h(copy.hook || "")}</p>
      <p class="muted">${h(copy.body)}</p>
      <p class="muted">${h(copyHashtagText(copy.hashtags))}</p>
      <div class="actions">
        <button class="button" data-action="open-copy-detail"${taskIdAttr} data-platform="${platformId}">查看文案详情</button>
        <button class="button" data-action="regenerate-copy"${taskIdAttr} data-platform="${platformId}" ${pendingAttr(regenerateKey)}>${pendingLabel(regenerateKey, `重新生成 ${platformName} 文案`, "生成中")}</button>
        ${result ? `<a href="${result.url}" target="_blank">${h(result.platformName)} 发布链接</a>` : copy.approved ? `<button class="button primary" data-action="publish-copy"${taskIdAttr} data-platform="${platformId}" ${platformReady ? "" : "disabled"}>发布</button><button class="button" data-action="schedule-copy"${taskIdAttr} data-platform="${platformId}" ${platformBlocked ? "disabled" : ""}>定时</button>` : `<button class="button primary" data-action="approve-copy"${taskIdAttr} data-platform="${platformId}">通过</button>`}
        <button class="button subtle" data-action="delete-copy"${taskIdAttr} data-platform="${platformId}">移除</button>
      </div>
    ` : `
      <h3>${h(platformName)}</h3>
      <p class="muted">点击选择后可批量生成。</p>
      <button class="button" data-action="regenerate-copy"${taskIdAttr} data-platform="${platformId}" ${pendingAttr(regenerateKey)}>${pendingLabel(regenerateKey, `生成 ${platformName} 文案`, "生成中")}</button>
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
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="copy-detail-modal" role="dialog" aria-modal="true" aria-label="文案详情">
        <div class="modal-head">
          <div><h2>文案详情</h2><p class="muted">${h(platform?.name || copyDetailPlatformId)} · 输入时自动保存。</p></div>
          <button class="button" data-action="close-copy-detail">完成</button>
        </div>
        <div class="copy-detail-body compact-copy-detail">
          <div class="copy-detail-primary">
            <div class="field"><label>标题</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="title" value="${h(copy.title || "")}" /></div>
            <div class="field"><label>Hook</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="hook" value="${h(copy.hook || "")}" /></div>
            <div class="field"><label>正文</label><textarea rows="7" data-copy-platform="${copyDetailPlatformId}" data-copy-field="body">${h(copy.body || "")}</textarea></div>
            <div class="form-grid">
              <div class="field"><label>CTA</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="cta" value="${h(copy.cta || "")}" /></div>
              <div class="field"><label>Hashtags</label><input data-copy-platform="${copyDetailPlatformId}" data-copy-field="hashtags" value="${h(copyHashtagText(copy.hashtags))}" /></div>
            </div>
          </div>
          <div class="field translation-reference"><label>中文翻译参考</label><textarea rows="5" data-copy-platform="${copyDetailPlatformId}" data-copy-field="chineseTranslation">${h(copy.chineseTranslation || "")}</textarea></div>
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
  const issue = ok ? null : Core.explainProviderIssue(response, { kind: "publisher" });
  const data = upstream.data || upstream.upstream?.data || response.result || response.results || null;
  const summary = data ? JSON.stringify(redactSecrets(data), null, 2) : "";
  return `
    <div class="publisher-feedback ${ok ? "success" : "danger"}">
      <div>
        <strong>后台发布反馈</strong>
        <span>${ok ? "提交成功" : "提交失败"}${status ? ` · HTTP ${h(status)}` : ""}</span>
      </div>
      ${issue ? renderOperatorIssue(issue, { showRaw: false }) : ""}
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
  const mediaIds = Core.publishMediaIds(state, task, activeIds);
  const missingPublisherAccounts = publisher.mode === "http" && publisher.provider === "posteverywhere" && accountIds.length === 0;
  const missingPublisherMedia = publisher.mode === "http" && publisher.provider === "posteverywhere" && activeIds.includes("tiktok") && mediaIds.length === 0;
  const ready = approved > 0 && !pending.length && !missing.length && !missingPublisherAccounts && !missingPublisherMedia;
  const published = task.status === "published";
  let message = "当前保留的平台文案已通过，可以发布到 PostEverywhere。";
  if (published) {
    message = "已发布。";
  } else if (!copyIds.length) {
    message = "还没有可发布文案。";
  } else if (missing.length) {
    message = `缺少 ${missing.length} 个平台文案。`;
  } else if (pending.length) {
    message = `${pending.length} 个文案待审核。`;
  } else if (missingPublisherAccounts) {
    message = "缺少 PostEverywhere 账号 ID。";
  } else if (missingPublisherMedia) {
    message = "缺少 PostEverywhere 媒体 ID。TikTok 发布必须先上传视频并填写 media_id。";
  }
  return { total, approved, approvedIds, activeIds, missing, pending, missingPublisherAccounts, missingPublisherMedia, ready, published, message };
}

function syncPublishStatus(task) {
  const readiness = publishReadiness(task, state.selectedPlatforms);
  if (task.status !== "published") {
    task.status = readiness.ready ? "ready_to_publish" : "copy_review";
  }
  return readiness;
}

function scheduleTimezoneOptions(active) {
  const options = [
    ["Asia/Shanghai", "中国时间 UTC+8"],
    ["UTC", "UTC"],
    ["America/Los_Angeles", "美国西岸 PT"],
    ["America/Chicago", "美国中部 CT"],
    ["America/New_York", "美国东岸 ET"],
  ];
  return options.map(([value, label]) => `<option value="${h(value)}" ${active === value ? "selected" : ""}>${h(label)}</option>`).join("");
}

function renderPublishScheduler(task, readiness) {
  const mode = state.publishMode || "immediate";
  return `
    <div class="publish-scheduler panel">
      <div class="panel-body">
        <div class="schedule-controls">
          <label>发布方式
            <select data-field="publishMode" aria-label="发布方式">
              <option value="immediate" ${mode === "immediate" ? "selected" : ""}>立即发布</option>
              <option value="scheduled" ${mode === "scheduled" ? "selected" : ""}>定时发布</option>
            </select>
          </label>
          <label>日期
            <input type="date" data-field="scheduleDate" value="${h(state.scheduleDate || "")}" />
          </label>
          <label>时间
            <input type="time" data-field="scheduleTime" value="${h(state.scheduleTime || "")}" />
          </label>
          <label>时区
            <select data-field="scheduleTimezone">${scheduleTimezoneOptions(state.scheduleTimezone || "Asia/Shanghai")}</select>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderScheduledQueue() {
  Core.markDueScheduledPosts(state);
  const posts = (Array.isArray(state.scheduledPosts) ? state.scheduledPosts : [])
    .filter((post) => post && !["cancelled", "published"].includes(post.status));
  if (!posts.length) return "";
  return `
    <div class="scheduled-queue panel">
      <div class="panel-head">
        <h2>定时发布队列</h2>
        <span class="tag">${posts.length} 条</span>
      </div>
      <div class="panel-body">
        <div class="scheduled-post-list">
          ${posts.map((post) => renderScheduledPostRow(post)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderScheduledPostRow(post) {
  const local = Core.scheduledIsoToLocal(post.scheduledAt, post.timezone || "Asia/Shanghai");
  const hosted = post.status === "platform_scheduled";
  const hasPlatformPost = Boolean(post.platformPostId);
  const cancelPendingKey = `cancel-scheduled-post-${post.id}`;
  const canPublish = !hosted && ["scheduled", "due", "failed"].includes(post.status);
  const canEdit = ["scheduled", "due", "failed"].includes(post.status) || (hosted && hasPlatformPost);
  const canCancel = post.status !== "cancelled" && post.status !== "published" && (!hosted || hasPlatformPost);
  const cancelText = hasPlatformPost ? "取消平台定时" : "取消定时";
  return `
    <article class="scheduled-post-row ${post.status}">
      <div class="scheduled-post-main">
        <span class="status ${post.status === "published" ? "success" : post.status === "cancelled" ? "muted" : post.status === "failed" ? "danger" : "info"}">${h(Core.scheduledPostStatusLabel(post.status))}</span>
        <strong>${h(post.copySnapshot?.title || post.taskTitle || "未命名文案")}</strong>
        <span>${h(post.platformName || post.platformId)} · ${h(post.productName || "")}</span>
        <em>${h(post.videoSnapshot?.url || "未记录视频地址")}</em>
        ${hosted && post.platformPostId ? `<small>PostEverywhere ID：${h(post.platformPostId)}</small>` : ""}
      </div>
      <div class="scheduled-post-time">
        <input type="date" data-scheduled-date="${h(post.id)}" value="${h(local.date)}" ${canEdit ? "" : "disabled"} />
        <input type="time" data-scheduled-time="${h(post.id)}" value="${h(local.time)}" ${canEdit ? "" : "disabled"} />
        <select data-scheduled-timezone="${h(post.id)}" ${canEdit ? "" : "disabled"}>${scheduleTimezoneOptions(post.timezone || "Asia/Shanghai")}</select>
      </div>
      <div class="scheduled-post-actions">
        <button class="button subtle" data-action="reschedule-scheduled-post" data-scheduled-post-id="${h(post.id)}" ${canEdit ? "" : "disabled"}>更新时间</button>
        <button class="button subtle" data-action="cancel-scheduled-post" data-scheduled-post-id="${h(post.id)}" ${pendingAttr(cancelPendingKey, !canCancel)}>${pendingLabel(cancelPendingKey, cancelText, "取消中")}</button>
        <button class="button" data-action="publish-scheduled-now" data-scheduled-post-id="${h(post.id)}" ${canPublish ? "" : "disabled"}>立即发布</button>
      </div>
    </article>
  `;
}

function publishMediaIds(task) {
  return Core.publishMediaIds(state, task, state.selectedPlatforms);
}

function publisherFeedbackLine(task) {
  const response = task.providerResponses && task.providerResponses.publisher;
  if (!response) return "未提交";
  const ok = response.ok !== false;
  const upstream = response.upstream || {};
  const status = upstream.status || response.status || "";
  const error = response.error || upstream.error || upstream.data?.error?.message || "";
  if (ok) return status ? `上次提交成功 HTTP ${status}` : "上次提交成功";
  const issue = Core.explainProviderIssue(response, { kind: "publisher" });
  return [status ? `上次提交失败 HTTP ${status}` : "上次提交失败", error, issue.title, issue.action].filter(Boolean).join(" · ");
}

function compactCopyText(copy, max = 110) {
  const text = [copy?.title, copy?.hook, copy?.body].filter(Boolean).join(" / ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function renderPublishQueueRow(task, platformId) {
  const copy = sanitizedCopy(task.copies[platformId]);
  const readiness = publishReadiness(task, [platformId]);
  const platform = Core.platforms.find((item) => item.id === platformId);
  const mediaIds = publishMediaIds(task);
  const published = task.publishResults && task.publishResults[platformId];
  const statusClassName = published ? "success" : readiness.ready ? "success" : readiness.missingPublisherMedia || readiness.pending.length ? "warning" : "muted";
  const copyStatus = copy ? copy.approved ? "文案已通过" : "待文案审核" : "缺文案";
  const mediaStatus = mediaIds.length ? `媒体 ${mediaIds[0]}` : "缺媒体";
  let actions = "";
  if (!copy) {
    actions = `<button class="button compact" data-action="regenerate-copy" data-task-id="${h(task.id)}" data-platform="${platformId}">生成文案</button>`;
  } else if (!copy.approved) {
    actions = `<button class="button compact primary" data-action="approve-copy" data-task-id="${h(task.id)}" data-platform="${platformId}">通过</button>`;
  } else if (readiness.missingPublisherMedia) {
    actions = `<button class="button compact primary" data-action="upload-publisher-media" data-task-id="${h(task.id)}" data-platform="${platformId}" ${pendingAttr(`upload-publisher-media-${task.id}`)}>上传媒体</button>`;
  } else if (published) {
    actions = `<a href="${h(published.url || "#")}" target="_blank">发布链接</a>`;
  } else {
    actions = [
      `<button class="button compact primary" data-action="open-publish-dialog" data-task-id="${h(task.id)}" data-platform="${platformId}">立即发布</button>`,
      `<button class="button compact" data-action="open-schedule-dialog" data-task-id="${h(task.id)}" data-platform="${platformId}">定时发布</button>`,
    ].join("");
  }
  return `
    <article class="publish-queue-row" data-publish-row="${h(task.id)}" data-publish-task-card="${h(task.id)}">
      <div class="publish-row-main">
        <strong>${h(task.title || "未命名视频")}</strong>
        <span>${h(task.productName || "")} · ${h(platform?.name || platformId)}</span>
      </div>
      <div class="publish-row-state">
        <span class="status ${statusClassName}">${h(readiness.ready ? "可发布" : readiness.message)}</span>
        <small>${h(copyStatus)} · ${h(mediaStatus)}</small>
      </div>
      <p class="publish-row-copy">${h(compactCopyText(copy) || "还没有平台文案。")}</p>
      <div class="publish-row-feedback">${h(publisherFeedbackLine(task))}</div>
      <div class="publish-row-actions">
        <button class="button compact" data-action="open-copy-detail" data-task-id="${h(task.id)}" data-platform="${platformId}">查看文案</button>
        <button class="button compact" data-action="regenerate-copy" data-task-id="${h(task.id)}" data-platform="${platformId}" ${pendingAttr(`regenerate-copy-${task.id}-${platformId}`)}>重新生成</button>
        ${actions}
      </div>
    </article>
  `;
}

function renderPublishActionModal() {
  if (!publishDialog) return "";
  const task = Core.getById(state.tasks, publishDialog.taskId);
  const platformId = publishDialog.platformId || "tiktok";
  if (!task || !task.copies || !task.copies[platformId]) return "";
  const copy = sanitizedCopy(task.copies[platformId]);
  const mode = publishDialog.mode || "immediate";
  const mediaIds = publishMediaIds(task);
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="copy-detail-modal publish-action-modal" role="dialog" aria-modal="true" aria-label="${mode === "scheduled" ? "定时发布配置" : "发布确认"}">
        <div class="modal-head">
          <div>
            <h2>${mode === "scheduled" ? "定时发布" : "立即发布"}</h2>
            <p class="muted">${h(task.title || "未命名视频")} · TikTok</p>
          </div>
          <button class="button" data-action="close-publish-dialog">取消</button>
        </div>
        <div class="copy-detail-body compact-copy-detail">
          <div class="publish-dialog-summary">
            <div><span>账号</span><strong>${h(String(state.integrations.publisher.accountIds || "未配置"))}</strong></div>
            <div><span>媒体</span><strong>${h(mediaIds.join(", ") || "未上传")}</strong></div>
            <div><span>文案</span><strong>${copy.approved ? "已通过" : "待审核"}</strong></div>
          </div>
          ${mode === "scheduled" ? `
            <div class="form-grid">
              <div class="field"><label>日期</label><input type="date" data-dialog-field="scheduleDate" value="${h(state.scheduleDate || "")}" /></div>
              <div class="field"><label>时间</label><input type="time" data-dialog-field="scheduleTime" value="${h(state.scheduleTime || "")}" /></div>
              <div class="field"><label>时区</label><select data-dialog-field="scheduleTimezone">${scheduleTimezoneOptions(state.scheduleTimezone || "Asia/Shanghai")}</select></div>
            </div>
          ` : ""}
          <div class="field">
            <label>最终发布文案</label>
            <textarea rows="8" readonly>${h(finalPlatformCopy(copy))}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button primary" data-action="${mode === "scheduled" ? "confirm-schedule-copy" : "confirm-publish-copy"}" data-task-id="${h(task.id)}" data-platform="${platformId}" ${pendingAttr(`${mode === "scheduled" ? "schedule-copy" : "publish-copy"}-${task.id}-${platformId}`)}>${mode === "scheduled" ? "确认定时" : "确认发布"}</button>
        </div>
      </section>
    </div>
  `;
}

function renderPublish() {
  const currentTask = selectedTask();
  const readyTasks = state.tasks.filter((item) => item.status === "ready_to_publish");
  const tasks = readyTasks.length ? readyTasks : (currentTask ? [currentTask] : []);
  if (!tasks.length) return emptyState("还没有可发布任务", "先完成视频审核。", "create");
  const summaryText = readyTasks.length
    ? `${readyTasks.length} 条待发布任务`
    : Core.taskStatusLabel(currentTask.status);
  const readyCount = readyTasks.reduce((count, item) => count + (publishReadiness(item, state.selectedPlatforms).ready ? 1 : 0), 0);
  const cardPlatformIds = (Core.publishPlatforms || Core.platforms).map((platform) => platform.id);
  return `
    <section class="stack">
      <div class="section-head">
        <div><h1>文案与发布</h1><p class="muted">${h(summaryText)}</p></div>
        <div class="actions">
          ${renderCopyStyleSelect()}
          <button class="button subtle" data-action="generate-copies" ${pendingAttr("generate-copies")}>${pendingLabel("generate-copies", selectedCopyGenerationLabel(), "生成中")}</button>
        </div>
      </div>
      <div class="publish-readiness ${readyCount || !readyTasks.length ? "ready" : "blocked"}">
        <div class="publish-readiness-copy">
          <strong>${readyTasks.length ? "待发布队列" : "发布反馈"}</strong>
          <span>${readyTasks.length ? `当前共有 ${readyTasks.length} 条待发布任务，${readyCount} 条配置完整可提交。` : h(publishReadiness(currentTask, state.selectedPlatforms).message)}</span>
        </div>
        <div class="publish-management-actions">
          <em>${readyTasks.length ? `${readyTasks.length} 条任务` : `${publishReadiness(currentTask, state.selectedPlatforms).approved}/${publishReadiness(currentTask, state.selectedPlatforms).total} 平台文案已通过`}</em>
        </div>
      </div>
      ${renderScheduledQueue()}
      <div class="publish-queue-table">
        ${tasks.map((task) => cardPlatformIds.map(platformId => renderPublishQueueRow(task, platformId)).join("")).join("")}
      </div>
      ${renderCopyDetailModal(currentTask)}
      ${renderPublishActionModal()}
    </section>
  `;
}

function renderSettings() {
  const llm = state.integrations.llm;
  const video = state.integrations.video;
  const publisher = state.integrations.publisher;
  return `
    <section class="settings-screen stack">
      <div class="section-head">
        <div><h1>必要配置</h1><p class="muted">常用模型可以一键切换，接口参数仍可直接编辑。</p></div>
        <button class="button primary" data-view="create">返回生成任务</button>
      </div>
      <div class="panel model-switch-console">
        <div class="panel-head">
          <div><h2>模型切换</h2></div>
          <span class="tag">${h([llm.model, video.model].filter(Boolean).join(" / "))}</span>
        </div>
        <div class="model-switch-grid">
          ${renderIntegrationProfilePanel("llm", llm)}
          ${renderIntegrationProfilePanel("video", video)}
        </div>
      </div>
      <div class="settings-config-grid minimal-settings-grid">
        ${renderLlmIntegrationCard(llm)}
        ${renderVideoIntegrationCard(video)}
        ${renderPublisherIntegrationCard(publisher)}
      </div>
    </section>
  `;
}

function renderLlmIntegrationCard(value) {
  return renderIntegrationCard({
    title: "通用大模型",
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
  llm: ["大模型", "例如：DeepSeek、Bailian、OpenRouter Claude"],
  video: ["视频模型", "例如：通义万相、Seedance、可灵"],
  publisher: ["发布配置", "例如：PostEverywhere 主账号"],
};

function renderIntegrationProfilePanel(key, integration) {
  const profiles = state.integrationProfiles && Array.isArray(state.integrationProfiles[key]) ? state.integrationProfiles[key] : [];
  const activeId = state.activeIntegrationProfileIds && state.activeIntegrationProfileIds[key] || "";
  const [title, placeholder] = profileTitles[key] || ["配置", "配置名称"];
  const suggestedName = (profiles.find((profile) => profile.id === activeId) || {}).name || integration.model || providerName(integration.provider || "") || "我的配置";
  const draftField = `${key}ProfileDraftName`;
  const justSaved = lastProfileSave && lastProfileSave.key === key;
  return `
    <section class="model-switch-card">
      <div class="model-switch-card-head">
        <div>
          <h3>${title}</h3>
          <span>${h(integration.model || providerName(integration.provider || "") || "未选择")}</span>
        </div>
        <span class="tag">${profiles.length} 个</span>
      </div>
      ${justSaved ? `<div class="inline-success"><strong>已保存</strong><span>${h(lastProfileSave.name)}</span></div>` : ""}
      <div class="model-profile-list">
        ${profiles.length ? profiles.map((profile) => renderIntegrationProfileItem(key, profile)).join("") : `<div class="empty-profile">还没有配置。填好下方接口信息后，点击保存配置。</div>`}
      </div>
      <div class="model-profile-save">
        <input data-field="${draftField}" value="${h(state[draftField] || suggestedName)}" placeholder="${h(placeholder)}" />
        <button class="button primary" data-action="save-integration-profile" data-profile-key="${key}">${justSaved ? "已保存" : activeId ? "保存当前" : "保存配置"}</button>
      </div>
    </section>
  `;
}

function renderIntegrationProfileItem(key, profile) {
  const active = profile.id === (state.activeIntegrationProfileIds && state.activeIntegrationProfileIds[key]);
  const subtitle = profile.endpoint ? profile.endpoint.replace(/^https?:\/\//, "") : providerName(profile.provider);
  return `
    <div class="model-profile-item ${active ? "active" : ""}">
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
    key: "publisher",
    value,
    providerOptions: [{ id: "posteverywhere", name: "PostEverywhere" }, { id: "custom-publisher", name: "自定义发布接口" }],
    endpointLabel: "发布 Endpoint",
    extraFields: `
      <div class="field">
        <label>PostEverywhere 账号 IDs</label>
        <input data-field="integrations.publisher.accountIds" value="${h(value.accountIds || "")}" placeholder="例如：2280,2282；来自 GET /accounts" />
      </div>
      <div class="field">
        <label>PostEverywhere Media IDs</label>
        <input data-field="integrations.publisher.mediaIds" value="${h(value.mediaIds || "")}" placeholder="例如：media_uuid；TikTok 必须绑定视频 media_id" />
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
          ${(Core.publishPlatforms || Core.platforms).map((platform) => `
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
  const { title, key, value, providerOptions, endpointLabel = "Endpoint", modelLabel = "模型", extraFields = "" } = config;
  const currentProvider = providerOptions.find((provider) => provider.id === value.provider);
  const testResult = state.connectionTests && state.connectionTests[key];
  const testIssue = testResult && !testResult.ok ? Core.explainProviderIssue(testResult, { kind: key }) : null;
  const testWarnings = Array.isArray(testResult && testResult.warnings) ? testResult.warnings.filter(Boolean) : [];
  const testWarningHtml = testWarnings.length ? `<div class="test-warnings">${testWarnings.map((warning) => `<small>${h(warning)}</small>`).join("")}</div>` : "";
  return `
    <div class="panel integration-card compact-integration-card">
      <div class="panel-head">
        <h2>${title}</h2>
      </div>
      <div class="panel-body stack">
        <div class="field">
          <label>Provider</label>
          <select data-field="integrations.${key}.provider" data-provider-group="${key}">
            ${providerOptions.map(provider => `<option value="${provider.id}" ${provider.id === value.provider ? "selected" : ""}>${h(provider.name || provider.id)}</option>`).join("")}
          </select>
        </div>
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
          ${testResult ? `<div class="test-result ${testResult.ok ? "success" : "danger"}"><strong>${testResult.ok ? "连接正常" : "连接失败"}</strong><span>${h(testResult.ok ? (testResult.message || "") : providerIssueInline(testResult, { kind: key }))}</span>${testWarningHtml}${testIssue && testIssue.rawMessage ? `<small>${h(testIssue.rawMessage)}</small>` : ""}</div>` : ""}
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
      if (el.dataset.selectTask) {
        state.selectedTaskId = el.dataset.selectTask;
        if (el.dataset.view === "review") {
          syncReviewFilterForTask(Core.getById(state.tasks, state.selectedTaskId));
        }
      }
      if (el.dataset.useFavorite) {
        state.selectedFavoriteId = el.dataset.useFavorite;
        if (el.dataset.view === "reverse") {
          state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
          state.reverseVideo.selectedFavoriteId = el.dataset.useFavorite;
        }
      }
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

  document.querySelectorAll("[data-dashboard-date-range]").forEach((el) => {
    el.addEventListener("click", () => {
      dashboardDateRange = el.dataset.dashboardDateRange || "today";
      if (dashboardDateRange === "custom") {
        const today = dateInputValue();
        dashboardCustomStart = dashboardCustomStart || today;
        dashboardCustomEnd = dashboardCustomEnd || today;
      }
      selectedTaskIds = new Set();
      renderShell();
    });
  });

  document.querySelectorAll("[data-dashboard-date-field]").forEach((el) => {
    el.addEventListener("change", () => {
      if (el.dataset.dashboardDateField === "start") dashboardCustomStart = el.value;
      if (el.dataset.dashboardDateField === "end") dashboardCustomEnd = el.value;
      dashboardDateRange = "custom";
      selectedTaskIds = new Set();
      renderShell();
    });
  });

  document.querySelectorAll("[data-review-filter]").forEach((el) => {
    el.addEventListener("click", () => {
      reviewStatusFilter = el.dataset.reviewFilter || "all";
      const nextTask = reviewTasksForFilter().find((item) => item.id === state.selectedTaskId) || reviewTasksForFilter()[0];
      if (nextTask) state.selectedTaskId = nextTask.id;
      saveState();
      renderShell();
    });
  });

  document.querySelectorAll("[data-platform-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      const platformId = el.dataset.platformToggle;
      if (!setPlatformSelected(platformId, el.checked)) {
        el.checked = state.selectedPlatforms.includes(platformId);
      }
    });
  });

  document.querySelectorAll("[data-platform-card]").forEach((el) => {
    el.addEventListener("click", (event) => {
      if (event.target.closest("button,a,input,select,textarea,label")) return;
      const platformId = el.dataset.platformCard;
      setPlatformSelected(platformId, !state.selectedPlatforms.includes(platformId));
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

  document.querySelectorAll("[data-favorites-search]").forEach((el) => {
    el.addEventListener("input", () => {
      favoritesSearch = el.value;
      renderShell();
    });
  });

  document.querySelectorAll("[data-favorites-type]").forEach((el) => {
    el.addEventListener("change", () => {
      favoritesType = el.value || "all";
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

  document.querySelectorAll("[data-product-image-field]").forEach((el) => {
    const saveProductImageField = () => {
      const productId = el.dataset.productId || state.selectedProductId;
      const imageId = el.dataset.productImageId;
      if (!imageId) return;
      const product = Core.getById(state.products, productId);
      if (!product) return;
      const value = el.type === "checkbox" ? el.checked : el.value;
      Core.updateProductImage(product, imageId, el.dataset.productImageField, value);
      saveState();
      renderShell();
    };
    el.addEventListener("change", saveProductImageField);
  });

  document.querySelectorAll("[data-file]").forEach((el) => {
    el.addEventListener("change", async () => {
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
      if (el.dataset.file === "product-reference-images") {
        try {
          await handleProductReferenceImagesUpload(el, Array.from(el.files || []));
        } catch (error) {
          toast(`图片读取失败：${error.message}`);
        }
        return;
      }
      uploadProductImageFile(file).then((upload) => {
        const productId = el.dataset.productId || state.selectedProductId;
        const product = Core.getById(state.products, productId);
        if (!product) return;
        Core.addProductImage(product, {
          type: upload.publicUrl ? "hosted" : (upload.url ? "url" : "upload"),
          url: upload.url || "",
          publicUrl: upload.publicUrl || "",
          modelVisible: Boolean(upload.modelVisible),
          dataUrl: upload.dataUrl || "",
          label: safeImageLabel(file.name, "本地上传图片"),
          role: productImageFallbackRole(product.images && product.images.length || 0),
          useForVideo: true,
        });
        if (upload.url) {
          product.imageData = "";
          product.imageLabel = "产品图";
        }
        saveState();
        renderShell();
        toast("产品图已保存到本地浏览器。");
      }).catch((error) => toast(`图片读取失败：${error.message}`));
    });
  });

  document.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => handleAction(el.dataset));
  });
}

async function handleAction(dataset) {
  let { action, platform: platformId, connectionKey, taskId, favoriteId, favoriteSource, profileId, profileKey, direction, productId, scheduledPostId, targetView } = dataset;
  const task = (taskId && Core.getById(state.tasks, taskId)) || selectedTask();
  if (taskId && task) state.selectedTaskId = task.id;
  if (action === "select-favorite") {
    const favorite = Core.getById(state.favorites, favoriteId);
    if (!favorite) {
      toast("收藏不存在或已被删除。");
      return;
    }
    state.selectedFavoriteId = favorite.id;
    saveState();
    renderShell();
    return;
  }
  if (action === "use-favorite-for-create") {
    const favorite = Core.getById(state.favorites, favoriteId || state.selectedFavoriteId);
    if (!favorite) {
      toast("请先选择一个收藏。");
      return;
    }
    state.selectedFavoriteId = favorite.id;
    state.contentBrief = state.contentBrief || {};
    state.contentBrief.seed = favoriteReferenceText(favorite);
    view = targetView || "create";
    storyboardEditorOpen = false;
    copyDetailPlatformId = "";
    saveState();
    renderShell();
    toast("已把收藏带入新建分镜脚本。");
    return;
  }
  if (action === "use-favorite-for-reverse") {
    const favorite = Core.getById(state.favorites, favoriteId || state.selectedFavoriteId);
    if (!favorite) {
      toast("请先选择一个收藏。");
      return;
    }
    state.selectedFavoriteId = favorite.id;
    state.reverseVideo = state.reverseVideo || Core.createInitialState().reverseVideo;
    state.reverseVideo.selectedFavoriteId = favorite.id;
    view = "reverse";
    storyboardEditorOpen = false;
    copyDetailPlatformId = "";
    saveState();
    renderShell();
    toast("已把收藏设为反推二创脚本。");
    return;
  }
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
  if (action === "remove-product-reference-image") {
    const product = Core.getById(state.products, productId || state.selectedProductId);
    Core.removeProductImage(product, dataset.productImageId);
    saveState();
    renderShell();
    toast("已移除产品参考图。");
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
  if (action === "open-dashboard-task") {
    const target = state.tasks.find((item) => item.id === taskId);
    if (!target) {
      toast("任务不存在或已被删除。");
      return;
    }
    dashboardDetailTaskId = target.id;
    state.selectedTaskId = target.id;
    renderShell();
    return;
  }
  if (action === "close-dashboard-task") {
    dashboardDetailTaskId = "";
    renderShell();
    return;
  }
  if (action === "archive-task") {
    const target = state.tasks.find((item) => item.id === taskId);
    if (!target) {
      toast("任务不存在或已被删除。");
      return;
    }
    target.archivedAt = new Date().toISOString();
    target.updatedAt = target.archivedAt;
    selectedTaskIds.delete(target.id);
    if (dashboardDetailTaskId === target.id) dashboardDetailTaskId = "";
    saveState();
    renderShell();
    toast("任务已归档，默认列表不再显示。");
    return;
  }
  if (action === "restore-task") {
    const target = state.tasks.find((item) => item.id === taskId);
    if (!target) {
      toast("任务不存在或已被删除。");
      return;
    }
    delete target.archivedAt;
    target.updatedAt = new Date().toISOString();
    dashboardDetailTaskId = target.id;
    saveState();
    renderShell();
    toast("任务已恢复到看板。");
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
  if (action === "delete-current-task") {
    if (!task) {
      toast("任务不存在或已被删除。");
      return;
    }
    if (!window.confirm(`确认删除任务「${task.title}」？删除后将从本地任务列表移除。`)) return;
    const deletedId = task.id;
    Core.deleteTask(state, deletedId);
    selectedTaskIds.delete(deletedId);
    copyDetailPlatformId = "";
    const nextReviewTask = reviewQueueTasks()[0] || null;
    state.selectedTaskId = nextReviewTask ? nextReviewTask.id : null;
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
  if (action === "generate-storyboard-script") {
    await generateStoryboardScriptWithUi(action);
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
    const videoResolution = ["480p", "720p", "1080p"].includes(String(state.contentBrief?.videoResolution || "").toLowerCase())
      ? String(state.contentBrief.videoResolution).toLowerCase()
      : "720p";
    planTask.videoResolution = videoResolution;
    planTask.contentBrief = Object.assign({}, planTask.contentBrief || {}, { videoResolution });
    if (batchCount > 1 || creationStrategy !== "original") {
      const tasks = Core.createTasksFromContentPlanStoryboard(state, planTask, {
        count: batchCount,
        strategy: creationStrategy,
        videoResolution,
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
      : result.recovered ? "视频提交没有留下可查询任务 ID，已恢复到待生成视频；分镜已保留，可重新提交。"
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
  if (action === "review-video-quality") {
    if (!startPending(action)) return;
    try {
      const review = await reviewVideoQualityForTask(task);
      finishPending(action);
      saveState();
      renderShell();
      toast(`AI 审查完成：${videoQualityReviewStatusLabel(review.status)[1]}，分数 ${review.score}。`);
    } catch (error) {
      task.videoQualityReview = Object.assign({}, task.videoQualityReview || {}, {
        status: "warning",
        score: 0,
        issues: [`审查调用失败：${error.message}`],
        suggestion: "检查 GPT-5.5 是否支持图片输入、API Key 是否可用，并确认视频已下载到本地后重试。",
        retryPrompt: "",
        shouldRetry: false,
        reviewedAt: new Date().toISOString(),
      });
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.videoQualityReview = { ok: false, error: error.message };
      finishPending(action);
      saveState();
      renderShell();
      toast(`AI 审查失败：${error.message}`);
    }
    return;
  }
  if (action === "refresh-review-status") {
    const before = task.status;
    if (["copy_review", "ready_to_publish", "published"].includes(task.status)) {
      syncPublishStatus(task);
      task.updatedAt = new Date().toISOString();
    }
    saveState();
    renderShell();
    toast(before === task.status ? "审核状态已刷新。" : `审核状态已更新为：${Core.taskStatusLabel(task.status)}`);
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
    const hasExistingSelectedCopy = state.selectedPlatforms.some((id) => task.copies && task.copies[id]);
    if (hasExistingSelectedCopy && !window.confirm(`这会重新生成所选平台文案，并覆盖已有内容。继续？`)) return;
    if (!startPending(action)) return;
    await generateCopiesForTask(task);
    finishPending(action);
    toast("平台文案已生成。");
    return;
  }
  if (action === "recover-missing-copies") {
    const missingPlatformIds = missingSelectedCopyPlatformIds(task);
    if (!missingPlatformIds.length) {
      toast("当前任务没有缺失的平台文案。");
      return;
    }
    if (!startPending(action)) return;
    for (const missingPlatformId of missingPlatformIds) {
      await generateCopyForPlatform(task, missingPlatformId);
    }
    finishPending(action);
    toast("缺失的平台文案已重新生成。");
    return;
  }
  if (action === "regenerate-copy") {
    if (!platformId) {
      toast("没有找到要重新生成的平台。");
      return;
    }
    const pendingKey = taskId ? `regenerate-copy-${task.id}-${platformId}` : `regenerate-copy-${platformId}`;
    if (!startPending(pendingKey)) return;
    await generateCopyForPlatform(task, platformId);
    finishPending(pendingKey);
    toast("这条平台文案已重新生成。");
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
  if (action === "open-publish-dialog" || action === "open-schedule-dialog") {
    const readiness = publishReadiness(task, [platformId]);
    if (!readiness.ready) {
      toast(`还不能发布：${readiness.message}`);
      return;
    }
    publishDialog = {
      mode: action === "open-schedule-dialog" ? "scheduled" : "immediate",
      taskId: task.id,
      platformId,
    };
    renderShell();
    return;
  }
  if (action === "close-publish-dialog") {
    publishDialog = null;
    renderShell();
    return;
  }
  if (action === "upload-publisher-media") {
    const pendingKey = `upload-publisher-media-${task.id}`;
    if (!startPending(pendingKey)) return;
    try {
      const result = await uploadTaskMediaToPublisher(task);
      task.video = task.video || {};
      task.video.posteverywhereMediaId = result.mediaId;
      task.video.posteverywhereMedia = result;
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisherMedia = result;
      task.updatedAt = new Date().toISOString();
      syncPublishStatus(task);
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast(`PostEverywhere 媒体已上传：${result.mediaId}`);
    } catch (error) {
      finishPending(pendingKey);
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisherMedia = { ok: false, error: error.message };
      saveState();
      renderShell();
      toast(`媒体上传失败：${error.message}`);
    }
    return;
  }
  if (action === "confirm-schedule-copy") {
    const dateInput = document.querySelector('[data-dialog-field="scheduleDate"]');
    const timeInput = document.querySelector('[data-dialog-field="scheduleTime"]');
    const timezoneInput = document.querySelector('[data-dialog-field="scheduleTimezone"]');
    const dateValue = dateInput && dateInput.value;
    const timeValue = timeInput && timeInput.value;
    if (!dateValue || !timeValue) {
      toast("请先选择日期和时间。");
      return;
    }
    const pendingKey = `schedule-copy-${task.id}-${platformId}`;
    if (!startPending(pendingKey)) return;
    let scheduledPost = null;
    try {
      state.scheduleDate = dateValue;
      state.scheduleTime = timeValue;
      state.scheduleTimezone = timezoneInput?.value || "Asia/Shanghai";
      scheduledPost = Core.createScheduledPost(state, task, platformId, {
        scheduledAt: `${dateValue}T${timeValue}`,
        timezone: state.scheduleTimezone,
      });
      const response = await callProvider("publisher", scheduledPost.providerRequestPreview);
      Core.applyScheduledPostProviderResult(scheduledPost, response);
      publishDialog = null;
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast("已提交到 PostEverywhere 托管定时。");
    } catch (error) {
      if (scheduledPost) {
        scheduledPost.status = "failed";
        scheduledPost.providerResponse = { ok: false, error: error.message };
        scheduledPost.updatedAt = new Date().toISOString();
      }
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast(`托管定时失败：${error.message}`);
    }
    return;
  }
  if (action === "confirm-publish-copy") {
    publishDialog = null;
    action = "publish-copy";
  }
  if (action === "publish-copy") {
    const readiness = publishReadiness(task, [platformId]);
    if (!readiness.ready) {
      toast(`还不能发布：${readiness.message}`);
      return;
    }
    const pendingKey = taskId ? `publish-copy-${task.id}-${platformId}` : `publish-copy-${platformId}`;
    if (!startPending(pendingKey)) return;
    const copy = task.copies[platformId];
    const previewTask = Object.assign({}, task, {
      copies: { [platformId]: copy },
      providerRequests: Object.assign({}, task.providerRequests || {}),
    });
    previewTask.providerRequests.publisher = Core.buildPublishProviderRequest(state, previewTask);
    let published = true;
    try {
      task.providerRequests = task.providerRequests || {};
      task.providerRequests.publisher = previewTask.providerRequests.publisher;
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisher = await callProvider("publisher", previewTask.providerRequests.publisher);
      const applied = Core.applyPublishProviderResult(previewTask, task.providerResponses.publisher);
      if (applied) {
        task.publishResults = Object.assign({}, task.publishResults || {}, previewTask.publishResults || {});
      } else {
        task.publishResults = task.publishResults || {};
        task.publishResults[platformId] = {
          platformName: copy.platformName || platformId,
          status: "published",
          url: `https://posteverywhere.example/${platformId}/${task.id}`,
          publishedAt: new Date().toISOString(),
        };
      }
      if (Object.keys(task.publishResults || {}).length >= Object.keys(task.copies || {}).filter((id) => task.copies[id]?.approved).length) {
        task.status = "published";
      }
    } catch (error) {
      published = false;
      task.providerResponses = task.providerResponses || {};
      task.providerResponses.publisher = { ok: false, error: error.message };
      toast(`发布失败：${error.message}`);
    }
    task.updatedAt = new Date().toISOString();
    finishPending(pendingKey);
    saveState();
    renderShell();
    if (published) toast("已提交这条文案。");
    return;
  }
  if (action === "schedule-copy") {
    const readiness = publishReadiness(task, [platformId]);
    if (!readiness.ready) {
      toast(`还不能定时：${readiness.message}`);
      return;
    }
    if (!state.scheduleDate || !state.scheduleTime) {
      toast("请先选择日期和时间。");
      return;
    }
    const pendingKey = taskId ? `schedule-copy-${task.id}-${platformId}` : `schedule-copy-${platformId}`;
    if (!startPending(pendingKey)) return;
    let scheduledPost = null;
    try {
      scheduledPost = Core.createScheduledPost(state, task, platformId, {
        scheduledAt: `${state.scheduleDate}T${state.scheduleTime}`,
        timezone: state.scheduleTimezone || "Asia/Shanghai",
      });
      const response = await callProvider("publisher", scheduledPost.providerRequestPreview);
      Core.applyScheduledPostProviderResult(scheduledPost, response);
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast("已提交到 PostEverywhere 托管定时。");
    } catch (error) {
      if (scheduledPost) {
        scheduledPost.status = "failed";
        scheduledPost.providerResponse = { ok: false, error: error.message };
        scheduledPost.updatedAt = new Date().toISOString();
      }
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast(`托管定时失败：${error.message}`);
    }
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
  if (action === "schedule-publish") {
    const readiness = publishReadiness(task, state.selectedPlatforms);
    if (!readiness.ready) {
      toast(`还不能定时发布：${readiness.message}`);
      return;
    }
    if (!state.scheduleDate || !state.scheduleTime) {
      toast("请先选择定时发布的日期和时间。");
      return;
    }
    if (!startPending(action)) return;
    let scheduledPost = null;
    try {
      const platform = readiness.approvedIds[0] || state.selectedPlatforms[0];
      scheduledPost = Core.createScheduledPost(state, task, platform, {
        scheduledAt: `${state.scheduleDate}T${state.scheduleTime}`,
        timezone: state.scheduleTimezone || "Asia/Shanghai",
      });
      const response = await callProvider("publisher", scheduledPost.providerRequestPreview);
      Core.applyScheduledPostProviderResult(scheduledPost, response);
      finishPending(action);
      saveState();
      renderShell();
      toast("已提交到 PostEverywhere 托管定时。");
    } catch (error) {
      if (scheduledPost) {
        scheduledPost.status = "failed";
        scheduledPost.providerResponse = { ok: false, error: error.message };
        scheduledPost.updatedAt = new Date().toISOString();
      }
      finishPending(action);
      saveState();
      renderShell();
      toast(`托管定时失败：${error.message}`);
    }
    return;
  }
  if (action === "cancel-scheduled-post") {
    const post = (state.scheduledPosts || []).find((item) => item.id === scheduledPostId);
    if (!post) {
      toast("没有找到这条定时任务。");
      return;
    }
    if (post.platformPostId) {
      const pendingKey = `cancel-scheduled-post-${scheduledPostId}`;
      if (!startPending(pendingKey)) return;
      try {
        const cancelRequest = Core.buildCancelScheduledPostProviderRequest(state, post);
        const response = await callProvider("publisher", cancelRequest);
        Core.applyCancelScheduledPostProviderResult(post, response);
        finishPending(pendingKey);
        saveState();
        renderShell();
        toast("已取消 PostEverywhere 平台定时。");
      } catch (error) {
        post.providerCancelResponse = { ok: false, error: error.message };
        post.updatedAt = new Date().toISOString();
        finishPending(pendingKey);
        saveState();
        renderShell();
        toast(`平台定时取消失败：${error.message}`);
      }
      return;
    }
    Core.cancelScheduledPost(state, scheduledPostId);
    saveState();
    renderShell();
    toast("已取消定时发布。");
    return;
  }
  if (action === "reschedule-scheduled-post") {
    const dateInput = document.querySelector(`[data-scheduled-date="${scheduledPostId}"]`);
    const timeInput = document.querySelector(`[data-scheduled-time="${scheduledPostId}"]`);
    const timezoneInput = document.querySelector(`[data-scheduled-timezone="${scheduledPostId}"]`);
    const dateValue = dateInput && dateInput.value;
    const timeValue = timeInput && timeInput.value;
    if (!dateValue || !timeValue) {
      toast("请先填写新的定时日期和时间。");
      return;
    }
    const pendingKey = `reschedule-scheduled-post-${scheduledPostId}`;
    if (!startPending(pendingKey)) return;
    try {
      const post = Core.reschedulePost(state, scheduledPostId, `${dateValue}T${timeValue}`, timezoneInput?.value || "Asia/Shanghai");
      if (!post) {
        finishPending(pendingKey);
        toast("没有找到这条定时任务。");
        return;
      }
      if (post.platformPostId) {
        const rescheduleRequest = Core.buildRescheduleScheduledPostProviderRequest(state, post);
        const response = await callProvider("publisher", rescheduleRequest);
        Core.applyRescheduleScheduledPostProviderResult(post, response);
      } else {
        const response = await callProvider("publisher", post.providerRequestPreview);
        Core.applyScheduledPostProviderResult(post, response);
      }
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast(post.platformPostId ? "已更新 PostEverywhere 平台定时时间。" : "已更新并提交到 PostEverywhere 托管定时。");
    } catch (error) {
      const post = (state.scheduledPosts || []).find((item) => item.id === scheduledPostId);
      if (post) {
        post.status = "failed";
        post.providerResponse = { ok: false, error: error.message };
        post.updatedAt = new Date().toISOString();
      }
      finishPending(pendingKey);
      saveState();
      renderShell();
      toast(`托管更新时间失败：${error.message}`);
    }
    return;
  }
  if (action === "publish-scheduled-now") {
    const post = (state.scheduledPosts || []).find((item) => item.id === scheduledPostId);
    if (!post) {
      toast("没有找到这条定时任务。");
      return;
    }
    if (!startPending(`publish-scheduled-now-${scheduledPostId}`)) return;
    post.status = "publishing";
    post.updatedAt = new Date().toISOString();
    let published = true;
    try {
      const response = await callProvider("publisher", post.providerRequestPreview);
      post.providerResponse = response;
      post.status = response && response.ok === false ? "failed" : "published";
      post.publishedAt = post.status === "published" ? new Date().toISOString() : "";
      if (post.status === "failed") published = false;
    } catch (error) {
      published = false;
      post.status = "failed";
      post.providerResponse = { ok: false, error: error.message };
      toast(`定时任务发布失败：${error.message}`);
    }
    finishPending(`publish-scheduled-now-${scheduledPostId}`);
    saveState();
    renderShell();
    if (published) toast("定时任务已提交到 PostEverywhere。");
    return;
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
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      capabilities: result.capabilities || {},
      upstream: result.upstream || null,
    };
    saveState();
    renderShell();
    const savedResult = state.connectionTests[connectionKey];
    const reverseUnavailable = savedResult.ok && savedResult.capabilities && savedResult.capabilities.reverseStoryboard === false;
    toast(savedResult.ok ? (reverseUnavailable ? "连接测试通过，但当前模型反推不可用。" : "连接测试通过。") : `连接测试失败：${savedResult.error || savedResult.message}`);
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

async function generateCopyForPlatform(task, platformId) {
  task.providerRequests = task.providerRequests || {};
  task.providerResponses = task.providerResponses || {};
  task.copyStyle = state.copyStyle || "ugc-real";
  const request = Core.buildCopyProviderRequest(state, task, [platformId]);
  task.providerRequests.copy = request;
  task.providerRequests.copyByPlatform = Object.assign({}, task.providerRequests.copyByPlatform || {}, {
    [platformId]: request,
  });
  try {
    const response = await callProvider("copy", request);
    task.providerResponses.copy = response;
    task.providerResponses.copyByPlatform = Object.assign({}, task.providerResponses.copyByPlatform || {}, {
      [platformId]: response,
    });
    const draftTask = Object.assign({}, task, { copies: {} });
    const applied = Core.applyCopyProviderResult(draftTask, response);
    if (applied && draftTask.copies[platformId]) {
      task.copies[platformId] = draftTask.copies[platformId];
      task.copySummary = draftTask.copySummary || task.copySummary;
    } else {
      Core.generateCopies(task, [platformId], { style: state.copyStyle });
      task.providerResponses.copyFallbackByPlatform = Object.assign({}, task.providerResponses.copyFallbackByPlatform || {}, {
        [platformId]: "provider returned no usable copy for this platform",
      });
    }
  } catch (error) {
    task.providerResponses.copy = { ok: false, error: error.message };
    task.providerResponses.copyByPlatform = Object.assign({}, task.providerResponses.copyByPlatform || {}, {
      [platformId]: task.providerResponses.copy,
    });
    Core.generateCopies(task, [platformId], { style: state.copyStyle });
  }
  if (task.publishResults) delete task.publishResults[platformId];
  task.status = "copy_review";
  syncPublishStatus(task);
}

function updateContentPlanStream(patch) {
  updateStreamState("content-plan", "contentPlanStream", patch);
}

function updateStoryboardStream(patch) {
  updateStreamState("storyboard", "storyboardStream", patch);
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
    const streamedLength = String(state.contentPlanStream?.text || "").length;
    finishPending(action, { render: false });
    updateContentPlanStream({
      status: "done",
      label: "内容规划已生成",
      text: `已收到模型返回${streamedLength ? `（流式片段约 ${streamedLength} 字符）` : ""}，已开始用于生成分镜脚本。`,
      rawText: task.contentPlanText,
    });
    if (!options.silentSuccessToast) {
      toast(options.keepPrevious ? "内容规划已重新生成，可恢复上一版。" : "内容规划已生成，可以继续生成分镜。");
    }
    return task;
  } catch (error) {
    finishPending(action, { render: false });
    updateContentPlanStream({ status: "error", label: "生成失败", text: `${state.contentPlanStream?.text || ""}\n\n错误：${error.message}`.trim() });
    toast(`内容规划生成失败：${error.message}`);
    return null;
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
    finishPending(action, { render: false });
    updateStoryboardStream({
      status: "done",
      label: "分镜脚本已生成",
      text: `已收到模型返回${streamedLength ? `（流式片段约 ${streamedLength} 字符）` : ""}，分镜脚本已写入上方可编辑中文分镜框。`,
      rawText: task.storyboardScriptText,
    });
    saveState();
    if (view === "create") renderShell();
    toast(`已生成 ${task.storyboard.length} 镜分镜，可在当前页检查后再进入审核生成视频。`);
  } catch (error) {
    finishPending(action, { render: false });
    task.status = "content_plan_ready";
    task.reviewNote = error.message;
    updateStoryboardStream({ status: "error", label: "生成失败", text: `${state.storyboardStream?.text || ""}\n\n错误：${error.message}`.trim() });
    saveState();
    if (view === "create") renderShell();
    toast(`分镜生成失败：${error.message}`);
  }
}

async function generateStoryboardFromIdeaWithUi(action) {
  syncDraftForm();
  if (!startPending(action)) return;
  let task = null;
  try {
    updateStoryboardStream({ status: "streaming", label: "正在请求大模型", text: "正在按视频想法和产品图生成分镜...\n" });
    const request = Core.buildStoryboardFromIdeaProviderRequest(state);
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
    task = Core.createStoryboardTaskFromIdea(state, {
      providerRequest: request,
      providerResponse: response,
    });
    Core.applyStoryboardProviderResult([task], response);
    if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
      throw new Error("大模型没有返回可用的分镜 scenes，请检查响应 JSON。");
    }
    task.storyboardScriptText = storyboardScriptText(task);
    task.status = "storyboard_ready";
    state.selectedTaskId = task.id;
    const streamedLength = String(state.storyboardStream?.text || "").length;
    finishPending(action, { render: false });
    updateStoryboardStream({
      status: "done",
      label: "分镜脚本已生成",
      text: `已收到模型返回${streamedLength ? `（流式片段约 ${streamedLength} 字符）` : ""}，分镜脚本已写入上方可编辑中文分镜框。`,
      rawText: task.storyboardScriptText,
    });
    saveState();
    if (view === "create") renderShell();
    toast(`已生成 ${task.storyboard.length} 镜分镜，可在当前页检查后再进入审核生成视频。`);
  } catch (error) {
    finishPending(action, { render: false });
    if (task && task.id) {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      if (state.selectedTaskId === task.id) state.selectedTaskId = state.tasks[0] && state.tasks[0].id || null;
    }
    updateStoryboardStream({ status: "error", label: "生成失败", text: `${state.storyboardStream?.text || ""}\n\n错误：${error.message}`.trim() });
    saveState();
    if (view === "create") renderShell();
    toast(`分镜生成失败：${error.message}`);
  }
}

async function generateStoryboardScriptWithUi(action) {
  await generateStoryboardFromIdeaWithUi(action);
}

async function generateVideoForTask(task) {
  if (!Array.isArray(task.storyboard) || !task.storyboard.length) {
    const error = new Error("请先生成分镜脚本，再生成视频。");
    task.reviewNote = error.message;
    return { ok: false, task, error };
  }
  if (task.status === "rejected") {
    task.video = null;
    task.reviewNote = "";
  }
  try {
    const product = Core.getById(state.products, task.productId || state.selectedProductId);
    await ensureProductImagesHostedForVideo(product);
    Core.simulateVideoGeneration(state, task);
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.video = await callProvider("video", task.providerRequests.video);
    Core.applyVideoProviderResult(task, task.providerResponses.video);
    if (!(task.video && (task.video.url || task.video.jobId))) {
      const error = new Error(task.reviewNote || "视频任务没有返回可查询的任务 ID，请重新生成视频。");
      return { ok: false, task, error, recovered: true };
    }
    return { ok: true, task };
  } catch (error) {
    task.providerResponses = task.providerResponses || {};
    task.providerResponses.video = { ok: false, error: error.message };
    if (isModelVisibleImageError(error)) {
      task.reviewNote = modelVisibleImagePreflightMessage(error);
      task.status = "storyboard_ready";
      task.updatedAt = new Date().toISOString();
      return { ok: false, task, error, recovered: true };
    }
    task.reviewNote = error.message;
    task.status = "rejected";
    task.updatedAt = new Date().toISOString();
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

async function reviewVideoQualityForTask(task) {
  if (!task.video || !task.video.url) {
    throw new Error("视频生成完成后才能执行 AI 审查。");
  }
  if (!shouldInlineReverseFrames()) {
    throw new Error(reverseVisionRequirementMessage());
  }
  const product = Core.getById(state.products, task.productId || state.selectedProductId);
  const extractedFrames = await extractGeneratedVideoFrames(task);
  const visionFrames = await loadReverseFrameData(extractedFrames);
  const request = Core.buildVideoQualityReviewProviderRequest(state, task, product, { frames: visionFrames });
  task.providerRequests = task.providerRequests || {};
  task.providerResponses = task.providerResponses || {};
  task.providerRequests.videoQualityReview = Core.buildVideoQualityReviewProviderRequest(state, task, product, { frames: extractedFrames });
  task.providerResponses.videoQualityReview = await callProvider("video-quality-review", request);
  const applied = Core.applyVideoQualityReviewProviderResult(task, task.providerResponses.videoQualityReview);
  if (!applied) {
    throw new Error("GPT-5.5 没有返回可用的审查 JSON。");
  }
  task.videoQualityReview.frames = extractedFrames.map((frame) => Object.assign({}, frame, { dataUrl: undefined }));
  task.videoQualityReview.frameCount = extractedFrames.length;
  return task.videoQualityReview;
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
