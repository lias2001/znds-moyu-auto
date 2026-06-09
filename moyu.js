const puppeteer = require('puppeteer');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

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

async function clickByText(page, text) {
  try {
    await page.evaluate((t) => {
      const els = Array.from(document.querySelectorAll('button, .btn, [type="button"], a'));
      const el = els.find(x => x.textContent.trim().includes(t));
      if (el) el.click();
    }, text);
    console.log(`✅ 点击：${text}`);
  } catch (e) {}
}

async function hasText(page, text) {
  try {
    return await page.evaluate((t) => {
      return document.body.textContent.includes(t);
    }, text);
  } catch (e) {
    return false;
  }
}

async function inTimeRange(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body.textContent;
      return /(^|[^\d])(9:\d{2}|10:00)([^\d]|$)/.test(t);
    });
  } catch (e) {
    return false;
  }
}

async function runCycle(browser) {
  console.log("\n==================== 新一轮 ====================");

  let page = await browser.newPage();
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  try {
    await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
    await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
    await delay(1500);

    // 初始检测开始摸鱼
    if (await hasText(page, "开始摸鱼")) {
      console.log("ℹ 检测到：开始摸鱼 → 点击");
      await clickByText(page, "开始摸鱼");

      console.log("ℹ 页面可能刷新，等待重新加载...");
      await delay(3000);

      // 页面不存在则重建
      if (!page || page.isClosed()) {
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(0);
        page.setDefaultTimeout(0);
        await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
        await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
        await delay(2000);
      }
    }

    console.log("ℹ 持续检测【开始摸鱼】，到达指定时段自动停止");
    while (true) {
      // 页面失效则重建
      if (!page || page.isClosed()) {
        console.log("ℹ 页面已关闭/失效，重新创建页面并加载");
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(0);
        page.setDefaultTimeout(0);
        await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
        await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
        await delay(2000);
      }

      // 检测到开始摸鱼，直接点击（和初始逻辑完全一致）
      if (await hasText(page, "开始摸鱼")) {
        console.log("ℹ 检测到【开始摸鱼】，执行点击");
        await clickByText(page, "开始摸鱼");
        console.log("ℹ 页面可能刷新，等待重新加载...");
        await delay(3000);

        // 刷新后页面失效则重建
        if (!page || page.isClosed()) {
          console.log("ℹ 页面刷新后关闭，重新创建页面");
          page = await browser.newPage();
          page.setDefaultNavigationTimeout(0);
          page.setDefaultTimeout(0);
          await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
          await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
          await delay(2000);
        }
      }

      // 判断是否到指定时段，到了点击停止并退出循环
      if (await inTimeRange(page)) {
        await clickByText(page, "停止");
        break;
      }

      await delay(1000);
    }

    await delay(2000);

  } catch (err) {
    console.log("ℹ 页面正常刷新，自动继续：", err.message);
  }

  try { if (!page.isClosed()) await page.close(); } catch {}
  console.log("✅ 本轮结束，立即重启循环...");
}

async function main() {
  console.log("🔥 摸鱼程序已启动 - 持续检测版");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  while (true) {
    await runCycle(browser);
  }
}

main().catch(console.error);
