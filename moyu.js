const puppeteer = require('puppeteer');

// 精准时间配置
const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  MOYU_DURATION: 9 * 60 * 1000,      // 开始 → 停止 = 9分钟
  LOOP_INTERVAL: 9 * 60 * 1000 + 10000, // 一轮结束 → 下一轮开始 = 9分10秒
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

// 延迟工具
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

// 执行一轮摸鱼
async function doMoyu(browser) {
  const page = await browser.newPage();
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
  await page.goto(CONFIG.url, { waitUntil: "networkidle2" });
  await delay(2000);

  // 开始摸鱼
  await clickButton(page, "开始摸鱼");

  // 【固定9分钟】
  console.log("⏳ 已开始，等待 9 分钟后停止……");
  await delay(CONFIG.MOYU_DURATION);

  // 停止摸鱼
  await clickButton(page, "停止");

  await page.close();
}

// 主循环：一次启动，永久运行
async function main() {
  console.log("🔥 摸鱼程序已启动 → 永久自动循环");
  console.log("📌 规则：开始↔停止=9分钟 | 轮循间隔=9分10秒\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  while (true) {
    try {
      await doMoyu(browser);
      console.log("✅ 一轮完成，等待 9分10秒 后自动开始下一轮...\n");
    } catch (err) {
      console.log("⚠️ 异常，继续循环：", err.message);
    }
    await delay(CONFIG.LOOP_INTERVAL);
  }
}

main();
