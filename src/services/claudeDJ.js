import { personaSystemPrefix, localPersona } from './djPersona.js'

// 运行时可配置（打包分发后由用户在应用内填写）；.env 仅作开发默认值
export const splitKeys = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean)

// 固定 DJ 人格（护城河）：生成一次后由 App 持久化并在启动时 configurePersona 回填。
// 注入到所有 DJ 口吻 prompt 的 system 前缀里，使开场/串场/故事都出自同一个人。
let PERSONA = null
export function configurePersona(p) { if (p?.name) PERSONA = p }
export function getPersona() { return PERSONA }
const withPersona = (system) => { const pre = personaSystemPrefix(PERSONA); return pre ? `${pre}\n${system}` : system }
let GEMINI_KEYS = splitKeys(import.meta.env.VITE_GEMINI_API_KEY)
let MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
let OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || ''
// 默认用中文母语的免费模型（GLM-Air：轻量低延迟）；:free 会轮换下架，故带一串中文系兜底逐个试
let OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'z-ai/glm-4.5-air:free'
const OPENROUTER_FALLBACKS = ['z-ai/glm-4.5-air:free', 'qwen/qwen3-next-80b-a3b-instruct:free', 'moonshotai/kimi-k2.6:free']

// 应用启动时用持久化配置覆盖
export function configureLLM(cfg = {}) {
  if (cfg.geminiKey != null) GEMINI_KEYS = splitKeys(cfg.geminiKey)
  if (cfg.geminiModel) MODEL = cfg.geminiModel
  if (cfg.openrouterKey != null) OPENROUTER_KEY = cfg.openrouterKey.trim()
  if (cfg.openrouterModel) OPENROUTER_MODEL = cfg.openrouterModel
  if (cfg.dailyLimit) DAILY_LIMIT = Number(cfg.dailyLimit) || DAILY_LIMIT
}
export function hasLLMKey() { return GEMINI_KEYS.length > 0 || !!OPENROUTER_KEY }

// ── 每日 LLM 调用预算（省配额：让免费额度撑一天）────────────────────────────
// 客户端按本地日期计数，超额就让调用方走本地兜底（而不是把真实配额耗尽/到处报错）。
// 故事类调用占量最大，预留最后 35% 给核心调用（心情分析/选歌），故事先让路。
const DAILY_LIMIT_DEFAULT = 200
let DAILY_LIMIT = DAILY_LIMIT_DEFAULT
const BUDGET_KEY = 'mooddj-llm-budget'

function ymd(now) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// 纯函数（可单测）：据已存计数 + 当前时间，算出今日计数与是否该拦核心/故事
export function evalBudget(stored, now = Date.now(), dailyLimit = DAILY_LIMIT) {
  const date = ymd(now)
  const count = (stored && stored.date === date) ? (stored.count || 0) : 0
  const storyCutoff = Math.max(1, Math.floor(dailyLimit * 0.65))
  return { date, count, dailyLimit, blockCore: count >= dailyLimit, blockStory: count >= storyCutoff }
}
function loadBudget() { try { return JSON.parse(localStorage.getItem(BUDGET_KEY) || 'null') } catch { return null } }
function bumpBudget(date) {
  try {
    const raw = loadBudget()
    const count = (raw && raw.date === date) ? (raw.count || 0) : 0
    localStorage.setItem(BUDGET_KEY, JSON.stringify({ date, count: count + 1 }))
  } catch { /* 无 localStorage（如测试环境）→ 不计数 */ }
}
export function llmBudget() { return evalBudget(loadBudget()) }   // 供 UI 显示今日用量

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
  // 依次试 默认模型 + 中文系兜底（某个被下架/限流就换下一个）
  const models = [OPENROUTER_MODEL, ...OPENROUTER_FALLBACKS].filter((m, i, a) => a.indexOf(m) === i)
  let lastErr
  for (const model of models) {
    try {
      const res = await fetchJSON('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer': 'https://github.com/NicholasGA/mood-dj', 'X-Title': 'Mood DJ',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }] }),
      })
      if (!res.ok) { lastErr = new Error(`openrouter ${res.status}`); continue }
      const text = ((await res.json()).choices?.[0]?.message?.content || '').trim()
      if (text) return text
      lastErr = new Error('openrouter empty')
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('openrouter failed')
}

