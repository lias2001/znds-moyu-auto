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

// 新建并初始化页面，加长加载等待
async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(5000); // 延长至5秒，确保异步元素完全渲染
  return page;
}

// 精准查找包含指定文本的按钮（还原旧版可用逻辑）
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
    await delay(4000);
  }

  await page.close().catch(() => {});
  console.log("✅ 签到流程结束，关闭页面");
}

// 步骤2：识别并点击 开始摸鱼
async function doStartFish(browser) {
  console.log("\n========== 检测开始摸鱼 ==========");
  const page = await createPage(browser);

  const clicked = await clickBtnByText(page, "开始摸鱼");
  if (clicked) {
    console.log("✅ 找到【开始摸鱼】并点击");
  } else {
    console.log("ℹ 未识别到【开始摸鱼】");
  }

  await delay(4000);
  await page.close().catch(() => {});
  console.log("✅ 开始摸鱼流程结束，关闭页面");
}

// 步骤3：检测分钟数(9/10)，检测间隔改为30秒
async function doStopFish(browser) {
  console.log("\n========== 等待计时并执行停止 ==========");
  const stopSel = '.btn-stop-fishing';
  const minuteId = 'timer-minutes';
  const checkInterval = 30000; // 30秒检测一次

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
      await delay(checkInterval); // 等待30秒再重试
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

  // 仅执行一次签到
  await doCheckIn(browser);

  // 无限循环 步骤2 + 步骤3
  while (true) {
    await doStartFish(browser);
    await doStopFish(browser);
  }
}

main().catch(err => {
  console.error("❌ 脚本异常：", err.message);
});
