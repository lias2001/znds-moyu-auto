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
    return page.evaluate(txt => {
      const nodes = document.querySelectorAll('button, .btn, a, span, div');
      for (let el of nodes) {
        const t = el.textContent.trim();
        if (t !== txt) continue;
        const st = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (rect.width <= 2 || rect.height <= 2) continue;
        if (rect.left === 0 && rect.top === 0) continue;
        if (rect.bottom < 0 || rect.right < 0) continue;
        return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
      }
      return null;
    }, targetText);
  } catch (e) {
    console.log(`ℹ 获取元素坐标失败：${e.message}`);
    return null;
  }
}

async function clickByExactText(page, targetText) {
  if (!isPageValid(page)) return false;
  try {
    return page.evaluate(txt => {
      const nodes = document.querySelectorAll('button, .btn, a, span, div');
      for (let el of nodes) {
        const t = el.textContent.trim();
        if (t !== txt) continue;
        const st = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (rect.width <= 2 || rect.height <= 2) continue;
        if (rect.left === 0 && rect.top === 0) continue;
        el.click();
        return true;
      }
      return false;
    }, targetText);
  } catch (e) {
    console.log(`ℹ 点击失败：${e.message}`);
    return false;
  }
}

// 重写计时器循环：刷新后先检测开始摸鱼，再读时间，再等60秒刷新
async function waitTimerLoop(page) {
  while (true) {
    // 第一步：刷新页面后优先检测开始摸鱼
    const fishPos = await getValidElemPos(page, "开始摸鱼");
    if (fishPos) {
      console.log("ℹ 刷新页面后检测到【开始摸鱼】，点击");
      await page.mouse.move(fishPos.x, fishPos.y);
      await clickByExactText(page, "开始摸鱼");
      await delay(2000);
      await page.reload({waitUntil:"networkidle2"});
      await delay(2000);
      return "foundFish";
    }

    // 第二步：读取打印分钟
    let minute = "";
    try {
      minute = await page.evaluate(()=>{
        const m = document.getElementById("timer-minutes");
        return m ? m.textContent.trim() : "";
      });
    } catch(e) {
      console.log("ℹ 读取计时器失败，刷新重试");
      await delay(2000);
      await page.reload({waitUntil:"domcontentloaded"});
      await delay(2000);
      continue;
    }
    console.log(`ℹ 当前计时器分钟：${minute}`);

    // 第三步：判断是否到停止时间
    if (minute === "9" || minute === "10") {
      return "reachStop";
    }

    // 第四步：未到时间，等待60秒再刷新
    console.log("ℹ 未到9/10分，等待60秒后刷新页面");
    await delay(60000);
    if (!isPageValid(page)) break;
    await page.reload({waitUntil:"networkidle2"});
    await delay(2000);
    // 回到while开头，立刻重新检测开始摸鱼
  }
  return "pageInvalid";
}

async function runOneRound(browser) {
  runCount++;
  console.log(`\n==================== 第${runCount}轮 ====================`);
  let page = null;
  let timeoutTimer = null;
  let isTimeout = false;
  let earlyEndByFish = false;

  const task = new Promise(async resolve => {
    timeoutTimer = setTimeout(()=>{
      isTimeout = true;
      console.log(`⚠️ 第${runCount}轮10分钟超时强制结束`);
      resolve();
    }, CONFIG.singleRoundMaxTime);

    try {
      page = await browser.newPage();
      page.setDefaultNavigationTimeout(0);
      page.setDefaultTimeout(0);
      await page.setViewport(CONFIG.viewport);
      await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
      await page.goto(CONFIG.url, {waitUntil:"networkidle2"});
      await delay(3000);
      console.log("ℹ 刷新页面");
      await page.reload({waitUntil:"networkidle2"});
      await delay(3000);

      // 签到逻辑
      const signDaily = await getValidElemPos(page, "每日签到");
      if (signDaily) {
        console.log("ℹ 检测到【每日签到】，点击");
        await page.mouse.move(signDaily.x, signDaily.y);
        await clickByExactText(page, "每日签到");
        await delay(3000);
      } else {
        const signed = await getValidElemPos(page, "今日已签到");
        if (signed) {
          console.log("ℹ 检测到【今日已签到】，无需操作");
          await page.mouse.move(signed.x, signed.y);
          await delay(2000);
        } else {
          console.log("ℹ 无签到按钮");
        }
      }

      // 初始页面检测开始摸鱼
      const startFish = await getValidElemPos(page, "开始摸鱼");
      if (startFish) {
        console.log("ℹ 初始页面检测到【开始摸鱼】，点击");
        await page.mouse.move(startFish.x, startFish.y);
        await clickByExactText(page, "开始摸鱼");
        await delay(3000);
      } else {
        console.log("ℹ 初始无开始摸鱼，进入计时器循环");
        const res = await waitTimerLoop(page);
        if (res === "foundFish") {
          earlyEndByFish = true;
          return;
        }
        if (res === "reachStop" && isPageValid(page)) {
          const stopBtn = await getValidElemPos(page, "停止");
          if (stopBtn) {
            console.log("ℹ 检测到【停止】按钮，点击");
            await page.mouse.move(stopBtn.x, stopBtn.y);
            await clickByExactText(page, "停止");
            await delay(3000);
          }
          await delay(2000);
        }
      }
    } catch (err) {
      console.error("❌ 本轮异常：", err.message);
    } finally {
      clearTimeout(timeoutTimer);
      if (page && !page.isClosed()) {
        await page.close();
        console.log("✅ 页面已关闭");
      }
      resolve();
    }
  });
  await task;
  if (isTimeout) {
    console.log(`✅ 第${runCount}轮【超时结束】，立即下一轮`);
  } else if (earlyEndByFish) {
    console.log(`✅ 第${runCount}轮【计时器内抓到开始摸鱼提前结束】，立即下一轮`);
  } else {
    console.log(`✅ 第${runCount}轮正常结束，立即下一轮`);
  }
}

async function main() {
  console.log("🔥 ZNDS摸鱼启动 | 分辨率980x7728 | 单轮最长10分钟");
  const browser = await puppeteer.launch({
    headless:"new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      `--window-size=${CONFIG.viewport.width},${CONFIG.viewport.height}`
    ]
  });
  try {
    while (true) {
      await runOneRound(browser);
    }
  } catch (err) {
    console.error("❌ 主循环异常：", err);
  } finally {
    await browser.close();
  }
}
main().catch(console.error);
