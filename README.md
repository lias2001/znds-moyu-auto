# ZNDS 签到 + 摸鱼（单文件 / 每 3 小时触发，单次不限时）

目标站点：<https://www.znds.com/qiandao.html>（实为 `plugin.php?id=muanyun_053`）

**全部逻辑在 `znds.js` 一个文件里**：启动时签到一次 → 之后无限循环摸鱼，脚本本身不设时长上限；跑到下一次定时触发时被新一轮替换（旧进程收到 SIGTERM，先点【停止】再退出）。

## 一、导出 Cookie（只做一次，失效时重做）

```bash
npm install
npm run get-cookie
```

浏览器自动打开签到页 → 你在窗口里登录（QQ 或账号密码）→ **检测到 `_auth` cookie 后自动导出并关窗**：

- `cookie.txt`：一行 Cookie 字符串（**贴到 Secret 用这个**）
- `znds_cookie.json`：JSON 备用（脚本同样兼容）

> 本机有 Chrome 或 Edge 就行，**不需要下载 Chromium**。想省掉依赖里的 Chromium 下载：`PUPPETEER_SKIP_DOWNLOAD=1 npm install`。

## 二、配置 GitHub

1. 新建仓库，推上本目录（`.github/workflows/znds.yml` 位置不能变）。
2. **Settings → Secrets and variables → Actions → New repository secret**
   - Name：`ZNDS_COOKIE`，Secret：`cookie.txt` 全部内容
3. **Actions** → `ZNDS 签到摸鱼` → **Run workflow** 手动跑一次。

## 三、运行节奏

- **每 3 小时触发一次**（北京时间 00:20 / 03:20 / 06:20 / 09:20 / 12:20 / 15:20 / 18:20 / 21:20）
- **每次不限时**，一直循环摸鱼，直到下一次触发把它替换掉
- 被替换时收到 SIGTERM → 点【停止】→ 关浏览器 → 退出（`concurrency.cancel-in-progress: true`）

单次运行内：

| 阶段 | 行为 |
| --- | --- |
| 启动 | 拉一次页面 → POST 签到 → 打印累计/连续天数 |
| 之后 | 每 30 秒刷新读计时器；满 9 分钟点【停止】→ 立刻【开始摸鱼】→ 继续累计 |
| 被替换 | 点【停止】收尾退出；万一没停掉，下一轮启动时发现计时已超阈值会自动停止并重开 |

一天 8 次触发 ≈ 全天候在摸鱼。每次都执行签到，站点已签到时只会返回「今日已签到」，无副作用。

> 免费版 cron 有 5～30 分钟随机延迟；仓库连续 60 天无提交会**自动停用** schedule，需手动 Enable。

## 四、命令行

```bash
node znds.js                  # 签到一次 + 摸鱼循环（默认，跑到被杀）
node znds.js --minutes=30     # 只跑 30 分钟后收尾，便于验证
node znds.js --signin-only    # 只签到
node znds.js --moyu-only      # 跳过签到，直接摸鱼
node znds.js --export-cookie  # 本地导出 Cookie
```

## 五、参数

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ZNDS_COOKIE` | — | 必填，字符串或 JSON 数组 |
| `STOP_AT_MINUTES` | 9 | 计时满几分点停止（站点单轮上限约 10 分钟，别设 ≥10） |
| `POLL_MS` | 30000 | 计时器轮询/刷新间隔 |
| `MOYU_URL` | 站点地址 | 调试用，指向本地 mock 页面 |
| `PUPPETEER_EXECUTABLE_PATH` | 自动探测 | 指定浏览器路径 |

## 六、成本提醒（重要）

私有仓库的 Actions 免费额度是 **2000 分钟/月**，而这个任务 24 小时/天连续运行，一个月约 43200 分钟 → **会超额计费或直接跑不起来**。

选一个：

- **仓库设为 public**（标准 runner 免费不限时长，推荐）
- 或用 self-hosted runner
- 或把 `timeout-minutes` 调小（如 120），接受摸鱼时长打折

## 七、常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Could not find Chrome` | Chromium 没下完（国内常见） | 已优先用系统 Chrome/Edge；仍报错就装 Chrome 或设 `PUPPETEER_EXECUTABLE_PATH` |
| `Cookie 无效或已过期` | Discuz 登录态过期，或导出时没真正登录 | 重跑 `npm run get-cookie`，等窗口自己关掉才算成功 |
| 日志一直 `计时 ? 分` | 页面改版或未登录 | 用 `--minutes=3` 本地跑，看打印的计时元素文本 |
| 摸鱼时长不累计 | 停止/重开没点成功 | 看是否有 `完成第 N 轮`；没有则把 `STOP_AT_MINUTES` 调成 8 |
| 请求 403 / 反复跳登录 | 机房 IP 被风控 | 换 self-hosted runner |

## 八、目录

```
znds.js               # 全部逻辑：Cookie 解析 / 签到 / 摸鱼循环 / 导出 Cookie
.github/workflows/znds.yml
package.json
```
