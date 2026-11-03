'use strict';

/**
 * ZNDS 单文件脚本：签到一次 → 摸鱼无限循环
 *
 * 用法：
 *   node znds.js                  # 签到一次，然后摸鱼循环（直到进程被杀）
 *   node znds.js --minutes=30     # 调试用：摸鱼 30 分钟后自行收尾退出
 *   node znds.js --signin-only    # 只签到
 *   node znds.js --export-cookie  # 本地开有头浏览器导出 cookie.txt
 *
 * 环境变量：
 *   ZNDS_COOKIE      必填（--export-cookie 除外）
 *   MOYU_URL         调试用，可指向本地 mock 页面
 *   STOP_AT_MINUTES  计时到几分钟点停止，默认 9
 *   POLL_MS          计时器轮询间隔，默认 30000
 *   STOP_TO_START_WAIT_MS  点停止后等多久再点开始，默认 2000（等弹出页关闭）
 *
 * 摸鱼机制：计时满 9 分钟 → 点【停止】→ 关闭页面 → 重新打开页面 → 点【开始摸鱼】→ 继续累计，如此反复。
 * GitHub Actions 单 job 上限 6 小时，到点被 kill 前会尝试点停止收尾。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/* ============================== 配置 ============================== */

const BASE = 'https://www.znds.com';
const PAGE_URL = `${BASE}/plugin.php?id=muanyun_053`;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const getOpt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

const CFG = {
  minutes: Number(getOpt('minutes', 0)), // 0 = 不限，跑到被杀
  stopAtMinutes: Number(process.env.STOP_AT_MINUTES || 9),
  pollMs: Number(process.env.POLL_MS || 30000),
  clickWait: 3000,
  stopWait: Number(process.env.STOP_TO_START_WAIT_MS || 2000), // 停止后等弹出页关闭
  navTimeout: 60000,
  url: process.env.MOYU_URL || PAGE_URL,
  viewport: { width: 980, height: 1600 },
};

const state = {
  startedAt: Date.now(),
  rounds: 0,
  shutdown: false,
  page: null,
  browser: null,
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const isAlive = (page) => !!page && !page.isClosed();
const elapsedMin = () => Math.round((Date.now() - state.startedAt) / 60000);
const outOfTime = () => (CFG.minutes > 0 ? Date.now() - state.startedAt >= CFG.minutes * 60000 : false);

/* ============================ Cookie ============================ */

/** 支持两种格式：浏览器字符串 "a=1; b=2" 或 getCookie 导出的 JSON 数组 */
function loadCookies(raw) {
  const src = String(raw || '').trim();
  if (!src) throw new Error('缺少 Cookie：请设置环境变量 ZNDS_COOKIE');

  if (src.startsWith('[')) {
    let arr;
    try {
      arr = JSON.parse(src);
    } catch (e) {
      throw new Error('ZNDS_COOKIE 是 JSON 但解析失败：' + e.message);
    }
    return arr
      .filter((c) => c && c.name)
      .map((c) => ({
        name: String(c.name),
        value: String(c.value ?? ''),
        domain: c.domain || '.znds.com',
        path: c.path || '/',
      }));
  }

  return src
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const i = item.indexOf('=');
      return {
        name: (i === -1 ? item : item.slice(0, i)).trim(),
        value: (i === -1 ? '' : item.slice(i + 1)).trim(),
        domain: '.znds.com',
        path: '/',
      };
    })
    .filter((c) => c.name);
}

const toCookieHeader = (list) => list.map((c) => `${c.name}=${c.value}`).join('; ');

/* ============================== HTTP ============================== */

async function httpGet(url, cookie, { method = 'GET', body = null, referer = PAGE_URL } = {}) {
  const headers = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: referer,
  };
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal, redirect: 'follow' });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

const getFormhash = (html) => (html.match(/name="formhash"\s+value="([0-9a-zA-Z]+)"/) || [])[1] || '';
const isLoggedIn = (html) => !/id="lsform"|name="loginsubmit"|只需一步[，,]快速开始/.test(html);

