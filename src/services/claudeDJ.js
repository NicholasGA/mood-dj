// 多 key 轮换：VITE_GEMINI_API_KEY 支持逗号分隔多个 key（各自独立配额）
const GEMINI_KEYS = (import.meta.env.VITE_GEMINI_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean)
// gemini-2.5-flash 免费层仅 20 次/天；2.5-flash-lite 免费日配额高得多且够用
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
// 可选备用 Provider：OpenRouter（OpenAI 兼容，有免费模型）。所有 Gemini key 都限流后兜底
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'

const KEY_COOLDOWN_MS = 30 * 60 * 1000   // 某 key 限流后冷却 30 分钟再试
const keyCooldown = new Map()            // key -> 冷却截止时间戳

let _lastCallTime = 0
const ANNOUNCE_COOLDOWN = 25000 // ms between announcement calls

async function fetchJSON(url, opts, ms = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(timer) }
}

async function callGemini(key, system, userMsg, maxTokens, temperature) {
  const res = await fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  if (res.status === 429) { const e = new Error('429'); e.rateLimited = true; throw e }
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const data = await res.json()
  return (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text).join('').trim()
}

async function callOpenRouter(system, userMsg, maxTokens, temperature) {
  const res = await fetchJSON('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
    body: JSON.stringify({ model: OPENROUTER_MODEL, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }] }),
  })
  if (!res.ok) throw new Error(`openrouter ${res.status}`)
  const data = await res.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

// 统一 LLM 入口：依次试每个未冷却的 Gemini key，限流则冷却该 key 换下一个；全挂则用 OpenRouter
async function gemini(system, userMsg, { maxTokens = 600, temperature = 0.9 } = {}) {
  const now = Date.now()
  let sawRateLimit = false
  for (const key of GEMINI_KEYS) {
    if ((keyCooldown.get(key) || 0) > now) { sawRateLimit = true; continue }
    try {
      return await callGemini(key, system, userMsg, maxTokens, temperature)
    } catch (e) {
      if (e.rateLimited) { keyCooldown.set(key, Date.now() + KEY_COOLDOWN_MS); sawRateLimit = true }
      // 其它错误（网络/超时）：继续试下一个 key
    }
  }
  if (OPENROUTER_KEY) {
    try { return await callOpenRouter(system, userMsg, maxTokens, temperature) } catch {}
  }
  throw new Error(sawRateLimit ? 'all keys rate-limited' : 'llm failed')
}

export async function analyzeMood(text, energy, valence, platform = 'qq') {
  const isQQ = platform === 'qq'
  const lang = isQQ ? '中文（QQ音乐里真实会搜的关键词）' : '英文'
  const system = `你是资深音乐编辑和情绪分析师，懂各种曲风/年代/场景。只输出JSON，不要任何其他文字。`

  const raw = await gemini(system, `
用户心情描述: "${text}"
能量值 ${energy}（0=慵懒放松/慢节奏，1=亢奋燃/快节奏强鼓点）
情绪值 ${valence}（0=低落伤感/小调，1=明亮快乐/大调）

请据此生成 5 个${lang}音乐搜索词，要求：
- 5 个词覆盖不同角度（曲风、场景、节奏、年代或语种、代表性关键词），彼此区分度高，避免雷同和泛词。
- 必须体现能量与情绪：高能量→快节奏/电子/摇滚/燃；低能量→慢歌/民谣/钢琴/氛围；高情绪→欢快/阳光/甜；低情绪→伤感/治愈/深夜。
- **兼顾多语种**：在贴合心情、且用户没有明确限定语种的前提下，让 5 个词跨语种——至少包含 1 个日系/J-POP（如"日系 治愈"/"J-POP 抒情"/"日语 城市流行"/"动漫 燃"），并可含欧美、韩系，别全是华语。
- 每个词 2-6 字/词，像真实搜索关键词，不要整句。

返回JSON:
{
  "mood_name": "中文心情名称(4-6字，要贴切独特)",
  "search_queries": ["词1","词2","词3","词4","词5"],
  "color_primary": "#十六进制(贴合情绪：暖色=积极/亮色=高能/冷暗色=低落)",
  "color_secondary": "#十六进制(与主色协调)",
  "mood_emoji": "单个emoji",
  "dj_intro": "一句话DJ开场白，必须≤25个汉字，热情有个性，呼应该心情（务必简短，只一句）"
}`, { maxTokens: 700 })

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Mood analysis failed')
  const cfg = JSON.parse(match[0])
  // flash-lite 有时不守长度，兜底截到第一句、最多30字
  if (cfg.dj_intro && cfg.dj_intro.length > 30) {
    cfg.dj_intro = cfg.dj_intro.split(/[。！!?？\n]/)[0].slice(0, 30)
  }
  return cfg
}