// 统一 LLM 入口：先看每日预算（超额→抛 budget 让调用方走本地兜底），
// 再依次试每个未冷却的 Gemini key，限流则冷却换下一个；全挂则用 OpenRouter。
async function gemini(system, userMsg, { maxTokens = 600, temperature = 0.9, kind = 'core' } = {}) {
  const now = Date.now()
  // 「歌曲介绍」优先走 OpenRouter（免费、额度大）：彻底不动 Gemini 的小配额，把它全留给核心(心情分析/选歌)。
  // OpenRouter 没配 key 或挂了，才退回 Gemini 走下面的流程。
  if (kind === 'story' && OPENROUTER_KEY) {
    try { return await callOpenRouter(system, userMsg, maxTokens, temperature) } catch {}
  }
  const budget = evalBudget(loadBudget(), now)
  if (budget.blockCore || (kind === 'story' && budget.blockStory)) {
    const e = new Error('budget'); e.budgetExhausted = true; throw e
  }
  let sawRateLimit = false
  for (const key of GEMINI_KEYS) {
    if ((keyCooldown.get(key) || 0) > now) { sawRateLimit = true; continue }
    try {
      const out = await callGemini(key, system, userMsg, maxTokens, temperature)
      bumpBudget(budget.date)   // 仅在 Gemini 真正成功时计数（OpenRouter 不占 Gemini 额度）
      return out
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
  const system = withPersona(`你是资深音乐编辑和情绪分析师，懂各种曲风/年代/场景。只输出JSON，不要任何其他文字。其中 dj_intro 要用你这个 DJ 一贯的口吻。`)

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
  // 校验模型给的颜色：非法值(如 "red"/"#ff")会一路流进 canvas 的 parseInt→NaN→抛错，统一兜底
  cfg.color_primary = sanitizeHex(cfg.color_primary, '#31c27c')
  cfg.color_secondary = sanitizeHex(cfg.color_secondary, '#1db954')
  return cfg
}

// 把任意值规整成合法 #rrggbb；非法就返回兜底色。纯函数，供 analyzeMood 与单测用。
export function sanitizeHex(hex, fallback = '#31c27c') {
  if (typeof hex !== 'string') return fallback
  let m = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(m)) m = m.split('').map(c => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(m) ? `#${m.toLowerCase()}` : fallback
}

// 本地意图解析（不依赖 AI）：识别意图 mode（探索/收藏/普通）+ 剥指令/意图词 + 拆歌手与心情
export function localInterpret(text) {
  const raw = (text || '').trim()
  // 否定式（没有/没怎么/没咋/没太听过、没有收藏）必须进 discover——否则"听过的"会被下面 favorite 误抓成反向意图。
  // "没.{0,2}听过"覆盖口语变体；"过"不可省（裸"没听"单列）：否则"有没有听起来温柔的歌"会被误判成探索
  const discover = /没.{0,2}听过|沒.{0,2}聽過|没听|沒聽|从未听|從未聽|新鲜|新鮮|探索|发现|發現|冷门|冷門|小众|小衆|没有?收藏|沒有?收藏|未收藏|宝藏|寶藏|换换口味|不一样|不一樣|陌生|生面孔|新歌手/.test(raw)
  const favorite = !discover && /(我|自己)的?(收藏|喜欢|喜歡|爱听|愛聽)|收藏(里|裡|夹|夾)|我的歌单|(?<!没有?|沒有?|未|不)(听过|聽過)的/.test(raw)
  // 剥掉 meta 意图词，避免被当成关键词/歌手去搜（"我没听过"绝不该进搜索）
  const stripMeta = (x) => (x || '').replace(/(我|自己|一些|一点|点儿?|些|首|那种|那些|这种|没.{0,2}听过的?|沒.{0,2}聽過的?|没听|沒聽|新鲜的?|新鮮的?|探索|发现|發現|冷门的?|冷門的?|小众的?|小衆的?|宝藏|寶藏|换换口味|不一样的?|不一樣的?|陌生的?|随便|隨便|没有?收藏过?的?|沒有?收藏过?的?|收藏(里|裡)?的?|喜欢的?|喜歡的?|爱听的?|愛聽的?|听过的?|聽過的?)/g, '').trim()
  let s = raw
    .replace(/^(请|帮我|给我|我想听|我要听|我想|我要|想听|来听|放点|来点|听点|放首|来首|来个|换成|换点|整点|一下|放|听|想|要)+/g, '')
    .replace(/(的歌曲?|的音乐|的曲子?|的|吧|嘛|啊|呗|哦|喔|呀)+$/g, '').trim()
  let artist = s, mood = ''
  const conj = s.match(/^(.+?)(但是?|不过|还要|要|换成)\s*(.+)$/)
  if (conj) { artist = conj[1].trim(); mood = conj[3] }
  artist = stripMeta(artist.replace(/(的|点)+$/g, '').trim())
  mood = stripMeta((mood || '').replace(/(的|点)+$/g, '').trim())
  // 纯拉丁名允许空格且放宽长度（Taylor Swift / chilichill）；中文名维持"短且无分隔"启发式
  const latin = /^[A-Za-z0-9 .&'-]+$/.test(artist)
  const artists = (artist && (latin ? artist.length <= 20 : (artist.length <= 10 && !/[，,\s]/.test(artist)))) ? [artist] : []
  let keywords = (mood ? [mood] : (artist ? [artist] : [])).filter(Boolean)
  if (!keywords.length) keywords = discover ? ['小众 华语', '宝藏 冷门', '好听 新发现'] : (favorite || !raw) ? [] : [raw]
  const mode = discover ? 'discover' : favorite ? 'favorite' : 'normal'
  const dj_intro = discover ? '行，挖几首你没听过的~' : favorite ? '回你的收藏里转转~' : '好嘞，换个味道~'
  return { mode, artists, keywords, mood_name: (artist || mood || (discover ? '探索新歌' : favorite ? '我的收藏' : raw)).slice(0, 6) || '点歌', dj_intro }
}

// 解析对话点歌请求 → 意图 mode / 歌手 / 关键词 / 心情（AI 优先，失败回退本地解析）。
// taste: { genres, artists } 给 AI 当探索方向的参考。
export async function interpretRequest(text, taste = {}) {
  const tasteHint = (taste.genres?.length || taste.artists?.length)
    ? `\n听众口味：曲风[${(taste.genres || []).slice(0, 4).join('、')}] 常听[${(taste.artists || []).slice(0, 5).join('、')}]。探索意图时据此延伸到相邻但新鲜的方向。` : ''
  try {
    const system = withPersona(`你解析用户的点歌/换歌请求，只输出JSON，不要解释。dj_intro 用你这个 DJ 一贯的口吻回应。`)
    const raw = await gemini(system, `
用户说："${text}"${tasteHint}
解析意图，返回JSON：
{
  "mode": "discover | favorite | normal",
  "artists": ["点名的歌手"],
  "keywords": ["搜索词，0-3个"],
  "mood_name": "4-6字概括",
  "dj_intro": "≤25字DJ口吻回应，呼应这句话"
}
判定规则：
- mode：想听没听过/没收藏过/新鲜/冷门/陌生的→discover；想听自己收藏/喜欢过/常听的→favorite；其余→normal。注意否定词："没收藏过的""没有听过的"是 discover 不是 favorite。
- artists：「想听X的歌/来点X/放X」里的 X 像名字（含英文、拼音、生造词）就填进 artists——小众歌手你多半不认识，宁可当歌手名也别猜成曲风或心情；认识的写官方原名。
- keywords：能在音乐App搜出歌的曲风/场景/语种词。绝不要把"没听过/探索/随便/收藏"这类意图词当关键词，也别重复 artists 里的名字。只点名歌手、没提其它要求时给空数组。
示例：
"我想听chilichill的歌"→{"mode":"normal","artists":["chilichill"],"keywords":[]}
"来点周杰伦 安静一点的"→{"mode":"normal","artists":["周杰伦"],"keywords":["安静","钢琴"]}
"想听没收藏过的歌"→{"mode":"discover","artists":[],"keywords":["小众宝藏","冷门佳作"]}
"放我收藏里的歌"→{"mode":"favorite","artists":[],"keywords":[]}`, { maxTokens: 440, temperature: 0.6 })
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no json')
    const j = JSON.parse(m[0])
    const local = localInterpret(text)
    // 先洗再判空：模型偶发 [""]/[null] 会让 length 判断误以为"有结果"而绕过本地兜底
    const aiArtists = (Array.isArray(j.artists) ? j.artists : []).map(x => String(x || '').trim()).filter(Boolean)
    const aiKeywords = (Array.isArray(j.keywords) ? j.keywords : []).map(x => String(x || '').trim()).filter(Boolean)
    return {
      mode: ['discover', 'favorite', 'normal'].includes(j.mode) ? j.mode : local.mode,
      artists: aiArtists.length ? aiArtists : local.artists,
      // AI 点名了歌手且没给词 → 尊重"只点歌手"的空数组；AI 全空才回退本地
      keywords: aiKeywords.length ? aiKeywords : (aiArtists.length ? [] : local.keywords),
      mood_name: j.mood_name || local.mood_name,
      dj_intro: j.dj_intro || local.dj_intro,
    }
  } catch {
    return localInterpret(text)   // 限流/失败 → 本地解析，照样能识别意图与歌手
  }
}

// AI 选歌（核心升级）：让 LLM 当资深歌单编辑/乐评人，按需求+心情+口味推荐"具体的歌"。
// LLM 学过海量乐评/歌单/推荐，相当于把"别人推荐的歌单"内化了——比关键词搜出来的泛泛热门精准。
// 返回 [{name, artist}]，调用方再去 QQ 把这些歌解析成可播曲目。
export async function recommendSongs(request, taste = {}, opts = {}) {
  const n = opts.n || 14
  const tasteLine = (taste.genres?.length || taste.artists?.length)
    ? `听众口味：曲风[${(taste.genres || []).slice(0, 5).join('、')}] 常听[${(taste.artists || []).slice(0, 8).join('、')}]。推荐时贴合但不要全是这些歌手本人。\n` : ''
  // 探索模式带上"已听清单"：LLM 不知道用户听过什么，不喂这个它推的"冷门"还是会撞上熟歌
  const avoidLine = opts.avoid?.length
    ? `他最近已经听过这些，绝不要再推荐：${opts.avoid.slice(0, 30).join('；')}\n` : ''
  const discoverLine = opts.discover
    ? `重点挑听众多半没听过的冷门宝藏/小众佳作，避开大热口水歌${taste.artists?.length ? '，也避开他常听歌手本人的歌（找同气质的新面孔）' : ''}。` : ''
  const system = withPersona(`你是资深歌单编辑/乐评人，熟悉各国曲风、年代、冷门宝藏。只输出JSON数组，不要任何解释。`)
  const raw = await gemini(system, `
需求/心情："${request}"
${tasteLine}${avoidLine}像优质歌单/乐评人那样，推荐 ${n} 首真实存在、契合上面需求与口味的具体歌曲——注重品味与契合度，宁缺毋滥，可跨语种、有层次。${discoverLine}
只返回JSON数组：[{"name":"准确歌名","artist":"主要歌手"}, …]`, { maxTokens: 800, temperature: 0.9 })
  const m = raw.match(/\[[\s\S]*\]/)
  if (!m) throw new Error('recommend failed')
  const arr = JSON.parse(m[0])
  return arr.filter(x => x?.name).map(x => ({ name: String(x.name).trim(), artist: String(x.artist || '').trim() })).slice(0, n)
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
返回JSON：{"order":[编号,编号,...]}`, { maxTokens: 900, temperature: 0.7 })

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

// 专属 DJ 人格：据口味生成一位有名字/调性/口头禅的固定 DJ。一次性调用，调用方持久化复用→几乎不增 API。
// 走 kind:'story'（优先 OpenRouter，不烧 Gemini 核心额度）；AI 不可用就用本地人格（按口味确定性选）。
export async function generatePersona(taste = {}) {
  const arts = (taste.artists || taste.likedArtists || []).slice(0, 8)
  const genres = (taste.genres || []).slice(0, 5)
  if (!arts.length && !genres.length) return localPersona(taste)   // 没口味信号 → 本地默认人格
  try {
    const system = `你为一个私人音乐电台塑造一位固定 DJ 的人设。只输出JSON，不要解释。`
    const raw = await gemini(system, `
听众常听的歌手：${arts.join('、') || '未知'}
偏好曲风：${genres.join('、') || '未知'}

为这位听众量身设计一个会长期陪他听歌的电台 DJ，贴合上面的口味气质。返回JSON：
{
  "name": "DJ 名字(2-4字中文名或英文名，好记有个性)",
  "vibe": "一句话人设/调性(≤30字，说清说话风格与偏爱的音乐气质)",
  "sign": "口头禅/收尾语(≤10字)",
  "emoji": "单个emoji"
}`, { maxTokens: 300, temperature: 0.9, kind: 'story' })
    const mm = raw.match(/\{[\s\S]*\}/)
    if (!mm) throw new Error('persona failed')
    const j = JSON.parse(mm[0])
    if (!j.name) throw new Error('no name')
    return { name: String(j.name).slice(0, 8), vibe: (j.vibe || '').slice(0, 40), sign: (j.sign || '').slice(0, 12), emoji: j.emoji || '🎧', source: 'ai' }
  } catch {
    return localPersona(taste)   // 限流/失败 → 本地人格兜底
  }
}

// 单首歌一句话「故事」：结合歌词点出情绪/主题/创作背景。调用方按 mid 永久缓存复用 → 省配额。
// 注：听众记忆（常听/收藏过/心情）不放这里——那会被永久缓存成过期信息，改由实时的 memoryNote 承担。
export async function generateStory(track, lyricSnippet = '') {
  const artist = track?.artists?.map(a => a.name).join('/') || '未知'
  const lyricBlock = lyricSnippet ? `\n部分歌词：\n${lyricSnippet}` : '\n（暂无歌词，可讲风格/情绪）'
  const system = withPersona(`你是博学、有洞察的音乐电台DJ。只输出一句话，不换行、不解释、不加引号。`)
  const text = await gemini(system, `
歌曲：${track?.name} - ${artist}${lyricBlock}

用一句话(≤30字)介绍这首歌：优先结合上面的歌词点出它的情绪/故事/主题；若你确知真实创作背景可讲；不确定就讲风格，别编造具体事实(假获奖/假年份)。口语、有DJ腔。`, { maxTokens: 200, temperature: 0.85, kind: 'story' })
  const one = (text || '').split(/[\n。！!?？]/)[0].trim().replace(/^["“「]|["”」]$/g, '')
  return one.slice(0, 40)
}
