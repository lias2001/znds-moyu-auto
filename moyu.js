const puppeteer = require('puppeteer');
const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  viewport: { width: 980, height: 7728 },
  singleRoundMaxTime: 10 * 60 * 1000,
  pageLoadTimeout: 2000
};
const COOKIE = process.env.ZNDS_COOKIE || '';
let runCount = 0;

function parseCookie(str) {
  const list = [];
  str.split(";").forEach(item=>{
    const [name,...vs] = item.trim().split("=");
    if(name) list.push({name,value:vs.join('='),domain:".znds.com",path:'/'});
  });
  return list;
}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function withTimeout(promise,tip){
  const t = new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${tip} 2秒超时`)),CONFIG.pageLoadTimeout));
  return Promise.race([promise,t]);
}
function isPageValid(p){return p && !p.isClosed()}

async function getValidElemPos(page,txt){
  if(!isPageValid(page)) return null;
  try{
    return page.evaluate(t=>{
      const els = document.querySelectorAll('button,.btn,a,span,div');
      for(let el of els){
        const text = el.textContent.trim();
        if(text!==t)continue;
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if(s.display==='none'||s.visibility==='hidden')continue;
        if(r.width<=2||r.height<=2)continue;
        if(r.left===0&&r.top===0)continue;
        if(r.bottom<0||r.right<0)continue;
        return {x:r.left+r.width/2,y:r.top+r.height/2};
      }
      return null;
    },txt);
  }catch(e){
    console.log(`获取元素失败:${e.message}`);
    return null;
  }
}
async function clickByText(page,txt){
  if(!isPageValid(page))return false;
  try{
    return page.evaluate(t=>{
      const els = document.querySelectorAll('button,.btn,a,span,div');
      for(let el of els){
        const text = el.textContent.trim();
        if(text!==t)continue;
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if(s.display==='none'||s.visibility==='hidden')continue;
        if(r.width<=2||r.height<=2)continue;
        if(r.left===0&&r.top===0)continue;
        el.click();
        return true;
      }
      return false;
    },txt);
  }catch(e){
    console.log(`点击失败:${e.message}`);
    return false;
  }
}

async function timerLoop(page){
  while(true){
    if(!isPageValid(page))return "pageInvalid";
    const fish = await getValidElemPos(page,"开始摸鱼");
    if(fish){
      console.log("刷新后检测到开始摸鱼，点击");
      await page.mouse.move(fish.x,fish.y);
      await clickByText(page,"开始摸鱼");
      await delay(2000);
      await withTimeout(page.reload({waitUntil:"domcontentloaded"}),"计时器刷新");
      await delay(2000);
      return "foundFish";
    }
    let minute = "";
    try{
      minute = await page.evaluate(()=>{
        const m = document.getElementById("timer-minutes");
        return m?m.textContent.trim():"";
      });
    }catch(e){
      console.log("读取计时器失败，刷新");
      await delay(2000);
      await withTimeout(page.reload({waitUntil:"domcontentloaded"}),"读计时刷新");
      await delay(2000);
      continue;
    }
    console.log(`当前分钟:${minute}`);
    if(minute==="9"||minute==="10")return "reachStop";
    console.log("未到9/10，等待60秒刷新");
    await delay(60000);
    if(!isPageValid(page))break;
    await withTimeout(page.reload({waitUntil:"domcontentloaded"}),"定时刷新");
    await delay(2000);
  }
  return "pageInvalid";
}

async function runRound(browser){
  runCount++;
  console.log(`\n=====第${runCount}轮=====`);
  let page = null;
  let roundTimer = null;
  let timeOutFlag = false;
  let earlyExit = false;
  const task = new Promise(async resolve=>{
    roundTimer = setTimeout(()=>{
      timeOutFlag = true;
      console.log(`第${runCount}轮10分钟超时终止`);
      resolve();
    },CONFIG.singleRoundMaxTime);
    try{
      console.log("新建页面");
      page = await browser.newPage();
      page.setDefaultNavigationTimeout(CONFIG.pageLoadTimeout);
      page.setDefaultTimeout(CONFIG.pageLoadTimeout);
      await page.setViewport(CONFIG.viewport);
      await page.setCookie(...parseCookie(COOKIE));
      console.log("打开网页");
      await withTimeout(page.goto(CONFIG.url,{waitUntil:"domcontentloaded"}),"首次访问");
      await delay(3000);
      console.log("页面刷新");
      await withTimeout(page.reload({waitUntil:"domcontentloaded"}),"首轮刷新");
      await delay(3000);
      //签到
      const signDay = await getValidElemPos(page,"每日签到");
      if(signDay){
        console.log("检测每日签到并点击");
        await page.mouse.move(signDay.x,signDay.y);
        await clickByText(page,"每日签到");
        await delay(3000);
      }else{
        const signed = await getValidElemPos(page,"今日已签到");
        if(signed){
          console.log("今日已签到");
          await page.mouse.move(signed.x,signed.y);
          await delay(2000);
        }else{
          console.log("无签到按钮");
        }
      }
      //初始摸鱼
      const startFish = await getValidElemPos(page,"开始摸鱼");
      if(startFish){
        console.log("初始检测开始摸鱼，点击");
        await page.mouse.move(startFish.x,startFish.y);
        await clickByText(page,"开始摸鱼");
        await delay(3000);
      }else{
        console.log("进入计时器循环");
        const res = await timerLoop(page);
        if(res==="foundFish"){earlyExit=true;return;}
        if(res==="reachStop"&&isPageValid(page)){
          const stopBtn = await getValidElemPos(page,"停止");
          if(stopBtn){
            console.log("点击停止");
            await page.mouse.move(stopBtn.x,stopBtn.y);
            await clickByText(page,"停止");
            await delay(3000);
          }
          await delay(2000);
        }
      }
    }catch(err){
      console.log("本轮异常："+err.message);
    }finally{
      clearTimeout(roundTimer);
      if(page&&!page.isClosed()){
        await page.close();
        console.log("页面关闭");
      }
      resolve();
    }
  });
  await task;
  if(timeOutFlag)console.log(`第${runCount}轮：超时结束，立刻下一轮`);
  else if(earlyExit)console.log(`第${runCount}轮：计时器抓到摸鱼提前结束`);
  else console.log(`第${runCount}轮：正常结束，立刻下一轮`);
}

async function main(){
  console.log("ZNDS摸鱼启动｜分辨率980*7728｜页面2秒超时｜单轮10分钟上限");
  const browser = await puppeteer.launch({
    headless:"new",
    args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--single-process",`--window-size=${CONFIG.viewport.width},${CONFIG.viewport.height}`]
  });
  try{
    while(true)await runRound(browser);
  }catch(err){
    console.error("主循环异常：",err);
  }finally{
    await browser.close();
  }
}
main().catch(console.error);
