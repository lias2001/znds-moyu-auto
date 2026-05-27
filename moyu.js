const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 解析Cookie
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

// 点击文字（安全版）
async function clickByText(page, text) {
  try {
    await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('button, .btn, [type="button"], a'));
      const el = els.find(x => x.textContent.trim().includes(t));
      if (el) el.click();
    }, text);
    console.log(`✅ 点击：${text}`);
    await delay(1500);
  } catch (e) {}
}

// 判断是否包含文字（安全版）
async function hasText(page, text) {
  try {
    return await page.evaluate((t) => {
      return document.body.textContent.includes(t);
    }, text);
  } catch (e) {
    return false;
  }
}

// 判断时间 9:00~10:00
async function inTimeRange(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body.textContent;
      return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(t);
    });
  } catch (e) {
    return false;
  }
}

// 主循环任务
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  let page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  try {
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(2000);

    // ==============================================
    // 🔥 新增功能：优先检测并点击 每日签到
    // ==============================================
    try {
      const hasCheckin = await page.$('.muanyun-053-action-btn.btn-checkin');
      if (hasCheckin) {
        console.log("ℹ 检测到每日签到 → 点击");
        await page.click('.muanyun-053-action-btn.btn-checkin');
        console.log("✅ 每日签到 点击成功！");
        await delay(3000);
      }
    } catch (e) {
      console.log("ℹ 无需签到或已签到");
    }

    // 检测开始摸鱼
    if (await hasText(page, "开始摸鱼")) {
      console.log("ℹ 检测到：开始摸鱼 → 点击");
      await clickByText(page, "开始摸鱼");
      
      // 修复页面刷新
      await delay(3000);
      if (page.isClosed()) {
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(0);
        page.setDefaultTimeout(0);
        await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
        await page.goto(CONFIG.url);
        await delay(2000);
      }
    }

    // 等待时间 9:00~10:00
    console.log("ℹ 等待时间到达 9:00~10:00");
    while (true) {
      if (await inTimeRange(page)) {
        await clickByText(page, "停止");
        break;
      }
      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log("ℹ 正常页面刷新，自动继续");
  }

  // 关闭页面
  try { if (!page.isClosed()) await page.close(); } catch {}
  console.log("✅ 本轮结束，立即循环");
}

// 无限启动
async function main() {
  console.log("🔥 自动摸鱼 + 每日签到 已启动");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
