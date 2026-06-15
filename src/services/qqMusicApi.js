function cookieStr(cookies) {
  return (cookies || []).map(c => `${c.name}=${c.value}`).join('; ')
}
export function getUin(cookies) {
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

// 非歌曲过滤：QQ音乐里混着喜马拉雅等有声书/播客/广播剧，模糊搜索词("小众宝藏/冷门")常把它们搜出来，
// 表现为"放出来好多不是歌"。按 来源平台 + 章节/有声 标题特征 识别（纯函数，可单测）。
const NON_MUSIC_ARTIST = /喜马拉雅|懒人听书|蜻蜓FM|阅文|有声|说书|讲书|评书/i
const NON_MUSIC_NAME = /第\s*[\d零一二三四五六七八九十百千两]+\s*[章集回话讲]|广播剧|有声书|有声小说|说书|讲书|评书|相声|脱口秀|播客|电台节目|完整版未删减/
export function isNonMusic(s) {
  const name = s?.name || s?.songname || ''
  const artist = (s?.singer || []).map(a => a?.name || '').join('/')
  return NON_MUSIC_ARTIST.test(artist) || NON_MUSIC_NAME.test(name)
}

// QQ 歌曲对象 → 统一 track 形状（搜索/歌单通用）
export function mapSong(s) {
  if (!s?.mid) return null
  if (isNonMusic(s)) return null   // 滤掉有声书/播客等非歌曲
  return {
    id: String(s.id ?? s.mid),
    mid: s.mid,
    media_mid: s.file?.media_mid || s.mid,  // 取流文件名要用 media_mid，不是 mid
    name: s.name || s.songname,
    artists: (s.singer || []).map(a => ({ name: a.name, mid: a.mid })),
    album: {
      name: s.album?.name,
      images: s.album?.mid ? [{ url: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` }] : [],
    },
    duration_ms: (s.interval || 0) * 1000,
    uri: `qqmusic:${s.mid}`,
  }
}

async function musicu(cookies, req) {
  const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: { ...HEADERS(cookies), 'Content-Type': 'application/json' },
    // ct:19 cv:1859 才认 DoSearchForQQMusicDesktop（ct:24/cv:0 会返回空）
    body: JSON.stringify({ comm: { ct: 19, cv: 1859, uin: getUin(cookies), format: 'json' }, req_1: req }),
  })
  if (!res.ok) throw new Error(`QQ ${res.status}`)
  return (await res.json()).req_1?.data
}

// ── Search 单曲（page 随机翻页 → 拉开曲目差异）────────────────────
export async function searchTracks(cookies, query, limit = 20, page = 1) {
  const data = await musicu(cookies, {
    method: 'DoSearchForQQMusicDesktop',
    module: 'music.search.SearchCgiService',
    param: { search_type: 0, query, page_num: page, num_per_page: limit, grp: 1 },
  })
  return (data?.body?.song?.list || []).map(mapSong).filter(Boolean)
}

// ── 歌手实锤（纯函数，可单测）：搜索结果里 singer 名与候选词（忽略大小写/空格）完全一致的
// 歌够多 → 这是个真歌手，返回官方写法的名字；否则 null。给"点名歌手"探针用：
// AI 不认识的小众歌手（如 chilichill）、本地启发式猜出来的词，都先拿 QQ 的数据验明正身。
export function canonicalArtist(tracks, term, min = 3) {
  const norm = (s) => (s || '').toLowerCase().replace(/\s/g, '')
  const want = norm(term)
  if (!want) return null
  const count = {}
  for (const t of tracks || []) for (const a of t?.artists || []) {
    if (norm(a.name) === want) count[a.name] = (count[a.name] || 0) + 1
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0]
  return best && best[1] >= min ? best[0] : null
}

// ── 按歌手搜：搜歌手名后用 singer 字段过滤，剔除"标题里含该词"的杂歌 ──
export async function searchByArtist(cookies, artist, limit = 20, page = 1) {
  const tracks = await searchTracks(cookies, artist, limit, page)
  const norm = (s) => (s || '').toLowerCase().replace(/\s/g, '')
  const a = norm(artist)
  return tracks.filter(t => (t.artists || []).some(x => { const n = norm(x.name); return n && (n.includes(a) || a.includes(n)) }))
}

// ── Search 歌单（参考别人的歌单）──────────────────────────────────
export async function searchPlaylists(cookies, query, limit = 8) {
  const data = await musicu(cookies, {
    method: 'DoSearchForQQMusicDesktop',
    module: 'music.search.SearchCgiService',
    param: { search_type: 3, query, page_num: 1, num_per_page: limit, grp: 1 },
  })
  return (data?.body?.songlist?.list || []).map(p => ({
    id: String(p.dissid),
    name: p.dissname,
    songCount: p.song_count || 0,
  })).filter(p => p.id && p.songCount >= 5)
}

// ── 取某歌单内的歌曲 ──────────────────────────────────────────────
export async function getPlaylistTracks(cookies, dissid, num = 50, begin = 0) {
  const data = await musicu(cookies, {
    module: 'music.srfDissInfo.aiDissInfo',
    method: 'uniform_get_Dissinfo',
    param: { disstid: Number(dissid), tag: 1, userinfo: 0, song_begin: begin, song_num: num },
  })
  return (data?.songlist || []).map(mapSong).filter(Boolean)
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
export function detectChoruses(lines) {
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
