const puppeteer = require('puppeteer');

// ========== 和你油猴一模一样的配置 ==========
const CONFIG = {
  loopMinute: 9,
  waitAfterStop: 3000,
  checkErrorInterval: 15000,
  heartbeatInterval: 45000,
  targetUrl: "https://www.znds.com/plugin.php?id=muanyun_053*"
};
const LOOP_TIME = 540000;

let browser, page;
// 从 GitHub Actions 环境变量读取登录Cookie
const RAW_COOKIE = process.env.ZNDS_COOKIE || "";

// 解析纯文本Cookie字符串插入浏览器
function parseCookieString(cookieStr, domain) {
  const list = [];
  cookieStr.split(";").forEach(item => {
    const arr = item.trim().split("=");
    if(arr.length >= 2){
      list.push({
        name: arr[0],
        value: arr.slice(1).join("="),
        domain: domain,
        path: "/"
      });
    }
  });
  return list;
}

// 获取按钮（复用你原选择器逻辑）
async function getButton(text) {
  return await page.evaluate((s) => {
    return Array.from(document.querySelectorAll("button,input[type='button'],a.btn"))
      .find(el => el.textContent.includes(s));
  }, text);
}

// 停止摸鱼
async function stopMoyu() {
  const exist = await getButton("停止");
  if(exist){
    await page.evaluate(()=>{
      let b = Array.from(document.querySelectorAll("button,input[type='button'],a.btn"))
      .find(el=>el.textContent.includes("停止"));
      b&&b.click();
    });
    console.log("🛑 已停止摸鱼");
  }
}

// 开始摸鱼
async function startMoyu() {
  const exist = await getButton("开始摸鱼");
  if(exist){
    await page.evaluate(()=>{
      let b = Array.from(document.querySelectorAll("button,input[type='button'],a.btn"))
      .find(el=>el.textContent.includes("开始摸鱼"));
      b&&b.click();
    });
    console.log("▶️ 已开启摸鱼");
  }
}

// 9分钟一轮启停循环
async function resetMoyuCycle() {
  try{
    await stopMoyu();
    await new Promise(r=>setTimeout(r, CONFIG.waitAfterStop));
    await startMoyu();
  }catch(e){
    console.error("🔁 循环异常，页面重载自愈",e);
    await page.reload();
  }
}

// 页面健康检测：白屏/DOM卡死/异常 自动刷新
async function checkPageHealth() {
  try{
    const dead = await page.evaluate(()=>{
      if(!document.body || document.body.innerHTML.length<500) return true;
      try{document.querySelector("*");return false;}catch{return true;}
    });
    if(dead){
      console.log("❌ 检测到页面崩溃/白屏，自动刷新");
      await page.reload();
    }
  }catch(e){
    console.error("health检查报错，强制刷新",e);
    await page.reload();
  }
}

// 心跳保活
async function heartbeat() {
  try{
    await page.evaluate(()=>fetch(location.href,{cache:"no-cache"}));
  }catch{}
}

// 全局JS页面错误捕获，等价你 window.onerror
function bindErrorAutoReload() {
  page.on("pageerror", err=>{
    console.log("⚠️ 捕获JS脚本崩溃，1秒后自动刷新：",err.message);
    setTimeout(()=>page.reload(),1000);
  });
  // 请求/网络崩溃兜底
  page.on("requestfailed", ()=>{});
}

// 主入口
async function init() {
  console.log("🚀 启动无头浏览器 ZNDS挂机...");
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  page = await browser.newPage();
  page.setDefaultNavigationTimeout(120000);
  
  // 注入登录Cookie 核心免登录逻辑
  if(RAW_COOKIE){
    const cookies = parseCookieString(RAW_COOKIE, ".znds.com");
    await page.setCookie(...cookies);
    console.log("🍪 登录Cookie注入成功");
  }

  // 访问目标页面
  await page.goto(CONFIG.targetUrl, {waituntil:"networkidle2"});
  bindErrorAutoReload();

  // 延迟启动，和原油猴2500ms一致
  await new Promise(r=>setTimeout(r,2500));
  await startMoyu();

  // 全部定时 和你本地时序完全一致
  setInterval(resetMoyuCycle, LOOP_TIME);
  setInterval(checkPageHealth, CONFIG.checkErrorInterval);
  setInterval(heartbeat, CONFIG.heartbeatInterval);

  console.log("✅ GitHub Actions 完整自愈摸鱼脚本已常驻运行！");
}

// 全局进程崩溃不炸容器、自动刷新兜底
process.on("uncaughtException",async err=>{
  console.error("💥 全局致命异常，恢复页面",err);
  if(page) await page.reload();
});

init();
