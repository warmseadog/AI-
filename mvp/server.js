const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
const OUTPUTS_ROOT = path.resolve(process.env.AI_VIDEO_OUTPUTS_ROOT || path.join(ROOT, "..", "outputs"));
const PORT = Number(process.env.PORT || 4188);

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) return;
    const rawValue = match[2].trim();
    process.env[match[1]] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  });
}

[path.join(ROOT, "..", ".env"), path.join(ROOT, "..", ".env.local")].forEach(loadLocalEnvFile);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

function publicUploadBaseUrl() {
  const raw = String(process.env.AI_VIDEO_PUBLIC_UPLOAD_BASE_URL || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.toString();
  } catch {
    return "";
  }
}

function publicUrlForOutputPath(outputUrl) {
  const base = publicUploadBaseUrl();
  const value = String(outputUrl || "").trim();
  if (!base || !value.startsWith("/outputs/")) return "";
  const relative = value.replace(/^\/outputs\/+/, "");
  const encodedRelative = relative.split("/").map((part) => encodeURIComponent(part)).join("/");
  return new URL(encodedRelative, base).toString();
}

function imageHostProvider() {
  return String(process.env.IMAGE_HOST_PROVIDER || "").trim().toLowerCase();
}

function imgbbUploadEndpoint() {
  return String(process.env.IMGBB_UPLOAD_ENDPOINT || "https://api.imgbb.com/1/upload").trim();
}

function directHostedImageUrl(data) {
  const candidates = [
    data && data.data && data.data.image && data.data.image.url,
    data && data.data && data.data.url,
    data && data.data && data.data.display_url,
    data && data.image && data.image.url,
    data && data.url,
  ];
  return candidates.map((item) => String(item || "").trim()).find((item) => /^https:\/\//i.test(item)) || "";
}

async function uploadImageToImgBB(bytes, fileName, contentType) {
  const apiKey = String(process.env.IMGBB_API_KEY || "").trim();
  if (!apiKey) throw new Error("请先配置 IMGBB_API_KEY，才能把产品图上传到 ImgBB。");
  const endpoint = imgbbUploadEndpoint();
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey);
  const formData = new FormData();
  formData.append("image", new Blob([bytes], { type: contentType || "image/png" }), fileName || "product-image.png");
  const response = await fetch(url, { method: "POST", body: formData });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.success === false) {
    const message = data && (data.error && data.error.message || data.message) || `ImgBB 上传失败，HTTP ${response.status}`;
    throw new Error(message);
  }
  const publicUrl = directHostedImageUrl(data);
  if (!publicUrl) {
    throw new Error("ImgBB 没有返回可供模型访问的 HTTPS 图片直链。");
  }
  return {
    publicUrl,
    imageHostProvider: "imgbb",
    modelVisible: true,
    response: data,
  };
}

async function hostUploadedImage(bytes, fileName, contentType, localUrl) {
  if (imageHostProvider() === "imgbb") {
    return uploadImageToImgBB(bytes, fileName, contentType);
  }
  const publicUrl = publicUrlForOutputPath(localUrl);
  return publicUrl ? { publicUrl, modelVisible: true, imageHostProvider: "public-base-url" } : null;
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("视频过大，请先压缩后再上传。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function redactEventValue(value) {
  if (Array.isArray(value)) return value.map(redactEventValue);
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (/apikey|api_key|authorization|token|secret|key/i.test(key)) {
      return [key, item ? "已隐藏" : ""];
    }
    return [key, redactEventValue(item)];
  }));
}

function logProviderEvent(event) {
  try {
    fs.mkdirSync(OUTPUTS_ROOT, { recursive: true });
    const entry = redactEventValue({
      at: new Date().toISOString(),
      ...event,
    });
    fs.appendFileSync(path.join(OUTPUTS_ROOT, "provider-events.jsonl"), `${JSON.stringify(entry)}\n`);
  } catch {
    // Logging should never break provider calls.
  }
}

function providerErrorMessage(error) {
  const message = error && error.message ? error.message : String(error || "provider failed");
  const cause = error && error.cause;
  const causeParts = [
    cause && cause.code,
    cause && cause.message && cause.message !== message ? cause.message : "",
  ].filter(Boolean);
  return causeParts.length ? `${message} (${causeParts.join(": ")})` : message;
}

const LLM_RETRY_ATTEMPTS = 3;
const LLM_RETRY_DELAYS_MS = [250, 750];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLlmRequest(providerRequest) {
  const body = providerRequest && providerRequest.body || {};
  return Array.isArray(body.messages) || Array.isArray(body.input);
}

function shouldRetryProviderKind(kind, providerRequest) {
  return isLlmRequest(providerRequest) || ["brief", "content-plan", "storyboard", "reverse-storyboard", "copy"].includes(kind);
}

function retryDelayMs(attempt) {
  return LLM_RETRY_DELAYS_MS[Math.min(attempt - 1, LLM_RETRY_DELAYS_MS.length - 1)] || 0;
}

function retryableStatus(status) {
  return [408, 429, 500, 502, 503, 504, 524].includes(Number(status));
}

function retryableError(error) {
  const text = providerErrorMessage(error).toLowerCase();
  return /fetch failed|econnreset|etimedout|econnrefused|enotfound|network|socket|timeout|dns|getaddrinfo|temporar/.test(text);
}

function retryableProxyFailure(proxied) {
  if (!proxied || proxied.ok) return false;
  if (retryableStatus(proxied.status)) return true;
  const message = upstreamErrorMessage(proxied);
  return /没有返回内容|empty|暂时|重试|retry|rate.?limit|timeout|超时|temporar/i.test(message);
}

function retryAwareFailureMessage(proxied) {
  const base = upstreamErrorMessage(proxied) || `upstream HTTP ${proxied && proxied.status}`;
  return proxied && proxied.attempts > 1 ? `已尝试 ${proxied.attempts} 次，最后一次错误：${base}` : base;
}

async function proxyHttpWithRetry(providerRequest, options = {}) {
  const maxAttempts = options.maxAttempts || LLM_RETRY_ATTEMPTS;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const proxied = await proxyHttp(providerRequest);
      const result = { ...proxied, attempts: attempt };
      if (result.ok || !retryableProxyFailure(result) || attempt === maxAttempts) {
        return result;
      }
      if (typeof options.onRetry === "function") {
        options.onRetry({ attempt, nextAttempt: attempt + 1, status: result.status, error: upstreamErrorMessage(result) || "" });
      }
    } catch (error) {
      lastError = error;
      if (!retryableError(error) || attempt === maxAttempts) {
        const message = attempt > 1 ? `已尝试 ${attempt} 次，最后一次错误：${providerErrorMessage(error)}` : providerErrorMessage(error);
        const retryError = new Error(message);
        retryError.cause = error;
        throw retryError;
      }
      if (typeof options.onRetry === "function") {
        options.onRetry({ attempt, nextAttempt: attempt + 1, error: providerErrorMessage(error) });
      }
    }
    await sleep(retryDelayMs(attempt));
  }
  throw lastError || new Error("provider retry failed");
}

