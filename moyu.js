const puppeteer = require('puppeteer');

// 时间配置（严格按你要求）
const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  MOYU_DURATION: 9 * 60 * 1000,      // 开始→停止：9分钟
  LOOP_INTERVAL: 0 * 60 * 1000 + 2000, // 一轮后等待：2秒
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
async function clickButton(page, text) {
  try {
    await page.evaluate(t => {
      const btn = Array.from(document.querySelectorAll('button, input[type="button"], a.btn'))
        .find(el => el.textContent.includes(t));
      btn && btn.click();
    }, text);
    console.log(`✅ 点击：${text}`);
  } catch (e) {}
}

// 执行一轮摸鱼（已修复超时、异常捕获加固）
async function doMoyu(browser) {
  try {
    const page = await browser.newPage();
    // 🔥 修复：关闭超时限制
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);

    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    
    // 🔥 修复：超慢网页也能加载，不报错
    await page.goto(CONFIG.url, {
      waitUntil: "domcontentloaded",
      timeout: 0
    });

    await delay(2000);
    await clickButton(page, "开始摸鱼");

    console.log("⏳ 摸鱼中，等待 9 分钟……");
    await delay(CONFIG.MOYU_DURATION);

    await clickButton(page, "停止");
    await page.close().catch(() => {});

  } catch (err) {
    console.log("⚠️ 本轮异常，已自动跳过：", err.message);
  }
}

// 主循环
async function main() {
  console.log("🔥 启动成功：一次运行，永久9分钟循环\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote"
    ]
  });

  while (true) {
    await doMoyu(browser);
    console.log("✅ 一轮完成 → 等待2秒后继续\n");
    await delay(CONFIG.LOOP_INTERVAL);
  }
}

main();
