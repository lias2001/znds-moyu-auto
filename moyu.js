const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  viewport: { width: 980, height: 7728 },
  screenshotDir: './screenshots',
  singleRoundMaxTime: 10 * 60 * 1000 // 单轮最大10分钟强制结束
};

const COOKIE = process.env.ZNDS_COOKIE || '';
let runCount = 0;
const MAX_SCREENSHOT_ROUND = 3;

if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

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

// 安全判断页面是否可用
function isPageValid(page) {
  return page && !page.isClosed();
}

async function screenshotWithMouse(page, type, x, y) {
  if (runCount > MAX_SCREENSHOT_ROUND) {
    console.log(`ℹ 第${runCount}轮，超出前3轮，跳过截图`);
    return;
  }
  if (!isPageValid(page)) return;
  try {
    await page.evaluate((x, y) => {
      let dot = document.getElementById('mouse-dot');
      if (!dot) {
        dot = document.createElement('div');
        dot.id = 'mouse-dot';
        dot.style.cssText = `
          position: fixed; width: 16px; height: 16px; border-radius: 50%;
          background: rgba(255, 0, 0, 0.8); z-index: 999999;
          pointer-events: none; transform: translate(-50%, -50%);
        `;
        document.body.appendChild(dot);
      }
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
    }, x, y);

    const filename = `${type}_${Date.now()}_X${Math.round(x)}_Y${Math.round(y)}.png`;
    const screenshotPath = path.join(CONFIG.screenshotDir, filename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 截图已保存：${filename} (X:${Math.round(x)}, Y:${Math.round(y)})`);

    await page.evaluate(() => {
      const dot = document.getElementById('mouse-dot');
      if (dot) dot.remove();
    });
  } catch (e) {
    console.log("ℹ 截图上下文已销毁，跳过截图");
  }
}

async function getValidElemPos(page, targetText) {
  if (!isPageValid(page)) return null;
  try {
    return page.evaluate((txt) => {
      const nodes = document.querySelectorAll('button, .btn, a, span, div');
      for (let el of nodes) {
        const text = el.textContent.trim();
        if (text !== txt) continue;

        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (rect.width <= 2 || rect.height <= 2) continue;
        if (rect.left === 0 && rect.top === 0) continue;
        if (rect.bottom < 0 || rect.right < 0) continue;

        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
      return null;
    }, targetText);
  } catch (e) {
    console.log(`ℹ 获取元素坐标失败，页面已刷新销毁：${e.message}`);
    return null;
  }
}

async function clickByExactText(page, targetText) {
  if (!isPageValid(page)) return false;
  try {
    return await page.evaluate((txt) => {
      const nodes = document.querySelectorAll('button, .btn, a, span, div');
      for (let el of nodes) {
        const text = el.textContent.trim();
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (text !== txt) continue;
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (rect.width <= 2 || rect.height <= 2) continue;
        if (rect.left === 0 && rect.top === 0) continue;

        el.click();
        return true;
      }
      return false;
    }, targetText);
  } catch (e) {
    console.log(`ℹ 点击失败，页面导航销毁上下文：${e.message}`);
    return false;
  }
}

// 循环等待计时器到9/10，增加页面有效性校验
async function waitTimerTo9Or10(page) {
  while (true) {
    if (!isPageValid(page)) {
      console.log("ℹ 页面失效，退出计时器等待循环");
      break;
    }
    let minute = "";
    try {
      minute = await page.evaluate(() => {
        const minEl = document.getElementById('timer-minutes');
        return minEl ? minEl.textContent.trim() : '';
      });
    } catch (e) {
      console.log("ℹ 读取计时器失败，刷新页面重试");
      await delay(2000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await delay(2000);
      continue;
    }
    console.log(`ℹ 实时检测计时器，当前分钟：${minute}`);

    if (minute === "9" || minute === "10") {
      console.log("ℹ 计时器到达9/10分，结束等待");
      return;
    }

    console.log("ℹ 未到指定分钟，等待1分钟后刷新页面重新检测");
    await delay(60 * 1000);
    if (!isPageValid(page)) break;
    await page.reload({ waitUntil: "networkidle2" });
    await delay(2000);
  }
}

// 单轮任务，带10分钟超时强制中断
async function runCycle(browser) {
  runCount++;
  console.log(`\n==================== 第${runCount}轮 ====================`);
  let page = null;
  let roundTimeout = null;
  let roundTimeoutTriggered = false;

  // 10分钟超时强制结束本轮
  const roundPromise = new Promise(async (resolve) => {
    roundTimeout = setTimeout(() => {
      roundTimeoutTriggered = true;
      console.log(`⚠️ 第${runCount}轮已运行满10分钟，超时强制终止本轮`);
      resolve();
    }, CONFIG.singleRoundMaxTime);

    try {
      page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);
      await page.setViewport(CONFIG.viewport);

      await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
      await page.goto(CONFIG.url, { waitUntil: "networkidle2" });
      await delay(3000);

      console.log("ℹ 刷新页面");
      await page.reload({ waitUntil: "networkidle2" });
      await delay(3000);

      // 签到识别
      const signPos = await getValidElemPos(page, "每日签到");
      if (signPos) {
        console.log("ℹ 检测到【每日签到】，移动鼠标");
        await page.mouse.move(signPos.x, signPos.y);
        await screenshotWithMouse(page, "每日签到", signPos.x, signPos.y);
        console.log("ℹ 点击【每日签到】");
        await clickByExactText(page, "每日签到");
        await delay(3000);
      } else {
        const signedPos = await getValidElemPos(page, "今日已签到");
        if (signedPos) {
          console.log("ℹ 检测到【今日已签到】，移动鼠标");
          await page.mouse.move(signedPos.x, signedPos.y);
          await screenshotWithMouse(page, "今日已签到", signedPos.x, signedPos.y);
          console.log("ℹ 今日已签到，无需操作");
          await delay(2000);
        } else {
          console.log("ℹ 未检测到有效【每日签到】/【今日已签到】");
        }
      }

      // 开始摸鱼识别
      const startPos = await getValidElemPos(page, "开始摸鱼");
      if (startPos) {
        console.log("ℹ 检测到【开始摸鱼】，移动鼠标");
        await page.mouse.move(startPos.x, startPos.y);
        await screenshotWithMouse(page, "开始摸鱼", startPos.x, startPos.y);
        console.log("ℹ 点击【开始摸鱼】");
        await clickByExactText(page, "开始摸鱼");
        await delay(3000);
      } else {
        console.log("ℹ 未检测到有效【开始摸鱼】");
      }

      // 循环等待计时器到9/10
      if (isPageValid(page)) await waitTimerTo9Or10(page);

      // 点击停止
      if (isPageValid(page)) {
        const stopPos = await getValidElemPos(page, "停止");
        if (stopPos) {
          console.log("ℹ 识别到【停止】按钮，移动鼠标");
          await page.mouse.move(stopPos.x, stopPos.y);
          await screenshotWithMouse(page, "停止按钮", stopPos.x, stopPos.y);
          console.log("ℹ 点击【停止】");
          await clickByExactText(page, "停止");
          await delay(3000);
        }
        await delay(2000);
      }

    } catch (err) {
      console.error("❌ 本轮执行出错：", err.message);
    } finally {
      clearTimeout(roundTimeout);
      if (page && !page.isClosed()) {
        await page.close();
        console.log("✅ 页面已关闭");
      }
      resolve();
    }
  });

  await roundPromise;
  if (roundTimeoutTriggered) {
    console.log(`✅ 第${runCount}轮【超时10分钟强制结束】，立即开启下一轮`);
  } else {
    console.log(`✅ 第${runCount}轮正常结束，立即开启下一轮`);
  }
}

async function main() {
  console.log("🔥 摸鱼程序已启动");
  console.log(`🔥 浏览器分辨率：${CONFIG.viewport.width}x${CONFIG.viewport.height}`);
  console.log(`🔥 规则：仅前${MAX_SCREENSHOT_ROUND}轮截图，单轮最长10分钟强制结束，计时器未到9/10则每分钟刷新检测，一轮结束立刻下一轮无等待`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${CONFIG.viewport.width},${CONFIG.viewport.height}`
    ],
  });

  try {
    while (true) {
      await runCycle(browser);
    }
  } catch (err) {
    console.error("❌ 主循环异常：", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
