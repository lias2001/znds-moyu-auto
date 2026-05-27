const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 工具
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

// 强制等待文字出现
async function waitForText(page, text) {
  try {
    await page.waitForFunction(`document.body.innerText.includes('${text}')`, {
      timeout: 5000
    });
    return true;
  } catch {
    return false;
  }
}

// 点击文字
async function clickText(page, text) {
  try {
    await page.evaluate((t) => {
      const buttons = Array.from(document.querySelectorAll('button, .btn, [type="submit"]'));
      const btn = buttons.find(b => b.innerText.includes(t));
      if (btn) btn.click();
    }, text);
    console.log(`✅ 点击了：${text}`);
  } catch (e) {}
}

// 检查时间 9:xx 或 10:00
async function checkTime(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body.innerText;
      return /(9:\d{2}|10:00)/.test(t);
    });
  } catch {
    return false;
  }
}

// 新建页面
async function openPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
  await page.goto(CONFIG.url);
  await delay(4000); // 强制等页面完全渲染
  return page;
}

// ================== 主逻辑 ==================
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  // 打开页面
  let page = await openPage(browser);

  try {
    // -------- 1. 先找 每日签到 --------
    console.log("ℹ 检查：每日签到");
    const foundCheckin = await waitForText(page, "每日签到");
    if (foundCheckin) {
      console.log("✅ 找到每日签到，点击！");
      await clickText(page, "每日签到");
      await delay(3000);
      // 刷新页面
      await page.close().catch(()=>{});
      page = await openPage(browser);
    } else {
      console.log("ℹ 未找到每日签到");
    }

    // -------- 2. 再找 开始摸鱼 --------
    console.log("ℹ 检查：开始摸鱼");
    const foundStart = await waitForText(page, "开始摸鱼");
    if (foundStart) {
      console.log("✅ 找到开始摸鱼，点击！");
      await clickText(page, "开始摸鱼");
      await delay(3000);
      // 刷新页面
      await page.close().catch(()=>{});
      page = await openPage(browser);
    } else {
      console.log("ℹ 未找到开始摸鱼");
    }

    // -------- 3. 等待时间 --------
    console.log("ℹ 开始等待时间 9:00~10:00");
    while (true) {
      if (await checkTime(page)) {
        console.log("✅ 时间到，点击停止");
        await clickText(page, "停止");
        break;
      }
      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log("ℹ 流程正常：", err.message);
  }

  try { await page.close().catch(()=>{}); } catch {}
  console.log("✅ 本轮结束");
}

// 启动
async function main() {
  console.log("🔥 自动签到+摸鱼 最终稳定版\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.log);
