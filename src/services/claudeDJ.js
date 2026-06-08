const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
// gemini-2.5-flash 免费层仅 20 次/天，根本不够用；2.5-flash-lite 免费日配额高得多且足够胜任
const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-lite'
let _lastCallTime = 0
const ANNOUNCE_COOLDOWN = 25000 // ms between announcement calls

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function gemini(system, userMsg, { retries = 2, maxTokens = 600, temperature = 0.9 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)  // 防止网络卡住时无限挂起
    let res
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      )
    } finally {
      clearTimeout(timer)
    }
    if (res.ok) {
      const data = await res.json()
      const parts = data.candidates?.[0]?.content?.parts ?? []
      return parts.filter(p => !p.thought).map(p => p.text).join('').trim()
    }
    // 429 限流：指数退避后重试，仍失败才抛错（调用方有降级处理）
    if (res.status === 429 && attempt < retries) {
      await sleep(1000 * 2 ** attempt)
      continue
    }
    throw new Error(`${res.status}`)
  }
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
