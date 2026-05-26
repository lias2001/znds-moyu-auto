const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// Cookie解析
function parseCookie(str, domain) {
  const list = [];
  str.split(";").forEach(item => {
    const [name, ...vs] = item.trim().split("=");
    if (name) list.push({ name, value: vs.join('='), domain, path: '/' });
  });
  return list;
}

// 延迟
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 点击文字按钮
async function clickByText(page, text) {
  try {
    await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('button, .btn, [type="button"], a'));
      const el = els.find(x => x.textContent.trim().includes(t));
      if (el) el.click();
    }, text);
    console.log(`✅ 点击：${text}`);
  } catch (e) {}
}

// 判断是否包含文字
async function hasText(page, text) {
  return await page.evaluate((t) => {
    return document.body.textContent.includes(t);
  }, text);
}

// 判断网页计时是否在 9:00 ~ 10:00
async function inTimeRange(page) {
  return await page.evaluate(() => {
    const t = document.body.textContent;
    return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(t);
  });
}

// 单轮逻辑（完全按你要求）
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  // 1. 打开页面
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  try {
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(1500);

    // 2. 判断逻辑
    if (await hasText(page, "开始摸鱼")) {
      console.log("ℹ 检测到：开始摸鱼 → 点击");
      await clickByText(page, "开始摸鱼");
      // 停留等待时间到达 9:00~10:00
      console.log("ℹ 已开始，等待时间到 9:00~10:00");
      while (true) {
        if (await inTimeRange(page)) {
          await clickByText(page, "停止");
          break;
        }
        await delay(1000);
      }
    } else {
      // 没有开始摸鱼，直接判断时间
      console.log("ℹ 未检测到开始摸鱼，检查时间是否在 9:00~10:00");
      while (true) {
        if (await inTimeRange(page)) {
          await clickByText(page, "停止");
          break;
        }
        await delay(1000);
      }
    }

    // 3. 停止后等待2秒关闭页面
    await delay(2000);

  } catch (err) {
    console.log("⚠️ 异常，自动跳过本轮：", err.message);
  }

  try { await page.close(); } catch {}
  console.log("✅ 本轮结束，立即重启循环...");

  // 4. 自动回到第1步
}

// 无限循环主程序
async function main() {
  console.log("🔥 摸鱼程序已启动 - 按最新逻辑无限循环");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