async function proxyHttp(providerRequest) {
  if (!providerRequest.endpoint) {
    throw new Error("http mode requires endpoint");
  }
  const body = providerRequest.body && typeof providerRequest.body === "object"
    ? { ...providerRequest.body }
    : providerRequest.body;
  const isOpenAiLike = body && typeof body === "object" && (Array.isArray(body.messages) || Array.isArray(body.input));
  if (isOpenAiLike && body.stream === undefined) {
    body.stream = false;
  }
  const headers = {
    "content-type": "application/json",
  };
  Object.assign(headers, providerRequest.headers || {});
  if (providerRequest.apiKey) {
    headers.authorization = `Bearer ${providerRequest.apiKey}`;
  }
  const method = String(providerRequest.method || "POST").toUpperCase();
  const shouldSendBody = !["GET", "HEAD", "DELETE"].includes(method);
  const response = await fetch(providerRequest.endpoint, {
    method,
    headers,
    body: shouldSendBody ? JSON.stringify(body || {}) : undefined,
  });
  const text = await response.text();
  let data;
  let ok = response.ok;
  if (/^\s*data:/m.test(text)) {
    const parsedStream = openAiLikeSseTextData(providerRequest, text);
    data = parsedStream.data;
    if (!parsedStream.hasContent && !embeddedUpstreamErrorMessage({ status: response.status, ok: response.ok, data })) {
      data = { error: { message: "上游没有返回内容：收到空的流式响应，没有 message.content 或 output_text。" }, raw: text.slice(0, 500) };
      ok = false;
    }
  } else {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, ok, data };
}

function providerHeaders(providerRequest) {
  const headers = {
    "content-type": "application/json",
  };
  Object.assign(headers, providerRequest.headers || {});
  if (providerRequest.apiKey) {
    headers.authorization = `Bearer ${providerRequest.apiKey}`;
  }
  return headers;
}

function writeStreamEvent(res, event) {
  res.write(`${JSON.stringify(event)}\n`);
}

function cloneProviderRequestForStreaming(providerRequest) {
  const next = {
    ...providerRequest,
    body: providerRequest && providerRequest.body && typeof providerRequest.body === "object"
      ? { ...providerRequest.body }
      : providerRequest && providerRequest.body,
  };
  const body = next.body || {};
  const isOpenAiLike = Array.isArray(body.messages) || Array.isArray(body.input);
  if (isOpenAiLike && body.stream === undefined) {
    body.stream = true;
  }
  return next;
}

function streamTextFromSsePayload(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.delta === "string" && /output_text\.delta|text\.delta/i.test(String(payload.type || ""))) return payload.delta;
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.choices)) {
    return payload.choices.map((choice) => {
      const delta = choice && choice.delta || {};
      const message = choice && choice.message || {};
      return delta.content || message.content || "";
    }).join("");
  }
  return "";
}

function openAiLikeStreamData(providerRequest, content) {
  const body = providerRequest && providerRequest.body || {};
  if (Array.isArray(body.input)) {
    return {
      output_text: content,
      output: [
        {
          content: [
            { text: content },
          ],
        },
      ],
    };
  }
  return {
    choices: [
      {
        message: { content },
      },
    ],
  };
}

function openAiLikeSseTextData(providerRequest, text) {
  let streamedText = "";
  const payloads = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      payloads.push(parsed);
      streamedText += streamTextFromSsePayload(parsed);
    } catch {
      // Ignore non-JSON stream housekeeping lines.
    }
  });
  if (streamedText) {
    return { hasContent: true, data: openAiLikeStreamData(providerRequest, streamedText) };
  }
  return {
    hasContent: false,
    data: payloads.length ? { raw: text, streamPayloads: payloads } : { raw: text },
  };
}

async function proxyHttpStream(providerRequest, onEvent) {
  if (!providerRequest.endpoint) {
    throw new Error("http mode requires endpoint");
  }
  const streamingRequest = cloneProviderRequestForStreaming(providerRequest);
  const method = providerRequest.method || "POST";
  const response = await fetch(providerRequest.endpoint, {
    method,
    headers: providerHeaders(streamingRequest),
    body: method === "GET" ? undefined : JSON.stringify(streamingRequest.body || {}),
  });
  const contentType = String(response.headers.get("content-type") || "");
  const decoder = new TextDecoder();
  let text = "";
  let streamedText = "";
  let emittedChunk = false;
  const emitChunk = (chunk) => {
    if (!chunk) return;
    emittedChunk = true;
    onEvent({ type: "chunk", text: chunk });
  };
  if (!response.ok) {
    text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: response.status, ok: false, data, emittedChunk };
  }
  if (contentType.includes("text/event-stream") && response.body && response.body.getReader) {
    const reader = response.body.getReader();
    let buffer = "";
    const handleLine = (line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") return;
      text += `${data}\n`;
      try {
        const parsed = JSON.parse(data);
        const deltaText = streamTextFromSsePayload(parsed);
        if (deltaText) {
          streamedText += deltaText;
          emitChunk(deltaText);
        }
      } catch {
        // Ignore non-JSON SSE housekeeping lines.
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      lines.forEach(handleLine);
    }
    const tail = decoder.decode();
    if (tail) buffer += tail;
    buffer.split(/\r?\n/).forEach(handleLine);
  } else if (response.body && response.body.getReader) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      emitChunk(chunk);
    }
    const tail = decoder.decode();
    if (tail) {
      text += tail;
      emitChunk(tail);
    }
  } else {
    text = await response.text();
    emitChunk(text);
  }
  let data;
  if (streamedText) {
    data = openAiLikeStreamData(streamingRequest, streamedText);
  } else {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  const proxied = { status: response.status, ok: response.ok, data };
  const embeddedError = embeddedUpstreamErrorMessage(proxied);
  return { status: response.status, ok: response.ok && !embeddedError, data, emittedChunk };
}