function getStats(html) {
  // 先去掉 HTML 注释：页面里残留的旧版注释块会把「累计经验」误当成「当前等级」
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const pick = (label) => {
    const re = new RegExp(label + '[\\s\\S]{0,200}?stat-value[^>]*>\\s*(\\d+(?:\\.\\d+)?)');
    const m = clean.match(re);
    return m ? m[1] : null;
  };
  const lv = clean.match(/当前等级[\s\S]{0,240}?Lv\.[\s\S]{0,40}?(\d+(?:\.\d+)?)/);
  return {
    total: pick('累计签到'),
    streak: pick('连续签到'),
    fishing: pick('摸鱼时长'),
    level: lv ? lv[1] : pick('当前等级'),
  };
}

/* ============================== 签到 ============================== */

async function signinOnce(cookieHeader) {
  console.log('\n========== 签到（每次运行只做一次） ==========');
  const page = await httpGet(PAGE_URL, cookieHeader);
  console.log(`  GET ${page.status}，${page.text.length} 字节`);

  if (!isLoggedIn(page.text)) {
    const err = new Error('Cookie 无效或已过期，请重新导出 ZNDS_COOKIE');
    err.fatal = true;
    throw err;
  }

  const before = getStats(page.text);
  console.log(`  签到前：累计 ${before.total ?? '-'} 天 / 连续 ${before.streak ?? '-'} 天`);

  const hasForm = /name="checkinsubmit"/.test(page.text);
  let result;

  if (!hasForm) {
    result = '页面无签到表单，今日已签到';
    console.log('ℹ ' + result);
  } else {
    const body = new URLSearchParams({ formhash: getFormhash(page.text), checkinsubmit: '1' }).toString();
    const res = await httpGet(`${PAGE_URL}&op=checkin`, cookieHeader, { method: 'POST', body });
    const hit = res.text.match(/(签到成功|签到完成|已经签到|已签到|恭喜)/);
    if (hit) result = `签到成功：${hit[0]}`;
    else if (/今日已签到|今天已经签到|无需重复/.test(res.text)) result = '今日已签到，无需重复';
    else result = `签到请求已发送（HTTP ${res.status}）`;
    console.log(`  POST ${res.status} → ${result}`);
  }

  const after = getStats((await httpGet(PAGE_URL, cookieHeader)).text);
  const grew = Number(after.total) > Number(before.total ?? 0);
  if (grew) result += `（累计 +${Number(after.total) - Number(before.total)}，已生效）`;
  console.log(`  签到后：累计 ${after.total ?? '-'} 天 / 连续 ${after.streak ?? '-'} 天 / 等级 Lv.${after.level ?? '-'}`);

  writeSummary([
    '### ZNDS 每日任务',
    '',
    '**签到**',
    `- 结果：${result}`,
    `- 累计签到：${after.total ?? '-'} 天`,
    `- 连续签到：${after.streak ?? '-'} 天`,
    `- 摸鱼时长（历史）：${after.fishing ?? '-'} h`,
    `- 等级：Lv.${after.level ?? '-'}`,
    '',
    `**摸鱼**：${CFG.minutes > 0 ? `最多 ${CFG.minutes} 分钟` : '持续循环，直到进程被 6 小时限制终止'}`,
    '',
  ]);

  return { result, stats: after };
}

function writeSummary(lines) {
  const text = lines.join('\n');
  console.log('\n' + text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n', 'utf8');
  }
}

/* ============================== 浏览器 ============================== */

const WIN_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const POSIX_BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
];

function fileOk(p) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024;
  } catch {
    return false;
  }
}

/** 环境变量 > puppeteer 自带 Chromium > 系统 Chrome/Edge */
function findBrowser() {
  if (fileOk(process.env.PUPPETEER_EXECUTABLE_PATH)) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    const p = require('puppeteer').executablePath();
    if (fileOk(p)) return p;
  } catch {}
  const list = os.platform() === 'win32' ? WIN_BROWSERS : POSIX_BROWSERS;
  return list.find(fileOk) || '';
}

async function launchBrowser(headless = true) {
  const exe = findBrowser();
  if (!exe) {
    throw new Error('未找到浏览器：请安装 Chrome/Edge，或设置 PUPPETEER_EXECUTABLE_PATH，或 npx puppeteer browsers install chrome');
  }
  console.log(`ℹ 浏览器：${path.basename(exe)} → ${exe}`);
  return require('puppeteer').launch({
    headless,
    executablePath: exe,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=zh-CN'],
    ...(headless ? {} : { defaultViewport: null }),
  });
}

/* ============================== 摸鱼 ============================== */

