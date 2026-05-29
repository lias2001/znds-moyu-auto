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

// 新建并初始化页面
async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(3000);
  return page;
}

// 步骤1：签到判断与执行
async function doCheckIn(browser) {
  console.log("\n========== 执行签到检测 ==========");
  const page = await createPage(browser);

  // 判断按钮是否被禁用（存在 disabled 属性）
  const isDisabled = await page.evaluate(() => {
    const btn = document.querySelector('.muanyun-053-action-btn.btn-checkin');
    if (!btn) return true;
    return btn.disabled;
  });

  if (isDisabled) {
    console.log("ℹ 今日已签到，按钮不可点击");
  } else {
    console.log("✅ 签到按钮可点击，执行签到");
    await page.click('.muanyun-053-action-btn.btn-checkin');
    await delay(2000);
  }

  await page.close().catch(() => {});
  console.log("✅ 签到流程结束，关闭页面");
}

// 步骤2：检测并点击开始摸鱼
async function doStartFish(browser) {
  console.log("\n========== 检测开始摸鱼 ==========");
  const page = await createPage(browser);

  // 查找开始摸鱼按钮
  const hasStartBtn = await page.evaluate(() => {
    const allBtns = document.querySelectorAll('button');
    for (const btn of allBtns) {
      if (btn.innerText.includes('开始摸鱼')) return true;
    }
    return false;
  });

  if (hasStartBtn) {
    console.log("✅ 找到开始摸鱼，执行点击");
    await page.evaluate(() => {
      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        if (btn.innerText.includes('开始摸鱼')) {
          btn.click();
          break;
        }
      }
    });
  } else {
    console.log("ℹ 未找到开始摸鱼按钮");
  }

  await delay(2000);
  await page.close().catch(() => {});
  console.log("✅ 开始摸鱼流程结束，关闭页面");
}

// 步骤3：检测计时分钟(9/10)并点击停止
async function doStopFish(browser) {
  console.log("\n========== 检测计时并停止 ==========");
  const page = await createPage(browser);

  // 读取 id="timer-minutes" 的分钟数
  const minuteVal = await page.evaluate(() => {
    const el = document.getElementById('timer-minutes');
    return el ? el.textContent.trim() : '';
  });

  if (minuteVal === '9' || minuteVal === '10') {
    console.log(`✅ 检测到分钟数：${minuteVal}，执行停止`);
    // 点击停止按钮
    await page.evaluate(() => {
      const allBtns = document.querySelectorAll('button');
      for (const btn of allBtns) {
        if (btn.innerText.includes('停止')) {
          btn.click();
          break;
        }
      }
    });
  } else {
    console.log(`ℹ 当前分钟数：${minuteVal}，未到停止条件`);
  }

  await page.close().catch(() => {});
  console.log("✅ 停止流程结束，关闭页面");
}

// 主入口
async function main() {
  console.log("🔥 脚本启动：签到 + 摸鱼循环流程");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // 1. 先执行一次签到流程
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