async function proxyHttpStreamWithRetry(providerRequest, onEvent, options = {}) {
  const maxAttempts = options.maxAttempts || LLM_RETRY_ATTEMPTS;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const proxied = await proxyHttpStream(providerRequest, onEvent);
      const result = { ...proxied, attempts: attempt };
      if (result.ok || result.emittedChunk || !retryableProxyFailure(result) || attempt === maxAttempts) {
        return result;
      }
      if (typeof options.onRetry === "function") {
        options.onRetry({ attempt, nextAttempt: attempt + 1, status: result.status, error: upstreamErrorMessage(result) || "" });
      }
    } catch (error) {
      lastError = error;
      if (!retryableError(error) || attempt === maxAttempts) {
        const message = attempt > 1 ? `已尝试 ${attempt} 次，最后一次错误：${providerErrorMessage(error)}` : providerErrorMessage(error);
        const retryError = new Error(message);
        retryError.cause = error;
        throw retryError;
      }
      if (typeof options.onRetry === "function") {
        options.onRetry({ attempt, nextAttempt: attempt + 1, error: providerErrorMessage(error) });
      }
    }
    await sleep(retryDelayMs(attempt));
  }
  throw lastError || new Error("provider stream retry failed");
}

function redactProxyData(data) {
  if (!data || typeof data !== "object") return data;
  const text = JSON.stringify(data);
  if (text.length <= 2000) return data;
  return { summary: text.slice(0, 2000), truncated: true };
}

function localOutputPathFromUrl(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/outputs/")) return "";
  try {
    const relative = raw.replace(/^\/outputs\/+/, "").split("/").map((part) => decodeURIComponent(part)).join(path.sep);
    const resolved = path.resolve(OUTPUTS_ROOT, relative);
    return resolved.startsWith(OUTPUTS_ROOT + path.sep) ? resolved : "";
  } catch {
    return "";
  }
}

function dataUrlFromLocalOutput(value) {
  const filePath = localOutputPathFromUrl(value);
  if (!filePath || !fs.existsSync(filePath)) return "";
  const mimeType = mimeFromFilename(filePath);
  if (!/^image\//i.test(mimeType)) return "";
  const bytes = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

function prepareOfficialJimengRequest(providerRequest) {
  if (!isOfficialJimengProviderRequest(providerRequest)) return providerRequest;
  const method = String(providerRequest && providerRequest.method || "POST").toUpperCase();
  if (["GET", "HEAD", "DELETE"].includes(method)) return providerRequest;
  const content = providerRequest && providerRequest.body && providerRequest.body.content;
  if (!Array.isArray(content)) return providerRequest;
  const body = { ...providerRequest.body };
  body.content = content.map((part) => {
    if (!part || part.type !== "image_url") return part;
    const imageUrl = typeof part.image_url === "string"
      ? { url: part.image_url }
      : { ...(part.image_url || {}) };
    const localUrl = imageUrl.local_url || imageUrl.localUrl || part.local_url || part.localUrl || "";
    const localDataUrl = dataUrlFromLocalOutput(localUrl);
    if (localDataUrl) imageUrl.url = localDataUrl;
    delete imageUrl.local_url;
    delete imageUrl.localUrl;
    const nextPart = { ...part, image_url: imageUrl };
    delete nextPart.local_url;
    delete nextPart.localUrl;
    return nextPart;
  });
  return { ...providerRequest, body };
}

function upstreamErrorMessage(proxied) {
  const data = proxied && proxied.data;
  if (!data || typeof data !== "object") return "";
  if (data.error && typeof data.error === "object" && data.error.message) return data.error.message;
  if (data.error && typeof data.error === "string") return data.error;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.code === "string" && data.code.trim()) return data.code;
  if (typeof data.raw === "string") {
    if (proxied.status === 524 || /524:\s*A timeout occurred|A timeout occurred/i.test(data.raw)) {
      return "上游请求超时（HTTP 524）。ToAPIS/Cloudflare 在模型完成前断开了连接，请减少关键帧数量或换用支持更长超时的视觉接口。";
    }
    const titleMatch = data.raw.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return `上游返回 HTML 错误页：${titleMatch[1].replace(/\s+/g, " ").trim()}`;
    }
    const jsonLine = data.raw.split(/\n/).find((line) => line.trim().startsWith("{"));
    if (jsonLine) {
      try {
        const parsed = JSON.parse(jsonLine);
        if (parsed.error && parsed.error.message) return parsed.error.message;
        if (parsed.response && parsed.response.error && parsed.response.error.message) return parsed.response.error.message;
      } catch {
        return data.raw.slice(0, 180);
      }
    }
    return data.raw.slice(0, 180);
  }
  return "";
}

function embeddedUpstreamErrorMessage(proxied) {
  const data = proxied && proxied.data;
  if (!data || typeof data !== "object") return "";
  if (data.error && typeof data.error === "object" && data.error.message) return data.error.message;
  if (data.error && typeof data.error === "string") return data.error;
  if (data.response && data.response.error && data.response.error.message) return data.response.error.message;
  if (typeof data.raw !== "string") return "";
  const lines = data.raw.split(/\n+/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.error && typeof parsed.error === "object" && parsed.error.message) return parsed.error.message;
      if (parsed.error && typeof parsed.error === "string") return parsed.error;
      if (parsed.response && parsed.response.error && parsed.response.error.message) return parsed.response.error.message;
    } catch {
      // Keep scanning later lines; upstreams sometimes append usage JSON after errors.
    }
  }
  return "";
}

function safeName(value, fallback) {
  const cleaned = String(value || "").replace(/[^\w.\-()\u4e00-\u9fa5]/g, "_").replace(/_+/g, "_");
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : fallback;
}

function isVideoUpload(contentType, filename) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const ext = path.extname(String(filename || "")).toLowerCase();
  return ["video/mp4", "video/quicktime", "video/webm"].includes(type) || [".mp4", ".mov", ".webm"].includes(ext);
}

function isImageUpload(contentType, filename) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const ext = path.extname(String(filename || "")).toLowerCase();
  return ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(type) || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);
}

function uploadUrlToPath(urlPath) {
  const value = String(urlPath || "");
  if (!value.startsWith("/outputs/uploads/") && !value.startsWith("/outputs/downloads/")) {
    throw new Error("没有找到本地视频。");
  }
  const relative = value.slice("/outputs/".length);
  const filePath = path.normalize(path.join(OUTPUTS_ROOT, relative));
  if (!isInside(OUTPUTS_ROOT, filePath)) {
    throw new Error("没有找到本地视频。");
  }
  return filePath;
}

