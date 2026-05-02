const puppeteer = require('puppeteer');

// 固定配置 禁止修改
const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  MOYU_DURATION: 9 * 60 * 1000, // 开始→停止 严格9分钟
  ROUND_DELAY: 2000,            // 每轮之间休息2秒
  TOTAL_ROUND: 39               // 总共重复执行39轮
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

async function clickButton(page, text) {
  try {
    await page.evaluate(t => {
      const btn = Array.from(document.querySelectorAll('button, input[type="button"], a.btn'))
        .find(el => el.textContent.includes(t));
      btn && btn.click();
    }, text);
    console.log(`✅ 点击：${text}`);
  } catch (e) {
    console.log(`⚠️ ${text} 按钮无需点击/已就绪`);
  }
}

// 单次标准摸鱼轮次
async function singleTask(browser, roundNum) {
  console.log(`\n---------- 第 ${roundNum} / ${CONFIG.TOTAL_ROUND} 轮 ----------`);
  const page = await browser.newPage();
  
  // 关闭超时限制，根治导航报错
  page.setDefaultNavigationTimeout(0);
  page.setDefaultTimeout(0);

  await page.setCookie(...parseCookie(COOKIE, ".znds.com"));
  await page.goto(CONFIG.url, { waitUntil: "domcontentloaded" });
  await delay(2000);

  await clickButton(page, "开始摸鱼");
  console.log("⏳ 静置9分钟挂机中...");
  await delay(CONFIG.MOYU_DURATION);
  await clickButton(page, "停止");

  await page.close().catch(()=>{});
}

// 主入口：连续跑39轮，轮间休眠2秒
async function main() {
  console.log("🔥 批量任务启动，总计执行", CONFIG.TOTAL_ROUND, "轮");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  // 循环39次
  for(let i = 1; i <= CONFIG.TOTAL_ROUND; i++){
    await singleTask(browser, i);
    // 最后一轮不用等待2秒
    if(i < CONFIG.TOTAL_ROUND){
      await delay(CONFIG.ROUND_DELAY);
    }
  }

  await browser.close();
  console.log("\n🎉 全部39轮任务圆满结束！等待下一个定时时间自动唤醒");
}

main().catch(err=>{
  console.error("❌ 全局异常兜底：",err.message);
  process.exit(1);
});

