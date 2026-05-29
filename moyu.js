const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053"
};
const COOKIE = process.env.ZNDS_COOKIE || '';

// 解析Cookie
function parseCookie(str, domain) {
  const list = [];
  str.split(';').forEach(item => {
    const [name, ...vs] = item.trim().split('=');
    if (name) {
      list.push({ name, value: vs.join('='), domain, path: '/' });
    }
  });
  return list;
}

// 延时
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 创建并初始化页面
async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(3000);
  return page;
}

// 步骤1：签到检测与点击
async function doCheckIn(browser) {
  console.log("\n========== 执行签到检测 ==========");
  const page = await createPage(browser);

  const checkinSel = '.muanyun-053-action-btn.btn-checkin';
  const isDisabled = await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    return btn ? btn.disabled : true;
  }, checkinSel);

  if (isDisabled) {
    console.log("ℹ 今日已签到，按钮不可点击");
  } else {
    console.log("✅ 签到按钮可点击，执行签到");
    await page.click(checkinSel);
    await delay(2000);
  }

  await page.close().catch(() => {});
  console.log("✅ 签到流程结束，关闭页面");
}

// 步骤2：检测并点击开始摸鱼
async function doStartFish(browser) {
  console.log("\n========== 检测开始摸鱼 ==========");
  const page = await createPage(browser);
  const startSel = '.muanyun-053-action-btn.btn-fishing';

  const hasStartBtn = await page.$(startSel);
  if (hasStartBtn) {
    console.log("✅ 找到开始摸鱼，执行点击");
    await page.click(startSel);
  } else {
    console.log("ℹ 未找到开始摸鱼按钮");
  }

  await delay(2000);
  await page.close().catch(() => {});
  console.log("✅ 开始摸鱼流程结束，关闭页面");
}

// 步骤3：等待分钟为9/10，点击停止
async function doStopFish(browser) {
  console.log("\n========== 等待计时并执行停止 ==========");
  const stopSel = '.btn-stop-fishing';
  const minuteId = 'timer-minutes';

  while (true) {
    const page = await createPage(browser);
    // 获取分钟数
    const minuteVal = await page.evaluate((id) => {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : '';
    }, minuteId);

    if (minuteVal === '9' || minuteVal === '10') {
      console.log(`✅ 检测到分钟数：${minuteVal}，执行停止`);
      await page.click(stopSel);
      await delay(2000);
      await page.close().catch(() => {});
      console.log("✅ 停止流程结束，关闭页面");
      break;
    } else {
      console.log(`ℹ 当前分钟数：${minuteVal}，继续等待...`);
      await page.close().catch(() => {});
      await delay(1000);
    }
  }
}

// 主程序
async function main() {
  console.log("🔥 脚本启动：签到 + 循环摸鱼流程");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // 1. 仅执行一次签到
  await doCheckIn(browser);

  // 2. 无限循环 步骤2 + 步骤3
  while (true) {
    await doStartFish(browser);
    await doStopFish(browser);
  }
}

main().catch(err => {
  console.error("❌ 脚本异常：", err.message);
});
