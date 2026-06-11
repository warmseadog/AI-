const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createServer } = require("./server.js");
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
  const outputFixtureDir = path.join(__dirname, "..", "outputs");
  const outputFixturePath = path.join(outputFixtureDir, "verify-static-video.mp4");
  const providerEventsPath = path.join(outputFixtureDir, "provider-events.jsonl");
  fs.mkdirSync(outputFixtureDir, { recursive: true });
  fs.writeFileSync(outputFixturePath, Buffer.from("verify-video"));
  fs.rmSync(providerEventsPath, { force: true });

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const upstreamCalls = [];
  const upstream = http.createServer((req, res) => {
    const call = { method: req.method, url: req.url, body: "" };
    upstreamCalls.push(call);
    if (req.url === "/videos/generated.mp4") {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end(Buffer.from("downloaded-video"));
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
    res.writeHead(200, { "content-type": "application/json" });
    if (req.method === "GET") {
      res.end(JSON.stringify({ output: { task_status: "SUCCEEDED", video_url: "https://example.test/video.mp4" } }));
      return;
    }
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

    const rejectedUpload = await requestRaw(baseUrl, "/api/uploads/video?filename=note.txt", Buffer.from("not-video"), "text/plain", { expectOk: false });
    assert.match(rejectedUpload.data.error, /mp4|mov|webm|视频/i, "non-video upload rejection explains accepted formats");

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
    const reverseRequestLog = fs.readFileSync(providerEventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)).reverse().find((entry) => entry.kind === "reverse-storyboard" && entry.phase === "request");
    assert.strictEqual(reverseRequestLog.requestSummary.imagePartCount, 1, "reverse request log records inline image parts");
    assert.strictEqual(reverseRequestLog.requestSummary.inlineFrameImageCount, 1, "reverse request log records inline frame metadata count");

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
    const providerEvents = fs.readFileSync(providerEventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const publisherEvent = providerEvents.find((event) => event.kind === "publisher" && event.phase === "response");
    assert.ok(publisherEvent, "publisher provider response is logged");
    assert.strictEqual(publisherEvent.ok, true, "publisher log records success");
    const eventLog = fs.readFileSync(providerEventsPath, "utf8");
    assert.ok(!eventLog.includes("publisher-secret-verify"), "provider event log redacts publisher api key");
    assert.ok(!eventLog.includes("llm-secret-verify"), "provider event log redacts llm api key");

    console.log("verify-server ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => upstream.close(resolve));
    fs.rmSync(outputFixturePath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
