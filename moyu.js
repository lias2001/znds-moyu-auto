const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  MOYU_DURATION: 9 * 60 * 1000, // 9分钟
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 解析Cookie
function parseCookie(str, domain) {
  const list = [];
  str.split(";").forEach(item => {
    const [name, ...valueParts] = item.trim().split("=");
    if (name) {
      list.push({
        name,
        value: valueParts.join("="),
        domain,
        path: "/"
      });
    }
  });
  return list;
}

// 延迟函数（修复 waitForTimeout 报错）
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 点击按钮
async function clickButton(page, text) {
  try {
    await page.evaluate((btnText) => {
      const btn = Array.from(document.querySelectorAll("button, input[type='button'], a.btn"))
        .find(el => el.textContent.includes(btnText));
      btn && btn.click();
    }, text);
    console.log(`✅ 已点击：${text}`);
  } catch (err) {
    console.log(`⚠️ 点击失败：${text}`);
  }
}

// 主逻辑
async function run() {
  console.log("\n🚀 启动新一轮摸鱼...");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));

  await page.goto(CONFIG.url, { waitUntil: "networkidle2" });
  await delay(2000); // 修复这里

  // 开始摸鱼
  await clickButton(page, "开始摸鱼");
  await delay(2000);

  // ========== 等待 9 分钟 ==========
  console.log("⏳ 已开始摸鱼，等待 9 分钟后停止...");
  await delay(CONFIG.MOYU_DURATION);

  // 停止摸鱼
  await clickButton(page, "停止");
  await delay(1000);

  await browser.close();
  console.log("✅ 一轮摸鱼完成！\n");
}

run();