/** 关闭【停止】后弹出的新标签页（保留主页面） */
async function closeExtraPages() {
  if (!state.browser) return 0;
  let closed = 0;
  try {
    const pages = await state.browser.pages();
    for (const p of pages) {
      if (p === state.page) continue;
      const url = p.url();
      try {
        await p.close();
        closed++;
        console.log(`ℹ 已关闭弹出页面：${url.slice(0, 90)}`);
      } catch {}
    }
  } catch {}
  return closed;
}

/**
 * 停止后的重启流程：等弹出页出来 → 关掉所有页面 → 重新打开页面 → 点【开始摸鱼】
 * 站点停止时会弹页面/改状态，直接点开始点不到，重开页面最稳
 */
async function restartAfterStop(cookies) {
  await delay(CFG.stopWait); // 等停止后的新页面弹出来/自己关掉

  if (isAlive(state.page)) {
    await state.page.close().catch(() => {});
    console.log('ℹ 已关闭旧页面');
  }
  await closeExtraPages();
  await delay(800);

  try {
    state.page = await openPageWithRetry(cookies);
    console.log('ℹ 已重新打开页面');
  } catch (e) {
    console.log(`⚠ 重新打开页面失败：${String(e.message).split('\n')[0]}`);
    console.log('   本轮跳过重开，等主循环下一轮再试');
    return false;
  }

  for (let i = 0; i < 5; i++) {
    if (!isAlive(state.page)) {
      try {
        state.page = await openPageWithRetry(cookies);
      } catch {
        return false;
      }
    }
    if (await clickByText(state.page, '开始摸鱼')) {
      console.log('▶ 点击【开始摸鱼】');
      await delay(CFG.clickWait);
      return true;
    }
    console.log(`ℹ 新页面未找到【开始摸鱼】，刷新重试（${i + 1}/5）`);
    await state.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await delay(2000);
  }
  return false;
}

async function clickByText(page, text) {
  if (!isAlive(page)) return false;
  try {
    return await page.evaluate((txt) => {
      for (const el of document.querySelectorAll('button, .btn, a, span, div')) {
        if (el.textContent.trim() !== txt) continue;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        if (rect.width <= 2 || rect.height <= 2) continue;
        if (rect.left === 0 && rect.top === 0) continue;
        el.click();
        return true;
      }
      return false;
    }, text);
  } catch {
    return false;
  }
}

/** 读计时器分钟数：优先 #timer-minutes，其次任何 class 含 timer 的元素 */
async function readTimer(page) {
  if (!isAlive(page)) return { minutes: null, text: '' };
  try {
    const raw = await page.evaluate(() => {
      const out = [];
      const byId = document.getElementById('timer-minutes');
      if (byId) out.push(byId.textContent.trim());
      for (const node of document.querySelectorAll('[class*="timer"]')) {
        const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
      }
      return out;
    });
    for (const text of raw) {
      if (/^\d{1,2}$/.test(text)) return { minutes: Number(text), text };
      const mmss = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
      if (mmss) return { minutes: Number(mmss[1]), text };
    }
    return { minutes: null, text: raw[0] || '' };
  } catch {
    return { minutes: null, text: '' };
  }
}

async function openPage(browser, cookies) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(CFG.navTimeout);
  page.setDefaultTimeout(CFG.navTimeout);
  await page.setViewport(CFG.viewport);
  await page.setUserAgent(UA);
  await page.setCookie(...cookies);
  await page.goto(CFG.url, { waitUntil: 'domcontentloaded' });
  await delay(3000);
  return page;
}

/** 打开页面失败（超时/限流）要重试，不能因为一次超时就把整轮任务打死 */
async function openPageWithRetry(cookies, attempts = 4) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await openPage(state.browser, cookies);
    } catch (e) {
      lastErr = e;
      console.log(`⚠ 打开页面失败（${i}/${attempts}）：${String(e.message).split('\n')[0]}`);
      await closeExtraPages();
      if (i < attempts) await delay(8000 * i); // 8s / 16s / 24s 退避
    }
  }
  throw lastErr;
}

async function stopFishing(page, tag) {
  if (!isAlive(page)) return false;
  if (await clickByText(page, '停止')) {
    console.log(`⏹ ${tag}：已点击【停止】`);
    await delay(1000);
    return true;
  }
  return false;
}