async function handleVideoDownload(req, res) {
  try {
    const payload = await readBody(req);
    const sourceUrl = String(payload.url || "").trim();
    if (!/^https?:\/\//i.test(sourceUrl)) {
      throw new Error("请提供可下载的 http/https 视频地址。");
    }
    const taskId = safeName(payload.taskId, "video-task");
    const requestedName = safeName(payload.fileName, `${taskId}.mp4`);
    const ext = path.extname(requestedName) || ".mp4";
    const fileName = requestedName.endsWith(ext) ? requestedName : `${requestedName}${ext}`;
    const downloadDir = path.join(OUTPUTS_ROOT, "downloads", taskId);
    fs.mkdirSync(downloadDir, { recursive: true });
    const filePath = path.normalize(path.join(downloadDir, fileName));
    if (!isInside(OUTPUTS_ROOT, filePath)) {
      throw new Error("下载文件路径无效。");
    }
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`视频下载失败，HTTP ${response.status}`);
    }
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType && !/video|octet-stream/i.test(contentType)) {
      throw new Error(`远端地址不是视频文件：${contentType}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      throw new Error("远端视频为空。");
    }
    fs.writeFileSync(filePath, bytes);
    const localUrl = `/outputs/downloads/${taskId}/${fileName}`;
    sendJson(res, 200, {
      ok: true,
      localPath: filePath,
      localUrl,
      size: bytes.length,
      downloadedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

function publisherApiUrl(postsEndpoint, pathName) {
  const endpoint = new URL(String(postsEndpoint || "").trim());
  let basePath = endpoint.pathname.replace(/\/+$/, "");
  if (/\/posts$/i.test(basePath)) {
    basePath = basePath.replace(/\/posts$/i, "");
  }
  const childPath = String(pathName || "").replace(/^\/+/, "");
  endpoint.pathname = `${basePath}/${childPath}`.replace(/\/+/g, "/");
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

function mimeFromFilename(filename) {
  const contentType = types[path.extname(String(filename || "")).toLowerCase()] || "application/octet-stream";
  return contentType.split(";")[0];
}

function outputUrlToPath(sourceUrl) {
  const pathname = decodeURIComponent(new URL(String(sourceUrl || ""), "http://localhost").pathname);
  if (!pathname.startsWith("/outputs/")) {
    throw new Error("只允许上传本地 outputs 目录内的视频。");
  }
  const relative = pathname.slice("/outputs/".length);
  const filePath = path.normalize(path.join(OUTPUTS_ROOT, relative));
  if (!isInside(OUTPUTS_ROOT, filePath)) {
    throw new Error("视频路径无效。");
  }
  return filePath;
}

async function readPublisherMediaSource(sourceUrl) {
  const source = String(sourceUrl || "").trim();
  if (!source) {
    throw new Error("缺少要上传的视频地址。");
  }
  if (source.startsWith("/outputs/")) {
    const filePath = outputUrlToPath(source);
    if (!fs.existsSync(filePath)) {
      throw new Error("没有找到要上传的视频文件。");
    }
    const bytes = fs.readFileSync(filePath);
    return {
      bytes,
      filename: path.basename(filePath),
      contentType: mimeFromFilename(filePath),
    };
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`视频下载失败，HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      bytes,
      filename: safeName(path.basename(new URL(source).pathname), "publisher-video.mp4"),
      contentType: String(response.headers.get("content-type") || mimeFromFilename(source)).split(";")[0],
    };
  }
  throw new Error("视频地址必须是 /outputs/ 本地文件或 http/https 下载地址。");
}

function publisherMediaData(data) {
  if (!data || typeof data !== "object") return {};
  return data.data && typeof data.data === "object" ? data.data : data;
}

async function uploadBytesToPublisher(uploadData, bytes, contentType) {
  const uploadUrl = uploadData.upload_url || uploadData.uploadUrl;
  if (!uploadUrl) {
    throw new Error("PostEverywhere 没有返回 upload_url。");
  }
  const uploadMethod = uploadData.upload_method || uploadData.uploadMethod || {};
  const method = String(uploadMethod.method || "PUT").toUpperCase();
  const headers = Object.assign({}, uploadMethod.headers || {});
  if (method === "PUT") {
    headers["content-type"] = uploadMethod.content_type || uploadMethod.contentType || contentType;
    const response = await fetch(uploadUrl, { method, headers, body: bytes });
    if (!response.ok) {
      throw new Error(`上传视频到 PostEverywhere 失败，HTTP ${response.status}`);
    }
    return { status: response.status, method };
  }
  if (method === "POST") {
    const fieldName = uploadMethod.field_name || uploadMethod.fieldName || "file";
    const formData = new FormData();
    formData.append(fieldName, new Blob([bytes], { type: contentType }), uploadData.filename || "publisher-video.mp4");
    const response = await fetch(uploadUrl, { method, headers, body: formData });
    if (!response.ok) {
      throw new Error(`上传视频到 PostEverywhere 失败，HTTP ${response.status}`);
    }
    return { status: response.status, method };
  }
  throw new Error(`不支持的 PostEverywhere 上传方法：${method}`);
}

async function handlePublisherMediaUpload(req, res) {
  let endpoint = "";
  try {
    const payload = await readBody(req);
    endpoint = String(payload.endpoint || "").trim();
    const apiKey = String(payload.apiKey || "").trim();
    if (!endpoint) throw new Error("请先配置 PostEverywhere Endpoint。");
    if (!apiKey) throw new Error("请先配置 PostEverywhere API Key。");
    const source = await readPublisherMediaSource(payload.sourceUrl);
    if (!source.bytes.length) {
      throw new Error("要上传的视频为空。");
    }
    const contentType = String(payload.contentType || source.contentType || "video/mp4").split(";")[0].trim().toLowerCase();
    if (contentType !== "video/mp4") {
      throw new Error(`PostEverywhere TikTok 视频上传当前只支持 MP4，请先转成 video/mp4。当前类型：${contentType || "未知"}`);
    }
    const filename = safeName(payload.filename || source.filename || "publisher-video.mp4", "publisher-video.mp4");
    const uploadInit = await proxyHttp({
      provider: "posteverywhere",
      mode: "http",
      endpoint: publisherApiUrl(endpoint, "/media/upload"),
      apiKey,
      body: {
        filename,
        content_type: contentType,
        size: source.bytes.length,
      },
    });
    if (!uploadInit.ok) {
      throw new Error(upstreamErrorMessage(uploadInit) || `PostEverywhere 创建媒体上传失败，HTTP ${uploadInit.status}`);
    }
    const uploadData = publisherMediaData(uploadInit.data);
    const mediaId = uploadData.media_id || uploadData.mediaId || uploadData.id;
    if (!mediaId) {
      throw new Error("PostEverywhere 没有返回 media_id。");
    }
    const uploadResult = await uploadBytesToPublisher(uploadData, source.bytes, contentType);
    const complete = await proxyHttp({
      provider: "posteverywhere",
      mode: "http",
      endpoint: publisherApiUrl(endpoint, `/media/${encodeURIComponent(mediaId)}/complete`),
      apiKey,
      body: {},
    });
    if (!complete.ok) {
      throw new Error(upstreamErrorMessage(complete) || `PostEverywhere 完成媒体上传失败，HTTP ${complete.status}`);
    }
    const completeData = publisherMediaData(complete.data);
    logProviderEvent({
      kind: "publisher-media",
      provider: "posteverywhere",
      mode: "http",
      endpoint: publisherApiUrl(endpoint, "/media/upload"),
      phase: "response",
      ok: true,
      status: complete.status,
      mediaId,
      size: source.bytes.length,
    });
    sendJson(res, 200, {
      ok: true,
      mediaId,
      upload: uploadData,
      uploadResult,
      complete: completeData,
    });
  } catch (error) {
    const errorMessage = providerErrorMessage(error);
    logProviderEvent({
      kind: "publisher-media",
      provider: "posteverywhere",
      mode: "http",
      endpoint,
      phase: "error",
      ok: false,
      error: errorMessage,
    });
    sendJson(res, 400, { ok: false, error: errorMessage });
  }
}

