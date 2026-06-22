const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createServer, ffmpegCommand } = require("./server.js");
const Core = require("./core.js");

async function request(baseUrl, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (options.expectOk === false) {
    assert.ok(!response.ok, `${path} should return non-2xx`);
    return { response, data };
  }
  assert.ok(response.ok, `${path} should return 2xx: ${JSON.stringify(data)}`);
  assert.notStrictEqual(data.ok, false, `${path} should not return ok false`);
  return data;
}

async function requestRaw(baseUrl, path, body, contentType, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const data = await response.json();
  if (options.expectOk === false) {
    assert.ok(!response.ok, `${path} should return non-2xx`);
    return { response, data };
  }
  assert.ok(response.ok, `${path} should return 2xx: ${JSON.stringify(data)}`);
  assert.notStrictEqual(data.ok, false, `${path} should not return ok false`);
  return data;
}

async function requestText(baseUrl, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (options.expectOk === false) {
    assert.ok(!response.ok || text.includes("\"type\":\"error\""), `${path} should return an error stream`);
    return { response, text };
  }
  assert.ok(response.ok, `${path} should return 2xx text response: ${text}`);
  return { response, text };
}

async function main() {
  const originalFfmpegPath = process.env.AI_VIDEO_FFMPEG_PATH;
  process.env.AI_VIDEO_FFMPEG_PATH = "/tmp/custom-ffmpeg";
  assert.strictEqual(ffmpegCommand(), "/tmp/custom-ffmpeg", "server honors AI_VIDEO_FFMPEG_PATH for desktop bundles");
  delete process.env.AI_VIDEO_FFMPEG_PATH;
  assert.strictEqual(ffmpegCommand(), "ffmpeg", "server falls back to PATH ffmpeg");
  if (originalFfmpegPath) process.env.AI_VIDEO_FFMPEG_PATH = originalFfmpegPath;

  const outputFixtureDir = path.join(__dirname, "..", "outputs");
  const outputFixturePath = path.join(outputFixtureDir, "verify-static-video.mp4");
  const providerEventsPath = path.join(outputFixtureDir, "provider-events.jsonl");
  const ffprobeFixturePath = path.join(outputFixtureDir, "verify-ffprobe.js");
  fs.mkdirSync(outputFixtureDir, { recursive: true });
  fs.writeFileSync(outputFixturePath, Buffer.from("verify-video"));
  fs.writeFileSync(ffprobeFixturePath, "#!/usr/bin/env node\nprocess.stdout.write(process.env.VERIFY_FFPROBE_DURATION || '5.061950');\n");
  fs.chmodSync(ffprobeFixturePath, 0o755);
  fs.rmSync(providerEventsPath, { force: true });
  const originalFfprobePath = process.env.AI_VIDEO_FFPROBE_PATH;
  const originalVerifyFfprobeDuration = process.env.VERIFY_FFPROBE_DURATION;
  process.env.AI_VIDEO_FFPROBE_PATH = ffprobeFixturePath;
  process.env.IMAGE_HOST_PROVIDER = "";

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const upstreamCalls = [];
  let flakyCompletionsAttempts = 0;
  let flakyStreamAttempts = 0;
  const upstream = http.createServer((req, res) => {
    const call = { method: req.method, url: req.url, body: "" };
    upstreamCalls.push(call);
    if (req.url.startsWith("/imgbb/upload") && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk.toString("latin1");
      });
      req.on("end", () => {
        const requestUrl = new URL(req.url, upstreamBaseUrl || "http://127.0.0.1");
        call.contentType = req.headers["content-type"] || "";
        call.apiKey = requestUrl.searchParams.get("key") || "";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          status: 200,
          data: {
            url: "https://i.ibb.co/verify/hosted.png",
            display_url: "https://i.ibb.co/verify/hosted-display.png",
            image: { url: "https://i.ibb.co/verify/hosted.png" },
          },
        }));
      });
      return;
    }
    if (req.url === "/video/official-short-status" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "cgt-short",
        status: "succeeded",
        content: { video_url: "https://example.test/short-five-second.mp4" },
      }));
      return;
    }
    if (req.url === "/chat/flaky-completions" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        flakyCompletionsAttempts += 1;
        if (flakyCompletionsAttempts < 3) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: `temporary upstream failure ${flakyCompletionsAttempts}` } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  contentPlan: {
                    productUnderstanding: "重试后返回的内容规划。",
                    targetAudience: "TikTok 美国用户。",
                    keySellingPoints: ["retry recovered"],
                    usageScenarios: ["outdoor"],
                    strategy: "先失败两次，第三次恢复。",
                    hook: "Retry works.",
                    reviewSummary: "重试恢复后可继续处理。",
                    complianceNotes: ["不要重复创建任务"],
                  },
                }),
              },
            },
          ],
        }));
      });
      return;
    }
    if (req.url === "/chat/flaky-stream" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        flakyStreamAttempts += 1;
        if (flakyStreamAttempts < 3) {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: `temporary stream failure ${flakyStreamAttempts}` } }));
          return;
        }
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"contentPlan\":" } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"productUnderstanding\":\"stream retry\",\"targetAudience\":\"US users\",\"keySellingPoints\":[\"stream recovered\"],\"strategy\":\"retry\",\"hook\":\"Recovered\"}}" } }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    if (req.url === "/chat/auth-failure" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "invalid api key" } }));
      });
      return;
    }
    if (req.url === "/videos/generated.mp4") {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end(Buffer.from("downloaded-video"));
      return;
    }
    if (req.url === "/media/upload" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({
          data: {
            media_id: "media-verify-1",
            upload_url: `${upstreamBaseUrl}/media/upload-target`,
            upload_method: {
              method: "PUT",
              content_type: "video/mp4",
              headers: { "x-upload-token": "verify" },
            },
          },
          error: null,
        }));
      });
      return;
    }
    if (req.url === "/media/upload-target" && req.method === "PUT") {
      req.on("data", (chunk) => {
        call.body += chunk.toString("utf8");
      });
      req.on("end", () => {
        call.contentType = req.headers["content-type"] || "";
        call.uploadToken = req.headers["x-upload-token"] || "";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (req.url === "/media/media-verify-1/complete" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          data: { id: "media-verify-1", status: "ready", type: "video" },
          error: null,
        }));
      });
      return;
    }
    if (req.url === "/chat/stream" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"contentPlan\":" } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "{\"productUnderstanding\":\"neck fan\",\"targetAudience\":\"US users\",\"keySellingPoints\":[\"strong wind\"],\"strategy\":\"UGC\",\"hook\":\"Stay cool\"}}" } }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    if (req.url === "/chat/storyboard-stream" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        const responseText = JSON.stringify({
          tasks: [
            {
              title: "Kitchen rescue",
              angle: "UGC kitchen rescue",
              hook: "Too hot in the kitchen",
              duration: 15,
              scenes: [
                { time: "0-5s", title: "Heat hook", visual: "Sweaty kitchen opener.", subtitle: "It's way too hot.", videoPrompt: "Hot kitchen UGC opener." },
                { time: "5-10s", title: "Fan reveal", visual: "Husband puts the neck fan on her.", subtitle: "Try this.", videoPrompt: "Neck fan reveal." },
                { time: "10-15s", title: "CTA", visual: "Couple talks to camera.", subtitle: "Link in bio.", videoPrompt: "Natural TikTok CTA." },
              ],
            },
          ],
        });
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: responseText.slice(0, 80) } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: responseText.slice(80) } }] })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    if (req.url === "/chat/embedded-error-stream" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write(JSON.stringify({ error: { message: "gpt-5.5 所有账号暂时不可用，请 40 秒后重试", type: "rate_limit_exceeded", code: null } }));
        res.write("\n");
        res.write(JSON.stringify({ choices: [], usage: { prompt_tokens: 15195, completion_tokens: 0, total_tokens: 15195 } }));
        res.end("\n");
      });
      return;
    }
    if (req.url === "/chat/empty-sse" && req.method === "POST") {
      req.on("data", (chunk) => {
        call.body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1913, completion_tokens: 0, total_tokens: 1913 } })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "GET") {
      res.end(JSON.stringify({ output: { task_status: "SUCCEEDED", video_url: "https://example.test/video.mp4" } }));
      return;
    }
    req.on("data", (chunk) => {
      call.body += chunk;
    });
    req.on("end", () => {
      res.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                contentPlan: {
                  productUnderstanding: "挂脖风扇，免手持，适合夏季户外。",
                  targetAudience: "TikTok 美国用户。",
                  keySellingPoints: ["hands-free", "portable"],
                  usageScenarios: ["commute", "outdoor"],
                  strategy: "热浪痛点开场，展示佩戴和风速。",
                  hook: "Wear the breeze.",
                  reviewSummary: "避免夸大降温效果。",
                  complianceNotes: ["不承诺具体降温度数"],
                  scenes: [
                    {
                      time: "0-3s",
                      title: "热浪痛点",
                      visual: "用户在户外排队出汗，拿出挂脖风扇。",
                      subtitle: "Too hot outside?",
                      videoPrompt: "vertical video, neck fan reveal in summer queue",
                    },
                  ],
                },
              }),
            },
          },
        ],
      }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamBaseUrl = `http://127.0.0.1:${upstream.address().port}`;
  try {
    const state = Core.createInitialState();
    state.products[0].imageUrl = "https://example.test/neck-fan.png";
    state.contentBrief.seed = "我想在 TikTok 美国地区售卖一款挂脖风扇。";
    state.integrations.llm.endpoint = `${upstreamBaseUrl}/chat/completions`;
    state.integrations.llm.apiKey = "llm-secret-verify";
    const contentPlanRequest = Core.buildContentPlanProviderRequest(state);

    const health = await request(baseUrl, "/api/health");
    assert.strictEqual(health.service, "ai-video-workbench-mvp", "health service name");

    const rejectedNonHttp = await request(baseUrl, "/api/provider/content-plan", {
      providerRequest: Object.assign({}, contentPlanRequest, { mode: "mock" }),
    }, { expectOk: false });
    assert.strictEqual(rejectedNonHttp.data.ok, false, "non-http provider call is rejected");
    assert.match(rejectedNonHttp.data.error, /non-http|真实接口|HTTP/i, "rejection explains real HTTP mode requirement");

    const contentPlan = await request(baseUrl, "/api/provider/content-plan", {
      providerRequest: contentPlanRequest,
    });
    assert.strictEqual(contentPlan.mode, "http", "content plan uses real HTTP mode");
    assert.strictEqual(upstreamCalls[0].method, "POST", "content plan proxy uses POST");
    const created = Core.applyContentPlanProviderResult(state, contentPlanRequest, contentPlan);
    assert.ok(created, "content plan provider response creates a task");
    assert.strictEqual(created.status, "content_plan_ready", "created task enters content plan review");

    const retriedContentPlan = await request(baseUrl, "/api/provider/content-plan", {
      providerRequest: Object.assign({}, contentPlanRequest, { endpoint: `${upstreamBaseUrl}/chat/flaky-completions` }),
    });
    assert.strictEqual(retriedContentPlan.ok, true, "non-stream LLM proxy succeeds after transient upstream failures");
    assert.strictEqual(flakyCompletionsAttempts, 3, "non-stream LLM proxy retries transient failures up to three total attempts");
    assert.strictEqual(retriedContentPlan.upstream.attempts, 3, "non-stream retry count is returned to the caller");

    const streamedContentPlan = await requestText(baseUrl, "/api/provider/content-plan-stream", {
      providerRequest: contentPlanRequest,
    });
    assert.match(streamedContentPlan.response.headers.get("content-type") || "", /application\/x-ndjson/, "content plan stream returns ndjson");
    const streamLines = streamedContentPlan.text.trim().split("\n").map((line) => JSON.parse(line));
    assert.strictEqual(streamLines[0].type, "start", "content plan stream starts with a start event");
    assert.ok(streamLines.some((event) => event.type === "chunk" && event.text.includes("contentPlan")), "content plan stream forwards upstream text chunks");
    assert.strictEqual(streamLines.at(-1).type, "done", "content plan stream ends with a done event");
    assert.strictEqual(streamLines.at(-1).upstream.ok, true, "content plan stream includes the upstream proxy result");

    const sseContentPlanRequest = Object.assign({}, contentPlanRequest, { endpoint: `${upstreamBaseUrl}/chat/stream` });
    const sseContentPlan = await requestText(baseUrl, "/api/provider/content-plan-stream", {
      providerRequest: sseContentPlanRequest,
    });
    const sseLines = sseContentPlan.text.trim().split("\n").map((line) => JSON.parse(line));
    const sseChunks = sseLines.filter((event) => event.type === "chunk").map((event) => event.text).join("");
    assert.ok(JSON.parse(upstreamCalls.find((call) => call.url === "/chat/stream").body).stream, "content plan stream enables upstream LLM streaming");
    assert.ok(sseChunks.startsWith("{\"contentPlan\""), "content plan stream forwards clean SSE delta text");
    assert.ok(!sseChunks.includes("data:"), "content plan stream does not expose raw SSE framing to the UI");
    assert.deepStrictEqual(Core.applyContentPlanProviderResult(state, sseContentPlanRequest, {
      ok: true,
      upstream: sseLines.at(-1).upstream,
    }).contentPlan.keySellingPoints, ["strong wind"], "clean SSE text remains parseable as a content plan result");

    const flakyStreamContentPlan = await requestText(baseUrl, "/api/provider/content-plan-stream", {
      providerRequest: Object.assign({}, contentPlanRequest, { endpoint: `${upstreamBaseUrl}/chat/flaky-stream` }),
    });
    const flakyStreamLines = flakyStreamContentPlan.text.trim().split("\n").map((line) => JSON.parse(line));
    assert.strictEqual(flakyStreamLines.at(-1).ok, true, "stream LLM proxy succeeds after transient upstream failures before content starts");
    assert.strictEqual(flakyStreamAttempts, 3, "stream LLM proxy retries transient failures up to three total attempts");
    assert.strictEqual(flakyStreamLines.at(-1).upstream.attempts, 3, "stream retry count is returned to the caller");
    assert.ok(flakyStreamLines.filter((event) => event.type === "chunk").map((event) => event.text).join("").includes("stream retry"), "stream retry only forwards chunks from the successful attempt");

    state.contentBrief.storyboardSceneCount = "10";
    state.contentBrief.storyboardDetailLevel = "dense";
    const storyboardRequest = Core.buildStoryboardFromContentPlanProviderRequest(state, created);
    storyboardRequest.endpoint = `${upstreamBaseUrl}/chat/storyboard-stream`;
    created.providerRequests = created.providerRequests || {};
    created.providerRequests.storyboard = storyboardRequest;
    const streamedStoryboard = await requestText(baseUrl, "/api/provider/storyboard-stream", {
      providerRequest: storyboardRequest,
    });
    assert.match(streamedStoryboard.response.headers.get("content-type") || "", /application\/x-ndjson/, "storyboard stream returns ndjson");
    const storyboardStreamLines = streamedStoryboard.text.trim().split("\n").map((line) => JSON.parse(line));
    const storyboardChunks = storyboardStreamLines.filter((event) => event.type === "chunk").map((event) => event.text).join("");
    assert.strictEqual(storyboardStreamLines[0].type, "start", "storyboard stream starts with a start event");
    assert.ok(storyboardChunks.includes("\"tasks\""), "storyboard stream forwards upstream storyboard chunks");
    assert.ok(JSON.parse(upstreamCalls.find((call) => call.url === "/chat/storyboard-stream").body).stream, "storyboard stream enables upstream LLM streaming");
    assert.strictEqual(storyboardStreamLines.at(-1).type, "done", "storyboard stream ends with a done event");
    assert.strictEqual(storyboardStreamLines.at(-1).upstream.ok, true, "storyboard stream includes the upstream proxy result");
    Core.applyStoryboardProviderResult([created], {
      ok: true,
      upstream: storyboardStreamLines.at(-1).upstream,
    });
    assert.strictEqual(created.storyboard.length, 10, "streamed storyboard result is repaired to the requested 10 scenes");

    const embeddedErrorStream = await requestText(baseUrl, "/api/provider/storyboard-stream", {
      providerRequest: Object.assign({}, storyboardRequest, {
        endpoint: `${upstreamBaseUrl}/chat/embedded-error-stream`,
      }),
    });
    const embeddedErrorLines = embeddedErrorStream.text.trim().split("\n").map((line) => JSON.parse(line));
    const embeddedErrorDone = embeddedErrorLines.at(-1);
    assert.strictEqual(embeddedErrorDone.type, "done", "embedded upstream error still ends the stream");
    assert.strictEqual(embeddedErrorDone.ok, false, "embedded upstream error marks stream as failed");
    assert.match(embeddedErrorDone.error, /gpt-5\.5.*不可用|重试/i, "embedded upstream error is surfaced to the UI");

    const rejectedUpload = await requestRaw(baseUrl, "/api/uploads/video?filename=note.txt", Buffer.from("not-video"), "text/plain", { expectOk: false });
    assert.match(rejectedUpload.data.error, /mp4|mov|webm|视频/i, "non-video upload rejection explains accepted formats");

    const rejectedImageUpload = await requestRaw(baseUrl, "/api/uploads/image?filename=note.txt", Buffer.from("not-image"), "text/plain", { expectOk: false });
    assert.match(rejectedImageUpload.data.error, /png|jpg|jpeg|webp|图片/i, "non-image upload rejection explains accepted formats");

    const uploadedImage = await requestRaw(baseUrl, "/api/uploads/image?filename=front.png", Buffer.from("verify-image"), "image/png");
    assert.strictEqual(uploadedImage.upload.fileName, "front.png", "image upload returns file name");
    assert.ok(uploadedImage.upload.url.startsWith("/outputs/uploads/"), "image upload returns browser URL");
    assert.strictEqual(uploadedImage.upload.mimeType, "image/png", "image upload returns image mime type");
    const uploadedImageFile = path.join(__dirname, "..", uploadedImage.upload.url);
    assert.ok(fs.existsSync(uploadedImageFile), "image upload stores file under outputs uploads");
    const originalImageHostProvider = process.env.IMAGE_HOST_PROVIDER;
    const originalImgbbApiKey = process.env.IMGBB_API_KEY;
    const originalImgbbUploadEndpoint = process.env.IMGBB_UPLOAD_ENDPOINT;
    process.env.IMAGE_HOST_PROVIDER = "imgbb";
    process.env.IMGBB_API_KEY = "verify-imgbb-key";
    process.env.IMGBB_UPLOAD_ENDPOINT = `${upstreamBaseUrl}/imgbb/upload`;
    const imgbbImage = await requestRaw(baseUrl, "/api/uploads/image?filename=imgbb.png", Buffer.from("imgbb-image"), "image/png");
    assert.strictEqual(imgbbImage.upload.publicUrl, "https://i.ibb.co/verify/hosted.png", "ImgBB upload returns the hosted direct image URL");
    assert.strictEqual(imgbbImage.upload.modelVisible, true, "ImgBB hosted upload is marked model visible");
    assert.strictEqual(imgbbImage.upload.imageHostProvider, "imgbb", "ImgBB hosted upload records the image host provider");
    const imgbbCall = upstreamCalls.find((call) => call.url.startsWith("/imgbb/upload"));
    assert.ok(imgbbCall, "image upload calls the configured ImgBB endpoint");
    assert.strictEqual(imgbbCall.apiKey, "verify-imgbb-key", "image upload sends the ImgBB API key as a query parameter");
    assert.match(imgbbCall.contentType, /multipart\/form-data/i, "image upload sends ImgBB multipart form data");
    if (originalImageHostProvider === undefined) {
      delete process.env.IMAGE_HOST_PROVIDER;
    } else {
      process.env.IMAGE_HOST_PROVIDER = originalImageHostProvider;
    }
    if (originalImgbbApiKey === undefined) {
      delete process.env.IMGBB_API_KEY;
    } else {
      process.env.IMGBB_API_KEY = originalImgbbApiKey;
    }
    if (originalImgbbUploadEndpoint === undefined) {
      delete process.env.IMGBB_UPLOAD_ENDPOINT;
    } else {
      process.env.IMGBB_UPLOAD_ENDPOINT = originalImgbbUploadEndpoint;
    }
    const originalPublicUploadBaseUrl = process.env.AI_VIDEO_PUBLIC_UPLOAD_BASE_URL;
    process.env.AI_VIDEO_PUBLIC_UPLOAD_BASE_URL = "https://cdn.example.test/workbench-assets/";
    const hostedImage = await requestRaw(baseUrl, "/api/uploads/image?filename=hosted.png", Buffer.from("hosted-image"), "image/png");
    assert.ok(hostedImage.upload.publicUrl.startsWith("https://cdn.example.test/workbench-assets/uploads/"), "image upload returns a model-visible public URL when configured");
    assert.ok(hostedImage.upload.publicUrl.endsWith("/hosted.png"), "image upload public URL preserves the stored filename");
    assert.strictEqual(hostedImage.upload.modelVisible, true, "image upload marks public URLs as model visible");
    if (originalPublicUploadBaseUrl === undefined) {
      delete process.env.AI_VIDEO_PUBLIC_UPLOAD_BASE_URL;
    } else {
      process.env.AI_VIDEO_PUBLIC_UPLOAD_BASE_URL = originalPublicUploadBaseUrl;
    }

    const uploaded = await requestRaw(baseUrl, "/api/uploads/video?filename=reference.mp4", Buffer.from("verify-video"), "video/mp4");
    assert.strictEqual(uploaded.upload.fileName, "reference.mp4", "video upload returns file name");
    assert.ok(uploaded.upload.url.startsWith("/outputs/uploads/"), "video upload returns browser URL");
    const uploadedFile = path.join(__dirname, "..", uploaded.upload.url);
    assert.ok(fs.existsSync(uploadedFile), "video upload stores file under outputs uploads");

    const frameResult = await request(baseUrl, "/api/video/frames", {
      uploadId: uploaded.upload.id,
      url: uploaded.upload.url,
      count: 2,
    }, { expectOk: false });
    assert.match(frameResult.data.error, /ffmpeg|抽帧|视频/i, "frame endpoint reports extraction dependency or media error clearly");

    const reverseProviderRequest = Core.buildReverseStoryboardProviderRequest(Object.assign(state, {
      integrations: Object.assign({}, state.integrations, {
        llm: Object.assign({}, state.integrations.llm, {
          provider: "custom-llm",
          model: "gpt-5.5",
          apiStyle: "openai-chat",
        }),
      }),
      reverseVideo: {
        upload: uploaded.upload,
        frames: [{ time: "0.0s", url: "/outputs/uploads/upload_verify/frames/frame-001.jpg", label: "frame-001", dataUrl: "data:image/jpeg;base64,AAA" }],
        result: null,
        selectedFavoriteId: "",
        notes: "测试反推",
        status: "frames_ready",
        error: "",
      },
    }));
    reverseProviderRequest.endpoint = `${upstreamBaseUrl}/chat/completions`;
    const reverseProvider = await request(baseUrl, "/api/provider/reverse-storyboard", {
      providerRequest: reverseProviderRequest,
    });
    assert.strictEqual(reverseProvider.mode, "http", "reverse storyboard provider uses HTTP proxy");
    assert.strictEqual(upstreamCalls.at(-1).method, "POST", "reverse storyboard proxy uses POST");
    assert.strictEqual(JSON.parse(upstreamCalls.at(-1).body).stream, false, "non-stream reverse proxy explicitly disables upstream streaming");
    const reverseRequestLog = fs.readFileSync(providerEventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)).reverse().find((entry) => entry.kind === "reverse-storyboard" && entry.phase === "request");
    assert.strictEqual(reverseRequestLog.requestSummary.imagePartCount, 1, "reverse request log records inline image parts");
    assert.strictEqual(reverseRequestLog.requestSummary.inlineFrameImageCount, 1, "reverse request log records inline frame metadata count");

    const emptySseFailure = await request(baseUrl, "/api/provider/reverse-storyboard", {
      providerRequest: Object.assign({}, reverseProviderRequest, {
        endpoint: `${upstreamBaseUrl}/chat/empty-sse`,
      }),
    }, { expectOk: false });
    assert.strictEqual(emptySseFailure.response.status, 502, "reverse proxy rejects empty SSE responses");
    assert.match(emptySseFailure.data.error, /没有返回内容|empty/i, "reverse proxy surfaces empty upstream response clearly");

    const videoConnection = await request(baseUrl, "/api/provider/test", {
      config: {
        kind: "video",
        mode: "http",
        provider: "tongyi-wanxiang",
        endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
        apiKey: "test-key",
      },
    });
    assert.strictEqual(videoConnection.ok, true, "video connection test validates config without generation");

    const deepseekConnection = await request(baseUrl, "/api/provider/test", {
      config: {
        kind: "llm",
        mode: "http",
        provider: "deepseek",
        apiStyle: "openai-chat",
        endpoint: `${upstreamBaseUrl}/chat/completions`,
        model: "deepseek-v4-pro",
        apiKey: "test-key",
      },
    });
    assert.strictEqual(deepseekConnection.ok, true, "DeepSeek connection test can pass for text LLM usage");
    assert.strictEqual(deepseekConnection.capabilities.reverseStoryboard, false, "DeepSeek text model is marked unavailable for reverse storyboard");
    assert.ok(deepseekConnection.warnings.some((warning) => /反推不可用|图片输入/.test(warning)), "DeepSeek connection test warns that reverse storyboard is unavailable");

    const authFailureStart = upstreamCalls.length;
    const authFailure = await request(baseUrl, "/api/provider/test", {
      config: {
        kind: "llm",
        mode: "http",
        provider: "deepseek",
        apiStyle: "openai-chat",
        endpoint: `${upstreamBaseUrl}/chat/auth-failure`,
        model: "deepseek-v4-pro",
        apiKey: "bad-key",
      },
    }, { expectOk: false });
    assert.strictEqual(authFailure.response.status, 502, "LLM connection test maps upstream auth failure to 502");
    assert.strictEqual(upstreamCalls.slice(authFailureStart).filter((call) => call.url === "/chat/auth-failure").length, 1, "auth failures are not retried");

    state.integrations.video = {
      mode: "http",
      provider: "tongyi-wanxiang",
      apiStyle: "dashscope-video",
      statusEndpoint: `${upstreamBaseUrl}/api/v1/tasks/{task_id}`,
      endpoint: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      model: "wanx2.1-i2v-turbo",
      apiKey: "test-key",
    };
    created.video = { jobId: "task-123" };
    const statusRequest = Core.buildVideoStatusProviderRequest(state, created);
    const videoStatus = await request(baseUrl, "/api/provider/video", { providerRequest: statusRequest });
    assert.strictEqual(upstreamCalls.at(-1).method, "GET", "video status proxy uses GET");
    assert.strictEqual(videoStatus.upstream.data.output.video_url, "https://example.test/video.mp4", "video status proxy returns upstream result");

    const officialJimengVideo = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/official-jimeng`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [
            { type: "text", text: "stable product video" },
            { role: "reference_image", type: "image_url", image_url: { url: "https://example.test/front.png" } },
            { role: "reference_image", type: "image_url", image_url: { url: "https://example.test/side.png" } },
          ],
          duration: 15,
          ratio: "9:16",
          resolution: "720p",
          watermark: false,
          camera_fixed: false,
        },
      },
    });
    assert.strictEqual(officialJimengVideo.mode, "http", "official Jimeng video proxy uses HTTP mode");
    const officialJimengLog = fs.readFileSync(providerEventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)).reverse().find((entry) => entry.kind === "video" && entry.endpoint.endsWith("/video/official-jimeng") && entry.phase === "request");
    assert.strictEqual(officialJimengLog.requestSummary.imageUrlCount, 2, "official Jimeng request log records image URL content parts");
    assert.strictEqual(officialJimengLog.requestSummary.referenceImageCount, 2, "official Jimeng request log records explicit reference image count");
    assert.strictEqual(officialJimengLog.requestSummary.duration, 15, "official Jimeng request log records submitted duration");
    assert.strictEqual(officialJimengLog.requestSummary.topLevelDuration, 15, "official Jimeng request log records top-level duration");
    assert.strictEqual(officialJimengLog.requestSummary.ratio, "9:16", "official Jimeng request log records submitted ratio");
    assert.strictEqual(officialJimengLog.requestSummary.resolution, "720p", "official Jimeng request log records submitted resolution");

    const localOfficialImageDir = path.join(outputFixtureDir, "uploads", "verify-jimeng-inline");
    fs.mkdirSync(localOfficialImageDir, { recursive: true });
    fs.writeFileSync(path.join(localOfficialImageDir, "product.png"), Buffer.from("verify-product-image"));
    await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/official-local-inline`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [
            { type: "text", text: "stable product video" },
            {
              role: "reference_image",
              type: "image_url",
              image_url: {
                url: "https://i.ibb.co/unreachable/product.png",
                local_url: "/outputs/uploads/verify-jimeng-inline/product.png",
              },
            },
          ],
          duration: 15,
          ratio: "9:16",
          resolution: "720p",
        },
      },
    });
    const localInlineCall = upstreamCalls.find((call) => call.url === "/video/official-local-inline");
    assert.ok(localInlineCall, "official Jimeng local-inline request reaches upstream");
    const localInlineBody = JSON.parse(localInlineCall.body);
    assert.match(localInlineBody.content[1].image_url.url, /^data:image\/png;base64,/, "official Jimeng local upload is converted to a base64 image before upstream");
    assert.ok(!("local_url" in localInlineBody.content[1].image_url), "official Jimeng upstream request strips internal local_url metadata");

    const guardedVideoCallCount = upstreamCalls.length;
    const missingReferenceImage = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/missing-reference-image`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        requiresReferenceImage: true,
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [{ type: "text", text: "stable product video without image" }],
          parameters: { reference_image_count: 0 },
        },
      },
    }, { expectOk: false });
    assert.strictEqual(missingReferenceImage.response.status, 400, "video proxy rejects product video requests with no model-visible image URL");
    assert.match(missingReferenceImage.data.error, /模型没有收到产品图链接/, "missing image URL failure gives an operator-readable error");
    assert.strictEqual(upstreamCalls.length, guardedVideoCallCount, "missing image URL validation does not call the upstream video provider");

    const staleOfficialCallCount = upstreamCalls.length;
    const staleOfficialMissingReferenceImage = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/stale-official-no-image`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [{ type: "text", text: "stale official request without image" }],
          parameters: { duration: 15, reference_image_count: 0 },
        },
      },
    }, { expectOk: false });
    assert.strictEqual(staleOfficialMissingReferenceImage.response.status, 400, "official Jimeng requests require model-visible images even when stale clients omit requiresReferenceImage");
    assert.match(staleOfficialMissingReferenceImage.data.error, /模型没有收到产品图链接/, "stale official missing image failure is operator-readable");
    assert.strictEqual(upstreamCalls.length, staleOfficialCallCount, "stale official missing image validation does not call upstream");

    const missingOfficialImageRoleCallCount = upstreamCalls.length;
    const missingOfficialImageRole = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/official-missing-image-role`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [
            { type: "text", text: "official request with stale image content shape" },
            { type: "image_url", image_url: { url: "https://example.test/product.png" } },
          ],
          parameters: { duration: 15, reference_image_count: 1 },
        },
      },
    }, { expectOk: false });
    assert.strictEqual(missingOfficialImageRole.response.status, 400, "official Jimeng image content without role is rejected locally");
    assert.match(missingOfficialImageRole.data.error, /image content 必须带 role 字段/, "missing official image role failure is operator-readable");
    assert.strictEqual(upstreamCalls.length, missingOfficialImageRoleCallCount, "missing official image role validation does not call upstream");

    const invalidOfficialImageRoleCallCount = upstreamCalls.length;
    const invalidOfficialImageRole = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        endpoint: `${upstreamBaseUrl}/video/official-invalid-image-role`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        body: {
          model: "doubao-seedance-2-0-260128",
          content: [
            { type: "text", text: "official request with invalid image role" },
            { role: "user", type: "image_url", image_url: { url: "https://example.test/product.png" } },
          ],
          duration: 15,
          ratio: "9:16",
          resolution: "720p",
        },
      },
    }, { expectOk: false });
    assert.strictEqual(invalidOfficialImageRole.response.status, 400, "official Jimeng invalid image role is rejected locally");
    assert.match(invalidOfficialImageRole.data.error, /role 必须是 reference_image/, "invalid official image role failure is operator-readable");
    assert.strictEqual(upstreamCalls.length, invalidOfficialImageRoleCallCount, "invalid official image role validation does not call upstream");

    const shortOfficialStatus = await request(baseUrl, "/api/provider/video", {
      providerRequest: {
        provider: "jimeng-seedance-official",
        mode: "http",
        apiStyle: "jimeng-seedance-official",
        method: "GET",
        endpoint: `${upstreamBaseUrl}/video/official-short-status`,
        model: "doubao-seedance-2-0-260128",
        apiKey: "test-key",
        expectedDuration: 15,
      },
    }, { expectOk: false });
    assert.strictEqual(shortOfficialStatus.response.status, 502, "official Jimeng 5 second output is rejected when 15 seconds is expected");
    assert.match(shortOfficialStatus.data.error, /视频时长不符合要求/, "short official output gives an operator-readable duration failure");

    const downloaded = await request(baseUrl, "/api/video/download", {
      taskId: "task-download-verify",
      url: `${upstreamBaseUrl}/videos/generated.mp4`,
      fileName: "generated-video.mp4",
    });
    assert.strictEqual(downloaded.ok, true, "video download endpoint reports success");
    assert.ok(downloaded.localUrl.startsWith("/outputs/downloads/task-download-verify/"), "video download returns browser local URL");
    assert.ok(fs.existsSync(downloaded.localPath), "video download writes file to local outputs folder");
    assert.strictEqual(fs.readFileSync(downloaded.localPath, "utf8"), "downloaded-video", "video download stores upstream bytes");

    const quotaUpstream = http.createServer((req, res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: "quota_not_enough", message: "user quota is not enough", data: null }));
    });
    await new Promise((resolve) => quotaUpstream.listen(0, "127.0.0.1", resolve));
    try {
      const quotaUrl = `http://127.0.0.1:${quotaUpstream.address().port}/v1/videos/generations`;
      const quotaFailure = await request(baseUrl, "/api/provider/video", {
        providerRequest: {
          provider: "toapis-seedance",
          mode: "http",
          apiStyle: "toapis-video",
          endpoint: quotaUrl,
          model: "seedance-2-fast",
          apiKey: "test-key",
          body: { model: "seedance-2-fast", prompt: "test", duration: 5 },
        },
      }, { expectOk: false });
      assert.strictEqual(quotaFailure.response.status, 502, "video proxy maps upstream failure to 502");
      assert.strictEqual(quotaFailure.data.error, "user quota is not enough", "video proxy surfaces upstream quota message");
      assert.strictEqual(quotaFailure.data.upstream.data.code, "quota_not_enough", "video proxy preserves upstream quota code");
    } finally {
      await new Promise((resolve) => quotaUpstream.close(resolve));
    }

    const timeoutUpstream = http.createServer((req, res) => {
      res.writeHead(524, { "content-type": "text/html" });
      res.end("<!DOCTYPE html><html><head><title>toapis.com | 524: A timeout occurred</title></head><body>A timeout occurred</body></html>");
    });
    await new Promise((resolve) => timeoutUpstream.listen(0, "127.0.0.1", resolve));
    try {
      const timeoutFailure = await request(baseUrl, "/api/provider/reverse-storyboard", {
        providerRequest: {
          provider: "custom-llm",
          mode: "http",
          apiStyle: "openai-chat",
          endpoint: `http://127.0.0.1:${timeoutUpstream.address().port}/chat/completions`,
          model: "gpt-5.5",
          apiKey: "test-key",
          body: { model: "gpt-5.5", messages: [{ role: "user", content: "test" }] },
        },
      }, { expectOk: false });
      assert.strictEqual(timeoutFailure.response.status, 502, "reverse proxy maps Cloudflare timeout to 502");
      assert.match(timeoutFailure.data.error, /524|timeout|超时/i, "reverse proxy surfaces concise timeout message");
      assert.ok(!timeoutFailure.data.error.includes("<!DOCTYPE html>"), "reverse proxy does not surface raw HTML as the error message");
    } finally {
      await new Promise((resolve) => timeoutUpstream.close(resolve));
    }

    const staticVideo = await fetch(`${baseUrl}/outputs/verify-static-video.mp4`);
    assert.ok(staticVideo.ok, "generated output video can be served to the frontend");
    assert.strictEqual(staticVideo.headers.get("content-type"), "video/mp4", "generated output video uses mp4 content type");

    Core.approveVideo(created);
    Core.generateCopies(created, ["tiktok"]);
    Core.approveCopy(created, "tiktok");
    state.integrations.publisher.apiKey = "publisher-secret-verify";
    state.integrations.publisher.accountIds = "2280";
    state.integrations.publisher.mediaIds = "media-1";
    Core.publishTask(state, created);
    state.integrations.publisher.endpoint = `${upstreamBaseUrl}/publisher`;
    created.providerRequests.publisher.endpoint = state.integrations.publisher.endpoint;
    const publisher = await request(baseUrl, "/api/provider/publisher", {
      providerRequest: created.providerRequests.publisher,
    });
    assert.strictEqual(publisher.mode, "http", "publisher uses HTTP proxy");
    const cancelPublisher = await request(baseUrl, "/api/provider/publisher", {
      providerRequest: {
        provider: "posteverywhere",
        mode: "http",
        method: "DELETE",
        endpoint: `${upstreamBaseUrl}/publisher/post-hosted-1`,
        apiKey: "publisher-secret-verify",
        body: null,
      },
    });
    assert.strictEqual(cancelPublisher.mode, "http", "publisher schedule cancellation uses HTTP proxy");
    const cancelPublisherCall = upstreamCalls.find((call) => call.url === "/publisher/post-hosted-1");
    assert.ok(cancelPublisherCall, "publisher schedule cancellation hits the hosted post endpoint");
    assert.strictEqual(cancelPublisherCall.method, "DELETE", "publisher schedule cancellation forwards DELETE");
    assert.strictEqual(cancelPublisherCall.body, "", "publisher schedule cancellation does not send an empty JSON body");
    const reschedulePublisher = await request(baseUrl, "/api/provider/publisher", {
      providerRequest: {
        provider: "posteverywhere",
        mode: "http",
        method: "PATCH",
        endpoint: `${upstreamBaseUrl}/publisher/post-hosted-1`,
        apiKey: "publisher-secret-verify",
        body: {
          scheduled_for: "2026-06-13T00:00:00.000Z",
          timezone: "UTC",
        },
      },
    });
    assert.strictEqual(reschedulePublisher.mode, "http", "publisher schedule time update uses HTTP proxy");
    const reschedulePublisherCall = upstreamCalls.filter((call) => call.url === "/publisher/post-hosted-1").at(-1);
    assert.ok(reschedulePublisherCall, "publisher schedule time update hits the hosted post endpoint");
    assert.strictEqual(reschedulePublisherCall.method, "PATCH", "publisher schedule time update forwards PATCH");
    assert.deepStrictEqual(JSON.parse(reschedulePublisherCall.body), {
      scheduled_for: "2026-06-13T00:00:00.000Z",
      timezone: "UTC",
    }, "publisher schedule time update sends the new hosted scheduled time");
    const providerEvents = fs.readFileSync(providerEventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const publisherEvent = providerEvents.find((event) => event.kind === "publisher" && event.phase === "response");
    assert.ok(publisherEvent, "publisher provider response is logged");
    assert.strictEqual(publisherEvent.ok, true, "publisher log records success");
    const publisherDnsFailure = await request(baseUrl, "/api/provider/publisher", {
      providerRequest: Object.assign({}, created.providerRequests.publisher, {
        endpoint: "https://definitely-not-a-real-posteverywhere-host.invalid/posts",
      }),
    }, { expectOk: false });
    assert.match(publisherDnsFailure.data.error, /fetch failed \(.+\)/i, "publisher proxy surfaces fetch failure cause details");
    const mediaUpload = await request(baseUrl, "/api/publisher/media-upload", {
      endpoint: `${upstreamBaseUrl}/posts`,
      apiKey: "publisher-secret-verify",
      sourceUrl: "/outputs/verify-static-video.mp4",
      filename: "verify-static-video.mp4",
      contentType: "video/mp4",
    });
    assert.strictEqual(mediaUpload.mediaId, "media-verify-1", "publisher media upload returns a media id for posts");
    assert.strictEqual(mediaUpload.complete.status, "ready", "publisher media upload completes the media item");
    const mediaCreateCall = upstreamCalls.find((call) => call.url === "/media/upload");
    assert.ok(mediaCreateCall, "publisher media upload requests a presigned upload URL");
    assert.deepStrictEqual(JSON.parse(mediaCreateCall.body), {
      filename: "verify-static-video.mp4",
      content_type: "video/mp4",
      size: Buffer.from("verify-video").length,
    }, "publisher media upload sends PostEverywhere upload metadata");
    const mediaPutCall = upstreamCalls.find((call) => call.url === "/media/upload-target");
    assert.ok(mediaPutCall, "publisher media upload sends bytes to the presigned upload URL");
    assert.strictEqual(mediaPutCall.body, "verify-video", "publisher media upload forwards the local video bytes");
    assert.strictEqual(mediaPutCall.contentType, "video/mp4", "publisher media upload preserves the video content type");
    assert.strictEqual(mediaPutCall.uploadToken, "verify", "publisher media upload forwards required upload headers");
    const eventLog = fs.readFileSync(providerEventsPath, "utf8");
    assert.ok(!eventLog.includes("publisher-secret-verify"), "provider event log redacts publisher api key");
    assert.ok(!eventLog.includes("llm-secret-verify"), "provider event log redacts llm api key");

    console.log("verify-server ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(outputFixturePath, { force: true });
    fs.rmSync(ffprobeFixturePath, { force: true });
    if (originalFfprobePath === undefined) {
      delete process.env.AI_VIDEO_FFPROBE_PATH;
    } else {
      process.env.AI_VIDEO_FFPROBE_PATH = originalFfprobePath;
    }
    if (originalVerifyFfprobeDuration === undefined) {
      delete process.env.VERIFY_FFPROBE_DURATION;
    } else {
      process.env.VERIFY_FFPROBE_DURATION = originalVerifyFfprobeDuration;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
