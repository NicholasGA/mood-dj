function cookieStr(cookies) {
  return (cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
}
function getUin(cookies) {
  const pick = (name) => (cookies || []).find(c => c.name === name && c.value && c.value !== '0')?.value
  const raw = pick('uin') || pick('wxuin')  // QQ 登录在 uin，微信登录在 wxuin
  return raw ? raw.replace(/^o0*/, '') : '0'
}
function guid() {
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0')
}

const HEADERS = (cookies) => ({
  'Referer': 'https://y.qq.com/',
  'Cookie': cookieStr(cookies),
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
})

// ── Search ────────────────────────────────────────────────────────
export async function searchTracks(cookies, query, limit = 20) {
  const body = {
    comm: { ct: 19, cv: 1859, uin: getUin(cookies), format: 'json' },
    req_1: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { search_type: 0, query, page_num: 1, num_per_page: limit, grp: 1 },
    },
  }
  const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: { ...HEADERS(cookies), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`QQ search ${res.status}`)
  const data = await res.json()
  const list = (data.req_1?.data?.body?.song?.list || []).filter(s => !s.pay?.payplay)
  return list.map(s => ({
    id: String(s.id),
    mid: s.mid,
    media_mid: s.file?.media_mid || s.mid,  // 取流文件名要用 media_mid，不是 mid
    name: s.name,
    artists: (s.singer || []).map(a => ({ name: a.name })),
    album: {
      name: s.album?.name,
      images: [{ url: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album?.mid}.jpg` }],
    },
    duration_ms: (s.interval || 0) * 1000,
    uri: `qqmusic:${s.mid}`,
  }))
}

// ── Get playback URL via main process (has session cookies) ──────
export async function getSongUrl(_cookies, songmid, mediaMid) {
  const url = await window.electronAPI.getQQUrl(songmid, mediaMid)
  if (!url) throw new Error('无法获取播放地址（可能需要 VIP）')
  return url
}

// ── 歌词：取 LRC 并解析成 [{time, text}] ──────────────────────────
const LRC_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g

export function parseLRC(lrc) {
  const out = []
  for (const line of (lrc || '').split('\n')) {
    const tags = [...line.matchAll(LRC_TAG)]
    if (!tags.length) continue
    const text = line.replace(LRC_TAG, '').trim()
    for (const t of tags) {
      const ms = t[3] ? Number(`0.${t[3]}`) : 0
      out.push({ time: Number(t[1]) * 60 + Number(t[2]) + ms, text })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

// 副歌检测（纯文本启发式，非精确）：以出现最多的"钩子行"为锚，标记钩子及其紧邻高重复行，
// 段落起点作为跳转点。若标记过多(>45%，说明全曲高度重复无法区分)则撤销标记、仅保留跳转。
function detectChoruses(lines) {
  const norm = (t) => (t || '').replace(/\s+/g, '').toLowerCase()
  const N = lines.length
  const keys = lines.map(l => norm(l.text))
  const freq = {}
  keys.forEach(k => { if (k.length >= 3) freq[k] = (freq[k] || 0) + 1 })
  const maxF = Math.max(0, ...Object.values(freq))
  if (maxF < 2) return []

  const hook = new Set(Object.keys(freq).filter(k => freq[k] === maxF))  // 重复最多的行
  for (let i = 0; i < N; i++) if (hook.has(keys[i])) lines[i].isChorus = true
  // 钩子行向两侧扩展相邻的高重复行，纳入整段副歌
  for (let i = 0; i < N; i++) {
    if (!lines[i].isChorus) continue
    for (const d of [-1, 1]) {
      let j = i + d
      while (j >= 0 && j < N && keys[j].length >= 3 && freq[keys[j]] >= 2) { lines[j].isChorus = true; j += d }
    }
  }

  const starts = []
  for (let i = 0; i < N; i++) {
    if (lines[i].isChorus && (i === 0 || !lines[i - 1].isChorus)) {
      if (!starts.length || lines[i].time - starts[starts.length - 1] > 10) starts.push(lines[i].time)
    }
  }
  // 标记过多 → 撤销可视标记（避免误导），但保留跳转点
  if (lines.filter(l => l.isChorus).length > N * 0.45) lines.forEach(l => { l.isChorus = false })
  return starts
}

export async function getLyric(songmid) {
  if (!songmid) return { lines: [], choruses: [], hasTrans: false }
  const { lyric, trans } = (await window.electronAPI.getQQLyric(songmid)) || {}
  const lines = parseLRC(lyric || '')
  const transLines = parseLRC(trans || '')
  // 按时间对齐翻译到每一行（容差 0.6s）；过滤 // 占位
  if (transLines.length) {
    for (const ln of lines) {
      let best = null, bd = 0.6
      for (const tl of transLines) { const d = Math.abs(tl.time - ln.time); if (d < bd) { bd = d; best = tl } }
      const t = best?.text || ''
      ln.trans = t === '//' ? '' : t
    }
  }
  const hasTrans = transLines.some(t => t.text && t.text !== '//')
  const choruses = detectChoruses(lines)
  return { lines, choruses, hasTrans }
}

// ── Check login validity ──────────────────────────────────────────
export async function checkLogin(cookies) {
  try {
    const results = await searchTracks(cookies, 'test', 1)
    return results.length >= 0
  } catch {
    return false
  }
}