async function moyuLoop(cookies) {
  console.log('\n========== 摸鱼（循环） ==========');
  console.log(`🔥 计时满 ${CFG.stopAtMinutes} 分钟 → 停止 → 关页面重开；轮询 ${CFG.pollMs / 1000}s`);
  console.log(CFG.minutes > 0 ? `🔥 上限 ${CFG.minutes} 分钟（调试模式）` : '🔥 不限时长，跑到进程被终止为止');

  state.browser = await launchBrowser(true);
  state.page = await openPageWithRetry(cookies);

  const html = await state.page.content();
  if (!isLoggedIn(html)) throw new Error('Cookie 无效或已过期，请重新导出 ZNDS_COOKIE');

  // 签到兜底（HTTP 那步失败时补一刀）
  if (await clickByText(state.page, '每日签到')) {
    console.log('ℹ 浏览器内补签一次');
    await delay(CFG.clickWait);
  }

  let lastStartAt = 0;
  let zeroStreak = 0;
  let ticks = 0;

  // 防误点：20s 内不重复点；连续两次读到 0 分才认为真的没在摸鱼
  const ensureStarted = async () => {
    if (Date.now() - lastStartAt < 20000) return;
    const t = await readTimer(state.page);
    if (t.minutes !== null && t.minutes >= 1) {
      zeroStreak = 0;
      return;
    }
    if (++zeroStreak < 2) return;
    if (await clickByText(state.page, '开始摸鱼')) {
      lastStartAt = Date.now();
      zeroStreak = 0;
      console.log('▶ 点击【开始摸鱼】');
      await delay(CFG.clickWait);
    }
  };

  while (!state.shutdown && !outOfTime()) {
    try {
      if (!isAlive(state.page)) {
        console.log('⚠ 页面失效，重新打开');
        state.page = await openPageWithRetry(cookies);
      }

      await ensureStarted();

      const timer = await readTimer(state.page);
      const min = timer.minutes;

      if (min !== null && min >= CFG.stopAtMinutes) {
        console.log(`⏱ 计时 ${min} 分，达到阈值 ${CFG.stopAtMinutes}`);
        if (await stopFishing(state.page, '本轮')) {
          state.rounds++;
          console.log(`✅ 完成第 ${state.rounds} 轮（累计运行 ${elapsedMin()} 分钟）`);

          if (await restartAfterStop(cookies)) {
            lastStartAt = Date.now();
          } else {
            console.log('⚠ 重开失败，交给下一轮检测');
            await delay(20000);
          }
        }
        continue;
      }

      if (ticks++ % 10 === 0) {
        console.log(`ℹ 计时 ${min ?? '?'} 分 / 已完成 ${state.rounds} 轮 / 运行 ${elapsedMin()} 分钟`);
        await closeExtraPages();
      }

      await delay(CFG.pollMs);

      // 计时器为服务端渲染，刷新页面才能看到最新分钟数
      if (isAlive(state.page) && !state.shutdown) {
        await state.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await delay(1500);
      }
    } catch (err) {
      // 网络抖动/超时不该终止整轮任务，歇一会儿继续
      console.log(`⚠ 本轮异常（已忽略，30s 后继续）：${String(err.message).split('\n')[0]}`);
      if (err.fatal) throw err;
      await closeExtraPages();
      await delay(30000);
      if (!isAlive(state.page)) {
        state.page = await openPageWithRetry(cookies).catch(() => null);
      }
    }
  }

  await stopFishing(state.page, '收尾');
  const result = { rounds: state.rounds, minutes: elapsedMin() };

  // 正常结束要关掉浏览器，否则进程不会退出
  try {
    if (isAlive(state.page)) await state.page.close().catch(() => {});
    if (state.browser) await Promise.race([state.browser.close(), delay(5000)]);
  } catch {}
  return result;
}

/* ======================= 本地导出 Cookie ======================= */

