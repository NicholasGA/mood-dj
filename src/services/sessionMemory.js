// 跨会话记忆（护城河：会记得你的 DJ）——纯逻辑、零 API、可单测。
// 在 djPersona 的「人格 + 时段」之上，再叠一层「时间维度的记忆」：
// 来得勤不勤、是不是老地方老时间、上次在听什么、一起听过多少首。
// 全部从已持久化的轻量数据（到访时间序列 + 最近一首 + 计数）本地推导，不调任何接口。

import { timeOfDay, greeting } from './djPersona.js'

const DAY = 86400000
const VISIT_CAP = 80

const sameDayMs = (a, b) => {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

// 记一次到访（启动时调用一次）：push now、滤掉脏值、裁到最近 cap 条
export function recordVisit(visits, now = Date.now(), cap = VISIT_CAP) {
  const next = (visits || []).filter(t => typeof t === 'number' && t > 0 && t <= now)
  next.push(now)
  return next.length > cap ? next.slice(next.length - cap) : next
}

// 从到访时间序列算「记得你」的信号
export function visitStats(visits = [], now = Date.now()) {
  const v = (visits || []).filter(t => typeof t === 'number' && t <= now)
  const total = v.length
  const thisWeek = v.filter(t => now - t < 7 * DAY).length
  // 时段习惯：各时段到访计数取众数；习惯成立 = 该时段≥3 次、占比过半、且此刻正落在该时段
  const slotCount = {}
  for (const t of v) { const s = timeOfDay(new Date(t)).slot; slotCount[s] = (slotCount[s] || 0) + 1 }
  let habitSlot = null, max = 0
  for (const s of Object.keys(slotCount)) { if (slotCount[s] > max) { max = slotCount[s]; habitSlot = s } }
  const curSlot = timeOfDay(new Date(now)).slot
  const atHabitSlot = !!habitSlot && curSlot === habitSlot && max >= 3 && max / total > 0.5
  return { total, thisWeek, habitSlot, atHabitSlot, curSlot }
}

// 一起听过多少首的里程碑：返回应庆祝的最高阈值（> 已庆祝过的），没有则 null
const MILESTONES = [50, 100, 200, 500, 1000, 2000, 5000]
export function dueMilestone(totalPlayed = 0, celebrated = 0) {
  let due = null
  for (const m of MILESTONES) { if (totalPlayed >= m && m > celebrated) due = m }
  return due
}

// 启动问候（升级版，零 API）：在基础问候之上，挑当下最有"记得你"分量的一句。
// 返回 { line, celebrate }：celebrate 为本次该记下的里程碑阈值（调用方持久化进 celebratedPlays），无则 0。
// mem: { lastSeen, visits, lastTrack:{name,artist}, totalPlayed, celebratedPlays }
export function sessionGreeting(persona, now = Date.now(), mem = {}) {
  const label = timeOfDay(new Date(now)).label
  const lastSeen = mem.lastSeen || null
  const lastTrack = (mem.lastTrack && mem.lastTrack.name) ? mem.lastTrack : null
  const stats = visitStats(mem.visits, now)

  // 1) 里程碑——最有"它记得我们一起走过"的分量，新触发才说，说一次
  const ms = dueMilestone(mem.totalPlayed || 0, mem.celebratedPlays || 0)
  if (ms) return { line: `我们已经一起听过 ${ms} 首了，${label}好，继续陪你`, celebrate: ms }

  // 2) 久别（≥3 天）+ 上次在听什么——具体到歌名，最像"老朋友还记得"
  if (lastSeen) {
    const days = Math.floor((now - lastSeen) / DAY)
    if (days >= 3 && lastTrack) {
      const clip = (s, n) => { const x = String(s || ''); return x.length > n ? x.slice(0, n) + '…' : x }
      const nm = clip(lastTrack.name, 18), ar = clip(lastTrack.artist, 12)
      const tag = ar ? `${ar}《${nm}》` : `《${nm}》`
      return { line: `${days} 天没见了，上次你听到 ${tag}，接着？`, celebrate: 0 }
    }
    // 3) 同一天再开
    if (sameDayMs(now, lastSeen)) return { line: `${label}好，又见面了——接着听`, celebrate: 0 }
  }

  // 4) 这周来得勤
  if (stats.thisWeek >= 3) return { line: `这周第 ${stats.thisWeek} 次来了，最近挺需要音乐的吧`, celebrate: 0 }

  // 5) 老地方老时间（时段习惯）
  if (stats.atHabitSlot) return { line: `又到你常来的${label}了，老规矩，我陪你`, celebrate: 0 }

  // 6) 其余交给基础问候（首次自我介绍 / 一般回归）
  return { line: greeting(persona, now, lastSeen), celebrate: 0 }
}

// 主动播报（零 API）：听的过程中据收听规律插一句 DJ 点评，让"听的当下"也像有人陪。无可说返回 ''。
// 条件本身就稀疏(连播 exactly 4/8 首、每 20 首、会话中跨入深夜)，调用方再加节流即可，不打扰。
// ctx: { track(当前这首), history(之前的，新→旧), sessionCount(本次会话已播第几首), persona, now, prevSlot(上一首所处时段) }
export function proactiveNote(ctx = {}) {
  const { track, history = [], sessionCount = 0, persona = {}, now = Date.now(), prevSlot = null } = ctx
  // 1) 会话中跨入深夜——最有"它在陪着我"的氛围
  const slot = timeOfDay(new Date(now)).slot
  if (prevSlot && prevSlot !== 'lateNight' && slot === 'lateNight') return '不知不觉到深夜了，把声音放轻些，慢慢听'
  // 2) 连续同一歌手（只在恰好第 4/8 首时说一次，避免每首都念叨）
  const a = track?.artists?.[0]?.name
  if (a) {
    let streak = 1
    for (const h of history) { if ((h.artists?.[0]?.name) === a) streak++; else break }
    if (streak === 4 || streak === 8) return `连着第 ${streak} 首 ${a} 了，今天是 ${a} 的专场`
  }
  // 3) 会话里程碑（每 20 首，自带间隔）
  if (sessionCount > 0 && sessionCount % 20 === 0) {
    const sign = persona.sign ? `，${persona.sign}` : ''
    return `不知不觉陪你听到第 ${sessionCount} 首了${sign}`
  }
  return ''
}
