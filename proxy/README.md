# Mood DJ 内置 AI 代理（让 app 零配置开箱即用）

把你的 Gemini key 放在这个 Cloudflare Worker 里（服务端），打包 app 时把 Worker 地址注入进去。
这样**用户首次启动只需登 QQ，AI 直接可用**，不用自己申请、粘贴 key——这是降低流失最关键的一步。

用户仍可在设置里填自己的 key，那样就走他自己的额度、绕过这个共享代理。
代理对每个 IP 每天限流（默认 80 次，见 `worker.js` 的 `DAILY_CAP`），超额时 app 自动降级到本地兜底。

## 部署（一次性，约 5 分钟）

> 需要一个 Cloudflare 账号（免费）。Worker 免费额度每天 10 万次请求，对这个量级绰绰有余。

```powershell
cd proxy

# 1) 登录 Cloudflare（浏览器授权）
npx wrangler login

# 2) 建限流计数用的 KV 命名空间，把输出的 id 填进 wrangler.toml 的 id 字段
npx wrangler kv namespace create RL

# 3) 写入你的 Gemini key（多个逗号分隔，抗限流）。粘贴后回车，终端不回显
npx wrangler secret put GEMINI_KEYS

# 4) 部署，记下输出的地址，形如 https://mooddj-llm-proxy.<你的子域>.workers.dev
npx wrangler deploy
```

## 把地址接进 app

在项目根的 `.env` 里加（打包时由 Vite 注入到客户端）：

```
VITE_LLM_PROXY_URL=https://mooddj-llm-proxy.<你的子域>.workers.dev
```

然后正常发版（`npm run build` → electron-builder）。装好的 app 首启即内置 AI。

## 自测

```powershell
curl -X POST https://mooddj-llm-proxy.<你的子域>.workers.dev `
  -H "Content-Type: application/json" `
  -d '{\"system\":\"只回一个字\",\"user\":\"你好\",\"maxTokens\":20}'
# 期望返回 {"text":"..."}；连发 80+ 次后应返回 {"error":"rate-limited"} 429
```

## 注意

- Worker 地址是公开的（不是秘密），但**真正的 key 只存在 Worker 环境变量里**，客户端拿不到。
- 共享额度有限：用的人多了 Gemini 免费层会先到顶，这时大家自动落到本地兜底（仍能用，只是不那么"聪明"）。重度用户引导他们填自己的 key。
- 想换更高额度：在 `GEMINI_KEYS` 里多放几个 key，或改 `worker.js` 里的 `MODEL`/`DAILY_CAP`。
