const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  viewport: { width: 980, height: 7728 },
  screenshotDir: './screenshots'
};

const COOKIE = process.env.ZNDS_COOKIE || '';

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

// 红点截图 + 文件名带入坐标
async function screenshotWithMouse(page, type, x, y) {
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

  // 文件名格式：类型_时间戳_X坐标_Y坐标.png
  const filename = `${type}_${Date.now()}_X${Math.round(x)}_Y${Math.round(y)}.png`;
  const screenshotPath = path.join(CONFIG.screenshotDir, filename);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 截图已保存：${filename} (X:${Math.round(x)}, Y:${Math.round(y)})`);

  await page.evaluate(() => {
    const dot = document.getElementById('mouse-dot');
    if (dot) dot.remove();
  });
}

// 精准全文本匹配，仅返回坐标
async function getElemCenterByExactText(page, targetText) {
  return page.evaluate((txt) => {
    const nodes = document.querySelectorAll('button, .btn, a, span, div');
    for (let el of nodes) {
      const text = el.textContent.trim();
      if (text === txt) {
        const rect = el.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    return null;
  }, targetText);
}

// 页面内执行点击
async function clickByExactText(page, targetText) {
  await page.evaluate((txt) => {
    const nodes = document.querySelectorAll('button, .btn, a, span, div');
    for (let el of nodes) {
      if (el.textContent.trim() === txt) {
        el.click();
        return true;
      }
    }
    return false;
  }, targetText);
}

// 签到逻辑
async function handleSignIn(page) {
  const signPos = await getElemCenterByExactText(page, "每日签到");
  if (signPos) {
    console.log("ℹ 检测到【每日签到】，移动鼠标并截图");
    await page.mouse.move(signPos.x, signPos.y);
    await screenshotWithMouse(page, "每日签到", signPos.x, signPos.y);
    console.log("ℹ 点击【每日签到】");
    await clickByExactText(page, "每日签到");
    await delay(3000);
    return true;
  }

  const signedPos = await getElemCenterByExactText(page, "今日已签到");
  if (signedPos) {
    console.log("ℹ 检测到【今日已签到】，移动鼠标并截图");
    await page.mouse.move(signedPos.x, signedPos.y);
    await screenshotWithMouse(page, "今日已签到", signedPos.x, signedPos.y);
    console.log("ℹ 今日已签到，无需操作");
    await delay(2000);
    return true;
  }

  console.log("ℹ 未检测到【每日签到】/【今日已签到】");
  return false;
}

// 开始摸鱼
async function handleStartFish(page) {
  const startPos = await getElemCenterByExactText(page, "开始摸鱼");
  if (startPos) {
    console.log("ℹ 检测到【开始摸鱼】，移动鼠标并截图");
    await page.mouse.move(startPos.x, startPos.y);
    await screenshotWithMouse(page, "开始摸鱼", startPos.x, startPos.y);
    console.log("ℹ 点击【开始摸鱼】");
    await clickByExactText(page, "开始摸鱼");
    await delay(3000);
    return true;
  }
  console.log("ℹ 未检测到【开始摸鱼】");
  return false;
}

// 停止摸鱼（判断计时器 9/10 分钟）
async function handleStopFish(page) {
  const minute = await page.evaluate(() => {
    const minEl = document.getElementById('timer-minutes');
    return minEl ? minEl.textContent.trim() : '';
  });
  console.log(`ℹ 计时器分钟：${minute}`);

  if (minute === "9" || minute === "10") {
    const stopPos = await getElemCenterByExactText(page, "停止");
    if (stopPos) {
      console.log("ℹ 计时器到达 9/10 分，准备停止");
      await page.mouse.move(stopPos.x, stopPos.y);
      await screenshotWithMouse(page, "停止按钮", stopPos.x, stopPos.y);
      console.log("ℹ 点击【停止】");
      await clickByExactText(page, "停止");
      await delay(3000);
      await delay(2000);
      return true;
    }
  }
  return false;
}

// 单轮任务
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");
  let page = null;

  try {
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.setViewport(CONFIG.viewport);

    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(2000);

    console.log("ℹ 刷新页面");
    await page.reload({ waitUntil: "domcontentloaded" });
    await delay(2000);

    const hasSign = await handleSignIn(page);
    if (!hasSign) {
      const hasStart = await handleStartFish(page);
      if (!hasStart) {
        await handleStopFish(page);
      }
    }

  } catch (err) {
    console.error("❌ 本轮执行出错：", err.message);
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
      console.log("✅ 页面已关闭");
    }
  }
  console.log("✅ 本轮结束");
}

// 主程序
async function main() {
  console.log("🔥 摸鱼程序已启动 - 每分钟一轮");
  console.log(`🔥 浏览器分辨率：${CONFIG.viewport.width}x${CONFIG.viewport.height}`);

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
      await delay(60 * 1000);
      console.log("ℹ 等待1分钟，进入下一轮...");
    }
  } catch (err) {
    console.error("❌ 主循环异常：", err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
