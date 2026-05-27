const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 工具函数
function parseCookie(str, domain) {
  const list = [];
  str.split(';').forEach(item => {
    const [name, ...vs] = item.trim().split('=');
    if (name) list.push({ name, value: vs.join('='), domain, path: '/' });
  });
  return list;
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 暴力点击文字（无视HTML结构）
async function clickText(page, text) {
  try {
    return await page.evaluate((t) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.innerText?.trim().includes(t) && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          (el.closest('button') || el).click();
          return true;
        }
      }
      return false;
    }, text);
  } catch {
    return false;
  }
}

// 判断是否包含文字
async function hasText(page, text) {
  try {
    return await page.evaluate((t) => document.body.innerText.includes(t), text);
  } catch {
    return false;
  }
}

// 打开新页面
async function newPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(4000);
  return page;
}

// ====================== 第一轮：只签到 ======================
async function round1(browser) {
  console.log("\n==================== 第1轮：每日签到 ====================");
  let page = await newPage(browser);

  try {
    // 点击签到
    if (await clickText(page, '每日签到')) {
      console.log("✅ 已点击每日签到，页面刷新中...");
      await delay(3500);
      await page.close();
      
      // 重新打开确认是否签到成功
      page = await newPage(browser);
      if (await hasText(page, '已签到') || !await hasText(page, '每日签到')) {
        console.log("✅ 签到完成！第一轮结束");
      }
    } else {
      console.log("ℹ 今日已签到，跳过第一轮");
    }
  } catch (e) {}

  try { await page.close(); } catch {}
  await delay(1000);
}

// ====================== 第二轮：无限循环摸鱼 ======================
async function round2(browser) {
  console.log("\n==================== 循环轮：开始摸鱼 ====================");
  let page = await newPage(browser);

  try {
    // 点击开始摸鱼
    if (await clickText(page, '开始摸鱼')) {
      console.log("✅ 已点击开始摸鱼，等待计时...");
    }

    // 等待 9:00 ~ 10:00
    console.log("ℹ 等待计时到达 9:00~10:00");
    while (true) {
      const text = await page.evaluate(() => document.body.innerText);
      if (/9:\d{2}|10:00/.test(text)) {
        console.log("✅ 时间到，点击停止");
        await clickText(page, '停止');
        break;
      }
      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log("ℹ 自动修复：", err.message);
  }

  try { await page.close(); } catch {}
  console.log("✅ 本轮结束，即将重新开始...");
}

// ====================== 主程序 ======================
async function main() {
  console.log("🔥 自动签到+摸鱼 已启动（严格两轮逻辑版）");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  // 1. 先执行第一轮：签到
  await round1(browser);

  // 2. 无限循环第二轮：摸鱼
  while (true) {
    await round2(browser);
  }
}

main().catch(console.log);
