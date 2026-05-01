// 纯原生请求，无任何依赖，不装浏览器，超快！
const https = require('https');
const { URL } = require('url');

// 配置
const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
  MOYU_TIME: 9 * 60 * 1000, // 9分钟
};

// 从环境变量读取Cookie
const COOKIE = process.env.ZNDS_COOKIE || '';

if (!COOKIE) {
  console.error("❌ 未配置 ZNDS_COOKIE，无法运行");
  process.exit(1);
}

// 通用请求函数
function fetch(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'Cookie': COOKIE,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.znds.com/',
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.end();
  });
}

// 执行一轮：开始 → 等待9分钟 → 停止
async function run() {
  console.log("🚀 开始摸鱼（纯接口版）");

  try {
    // 1. 打开页面（获取状态）
    await fetch(CONFIG.url);

    // 2. 开始摸鱼
    await fetch(CONFIG.url + "&action=start");
    console.log("✅ 已点击：开始摸鱼");

    // 3. 等待 9 分钟
    console.log("⏳ 等待 9 分钟...");
    await new Promise(r => setTimeout(r, CONFIG.MOYU_TIME));

    // 4. 停止摸鱼
    await fetch(CONFIG.url + "&action=stop");
    console.log("✅ 已点击：停止摸鱼");

    console.log("🎉 一轮摸鱼完成！");
  } catch (e) {
    console.error("❌ 执行失败：", e.message);
  }
}

run();
