const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

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

async function hasText(page, text) {
  try {
    return await page.evaluate((t) => document.body.textContent.includes(t), text);
  } catch { return false; }
}

async function inTimeRange(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body.textContent;
      return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(t);
    });
  } catch { return false; }
}

// 统一刷新页面（专治一切刷新问题）
async function freshPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await delay(3000);
  return page;
}

// 主任务
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  try {
    // 1. 打开全新页面
    let page = await freshPage(browser);

    // 2. 每日签到
    try {
      const checkin = await page.$('.muanyun-053-action-btn.btn-checkin');
      if (checkin) {
        console.log("ℹ 签到 → 点击");
        await page.click('.muanyun-053-action-btn.btn-checkin');
        await delay(3500);
        await page.close().catch(()=>{});
        page = await freshPage(browser); // 刷新后重建页面
      }
    } catch {}

    // 3. 开始摸鱼
    if (await hasText(page, "开始摸鱼")) {
      console.log("ℹ 开始摸鱼 → 点击");
      await clickByText(page, "开始摸鱼");
      await delay(3500);
      await page.close().catch(()=>{});
      page = await freshPage(browser); // 点击后刷新 → 重建
    }

    // 4. 等待时间 9:00~10:00 → 停止
    console.log("ℹ 等待 9:00~10:00");
    while (true) {
      if (await inTimeRange(page)) {
        await clickByText(page, "停止");
        break;
      }
      await delay(1000);
    }

    await delay(2000);
    await page.close().catch(()=>{});

  } catch (err) {
    console.log("ℹ 自动修复：", err.message);
  }

  console.log("✅ 本轮完成，循环继续");
}

// 无限循环
async function main() {
  console.log("🔥 自动签到+摸鱼 终极稳定版启动");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
