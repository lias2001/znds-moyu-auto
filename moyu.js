const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053"
};
const COOKIE = process.env.ZNDS_COOKIE || '';

function parseCookie(str, domain) {
  const list = [];
  str.split(';').forEach(item => {
    const [name, ...vs] = item.trim().split('=');
    if (name) list.push({ name, value: vs.join('='), domain, path: '/' });
  });
  return list;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 新建并初始化页面
async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(5000);
  return page;
}

// 判断页面是否包含指定文字
async function hasText(page, text) {
  try {
    return await page.evaluate(t => document.body.innerText.includes(t), text);
  } catch {
    return false;
  }
}

// 点击包含指定文本的按钮
async function clickBtnByText(page, text) {
  try {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const txt = await btn.evaluate(el => el.textContent.trim());
      if (txt.includes(text)) {
        await btn.click();
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// 步骤1：签到检测
async function doCheckIn(browser) {
  console.log("\n========== 执行签到检测 ==========");
  const page = await createPage(browser);
  const checkinSel = '.muanyun-053-action-btn.btn-checkin';

  const isDisabled = await page.evaluate(sel => {
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

// 步骤2：先打开页面 → 识别开始摸鱼文字 → 存在则点击
async function doStartFish(browser) {
  console.log("\n========== 检测并点击开始摸鱼 ==========");
  // 强制先打开页面
  const page = await createPage(browser);
  const targetText = "开始摸鱼";

  if (await hasText(page, targetText)) {
    console.log("✅ 识别到开始摸鱼文字，执行点击");
    await clickBtnByText(page, targetText);
  } else {
    console.log("ℹ 未识别到开始摸鱼文字");
  }

  await delay(2000);
  await page.close().catch(() => {});
  console.log("✅ 开始摸鱼流程结束，关闭页面");
}

// 步骤3：检测分钟数，间隔30秒
async function doStopFish(browser) {
  console.log("\n========== 等待计时并执行停止 ==========");
  const stopSel = '.btn-stop-fishing';
  const minuteId = 'timer-minutes';
  const checkInterval = 30000;

  while (true) {
    const page = await createPage(browser);
    const minuteVal = await page.evaluate(id => {
      const el = document.getElementById(id);
      return el ? el.textContent.trim() : '';
    }, minuteId);

    if (minuteVal === '9' || minuteVal === '10') {
      console.log(`✅ 检测到分钟数：${minuteVal}，点击停止`);
      await page.click(stopSel);
      await delay(2000);
      await page.close().catch(() => {});
      console.log("✅ 停止流程结束，关闭页面");
      break;
    } else {
      console.log(`ℹ 当前分钟数：${minuteVal}，30秒后再次检测...`);
      await page.close().catch(() => {});
      await delay(checkInterval);
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

  await doCheckIn(browser);

  while (true) {
    await doStartFish(browser);
    await doStopFish(browser);
  }
}

main().catch(err => {
  console.error("❌ 脚本异常：", err.message);
});
