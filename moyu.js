const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  viewport: { width: 980, height: 7728 }, // 设置浏览器分辨率
  screenshotDir: './screenshots' // 截图保存目录
};

const COOKIE = process.env.ZNDS_COOKIE || '';

// 确保截图目录存在
if (!fs.existsSync(CONFIG.screenshotDir)) {
  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
}

/**
 * 解析Cookie字符串为Puppeteer可识别的格式
 */
function parseCookie(str, domain) {
  const list = [];
  str.split(";").forEach(item => {
    const [name, ...vs] = item.trim().split("=");
    if (name) list.push({ name, value: vs.join('='), domain, path: '/' });
  });
  return list;
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 带鼠标红点的截图（红点跟随鼠标位置）
 * @param {puppeteer.Page} page - 页面实例
 * @param {string} filename - 截图文件名
 * @param {number} x - 鼠标X坐标
 * @param {number} y - 鼠标Y坐标
 */
async function screenshotWithMouse(page, filename, x, y) {
  // 注入红点样式和元素
  await page.evaluate((x, y) => {
    let dot = document.getElementById('mouse-dot');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'mouse-dot';
      dot.style.cssText = `
        position: fixed;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(255, 0, 0, 0.8);
        z-index: 999999;
        pointer-events: none;
        transform: translate(-50%, -50%);
      `;
      document.body.appendChild(dot);
    }
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
  }, x, y);

  // 截图并保存
  const screenshotPath = path.join(CONFIG.screenshotDir, filename);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 截图已保存：${screenshotPath}`);

  // 移除红点
  await page.evaluate(() => {
    const dot = document.getElementById('mouse-dot');
    if (dot) dot.remove();
  });
}

/**
 * 根据文本查找元素并获取坐标
 * @param {puppeteer.Page} page - 页面实例
 * @param {string} text - 要查找的文本
 * @returns {Promise<{x: number, y: number, element: any}>} 元素坐标和实例
 */
async function findElementByText(page, text) {
  return await page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('button, .btn, [type="button"], a, div, span'));
    const el = els.find(x => x.textContent.trim().includes(t));
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2, // 元素中心X
      y: rect.top + rect.height / 2,  // 元素中心Y
      element: el
    };
  }, text);
}

/**
 * 处理签到逻辑
 * @param {puppeteer.Page} page - 页面实例
 */
async function handleSignIn(page) {
  // 检查【每日签到】
  const signInEl = await findElementByText(page, "每日签到");
  if (signInEl) {
    console.log("ℹ 检测到【每日签到】，移动鼠标并截图");
    // 移动鼠标到元素位置
    await page.mouse.move(signInEl.x, signInEl.y);
    // 截图（带红点）
    await screenshotWithMouse(page, `签到_每日签到_${Date.now()}.png`, signInEl.x, signInEl.y);
    // 点击签到
    console.log("ℹ 点击【每日签到】");
    await page.evaluate(el => el.click(), signInEl.element);
    await delay(3000); // 等待页面刷新
    return;
  }

  // 检查【今日已签到】
  const signedEl = await findElementByText(page, "今日已签到");
  if (signedEl) {
    console.log("ℹ 检测到【今日已签到】，移动鼠标并截图");
    // 移动鼠标到元素位置
    await page.mouse.move(signedEl.x, signedEl.y);
    // 截图（带红点）
    await screenshotWithMouse(page, `签到_今日已签到_${Date.now()}.png`, signedEl.x, signedEl.y);
    console.log("ℹ 提示：今日已签到，无需操作");
    await delay(2000);
    return;
  }

  console.log("ℹ 未检测到【每日签到】或【今日已签到】");
}

/**
 * 处理摸鱼逻辑
 * @param {puppeteer.Page} page - 页面实例
 */
async function handleFishing(page) {
  // 检查【开始摸鱼】
  const startFishingEl = await findElementByText(page, "开始摸鱼");
  if (startFishingEl) {
    console.log("ℹ 检测到【开始摸鱼】，移动鼠标并截图");
    // 移动鼠标到元素位置
    await page.mouse.move(startFishingEl.x, startFishingEl.y);
    // 截图（带红点）
    await screenshotWithMouse(page, `摸鱼_开始摸鱼_${Date.now()}.png`, startFishingEl.x, startFishingEl.y);
    // 点击开始摸鱼
    console.log("ℹ 点击【开始摸鱼】");
    await page.evaluate(el => el.click(), startFishingEl.element);
    await delay(3000); // 等待页面刷新
    return true;
  }

  console.log("ℹ 未检测到【开始摸鱼】");
  return false;
}

/**
 * 处理停止摸鱼逻辑（计时器分钟为9/10时）
 * @param {puppeteer.Page} page - 页面实例
 * @returns {Promise<boolean>} 是否执行了停止操作
 */
async function handleStopFishing(page) {
  // 获取计时器分钟数
  const minutes = await page.evaluate(() => {
    const minuteEl = document.getElementById('timer-minutes');
    return minuteEl ? minuteEl.textContent.trim() : '';
  });

  console.log(`ℹ 计时器分钟数：${minutes}`);
  if (minutes === '9' || minutes === '10') {
    // 查找【停止】按钮
    const stopEl = await findElementByText(page, "停止");
    if (stopEl) {
      console.log("ℹ 检测到计时器分钟为9/10，移动鼠标到【停止】并截图");
      // 移动鼠标到元素位置
      await page.mouse.move(stopEl.x, stopEl.y);
      // 截图（带红点）
      await screenshotWithMouse(page, `摸鱼_停止_${Date.now()}.png`, stopEl.x, stopEl.y);
      // 点击停止
      console.log("ℹ 点击【停止】");
      await page.evaluate(el => el.click(), stopEl.element);
      await delay(3000); // 等待页面刷新
      await delay(2000); // 额外等待2秒
      return true;
    }
  }

  return false;
}

/**
 * 单轮任务执行逻辑
 * @param {puppeteer.Browser} browser - 浏览器实例
 */
async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");
  let page = null;

  try {
    // 创建新页面并设置分辨率
    page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.setViewport(CONFIG.viewport); // 设置浏览器分辨率

    // 设置Cookie并打开页面
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(2000); // 等待2秒

    // 刷新页面
    console.log("ℹ 刷新页面");
    await page.reload({ waitUntil: "domcontentloaded" });
    await delay(2000); // 等待2秒

    // 处理签到逻辑
    await handleSignIn(page);

    // 处理摸鱼逻辑
    const hasStartFishing = await handleFishing(page);

    // 如果未检测到签到/开始摸鱼，检查计时器并处理停止
    if (!hasStartFishing) {
      const hasStopped = await handleStopFishing(page);
      if (hasStopped) {
        console.log("ℹ 已执行停止操作，准备关闭页面");
        await page.close();
        return;
      }
    }

  } catch (err) {
    console.error("❌ 本轮执行出错：", err.message);
  } finally {
    // 关闭页面（如果未关闭）
    if (page && !page.isClosed()) {
      await page.close();
      console.log("✅ 页面已关闭");
    }
  }

  console.log("✅ 本轮结束");
}

/**
 * 主函数：按分钟循环执行任务
 */
async function main() {
  console.log("🔥 摸鱼程序已启动 - 每分钟一轮");
  console.log(`🔥 浏览器分辨率设置为：${CONFIG.viewport.width}x${CONFIG.viewport.height}`);

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: "new", // 使用新版无头模式
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--window-size=980,7728" // 确保窗口尺寸匹配
    ],
  });

  try {
    // 每分钟执行一轮
    while (true) {
      await runCycle(browser);
      console.log("ℹ 等待1分钟后启动下一轮...");
      await delay(60 * 1000); // 间隔1分钟
    }
  } catch (err) {
    console.error("❌ 程序主循环出错：", err);
  } finally {
    await browser.close();
    console.log("✅ 浏览器已关闭");
  }
}

main().catch(console.error);