// 本地意图解析（不依赖 AI，Gemini 挂了/限流也能用）：剥掉指令词，拆出歌手与心情
function localInterpret(text) {
  let s = (text || '').trim()
  s = s.replace(/^(请|帮我|给我|我想听|我要听|我想|我要|想听|来听|放点|来点|听点|放首|来首|来个|换成|换点|整点|放|听|想|要)+/g, '')
  s = s.replace(/(的歌曲?|的音乐|的曲子?|的|吧|嘛|啊|呗|哦|喔|呀)+$/g, '').trim()
  // 拆 "歌手 + 但/还要/要 + 心情"
  let artist = s, mood = ''
  const conj = s.match(/^(.+?)(但是?|不过|还要|要|换成)\s*(.+)$/)
  if (conj) { artist = conj[1].trim(); mood = conj[3] }
  artist = artist.replace(/(的|点)+$/g, '').trim()
  mood = (mood || '').replace(/(的|点)+$/g, '').trim()
  const artists = (artist && artist.length <= 10 && !/[，,\s]/.test(artist)) ? [artist] : []
  const keywords = (mood ? [mood] : (artist ? [artist] : [text])).filter(Boolean)
  return { artists, keywords, mood_name: (artist || text).slice(0, 6), dj_intro: '好嘞，换个味道~' }
}

// 解析对话点歌请求 → 歌手 / 关键词 / 心情（AI 优先，失败回退本地解析）
export async function interpretRequest(text) {
  try {
    const system = `你解析用户的点歌/换歌请求，只输出JSON，不要解释。`
    const raw = await gemini(system, `
用户说："${text}"
解析其意图，返回JSON：
{
  "artists": ["用户点名的歌手原名(没有就空数组)"],
  "keywords": ["描述曲风/心情/语种/场景的中文搜索词，2-4个，始终给(贴合请求)"],
  "mood_name": "4-6字概括",
  "dj_intro": "≤25字DJ口吻回应，呼应这句话"
}`, { maxTokens: 400, temperature: 0.6 })
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no json')
    const j = JSON.parse(m[0])
    const local = localInterpret(text)
    return {
      artists: Array.isArray(j.artists) && j.artists.length ? j.artists.filter(Boolean) : local.artists,
      keywords: Array.isArray(j.keywords) && j.keywords.length ? j.keywords.filter(Boolean) : local.keywords,
      mood_name: j.mood_name || local.mood_name,
      dj_intro: j.dj_intro || local.dj_intro,
    }
  } catch {
    return localInterpret(text)   // 限流/失败 → 本地解析，照样能识别歌手
  }
}

// AI 精排：从候选池里按心情/能量/情绪挑选并排序，剔除不搭的歌；favArtists 偏向用户口味
export async function curateTracks(tracks, moodConfig, energy, valence, favArtists = []) {
  const pool = tracks.slice(0, 45)
  if (pool.length < 6) return tracks  // 池子太小没必要精排
  const numbered = pool
    .map((t, i) => `${i + 1}. ${t.name} - ${t.artists?.map(a => a.name).join('/') || '未知'}`)
    .join('\n')
  const tasteLine = favArtists.length
    ? `\n用户偏爱的歌手/风格：${favArtists.slice(0, 10).join('、')}。在贴合心情的前提下，优先挑选这些歌手或风格相近的歌。`
    : ''
  const system = `你是资深电台选歌人，擅长按心情和听众口味精准排歌单。只输出JSON，不要解释。`
  const raw = await gemini(system, `
听众心情：${moodConfig?.mood_name || '未知'}
能量值 ${energy}（0放松-1亢奋）　情绪值 ${valence}（0低落-1愉悦）${tasteLine}

候选歌曲（编号. 歌名 - 歌手）：
${numbered}

任务：挑出最贴合该心情/能量/情绪、并尽量符合用户口味的歌，剔除明显不搭的（如低落心情里的蹦迪神曲、放松心情里的硬核摇滚），按适合电台连续收听的流畅顺序排列，尽量 15-25 首。
返回JSON：{"order":[编号,编号,...]}`, { retries: 1, maxTokens: 900, temperature: 0.7 })

  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('curate failed')
  const order = JSON.parse(m[0]).order
  if (!Array.isArray(order) || order.length < 5) throw new Error('curate too few')

  const picked = [], seen = new Set()
  for (const n of order) {
    const t = pool[n - 1]
    if (t?.mid && !seen.has(t.mid)) { seen.add(t.mid); picked.push(t) }
  }
  if (picked.length < 5) throw new Error('curate invalid')
  // 没被选中的接在后面，保证队列不至于太短
  const rest = tracks.filter(t => t?.mid && !seen.has(t.mid))
  return [...picked, ...rest]
}

export async function generateAnnouncement(prevTrack, nextTrack, moodName) {
  const now = Date.now()
  if (now - _lastCallTime < ANNOUNCE_COOLDOWN) return ''
  _lastCallTime = now
  const system = `你是个性鲜明的AI DJ，幽默热情有品味。中文，简洁有力，像真正的DJ说话。只输出一句播报文字，不要换行。`
  const text = await gemini(system, `
刚播: ${prevTrack ? `"${prevTrack.name}" - ${prevTrack.artists?.[0]?.name}` : '暂无'}
接下来: "${nextTrack.name}" - ${nextTrack.artists?.[0]?.name}
听众心情: ${moodName}
生成15-25字DJ过渡播报，必须简短（≤30字，只一句），有腔调。`, { maxTokens: 200 })
  // 兜底：太长就截到第一句
  return text.length > 36 ? text.split(/[。！!?？\n]/)[0].slice(0, 36) : text
}
