const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun-053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 工具
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
  await page.setCookie(...parseCookie(COOKIE, '.znds.com'));
  await page.goto(CONFIG.url);
  await delay(4000);
  return page;
}

// 查找并点击包含文字的元素（暴力版）
async function clickByTextContent(page, text) {
  try {
    return await page.evaluate((t) => {
      const elements = document.querySelectorAll('*');
      for (const el of elements) {
        if (el.innerText && el.innerText.trim().includes(t) && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
          // 点击父级，确保点到按钮
          const clickTarget = el.closest('button') || el;
          clickTarget.click();
          return true;
        }
      }
      return false;
    }, text);
  } catch {
    return false;
  }
}

// ================== 主逻辑 ==================
async function runCycle(browser) {
  console.log('\n==================== 新一轮 ====================');

  let page = await openPage(browser);

  try {
    // -------- 1. 每日签到 --------
    console.log('ℹ 检查：每日签到');
    const signed = await clickByTextContent(page, '每日签到');
    if (signed) {
      console.log('✅ 已点击 每日签到');
      await delay(3000);
      await page.close().catch(() => { });
      page = await openPage(browser);
    } else {
      console.log('ℹ 无需签到');
    }

    // -------- 2. 开始摸鱼 --------
    console.log('ℹ 检查：开始摸鱼');
    const started = await clickByTextContent(page, '开始摸鱼');
    if (started) {
      console.log('✅ 已点击 开始摸鱼');
      await delay(3000);
      await page.close().catch(() => { });
      page = await openPage(browser);
    } else {
      console.log('ℹ 未找到 开始摸鱼，继续等待时间');
    }

    // -------- 3. 等待时间 --------
    console.log('ℹ 开始等待时间 9:00~10:00');
    while (true) {
      if (await checkTime(page)) {
        console.log('✅ 时间到，点击停止');
        await clickByTextContent(page, '停止');
        break;
      }
      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log('ℹ 流程正常：', err.message);
  }

  try { await page.close().catch(() => { }); } catch { }
  console.log('✅ 本轮结束');
}

// 启动
async function main() {
  console.log('🔥 自动签到+摸鱼 最终完美版\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.log);
