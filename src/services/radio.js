// 电台选歌的纯逻辑（可单测、不依赖网络）：多样性 / 防重复 / 新鲜度。

// 每位歌手最多 maxPer 首，避免「老那几个」霸屏；保持原相对顺序
export function capPerArtist(tracks, maxPer = 2) {
  const seen = {}
  const out = []
  for (const t of tracks || []) {
    const k = t?.artists?.[0]?.name || t?.mid || ''
    seen[k] = (seen[k] || 0) + 1
    if (seen[k] <= maxPer) out.push(t)
  }
  return out
}

// 过滤掉最近放过的（跨会话防重复）。excludeSet: Set<mid>
export function excludeRecent(tracks, excludeSet) {
  if (!excludeSet || !excludeSet.size) return (tracks || []).slice()
  return (tracks || []).filter(t => t?.mid && !excludeSet.has(t.mid))
}

// 「最近放过」环形缓冲：放新 mid 到末尾、去掉旧的同 mid、封顶 cap，返回新数组
export function pushRecent(recent, mid, cap = 300) {
  if (!mid) return (recent || []).slice()
  const next = (recent || []).filter(m => m !== mid)
  next.push(mid)
  return next.length > cap ? next.slice(next.length - cap) : next
}

// 综合一步到位：先去最近重复、再限歌手数；过滤到太短就退回只限歌手数（别把队列清空）
export function freshen(tracks, recentSet, { maxPer = 2, min = 6 } = {}) {
  const a = capPerArtist(excludeRecent(tracks, recentSet), maxPer)
  return a.length >= min ? a : capPerArtist(tracks || [], maxPer)
}
