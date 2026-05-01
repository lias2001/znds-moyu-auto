const https = require('https');
const { URL } = require('url');

const CONFIG = {
  url: "https://www.znds.com/plugin.php?id=muanyun_053",
};

const COOKIE = process.env.ZNDS_COOKIE || '';

if (!COOKIE) {
  console.error("❌ 未配置 ZNDS_COOKIE");
  process.exit(1);
}

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

async function run() {
  try {
    console.log("🚀 执行一轮摸鱼");

    // 开始
    await fetch(CONFIG.url + "&action=start");
    console.log("✅ 开始摸鱼");

    // 停止
    await fetch(CONFIG.url + "&action=stop");
    console.log("✅ 停止摸鱼");

    console.log("🎉 一轮完成，等待9分钟后自动继续\n");
  } catch (e) {
    console.error("❌ 异常：", e.message);
  }
}

run();
