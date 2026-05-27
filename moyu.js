const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 工具函数
function parseCookie(str, domain) {
  const list = [];
  str.split(";").forEach(item => {
    const [name, ...vs] = item.trim().split("=");
    if (name) list.push({ name, value: vs.join('='), domain, path: '/' });
  });
  return list;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 点击文字
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

// 判断是否有文字
async function hasText(page, text) {
  try {
    return await page.evaluate((t) => document.body.textContent.includes(t), text);
  } catch { return false; }
}

// 判断时间 9:00~10:00
async function inTimeRange(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body.textContent;
      return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(t);
    });
  } catch { return false; }
}

// 新建页面
async function newPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await delay(2000);
  return page;
}

// ====================== 主逻辑 ======================
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  let page = await newPage(browser);

  try {
    // 1. 先检测 每日签到（有就点）
    const hasCheckinBtn = await page.$('.muanyun-053-action-btn.btn-checkin');
    if (hasCheckinBtn) {
      console.log("ℹ 检测到【每日签到】，点击签到");
      await page.click('.muanyun-053-action-btn.btn-checkin');
      await delay(3000);
      // 签到刷新 → 重新开页面
      await page.close().catch(()=>{});
      page = await newPage(browser);
    }

    // 2. 检测【开始摸鱼】（有就点）
    const hasStart = await hasText(page, "开始摸鱼");
    if (hasStart) {
      console.log("ℹ 检测到【开始摸鱼】，点击开始");
      await clickByText(page, "开始摸鱼");
      await delay(3000);
      // 开始摸鱼刷新 → 重新开页面
      await page.close().catch(()=>{});
      page = await newPage(browser);
    }

    // 3. 等待时间 9:00~10:00
    console.log("ℹ 等待页面时间到达 9:00~10:00");
    while (true) {
      if (await inTimeRange(page)) {
        console.log("ℹ 时间已到，点击停止");
        await clickByText(page, "停止");
        break;
      }
      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log("ℹ 自动修复异常:", err.message);
  }

  try { await page.close().catch(()=>{}); } catch {}
  console.log("✅ 本轮完成，继续循环");
}

// 启动
async function main() {
  console.log("🔥 自动签到+摸鱼 已启动（最终正确版）");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