async function exportCookie() {
  const browser = await launchBrowser(process.env.EXPORT_HEADLESS === '1');
  try {
    const page = await browser.newPage();
    console.log(`正在打开：${BASE}/qiandao.html`);
    await page.goto(`${BASE}/qiandao.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('👉 请在弹出的浏览器窗口里完成登录（QQ 或账号密码），登录成功后会自动导出并关闭窗口。');
    console.log('   窗口在检测到登录态之前不会关闭，最多等 10 分钟。');

    // 关键：游客页也有「累计签到 / 每日签到」，只能靠 *_auth cookie + 无登录表单判断
    const checkLogin = async () => {
      try {
        const cookies = await page.cookies();
        const hasAuth = cookies.some((c) => /_auth$/.test(c.name));
        if (!hasAuth) return { ok: false, cookies };
        const html = await page.content();
        const hasLoginForm = /id="lsform"|name="loginsubmit"|只需一步[，,]快速开始/.test(html);
        return { ok: !hasLoginForm, cookies };
      } catch {
        return { ok: false, cookies: [] };
      }
    };

    const deadline = Date.now() + 600000;
    let res = await checkLogin();
    let waited = 0;

    while (!res.ok && Date.now() < deadline && !page.isClosed()) {
      await delay(2000);
      waited += 2;
      if (waited % 20 === 0) {
        const names = res.cookies.map((c) => c.name).filter((n) => !/(lastvisit|lastactivity|sid|saltkey|seccode)/.test(n));
        console.log(`⏳ 等待登录中（${waited}s）... 当前 Cookie：${names.join(', ') || '(游客)'}`);
      }
      res = await checkLogin();
    }

    if (!res.ok) {
      const names = res.cookies.map((c) => c.name);
      console.error('\n❌ 10 分钟内未检测到登录态，未导出 Cookie。');
      console.error(`   当前 ${names.length} 条：${names.join(', ') || '(空)'}`);
      console.error('   请重跑 npm run get-cookie，并在窗口里完成登录（QQ 扫码后要点授权/确认）。');
      process.exitCode = 1;
      return;
    }

    const cookies = await page.cookies();
    const str = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    fs.writeFileSync(path.join(process.cwd(), 'znds_cookie.json'), JSON.stringify(cookies, null, 2), 'utf8');
    fs.writeFileSync(path.join(process.cwd(), 'cookie.txt'), str, 'utf8');
    console.log(`\n✅ 已登录（${cookies.length} 条 Cookie，含 auth），已写入 cookie.txt / znds_cookie.json`);
    console.log('把 cookie.txt 全部内容贴到 GitHub Secret：ZNDS_COOKIE');
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ============================== 入口 ============================== */

async function shutdown(signal) {
  if (state.shutdown) return;
  state.shutdown = true;
  console.log(`\n⚠ 收到 ${signal}，准备收尾...`);

  // GitHub 取消任务只给约 7 秒宽限，收尾必须限时，否则会被 SIGKILL 掉
  const hardExit = setTimeout(() => process.exit(0), 6000);

  try {
    if (isAlive(state.page)) await stopFishing(state.page, '退出前');
  } catch {}
  try {
    if (state.browser) await Promise.race([state.browser.close(), delay(3000)]);
  } catch {}

  clearTimeout(hardExit);
  console.log(`✅ 退出：完成 ${state.rounds} 轮，运行 ${elapsedMin()} 分钟`);
  writeSummary(['', '---', `**结束**：${signal} 触发，完成 ${state.rounds} 轮，运行 ${elapsedMin()} 分钟`, '']);
  process.exit(0);
}

(async () => {
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (hasFlag('export-cookie')) return exportCookie();

  console.log('🔥 ZNDS 启动：签到一次 → 摸鱼循环');
  const cookies = loadCookies(process.env.ZNDS_COOKIE);

  if (!hasFlag('moyu-only')) {
    try {
      await signinOnce(toCookieHeader(cookies));
    } catch (err) {
      console.error('❌ 签到失败：' + err.message);
      if (err.fatal) {
        console.error('⛔ Cookie 失效，结束运行');
        process.exit(1);
      }
    }
  }

  if (hasFlag('signin-only')) return;

  // 整个摸鱼循环崩掉就重建一次（最多 5 次），别因为一次网络超时浪费整轮 3 小时
  for (let attempt = 1; attempt <= 5 && !state.shutdown; attempt++) {
    try {
      const r = await moyuLoop(cookies);
      console.log(`✅ 摸鱼结束：${r.rounds} 轮 / ${r.minutes} 分钟`);
      return;
    } catch (err) {
      const msg = String(err.message).split('\n')[0];
      console.error(`❌ 摸鱼失败（第 ${attempt}/5 次）：${msg}`);

      try {
        if (state.browser) await Promise.race([state.browser.close(), delay(5000)]);
      } catch {}
      state.browser = null;
      state.page = null;

      if (/Cookie/i.test(msg) || attempt === 5) process.exit(1);
      console.log('ℹ 60 秒后重启摸鱼循环');
      await delay(60000);
    }
  }
})();
