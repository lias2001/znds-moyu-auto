const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  viewport: { width: 980, height: 7728 },
  singleRoundMaxTime: 10 * 60 * 1000
};

const COOKIE = process.env.ZNDS_COOKIE || '';
let runCount = 0;

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

function isPageValid(page) {
  return page && !page.isClosed();
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
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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

// 计时器循环：每次刷新页面后【先检测开始摸鱼】再读时间
async function waitTimerTo9Or10(page) {
  while (true) {
    if (!isPageValid(page)) {
      console.log("ℹ 页面失效，退出计时器等待循环");
      return "pageInvalid";
    }

    // ========== 修复核心：每次循环第一步重新检测开始摸鱼 ==========
    const startFishPos = await getValidElemPos(page, "开始摸鱼");
    if (startFishPos) {
      console.log("ℹ 计时器循环刷新后检测到【开始摸鱼】，执行点击");
      await page.mouse.move(startFishPos.x, startFishPos.y);
      await clickByExactText(page, "开始摸鱼");
      await delay(2000);
      console.log("ℹ 点击完成，刷新页面后结束本轮");
      await page.reload({ waitUntil: "networkidle2" });
      await delay(2000);
      return "foundStartFish";
    }

    // 未找到开始摸鱼，读取计时器分钟
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
      return "reachTargetTime";
    }

    console.log("ℹ 未到指定分钟，等待1分钟后刷新页面重新检测");
    await delay(60 * 1000);
    if (!isPageValid(page)) break;
    // 刷新页面，下一轮while循环会先查开始摸鱼
    await page.reload({ waitUntil: "networkidle2" });
    await delay(2000);
  }
  return "pageInvalid";
}

async function runCycle(browser) {
  runCount++;
  console.log(`\n==================== 第${runCount}轮 ====================`);
  let page = null;
  let roundTimeout = null;
  let roundTimeoutTriggered = false;
  let breakByStartFish = false;

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

      // 签到判断
      const signPos = await getValidElemPos(page, "每日签到");
      if (signPos) {
        console.log("ℹ 检测到【每日签到】，移动鼠标并点击");
        await page.mouse.move(signPos.x, signPos.y);
        await clickByExactText(page, "每日签到");
        await delay(3000);
      } else {
        const signedPos = await getValidElemPos(page, "今日已签到");
        if (signedPos) {
          console.log("ℹ 检测到【今日已签到】，无需操作");
          await page.mouse.move(signedPos.x, signedPos.y);
          await delay(2000);
        } else {
          console.log("ℹ 未检测到有效【每日签到】/【今日已签到】");
        }
      }

      // 初始页面检测开始摸鱼
      const startPos = await getValidElemPos(page, "开始摸鱼");
      if (startPos) {
        console.log("ℹ 初始页面检测到【开始摸鱼】，点击");
        await page.mouse.move(startPos.x, startPos.y);
        await clickByExactText(page, "开始摸鱼");
        await delay(3000);
      } else {
        console.log("ℹ 初始页面未检测到有效【开始摸鱼】，进入计时器循环");
        const timerResult = await waitTimerTo9Or10(page);
        if (timerResult === "foundStartFish") {
          breakByStartFish = true;
          return;
        }
        if (timerResult === "reachTargetTime" && isPageValid(page)) {
          const stopPos = await getValidElemPos(page, "停止");
          if (stopPos) {
            console.log("ℹ 识别到【停止】按钮，移动鼠标并点击");
            await page.mouse.move(stopPos.x, stopPos.y);
            await clickByExactText(page, "停止");
            await delay(3000);
          }
          await delay(2000);
        }
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
  } else if (breakByStartFish) {
    console.log(`✅ 第${runCount}轮【计时器内检测到开始摸鱼，提前结束】，立即开启下一轮`);
  } else {
    console.log(`✅ 第${runCount}轮正常结束，立即开启下一轮`);
  }
}

async function main() {
  console.log("🔥 摸鱼程序已启动");
  console.log(`🔥 浏览器分辨率：${CONFIG.viewport.width}x${CONFIG.viewport.height}`);
  console.log(`🔥 规则：无截图，计时器每次刷新后先检测开始摸鱼，单轮最长10分钟，一轮结束立刻下一轮`);

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
  } catch (err)
    console.error("❌ 主循环异常：", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
