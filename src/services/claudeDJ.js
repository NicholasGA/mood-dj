// 运行时可配置（打包分发后由用户在应用内填写）；.env 仅作开发默认值
export const splitKeys = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean)
let GEMINI_KEYS = splitKeys(import.meta.env.VITE_GEMINI_API_KEY)
let MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
let OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || ''
let OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'

// 应用启动时用持久化配置覆盖
export function configureLLM(cfg = {}) {
  if (cfg.geminiKey != null) GEMINI_KEYS = splitKeys(cfg.geminiKey)
  if (cfg.geminiModel) MODEL = cfg.geminiModel
  if (cfg.openrouterKey != null) OPENROUTER_KEY = cfg.openrouterKey.trim()
  if (cfg.openrouterModel) OPENROUTER_MODEL = cfg.openrouterModel
}
export function hasLLMKey() { return GEMINI_KEYS.length > 0 || !!OPENROUTER_KEY }

const KEY_COOLDOWN_MS = 90 * 1000   // 某 key 限流后冷却 90 秒再试（RPM 限流约 60s 恢复，别一次限流就半小时不可用）
const keyCooldown = new Map()            // key -> 冷却截止时间戳

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
export function localInterpret(text) {
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

// AI 音乐画像：读用户喜欢的歌 → 曲风/情绪/人格/探索方向
export async function analyzeTaste(tracks) {
  const list = (tracks || []).slice(-60).map(t => `${t.name} - ${t.artists?.map(a => a.name).join('/') || ''}`).join('\n')
  const system = `你是懂行、有洞察又温柔的乐评人。只输出JSON，不要解释。`
  const raw = await gemini(system, `
用户喜欢的歌：
${list}

分析他的音乐口味，返回JSON：
{
  "personality": "一句话音乐人格(≤28字，有洞察、有温度，像懂他的朋友)",
  "genres": ["主要曲风2-4个"],
  "moods": ["偏爱的情绪或场景2-4个"],
  "artists": ["最常出现的歌手2-4个"],
  "explore": "一句话建议接下来可以挖什么(≤24字)"
}`, { maxTokens: 500, temperature: 0.85 })
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('taste failed')
  const j = JSON.parse(m[0])
  return { personality: j.personality || '', genres: j.genres || [], moods: j.moods || [], artists: j.artists || [], explore: j.explore || '' }
}

// 自动 vibe 分组：把喜欢的歌按氛围聚成几组
export async function clusterLikes(tracks) {
  const pool = (tracks || []).slice(-50)
  if (pool.length < 4) return []
  const numbered = pool.map((t, i) => `${i + 1}. ${t.name} - ${t.artists?.map(a => a.name).join('/') || ''}`).join('\n')
  const system = `你是歌单编辑，擅长按氛围/场景把歌分组。只输出JSON，不要解释。`
  const raw = await gemini(system, `
歌曲：
${numbered}

按氛围/场景分成 3-5 组（如 深夜/通勤燃/治愈/派对/专注…），每组给名字、一个emoji、该组的编号。每首尽量只进最合适的一组。
返回JSON：{"groups":[{"name":"组名2-5字","emoji":"单emoji","idx":[编号,...]}]}`, { retries: 1, maxTokens: 800, temperature: 0.6 })
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('cluster failed')
  const j = JSON.parse(m[0])
  return (j.groups || []).map(g => ({
    name: g.name, emoji: g.emoji || '🎵',
    tracks: (g.idx || []).map(n => pool[n - 1]).filter(Boolean),
  })).filter(g => g.tracks.length)
}

// 单首歌一句话「故事」：结合歌词点出情绪/主题/创作背景。调用方按 mid 永久缓存复用 → 省配额
export async function generateStory(track, lyricSnippet = '', taste = {}) {
  const artist = track?.artists?.map(a => a.name).join('/') || '未知'
  const tasteHint = taste.likedArtists?.length && taste.likedArtists.includes(track?.artists?.[0]?.name)
    ? '（这是听众钟爱的歌手，可自然点一下）' : ''
  const lyricBlock = lyricSnippet ? `\n部分歌词：\n${lyricSnippet}` : '\n（暂无歌词，可讲风格/情绪）'
  const system = `你是博学、有洞察的音乐电台DJ。只输出一句话，不换行、不解释、不加引号。`
  const text = await gemini(system, `
歌曲：${track?.name} - ${artist}${tasteHint}${lyricBlock}

用一句话(≤30字)介绍这首歌：优先结合上面的歌词点出它的情绪/故事/主题；若你确知真实创作背景可讲；不确定就讲风格，别编造具体事实(假获奖/假年份)。口语、有DJ腔。`, { maxTokens: 200, temperature: 0.85 })
  const one = (text || '').split(/[\n。！!?？]/)[0].trim().replace(/^["“「]|["”」]$/g, '')
  return one.slice(0, 40)
}
