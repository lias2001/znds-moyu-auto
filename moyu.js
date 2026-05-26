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

// 通用延迟
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 点击包含指定文字的按钮
async function clickByText(page, text) {
  try {
    await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('button, .btn, [type="button"], a'));
      const el = els.find(x => x.textContent.trim().includes(t));
      if (el) el.click();
    }, text);
    console.log(`✅ 执行：点击 ${text}`);
  } catch (e) {}
}

// 检查是否在 9:00 ~ 9:59 范围内
async function checkTimeInRange(page) {
  return await page.evaluate(() => {
    const text = document.body.textContent;
    return /9:\d{2}/.test(text); // 匹配 9:00 - 9:59
  });
}

// 单轮任务
async function runCycle(browser) {
  console.log("\n--------------------- 开始新一轮 ---------------------");

  // 1. 打开页面
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  try {
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(1500);

    // 2. 识别到“开始摸鱼”就点击
    console.log("⏳ 等待：开始摸鱼 按钮");
    while (true) {
      const found = await page.evaluate(() => document.body.textContent.includes("开始摸鱼"));
      if (found) {
        await clickByText(page, "开始摸鱼");
        break;
      }
      await delay(1000);
    }

    // 3. 识别时间在 9:00 ~ 9:59 之间 → 点击停止
    console.log("⏳ 等待：时间到达 9:00 ~ 9:59 区间");
    while (true) {
      const inRange = await checkTimeInRange(page);
      if (inRange) {
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
  console.log("✅ 本轮完成，等待2秒后重启...");

  // 5. 循环
  await delay(CONFIG.CYCLE_DELAY);
}

// 主程序：无限循环
async function main() {
  console.log("🔥 摸鱼程序已启动：无限自动循环 + 9:00~9:59 精准停止");
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
