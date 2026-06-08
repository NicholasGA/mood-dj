// 纯文本兜底逻辑（零 API、可单测）：AI 不可用/配额耗尽时也能给出合理的电台与每首简介。

// 每首歌一句本地简介：按 mid 稳定选一句模板，保证同一首每次一致
export function localStory(track) {
  const name = track?.name || '这首'
  const artist = track?.artists?.map(a => a.name).join('、') || ''
  const tmpl = artist
    ? [`${artist} 的「${name}」，跟着走就对了`, `接下来「${name}」— ${artist}，听听这个味道`,
       `${artist} 带来「${name}」，让它陪你这一刻`, `「${name}」，${artist}，闭眼感受一下`]
    : [`「${name}」，让它陪你这一刻`, `接下来「${name}」，跟着感觉走`]
  let h = 0
  const s = track?.mid || name
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return tmpl[h % tmpl.length]
}

// 心情关键词 → 电台配置。analyzeMood（Gemini）失败时的本地兜底，比通用歌单更贴合心情。
const MOOD_RULES = [
  { re: /开心|快乐|高兴|愉快|嗨|兴奋|爽|喜悦|好心情/, name: '开心', emoji: '😄',
    queries: ['欢快 流行', '快乐 华语', '元气 满满'], c1: '#f59e0b', c2: '#f97316', intro: '心情不错，来点欢快的~' },
  { re: /伤感|难过|失恋|分手|想念|孤独|emo|哭|低落|心碎|想哭/, name: '伤感', emoji: '🌧️',
    queries: ['伤感 情歌', '深夜 emo', '治愈 华语 慢歌'], c1: '#6366f1', c2: '#8b5cf6', intro: '陪你慢慢消化这份情绪~' },
  { re: /安静|放松|平静|静|睡|助眠|轻音乐|发呆|惬意/, name: '安静', emoji: '🌙',
    queries: ['安静 轻音乐', '放松 纯音乐', '睡前 钢琴'], c1: '#0ea5e9', c2: '#22d3ee', intro: '把声音调轻，慢慢放松下来~' },
  { re: /燃|热血|嗨爆|激情|运动|跑步|健身|动感|蹦迪|嗨歌/, name: '燃', emoji: '🔥',
    queries: ['热血 燃曲', '运动 节奏', '电子 动感'], c1: '#ef4444', c2: '#f43f5e', intro: '能量拉满，跟上节奏！' },
  { re: /累|疲惫|压力|焦虑|烦|丧|疲劳|解压/, name: '解压', emoji: '🍃',
    queries: ['解压 治愈', '舒缓 民谣', '温柔 慢歌'], c1: '#10b981', c2: '#34d399', intro: '辛苦了，让音乐帮你松一松~' },
  { re: /怀旧|经典|老歌|回忆|青春|童年/, name: '怀旧', emoji: '📼',
    queries: ['经典 老歌', '怀旧 华语', '90年代 金曲'], c1: '#a16207', c2: '#ca8a04', intro: '翻翻那些老唱片，回到从前~' },
  { re: /浪漫|甜|恋爱|喜欢的人|约会|心动/, name: '浪漫', emoji: '💕',
    queries: ['浪漫 情歌', '甜蜜 华语', '心动 旋律'], c1: '#ec4899', c2: '#f472b6', intro: '空气里都是甜甜的味道~' },
  { re: /专注|工作|学习|写代码|效率|deep ?work/i, name: '专注', emoji: '🎯',
    queries: ['专注 纯音乐', 'lofi 学习', '轻电子 背景'], c1: '#64748b', c2: '#94a3b8', intro: '进入状态，专注这一刻~' },
]

export function localMoodConfig(text) {
  const t = (text || '').trim()
  const hit = MOOD_RULES.find(r => r.re.test(t))
  if (hit) {
    return {
      mood_name: hit.name, search_queries: hit.queries.slice(),
      color_primary: hit.c1, color_secondary: hit.c2,
      mood_emoji: hit.emoji, dj_intro: hit.intro,
    }
  }
  return {
    mood_name: t.slice(0, 6) || '随心', search_queries: ['流行音乐', '好听的歌 轻快', '华语流行'],
    color_primary: '#31c27c', color_secondary: '#1db954',
    mood_emoji: '🎵', dj_intro: '音乐开始，感受当下~',
  }
}
