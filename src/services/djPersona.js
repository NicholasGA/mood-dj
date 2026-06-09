// DJ 人格（护城河：会记得你的 DJ）——纯逻辑、零 API、可单测。
// 思路：给电台一个"固定的人"——有名字、有调性、有口头禅。生成一次后持久化复用，
// 注入到所有 DJ 口吻的 prompt 里，使每次开场/串场/歌曲故事都出自同一个人格。
// 没有 API 也能用本地人格（按口味确定性选一个，保证同一用户每次同一个人）。

// 几种电台 DJ 原型。本地兜底从这里按口味选，保证有人格、且稳定。
export const PERSONAS = [
  { name: '阿声', vibe: '深夜电台的老朋友，慵懒温柔，爱讲冷门音乐背后的故事', sign: '夜还长，我们继续。', emoji: '🌙' },
  { name: 'Nana', vibe: '偏爱日系与城市流行的女声 DJ，温暖细腻，像深夜便利店的灯', sign: '陪你到天亮。', emoji: '🌃' },
  { name: '阿K',  vibe: '摇滚与电子的狂热分子，热血直接，专挑带劲的歌', sign: '音量再开大点。', emoji: '🔥' },
  { name: '清和', vibe: '安静的纯音乐向导，话少留白，让旋律自己说话', sign: '慢慢听。', emoji: '🍃' },
  { name: '老周', vibe: '懂行的老乐迷，话不多但每句都在点上，偏爱有质感的编曲', sign: '听着。', emoji: '🎚️' },
  { name: '小满', vibe: '元气满满的午后 DJ，语速轻快，总能挖到让你点头的歌', sign: '走，下一首！', emoji: '☀️' },
]

// 口味关键词 → 倾向某个人格（命中就用，体现"懂你"）。
const TASTE_BIAS = [
  { re: /初音|vocaloid|j-?pop|日系|日语|动漫|东方|幽闭|halozy|yoasobi|城市流行|アニ/i, name: 'Nana' },
  { re: /摇滚|rock|金属|metal|电子|edm|punk|one ?ok|燃|核/i, name: '阿K' },
  { re: /纯音乐|钢琴|piano|轻音乐|氛围|ambient|后摇|post-?rock|古典/i, name: '清和' },
  { re: /民谣|爵士|jazz|blues|老歌|经典|怀旧|brit/i, name: '老周' },
]

const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

// 从口味确定性地选一个本地人格。taste: { artists?, genres?, personality? } 或字符串数组。
export function localPersona(taste) {
  const parts = []
  if (Array.isArray(taste)) parts.push(...taste)
  else if (taste && typeof taste === 'object') parts.push(...(taste.artists || []), ...(taste.genres || []), taste.personality || '')
  else if (typeof taste === 'string') parts.push(taste)
  const blob = parts.filter(Boolean).join(' ')

  const bias = TASTE_BIAS.find(b => b.re.test(blob))
  if (bias) { const p = PERSONAS.find(x => x.name === bias.name); if (p) return { ...p, source: 'local' } }
  // 无明显倾向：按口味哈希稳定选一个（同一用户每次同一个，不同用户分散）
  return { ...PERSONAS[hash(blob || 'mooddj') % PERSONAS.length], source: 'local' }
}

// 时段（本地，零成本）：用于让开场白自然带点"现在几点"的感觉。
export function timeOfDay(date = new Date()) {
  const h = date.getHours()
  if (h < 5)  return { slot: 'lateNight', label: '深夜' }
  if (h < 9)  return { slot: 'morning',   label: '清晨' }
  if (h < 12) return { slot: 'forenoon',  label: '上午' }
  if (h < 14) return { slot: 'noon',      label: '中午' }
  if (h < 18) return { slot: 'afternoon', label: '下午' }
  if (h < 23) return { slot: 'evening',   label: '晚上' }
  return { slot: 'lateNight', label: '深夜' }
}

// 注入到 LLM system prompt 前缀：让所有 DJ 口吻保持同一人格。
export function personaSystemPrefix(persona) {
  if (!persona?.name) return ''
  return `你是这档私人电台固定的 DJ「${persona.name}」，人设：${persona.vibe}。所有开场白/串场/介绍都保持这个人格与口吻，自然、不做作、不要每次自报家门。`
}

const sameDay = (a, b) => {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

// 启动问候（本地）：结合人格 + 时段 + 会话连续性（今天再见/久别/初次），一句话。
export function greeting(persona, now = Date.now(), lastSeen = null) {
  const name = persona?.name || 'DJ'
  const { label } = timeOfDay(new Date(now))
  if (!lastSeen) return `我是 ${name}，${label}好，从今天起这台就归你了`
  if (sameDay(now, lastSeen)) return `${label}好，又见面了——接着听`
  const days = Math.floor((now - lastSeen) / 86400000)
  if (days >= 7) return `好些天没见了，${label}好，位置给你留着呢`
  return `${label}好，回来啦——继续上次的频率`
}

// 调味/换台时 DJ 出声反应（本地字符串，零 API）。dir: 'happier'|'chill'|'energetic'|'sadder'|...
const VIBE_LINES = {
  happier:   ['往亮里调一调', '加点甜', '心情往上走一点'],
  sadder:    ['往深处沉一沉', '换点走心的', '慢下来，陪你'],
  energetic: ['能量加满', '把劲儿提起来', '节奏给你拉快'],
  chill:     ['松一松，放空', '调轻一点', '慢慢漂着'],
  default:   ['换个味道', '我懂，调一下', '听这个'],
}
export function vibeReaction(persona, dir) {
  const lines = VIBE_LINES[dir] || VIBE_LINES.default
  let h = hash((persona?.name || '') + (dir || ''))
  return lines[h % lines.length]
}
