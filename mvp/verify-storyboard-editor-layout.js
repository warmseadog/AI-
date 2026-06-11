const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE_URL = process.env.MVP_URL || "http://127.0.0.1:4191/#review";
const OUTPUT_DIR = path.join(__dirname, "..", "outputs");

async function seedAndOpen(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const Core = window.VideoWorkbenchCore;
    const state = Core.createInitialState();
    state.products[0].imageUrl = "https://example.test/neck-fan.png";
    state.contentBrief.seed = "我想在 TikTok 美国地区售卖一款挂脖风扇。";
    const task = Core.createContentPlanTask(state, {
      contentPlan: {
        productUnderstanding: "挂脖风扇，免手持，适合夏季厨房和户外。",
        targetAudience: "TikTok 美国用户。",
        keySellingPoints: ["hands-free", "lightweight"],
        strategy: "热浪痛点开场，展示佩戴和风速。",
        hook: "Kitchen heat rescue.",
        scenes: [
          {
            time: "0-3s",
            title: "热浪痛点",
            visual: "炎热夏季厨房，一个美国白人肥胖长发孕妇正在平底锅前煎牛排。大量油烟升腾，她的脸被熏得通红，汗水从额头流到脖子，头发湿漉漉，头顶还冒着白色的水蒸气。丈夫拿着挂脖风扇入画。",
            subtitle: "Too hot in here?",
            motion: "孕妇难受扇风 -> 丈夫入画 -> 戴上风扇",
          },
          {
            time: "3-10s",
            title: "风扇救场",
            visual: "风扇启动，长发被强风吹起，孕妇表情从痛苦变成享受，油烟被吹散。镜头绕半圈保持风扇完整露出。",
            subtitle: "It's like a hurricane on my neck!",
            motion: "风扇吹风 -> 长发飘起 -> 表情享受",
          },
          {
            time: "10-15s",
            title: "口播收尾",
            visual: "孕妇和丈夫一同面对镜头，展示风口并说出口播台词，两人一起大笑。",
            subtitle: "Link in my bio, babe!",
            motion: "展示产品 -> 口播 -> 大笑",
          },
        ],
      },
    });
    task.status = "video_review";
    task.video = { jobId: "tsk_vid_layout_check", providerStatus: "running" };
    state.selectedTaskId = task.id;
    localStorage.setItem("ai-video-workbench-mvp", JSON.stringify(state));
    location.hash = "#review";
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "编辑分镜" }).click();
  await page.waitForSelector(".storyboard-editor-shell");
}

async function inspectViewport(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  await seedAndOpen(page);
  const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    };
    const shell = document.querySelector(".storyboard-editor-shell");
    const modal = document.querySelector(".storyboard-editor-modal");
    return {
      shell: box(".storyboard-editor-shell"),
      sceneList: box(".storyboard-scene-list"),
      detail: box(".storyboard-detail-editor"),
      visual: box(".storyboard-main-visual textarea"),
      advancedOpen: document.querySelector(".storyboard-advanced-fields").open,
      columns: getComputedStyle(shell).gridTemplateColumns,
      modalOverflowX: modal.scrollWidth > modal.clientWidth,
      bodyText: document.body.innerText.includes("第 1 / 3 镜") && document.body.innerText.includes("高级字段"),
    };
  });
  const screenshotPath = path.join(OUTPUT_DIR, `mvp-storyboard-editor-${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();
  return { name, screenshotPath, metrics };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  try {
    const results = [
      await inspectViewport(browser, "desktop", { width: 1440, height: 900 }),
      await inspectViewport(browser, "mobile", { width: 390, height: 844 }),
    ];
    for (const result of results) {
      assert.ok(result.metrics.bodyText, `${result.name} renders focused editor labels`);
      assert.ok(result.metrics.visual.height >= 180, `${result.name} keeps visual textarea large`);
      assert.strictEqual(result.metrics.advancedOpen, false, `${result.name} keeps advanced fields collapsed`);
      assert.strictEqual(result.metrics.modalOverflowX, false, `${result.name} has no horizontal modal overflow`);
    }
    assert.ok(results[0].metrics.detail.width > results[0].metrics.sceneList.width, "desktop detail editor is wider than scene list");
    assert.ok(results[1].metrics.sceneList.width <= results[1].metrics.shell.width, "mobile scene list fits shell width");
    assert.ok(results[1].metrics.detail.width <= results[1].metrics.shell.width, "mobile detail editor fits shell width");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