async function handleVideoUpload(req, res, url) {
  try {
    const filename = safeName(url.searchParams.get("filename"), "reference.mp4");
    const contentType = req.headers["content-type"] || "";
    if (!isVideoUpload(contentType, filename)) {
      throw new Error("请上传 mp4、mov 或 webm 视频。");
    }
    const body = await readRawBody(req);
    if (!body.length) {
      throw new Error("上传的视频为空。");
    }
    const uploadId = `upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const uploadDir = path.join(OUTPUTS_ROOT, "uploads", uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = safeName(filename, `reference${path.extname(filename) || ".mp4"}`);
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, body);
    const upload = {
      id: uploadId,
      fileName,
      url: `/outputs/uploads/${uploadId}/${fileName}`,
      mimeType: String(contentType).split(";")[0] || types[path.extname(fileName)] || "video/mp4",
      size: body.length,
      uploadedAt: new Date().toISOString(),
    };
    sendJson(res, 200, { ok: true, upload });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

async function handleImageUpload(req, res, url) {
  try {
    const filename = safeName(url.searchParams.get("filename"), "product-image.png");
    const contentType = req.headers["content-type"] || "";
    if (!isImageUpload(contentType, filename)) {
      throw new Error("请上传 png、jpg、jpeg、webp 或 gif 图片。");
    }
    const body = await readRawBody(req, 20 * 1024 * 1024);
    if (!body.length) {
      throw new Error("上传的图片为空。");
    }
    const uploadId = `upload_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const uploadDir = path.join(OUTPUTS_ROOT, "uploads", uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = safeName(filename, `product-image${path.extname(filename) || ".png"}`);
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, body);
    const upload = {
      id: uploadId,
      fileName,
      url: `/outputs/uploads/${uploadId}/${fileName}`,
      mimeType: String(contentType).split(";")[0] || types[path.extname(fileName)] || "image/png",
      size: body.length,
      uploadedAt: new Date().toISOString(),
    };
    const hosted = await hostUploadedImage(body, fileName, upload.mimeType, upload.url);
    if (hosted && hosted.publicUrl) {
      upload.publicUrl = hosted.publicUrl;
      upload.modelVisible = true;
      upload.imageHostProvider = hosted.imageHostProvider || "";
    }
    sendJson(res, 200, { ok: true, upload });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

function ffmpegCommand() {
  return process.env.AI_VIDEO_FFMPEG_PATH || "ffmpeg";
}

function ffprobeCommand() {
  return process.env.AI_VIDEO_FFPROBE_PATH || "ffprobe";
}

function ffmpegAvailable() {
  const result = spawnSync(ffmpegCommand(), ["-version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

async function handleVideoFrames(req, res) {
  try {
    const payload = await readBody(req);
    const uploadId = safeName(payload.uploadId, "");
    const sourcePath = uploadUrlToPath(payload.url);
    if (!fs.existsSync(sourcePath)) {
      throw new Error("没有找到已上传的视频。");
    }
    if (!ffmpegAvailable()) {
      throw new Error("未检测到 ffmpeg，无法从视频抽帧。请先安装 ffmpeg 或改用手动上传关键帧版本。");
    }
    const frameCount = Math.max(1, Math.min(Number(payload.count || 8), 12));
    const frameDir = path.join(OUTPUTS_ROOT, "uploads", uploadId || path.basename(path.dirname(sourcePath)), "frames");
    fs.mkdirSync(frameDir, { recursive: true });
    const pattern = path.join(frameDir, "frame-%03d.jpg");
    const result = spawnSync(ffmpegCommand(), [
      "-y",
      "-i", sourcePath,
      "-vf", `fps=${frameCount}/15,scale=720:-1`,
      "-frames:v", String(frameCount),
      pattern,
    ], { encoding: "utf8" });
    if (result.error) {
      throw new Error(`抽帧失败：${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = String(result.stderr || "").split("\n").slice(-4).join(" ").trim();
      throw new Error(`抽帧失败：${stderr || "视频文件无法解析"}`);
    }
    const frames = fs.readdirSync(frameDir)
      .filter((name) => /^frame-\d+\.jpg$/.test(name))
      .sort()
      .map((name, index) => ({
        time: `${(index * 15 / frameCount).toFixed(1)}s`,
        url: `/outputs/uploads/${uploadId || path.basename(path.dirname(sourcePath))}/frames/${name}`,
        label: path.basename(name, ".jpg"),
      }));
    if (!frames.length) {
      throw new Error("抽帧失败：没有生成关键帧。");
    }
    sendJson(res, 200, { ok: true, frames });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

function buildTestRequest(config) {
  if (!config || typeof config !== "object") {
    throw new Error("missing integration config");
  }
  if (config.mode !== "http") {
    return null;
  }
  if (!config.endpoint) {
    throw new Error("请先填写 Endpoint");
  }
  if (!config.apiKey) {
    throw new Error("请先填写 API Key");
  }
  if (config.kind === "llm") {
    if ((config.apiStyle || "openai-chat") === "openai-responses") {
      return {
        provider: config.provider,
        mode: "http",
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        body: {
          model: config.model,
          input: [
            { role: "system", content: "你是连接测试助手。" },
            { role: "user", content: "请只回复 JSON：{\"ok\":true}" },
          ],
        },
      };
    }
    return {
      provider: config.provider,
      mode: "http",
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      body: {
        model: config.model,
        messages: [
          { role: "system", content: "你是连接测试助手。" },
          { role: "user", content: "请只回复 JSON：{\"ok\":true}" },
        ],
        max_tokens: 20,
        temperature: 0,
      },
    };
  }
  return null;
}

function supportsReverseVisionConfig(config) {
  const apiStyle = String(config && config.apiStyle || "");
  if (/vision|multimodal/i.test(apiStyle)) return true;
  const model = String(config && config.model || "").trim().toLowerCase();
  return /^gpt-(?:5(?:\.5)?|4o|4\.1|4\.5)(?:$|[-_.])/.test(model);
}

function llmTestCapabilities(config) {
  return {
    reverseStoryboard: supportsReverseVisionConfig(config),
  };
}

function llmTestWarnings(config, capabilities) {
  const warnings = [];
  if (capabilities && capabilities.reverseStoryboard === false) {
    const modelName = config && config.provider === "deepseek" ? "DeepSeek 文本模型" : "当前文本模型";
    warnings.push(`注意：当前模型反推不可用。${modelName}不能读取关键帧图片；内容规划、分镜和文案仍可用。如需反推，请切换支持图片输入的视觉模型，或把 apiStyle 设为 openai-vision-chat / multimodal。`);
  }
  return warnings;
}

async function handleTestConnection(req, res) {
  try {
    const payload = await readBody(req);
    const config = payload.config || {};
    if (config.mode !== "http") {
      throw new Error("当前版本只支持 http 真实接口。");
      return;
    }
    if (config.kind === "video") {
      if (!config.endpoint) throw new Error("请先填写 Endpoint");
      if (!config.apiKey) throw new Error("请先填写 API Key");
      sendJson(res, 200, {
        ok: true,
        mode: "http",
        provider: config.provider,
        checkedAt: new Date().toISOString(),
        message: config.provider === "tongyi-wanxiang" ? "通义万相配置已通过基础检查。为避免扣费，测试连接不会创建视频任务。" : "视频接口配置已通过基础检查。为避免扣费，测试连接不会创建视频任务。",
      });
      return;
    }
    if (config.kind === "publisher") {
      if (!config.endpoint) throw new Error("请先填写 Endpoint");
      if (!config.apiKey) throw new Error("请先填写 API Key");
      sendJson(res, 200, { ok: true, mode: "http", provider: config.provider, checkedAt: new Date().toISOString(), message: "发布接口配置已通过基础检查。测试连接不会发布内容。" });
      return;
    }
    const providerRequest = buildTestRequest(config);
    if (!providerRequest) {
      sendJson(res, 200, { ok: true, mode: config.mode, provider: config.provider, checkedAt: new Date().toISOString(), message: "配置已通过基础检查。" });
      return;
    }
    const proxied = config.kind === "llm" ? await proxyHttpWithRetry(providerRequest) : await proxyHttp(providerRequest);
    const capabilities = config.kind === "llm" ? llmTestCapabilities(config) : undefined;
    const warnings = config.kind === "llm" && proxied.ok ? llmTestWarnings(config, capabilities) : [];
    sendJson(res, proxied.ok ? 200 : 502, {
      ok: proxied.ok,
      mode: "http",
      provider: config.provider,
      checkedAt: new Date().toISOString(),
      message: proxied.ok ? "真实接口连接成功。" : `真实接口连接失败，${proxied.attempts > 1 ? `已尝试 ${proxied.attempts} 次，` : ""}HTTP ${proxied.status}`,
      warnings,
      capabilities,
      upstream: { status: proxied.status, attempts: proxied.attempts || 1, data: redactProxyData(proxied.data) },
    });
  } catch (error) {
    sendJson(res, 400, { ok: false, checkedAt: new Date().toISOString(), error: error.message });
  }
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractLlmUserContent(providerRequest) {
  const body = providerRequest.body || {};
  if (Array.isArray(body.input)) {
    const input = body.input.find((item) => item.role === "user") || body.input[1];
    return input ? input.content || {} : {};
  }
  if (Array.isArray(body.messages)) {
    const message = body.messages.findLast ? body.messages.findLast((item) => item.role === "user") : body.messages.filter((item) => item.role === "user").pop();
    return parseMaybeJson(message && message.content) || {};
  }
  return {};
}

function providerRequestSummary(providerRequest) {
  const body = providerRequest && providerRequest.body || {};
  const parameters = body.parameters || {};
  let imagePartCount = 0;
  let imageUrlCount = 0;
  let referenceImageCount = 0;
  let textPayload = null;
  if (Array.isArray(body.messages)) {
    body.messages.forEach((message) => {
      if (Array.isArray(message.content)) {
        message.content.forEach((part) => {
          if (part && part.type === "image_url") {
            imagePartCount += 1;
            imageUrlCount += 1;
          }
          if (part && part.type === "text" && !textPayload) textPayload = parseMaybeJson(part.text);
        });
      } else if (message && message.role === "user") {
        textPayload = parseMaybeJson(message.content) || textPayload;
      }
    });
  }
  if (Array.isArray(body.content)) {
    body.content.forEach((part) => {
      if (part && part.type === "image_url" && part.image_url && part.image_url.url) {
        imageUrlCount += 1;
      }
      if (part && part.type === "text" && !textPayload) textPayload = parseMaybeJson(part.text);
    });
  }
  if (Array.isArray(body.image_urls)) {
    imageUrlCount += body.image_urls.filter(Boolean).length;
  }
  if (body.input && Array.isArray(body.input.media)) {
    imageUrlCount += body.input.media.filter((item) => item && item.url).length;
  }
  referenceImageCount = Number(parameters.reference_image_count || 0) || imageUrlCount;
  if (!textPayload) textPayload = extractLlmUserContent(providerRequest);
  return {
    imagePartCount,
    imageUrlCount,
    referenceImageCount,
    duration: body.duration !== undefined ? body.duration : parameters.duration,
    topLevelDuration: body.duration,
    parameterDuration: parameters.duration,
    ratio: body.ratio || parameters.ratio || body.aspect_ratio || parameters.aspect_ratio || "",
    resolution: body.resolution || parameters.resolution || "",
    requiresReferenceImage: Boolean(providerRequest && providerRequest.requiresReferenceImage),
    inlineFrameImageCount: Number(textPayload && textPayload.inlineFrameImageCount || 0),
    visualInputMode: textPayload && textPayload.visualInputMode || "",
    frameCount: Array.isArray(textPayload && textPayload.frames) ? textPayload.frames.length : 0,
  };
}

function missingReferenceImageMessage(providerRequest, summary) {
  const validation = providerRequest && providerRequest.referenceImageValidation || {};
  const reason = validation.missingReason || "请求体里没有可被模型访问的 image_url / image_urls。";
  return `模型没有收到产品图链接：${reason} 请先上传到 ImgBB/公网图床，或填写公网 HTTPS 图片链接后再生成视频。`;
}

function isOfficialJimengProviderRequest(providerRequest) {
  if (!providerRequest) return false;
  return providerRequest.apiStyle === "jimeng-seedance-official" ||
    providerRequest.provider === "jimeng-seedance-official";
}

function assertOfficialJimengContentRoles(providerRequest) {
  if (!isOfficialJimengProviderRequest(providerRequest)) return;
  const method = String(providerRequest && providerRequest.method || "POST").toUpperCase();
  if (["GET", "HEAD", "DELETE"].includes(method)) return;
  const content = providerRequest && providerRequest.body && providerRequest.body.content;
  if (!Array.isArray(content)) return;
  const missingRole = content.find((part) => part && part.type === "image_url" && !part.role);
  const invalidRole = content.find((part) =>
    part && part.type === "image_url" && part.role && !["first_frame", "last_frame", "reference_image"].includes(part.role)
  );
  if (!missingRole && !invalidRole) return;
  const error = new Error(missingRole
    ? "官方即梦请求体不完整：image content 必须带 role 字段。请刷新页面后重新生成视频。"
    : "官方即梦请求体不完整：多模态参考图的 image content role 必须是 reference_image。请刷新页面后重新生成视频。");
  error.code = missingRole ? "JIMENG_IMAGE_CONTENT_ROLE_MISSING" : "JIMENG_IMAGE_CONTENT_ROLE_INVALID";
  throw error;
}

function assertProviderReferenceImages(kind, providerRequest, summary) {
  if (kind !== "video") return;
  const method = String(providerRequest && providerRequest.method || "POST").toUpperCase();
  if (["GET", "HEAD", "DELETE"].includes(method)) return;
  const requiresReferenceImage = providerRequest && (
    isOfficialJimengProviderRequest(providerRequest) ||
    providerRequest.requiresReferenceImage === true ||
    providerRequest.referenceImageValidation && providerRequest.referenceImageValidation.required === true
  );
  if (!requiresReferenceImage) return;
  if (summary && Number(summary.imageUrlCount || 0) > 0) return;
  const error = new Error(missingReferenceImageMessage(providerRequest, summary));
  error.code = "MODEL_REFERENCE_IMAGE_MISSING";
  throw error;
}

function findStringUrl(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  return "";
}

function providerVideoUrl(data) {
  if (!data || typeof data !== "object") return "";
  const direct = findStringUrl(data.video_url) || findStringUrl(data.videoUrl) || findStringUrl(data.url);
  if (direct) return direct;
  const content = data.content || {};
  const contentUrl = findStringUrl(content.video_url) || findStringUrl(content.videoUrl) || findStringUrl(content.url);
  if (contentUrl) return contentUrl;
  const output = data.output || {};
  const outputUrl = findStringUrl(output.video_url) || findStringUrl(output.videoUrl) || findStringUrl(output.url);
  if (outputUrl) return outputUrl;
  const candidates = [
    ...(Array.isArray(data.data) ? data.data : []),
    ...(Array.isArray(data.result) ? data.result : []),
    ...(Array.isArray(output.videos) ? output.videos : []),
  ];
  for (const item of candidates) {
    const itemUrl = item && (findStringUrl(item.video_url) || findStringUrl(item.videoUrl) || findStringUrl(item.url));
    if (itemUrl) return itemUrl;
  }
  return "";
}

function providerStatusSucceeded(data) {
  const status = String(data && (data.status || data.state || data.task_status || data.providerStatus) || "").toLowerCase();
  if (!status) return true;
  return ["succeeded", "success", "completed", "done", "finished"].includes(status);
}

function expectedVideoDuration(providerRequest) {
  const duration = Number(
    providerRequest && (
      providerRequest.expectedDuration ||
      providerRequest.duration && providerRequest.duration.submitted ||
      providerRequest.body && providerRequest.body.parameters && providerRequest.body.parameters.duration ||
      providerRequest.body && providerRequest.body.duration
    )
  );
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function shouldValidateProviderVideoDuration(kind, providerRequest, proxied) {
  const method = String(providerRequest && providerRequest.method || "POST").toUpperCase();
  if (kind !== "video" || method !== "GET") return false;
  if (!isOfficialJimengProviderRequest(providerRequest)) return false;
  if (!proxied || !proxied.ok || !providerStatusSucceeded(proxied.data)) return false;
  if (!expectedVideoDuration(providerRequest)) return false;
  return Boolean(providerVideoUrl(proxied.data));
}

function probeVideoDurationSeconds(url) {
  const result = spawnSync(ffprobeCommand(), [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    url,
  ], { encoding: "utf8", timeout: 30000 });
  if (result.error) {
    throw new Error(`视频时长检测失败：${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").split("\n").slice(-3).join(" ").trim();
    throw new Error(`视频时长检测失败：${stderr || `ffprobe exit ${result.status}`}`);
  }
  const duration = Number(String(result.stdout || "").trim().split(/\s+/)[0]);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("视频时长检测失败：ffprobe 没有返回有效时长。");
  }
  return duration;
}

function validateProviderVideoDuration(kind, providerRequest, proxied) {
  if (!shouldValidateProviderVideoDuration(kind, providerRequest, proxied)) return proxied;
  const expected = expectedVideoDuration(providerRequest);
  const actual = probeVideoDurationSeconds(providerVideoUrl(proxied.data));
  const tolerance = 0.75;
  if (actual < expected - tolerance) {
    const error = new Error(`视频时长不符合要求：期望 ${expected}s，实际 ${actual.toFixed(2)}s。上游没有按 15 秒出片，请重新生成或检查官方即梦模型/账号是否支持 15 秒。`);
    error.code = "VIDEO_DURATION_MISMATCH";
    throw error;
  }
  proxied.data = Object.assign({}, proxied.data, {
    durationCheck: {
      expectedSeconds: expected,
      actualSeconds: Number(actual.toFixed(3)),
    },
  });
  return proxied;
}

async function handleProvider(req, res, kind) {
  let providerRequest = null;
  try {
    const payload = await readBody(req);
    providerRequest = prepareOfficialJimengRequest(payload.providerRequest || payload);
    const baseEvent = {
      kind,
      provider: providerRequest.provider,
      mode: providerRequest.mode || "",
      endpoint: providerRequest.endpoint || "",
      method: providerRequest.method || (providerRequest.mode === "http" ? "POST" : "MOCK"),
    };
    const summary = providerRequestSummary(providerRequest);
    logProviderEvent({
      ...baseEvent,
      phase: "request",
      model: providerRequest.model || providerRequest.body?.model || "",
      postCount: providerRequest.body?.posts?.length || 0,
      requestSummary: summary,
    });
    assertProviderReferenceImages(kind, providerRequest, summary);
    assertOfficialJimengContentRoles(providerRequest);
    if (providerRequest.mode !== "http") {
      throw new Error("non-http provider mode has been removed; configure a real HTTP provider.");
    }
    if (providerRequest.mode === "http") {
      const useRetry = shouldRetryProviderKind(kind, providerRequest);
      const proxied = useRetry ? await proxyHttpWithRetry(providerRequest, {
        onRetry: (retry) => logProviderEvent({
          ...baseEvent,
          phase: "retry",
          attempt: retry.attempt,
          nextAttempt: retry.nextAttempt,
          status: retry.status,
          error: retry.error,
        }),
      }) : await proxyHttp(providerRequest);
      let finalProxied = proxied;
      try {
        finalProxied = validateProviderVideoDuration(kind, providerRequest, proxied);
      } catch (durationError) {
        finalProxied = {
          status: proxied.status,
          ok: false,
          attempts: proxied.attempts || 1,
          data: {
            error: {
              code: durationError.code || "VIDEO_DURATION_CHECK_FAILED",
              message: durationError.message,
            },
            upstream: proxied.data,
          },
        };
      }
      logProviderEvent({
        ...baseEvent,
        phase: "response",
        ok: finalProxied.ok,
        status: finalProxied.status,
        attempts: finalProxied.attempts || 1,
        data: redactProxyData(finalProxied.data),
      });
      sendJson(res, finalProxied.ok ? 200 : 502, {
        ok: finalProxied.ok,
        mode: "http",
        provider: providerRequest.provider,
        error: finalProxied.ok ? undefined : retryAwareFailureMessage(finalProxied),
        upstream: finalProxied,
      });
      return;
    }
  } catch (error) {
    const errorMessage = providerErrorMessage(error);
    logProviderEvent({
      kind,
      provider: providerRequest?.provider || "",
      mode: providerRequest?.mode || "",
      endpoint: providerRequest?.endpoint || "",
      phase: "error",
      ok: false,
      error: errorMessage,
    });
    sendJson(res, 400, { ok: false, error: errorMessage });
  }
}

async function handleProviderStream(req, res, kind) {
  let providerRequest = null;
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  });
  try {
    const payload = await readBody(req);
    providerRequest = payload.providerRequest || payload;
    const baseEvent = {
      kind,
      provider: providerRequest.provider,
      mode: providerRequest.mode || "",
      endpoint: providerRequest.endpoint || "",
      method: providerRequest.method || (providerRequest.mode === "http" ? "POST" : "MOCK"),
    };
    writeStreamEvent(res, { type: "start", provider: providerRequest.provider, kind });
    logProviderEvent({
      ...baseEvent,
      phase: "stream-request",
      model: providerRequest.model || providerRequest.body?.model || "",
      requestSummary: providerRequestSummary(providerRequest),
    });
    if (providerRequest.mode !== "http") {
      throw new Error("non-http provider mode has been removed; configure a real HTTP provider.");
    }
    const useRetry = shouldRetryProviderKind(kind, providerRequest);
    const proxied = useRetry ? await proxyHttpStreamWithRetry(providerRequest, (event) => writeStreamEvent(res, event), {
      onRetry: (retry) => logProviderEvent({
        ...baseEvent,
        phase: "stream-retry",
        attempt: retry.attempt,
        nextAttempt: retry.nextAttempt,
        status: retry.status,
        error: retry.error,
      }),
    }) : await proxyHttpStream(providerRequest, (event) => writeStreamEvent(res, event));
    logProviderEvent({
      ...baseEvent,
      phase: "stream-response",
      ok: proxied.ok,
      status: proxied.status,
      attempts: proxied.attempts || 1,
      data: redactProxyData(proxied.data),
    });
    writeStreamEvent(res, {
      type: "done",
      ok: proxied.ok,
      error: proxied.ok ? "" : retryAwareFailureMessage(proxied),
      upstream: proxied,
    });
    res.end();
  } catch (error) {
    const errorMessage = providerErrorMessage(error);
    logProviderEvent({
      kind,
      provider: providerRequest?.provider || "",
      mode: providerRequest?.mode || "",
      endpoint: providerRequest?.endpoint || "",
      phase: "stream-error",
      ok: false,
      error: errorMessage,
    });
    writeStreamEvent(res, { type: "error", ok: false, error: errorMessage });
    res.end();
  }
}

function isInside(baseDir, filePath) {
  const relative = path.relative(baseDir, filePath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const isOutputPath = pathname.startsWith("/outputs/");
  const baseDir = isOutputPath ? OUTPUTS_ROOT : ROOT;
  const requestPath = isOutputPath ? pathname.slice("/outputs".length) : pathname;
  const filePath = path.normalize(path.join(baseDir, requestPath));
  if (!isInside(baseDir, filePath)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "ai-video-workbench-mvp" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/test") {
      handleTestConnection(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/uploads/video") {
      handleVideoUpload(req, res, url);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/uploads/image") {
      handleImageUpload(req, res, url);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/video/frames") {
      handleVideoFrames(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/video/download") {
      handleVideoDownload(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/publisher/media-upload") {
      handlePublisherMediaUpload(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/storyboard") {
      handleProvider(req, res, "storyboard");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/storyboard-stream") {
      handleProviderStream(req, res, "storyboard");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/reverse-storyboard") {
      handleProvider(req, res, "reverse-storyboard");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/content-plan-stream") {
      handleProviderStream(req, res, "content-plan");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/content-plan") {
      handleProvider(req, res, "content-plan");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/brief") {
      handleProvider(req, res, "brief");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/video") {
      handleProvider(req, res, "video");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/video-quality-review") {
      handleProvider(req, res, "video-quality-review");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/copy") {
      handleProvider(req, res, "copy");
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/provider/publisher") {
      handleProvider(req, res, "publisher");
      return;
    }
    if (req.method === "GET") {
      serveStatic(req, res);
      return;
    }
    sendJson(res, 405, { ok: false, error: "method not allowed" });
  });
}

if (require.main === module) {
  createServer().listen(PORT, "127.0.0.1", () => {
    console.log(`AI video workbench MVP: http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createServer, ffmpegCommand, ffprobeCommand };
