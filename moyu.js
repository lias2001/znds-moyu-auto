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
    args: ["--no-sandbox", "--disable-setuid-snooze", "--disable-dev-shm-usage"]
  });

  const page = await browser.newPage();
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));

  await page.goto(CONFIG.url, { waitUntil: "networkidle2" });
  await page.waitForTimeout(2000);

  // 开始摸鱼
  await clickButton(page, "开始摸鱼");

  // ========== 等待 9 分钟 ==========
  console.log("⏳ 已开始摸鱼，等待 9 分钟后停止...");
  await page.waitForTimeout(CONFIG.MOYU_DURATION);

  // 停止摸鱼
  await clickButton(page, "停止");

  await browser.close();
  console.log("✅ 一轮摸鱼完成！\n");
}

run();
