const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  CYCLE_DELAY: 2000,
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

// 点击按钮
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

// 检测网页计时：9:00 ~ 10:00
async function checkPageTimer(page) {
  return await page.evaluate(() => {
    const text = document.body.textContent;
    // 匹配 9:00 - 9:59 或 10:00
    return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(text);
  });
}

// 一轮任务流程
async function runCycle(browser) {
  console.log("\n==================== 新一轮摸鱼 ====================");

  // 1. 打开页面
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  try {
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(1500);

    // 2. 检测到【开始摸鱼】就点击
    console.log("⏳ 等待 开始摸鱼 按钮...");
    while (true) {
      const hasStart = await page.evaluate(() => document.body.textContent.includes("开始摸鱼"));
      if (hasStart) {
        await clickByText(page, "开始摸鱼");
        break;
      }
      await delay(1000);
    }

    // 3. 监控网页计时 9:00 ~ 10:00 → 停止
    console.log("⏳ 等待网页计时到 9:00 ~ 10:00...");
    while (true) {
      const timeOk = await checkPageTimer(page);
      if (timeOk) {
        await clickByText(page, "停止");
        break;
      }
      await delay(1000);
    }

    // 4. 等待2秒关闭页面
    await delay(2000);

  } catch (err) {
    console.log("⚠️ 本轮异常，自动跳过：", err.message);
  }

  try { await page.close(); } catch {}
  console.log("✅ 本轮完成，2秒后重启...");

  // 5. 循环
  await delay(CONFIG.CYCLE_DELAY);
}

// 主程序：无限循环
async function main() {
  console.log("🔥 摸鱼程序启动：无限循环 + 网页计时 9:00~10:00 停止");
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
