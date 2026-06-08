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

// ── Check login validity ──────────────────────────────────────────
export async function checkLogin(cookies) {
  try {
    const results = await searchTracks(cookies, 'test', 1)
    return results.length >= 0
  } catch {
    return false
  }
}
