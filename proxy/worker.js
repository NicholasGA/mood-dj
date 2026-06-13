// Mood DJ 零配置 LLM 代理（Cloudflare Worker）
// ─────────────────────────────────────────────────────────────────────────
// 作用：让 app 开箱即用——key 存在这里（Worker 环境变量），客户端不持任何 key。
// 安全：按来源 IP 每日限流（KV）、固定模型、限制 maxTokens、只接受 POST。
// 部署见同目录 README.md。
//
// 需要的绑定：
//   - secret GEMINI_KEYS：你的 Gemini key，多个用逗号分隔（轮换 + 抗限流）
//   - KV namespace RL：每 IP 每日计数（见 wrangler.toml）

const MODEL = 'gemini-2.5-flash-lite'   // 与客户端默认一致；免费层够用
const DAILY_CAP = 80                    // 每 IP 每日调用上限（超额客户端自动降级本地兜底）
const MAX_TOKENS = 1000                 // 服务端硬上限，防滥用

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

    // 限流：来源 IP + 日期 计数（KV，48h 过期自动清）
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown'
    const day = new Date().toISOString().slice(0, 10)
    const rlKey = `rl:${ip}:${day}`
    let used = 0
    if (env.RL) {
      used = Number(await env.RL.get(rlKey)) || 0
      if (used >= DAILY_CAP) return json({ error: 'rate-limited', cap: DAILY_CAP }, 429)
    }

    let body
    try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    const system = String(body.system || '').slice(0, 4000)
    const user = String(body.user || '').slice(0, 8000)
    const maxTokens = Math.min(MAX_TOKENS, Math.max(1, Number(body.maxTokens) || 600))
    const temperature = Math.max(0, Math.min(2, body.temperature == null ? 0.9 : Number(body.temperature)))
    if (!user) return json({ error: 'empty user' }, 400)

    const keys = (env.GEMINI_KEYS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!keys.length) return json({ error: 'server misconfigured: no GEMINI_KEYS' }, 500)

    let lastErr = 'all upstream failed'
    for (const key of keys) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
          }),
        })
        if (r.status === 429) { lastErr = 'upstream 429'; continue }   // 该 key 限流，换下一个
        if (!r.ok) { lastErr = `upstream ${r.status}`; continue }
        const data = await r.json()
        const text = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text).join('').trim()
        if (!text) { lastErr = 'upstream empty'; continue }
        if (env.RL) await env.RL.put(rlKey, String(used + 1), { expirationTtl: 172800 })   // 仅成功才计数
        return json({ text })
      } catch (e) { lastErr = String(e && e.message || e).slice(0, 120) }
    }
    return json({ error: lastErr }, 502)
  },
}
