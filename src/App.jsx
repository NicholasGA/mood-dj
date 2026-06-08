import { useState, useEffect, useRef, useCallback } from 'react'
import Onboarding from './components/Onboarding'
import MoodInput from './components/MoodInput'
import NowPlaying from './components/NowPlaying'
import Visualizer from './components/Visualizer'
import DJAnnouncement from './components/DJAnnouncement'
import MiniPlayer from './components/MiniPlayer'
import LikesPanel from './components/LikesPanel'
import Icon from './components/Icon'
import { searchTracks, getSongUrl, getLyric, searchPlaylists, getPlaylistTracks, searchByArtist } from './services/qqMusicApi'
import { analyzeMood, generateStory, curateTracks, interpretRequest, configureLLM, hasLLMKey, analyzeTaste, clusterLikes } from './services/claudeDJ'
import { localStory, localMoodConfig } from './services/djText'
import { freshen, pushRecent } from './services/radio'
import { extractAlbumColors } from './services/albumColor'

export default function App() {
  const [qqCookies, setQQCookies] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTrack, setCurrentTrack] = useState(null)
  const [queue, setQueue] = useState([])
  const [moodConfig, setMoodConfig] = useState(null)
  const [announcement, setAnnouncement] = useState('')
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingTrack, setLoadingTrack] = useState(false)
  const [albumColors, setAlbumColors] = useState(null)
  const [lyric, setLyric] = useState({ lines: [], choruses: [], hasTrans: false })
  const [miniMode, setMiniMode] = useState(false)
  const [favCount, setFavCount] = useState(0)   // 已接入的 QQ收藏数（仅用于 UI 提示）
  const [likedCount, setLikedCount] = useState(0)   // 本地"我喜欢的"数量
  const [showLikes, setShowLikes] = useState(false) // 喜欢列表面板
  const [llmReady, setLlmReady] = useState(hasLLMKey())  // 是否已配置 AI key
  const [showSetup, setShowSetup] = useState(false)      // 手动重开设置/引导
  const [toast, setToast] = useState('')
  const [update, setUpdate] = useState(null)   // { state, version, percent }
  const [error, setError] = useState('')
  const toastTimer = useRef(null)
  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])

  const audioRef = useRef(new Audio())
  const queueRef = useRef([])
  const currentTrackRef = useRef(null)
  const moodConfigRef = useRef(null)
  const qqCookiesRef = useRef(null)
  const isAdvancingRef = useRef(false)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const radioRef = useRef(null)        // 当前电台上下文：{ queries, playlistIds, seen }，用于无限补歌
  const replenishPromiseRef = useRef(null)   // 进行中的补歌 promise（合并并发调用，避免竞态）
  const favRef = useRef(null)          // 用户收藏：{ playlistIds, topArtists, sample, favCount }
  const memoryRef = useRef({ likedTracks: [], dislikedArtists: [] })   // 跨会话口味记忆
  const saveMemory = useCallback(() => { window.electronAPI.storeMemory(memoryRef.current) }, [])
  const lastSpokeRef = useRef(0)         // 上次语音播报时间（节流，文字每首都显示）
  const [djSpeak, setDjSpeak] = useState(false)   // 本次播报是否出声

  // 懒初始化 Web Audio 分析器（只能对一个 <audio> 创建一次 source）
  const ensureAnalyser = useCallback(() => {
    if (analyserRef.current || !audioRef.current) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      const ctx = new Ctx()
      const source = ctx.createMediaElementSource(audioRef.current)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)
      analyser.connect(ctx.destination)
      audioCtxRef.current = ctx
      analyserRef.current = analyser
    } catch { /* 不支持则可视化退回时间驱动 */ }
  }, [])

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { moodConfigRef.current = moodConfig }, [moodConfig])
  useEffect(() => { qqCookiesRef.current = qqCookies }, [qqCookies])

  // Load stored QQ cookies on startup
  useEffect(() => {
    window.electronAPI.getQQCookies().then(c => { if (c?.length) setQQCookies(c) })
  }, [])

  // 载入跨会话口味记忆（喜欢的歌 + 不喜欢的歌手）
  useEffect(() => {
    window.electronAPI.getMemory().then(m => {
      if (m) memoryRef.current = { ...memoryRef.current, ...m, likedTracks: m.likedTracks || [], dislikedArtists: m.dislikedArtists || [] }   // 保留 likesCache / songStories 等持久化缓存
      setLikedCount(memoryRef.current.likedTracks.length)
    }).catch(() => {})
  }, [])

  // 载入应用配置（API key 等），覆盖默认值
  useEffect(() => {
    window.electronAPI.getConfig().then(cfg => {
      if (cfg) configureLLM(cfg)
      setLlmReady(hasLLMKey())
    }).catch(() => setLlmReady(hasLLMKey()))
  }, [])

  // 自动更新状态
  useEffect(() => { window.electronAPI.onUpdateStatus?.(setUpdate) }, [])

  // 登录后拉取用户收藏（"我喜欢"等），用于个性化推荐
  useEffect(() => {
    if (!qqCookies) { favRef.current = null; setFavCount(0); return }
    window.electronAPI.getQQFavorites().then(f => {
      if (f && (f.sample?.length || f.playlistIds?.length)) {
        favRef.current = f
        setFavCount(f.favCount || f.sample?.length || 0)
      }
    }).catch(() => {})
  }, [qqCookies])

  // 当前歌曲变化时，从封面提取主题色（失败则回退心情色）
  useEffect(() => {
    const art = currentTrack?.album?.images?.[0]?.url
    if (!art) { setAlbumColors(null); return }
    let cancelled = false
    extractAlbumColors(art)
      .then(c => { if (!cancelled) setAlbumColors(c) })
      .catch(() => { if (!cancelled) setAlbumColors(null) })
    return () => { cancelled = true }
  }, [currentTrack])

  // 当前歌曲变化时抓取歌词
  useEffect(() => {
    const mid = currentTrack?.mid
    const empty = { lines: [], choruses: [], hasTrans: false }
    if (!mid) { setLyric(empty); return }
    let cancelled = false
    setLyric(empty)
    getLyric(mid)
      .then(l => { if (!cancelled) setLyric(l) })
      .catch(() => { if (!cancelled) setLyric(empty) })
    return () => { cancelled = true }
  }, [currentTrack])

  // 逃生通道：迷你模式下按 Esc 一定能还原
  useEffect(() => {
    if (!miniMode) return
    const onKey = (e) => { if (e.key === 'Escape') toggleMini(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [miniMode])

  // Set up audio element events
  useEffect(() => {
    const audio = audioRef.current
    audio.volume = 0.8

    // playNext 自带 isAdvancingRef 重入保护
    const onEnded = () => playNext()
    const onPlay  = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onError = () => playNext()

    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('error', onError)
    }
  }, [])

  const showDJ = useCallback((next) => {
    // 立刻显示：有缓存的歌词故事就用，否则本地兜底——保证每首都有一句（AI 故事由下面副作用异步补上）
    const line = memoryRef.current.songStories?.[next.mid] || localStory(next)
    const speak = Date.now() - lastSpokeRef.current > 45000   // 语音节流：≥45s 才出声
    if (speak) lastSpokeRef.current = Date.now()
    setDjSpeak(speak)
    setAnnouncement(line)
    setShowAnnouncement(true)
    setTimeout(() => setShowAnnouncement(false), 8000)
  }, [])

  // 基于歌词的「这首歌的故事」：歌真正听了约 4s 才生成（跳过的不浪费配额），按 mid 永久缓存复用
  useEffect(() => {
    const t = currentTrack, mid = t?.mid
    if (!mid || memoryRef.current.songStories?.[mid]) return   // 无歌 / 已有缓存
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const ly = await getLyric(mid).catch(() => null)
        if (cancelled) return
        const lines = ly?.lines || []
        const chorus = lines.filter(l => l.isChorus).map(l => (l.text || '').trim()).filter(Boolean)
        const plain = lines.map(l => (l.text || '').trim()).filter(Boolean)
        const snippet = [...new Set((chorus.length ? chorus : plain).slice(0, 8))].join('\n').slice(0, 240)
        const story = await generateStory(t, snippet, { likedArtists: likedArtists() })
        if (cancelled || !story) return
        const cache = memoryRef.current.songStories || (memoryRef.current.songStories = {})
        cache[mid] = story
        const keys = Object.keys(cache); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete cache[k])
        saveMemory()
        if (currentTrackRef.current?.mid === mid) {   // 仍在放这首 → 升级成歌词故事（不重复出声）
          setDjSpeak(false); setAnnouncement(story); setShowAnnouncement(true)
          setTimeout(() => setShowAnnouncement(false), 8000)
        }
      } catch { /* 配额/失败：保留本地兜底，下次再试 */ }
    }, 4000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [currentTrack])

  // 加载并播放单首；地址已在主进程校验过可播，拿不到地址会抛错
  const playTrack = useCallback(async (track) => {
    const url = await getSongUrl(qqCookiesRef.current, track.mid, track.media_mid)
    ensureAnalyser()
    audioCtxRef.current?.resume?.()  // 自动播放策略下需在用户手势后恢复
    audioRef.current.src = url
    audioRef.current.load()
    await audioRef.current.play()
  }, [ensureAnalyser])

  // 无限补歌：随机翻页 + 已知歌单随机段 + 自动发现新歌单；按 mid 去重，合并并发调用
  const replenishQueue = useCallback(() => {
    const ctx = radioRef.current
    if (!ctx) return Promise.resolve(0)
    if (replenishPromiseRef.current) return replenishPromiseRef.current   // 复用进行中的，避免竞态
    const run = async () => {
      const fresh = []
      const disliked = (t) => ctx.disliked && (t.artists || []).some(a => ctx.disliked.has(a.name))
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !ctx.seen.has(t.mid) && !disliked(t)) { ctx.seen.add(t.mid); fresh.push(t) } }
      // 1) 单曲搜索：随机翻较深页（避开第 1 页口水热门）
      await Promise.allSettled(ctx.queries.map(q =>
        searchTracks(qqCookiesRef.current, q, 15, 2 + Math.floor(Math.random() * 8)).then(add).catch(() => {})))
      // 2) 已知歌单随机翻段
      if (ctx.playlistIds.length) {
        const pid = ctx.playlistIds[Math.floor(Math.random() * ctx.playlistIds.length)]
        await getPlaylistTracks(qqCookiesRef.current, pid, 50, Math.floor(Math.random() * 4) * 50).then(add).catch(() => {})
      }
      // 3) 发现新歌单（真·无限）：搜一个还没用过的歌单加入
      if (fresh.length < 12 || Math.random() < 0.5) {
        const q = ctx.queries[Math.floor(Math.random() * ctx.queries.length)]
        try {
          const pls = await searchPlaylists(qqCookiesRef.current, q, 12)
          const np = pls.find(p => !ctx.playlistIds.includes(p.id))
          if (np) { ctx.playlistIds.push(np.id); await getPlaylistTracks(qqCookiesRef.current, np.id, 50).then(add).catch(() => {}) }
        } catch {}
      }
      if (fresh.length) {
        const picked = freshen(fresh, new Set(memoryRef.current.recentMids || []), { maxPer: 2, min: 1 })
        picked.sort(() => Math.random() - 0.5)
        const merged = [...queueRef.current, ...picked]
        queueRef.current = merged
        setQueue(merged)
      }
      return fresh.length
    }
    const p = run().finally(() => { replenishPromiseRef.current = null })
    replenishPromiseRef.current = p
    return p
  }, [])

  // 从队列依次试播，跳过不可播的；队列见底自动补歌 → 不间断电台
  const playNext = useCallback(async () => {
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true
    setLoadingTrack(true)
    try {
      let q = [...queueRef.current]
      let tried = 0, rounds = 0
      while (tried < 40) {
        if (q.length === 0) {
          // 见底了：等补歌（会合并进行中的，解决竞态），最多补 3 轮
          if (radioRef.current && rounds < 3) {
            rounds++
            await replenishQueue()
            q = [...queueRef.current]
            continue
          }
          break
        }
        tried++
        const next = q.shift()
        try {
          await playTrack(next)
          showDJ(next)            // 此时 currentTrackRef 仍是上一首，作为"刚播"
          setCurrentTrack(next)
          queueRef.current = q
          setQueue(q)
          setError('')
          memoryRef.current.recentMids = pushRecent(memoryRef.current.recentMids || [], next.mid)  // 记最近放过
          if (q.length < 6) replenishQueue()          // 偏低就后台补歌（不阻塞）
          return
        } catch { /* 这首放不了，试下一首 */ }
      }
      setQueue([]); queueRef.current = []
      setCurrentTrack(null)
      setIsPlaying(false)
      setError('暂时没找到能播放的歌，换个心情描述试试')
    } finally {
      isAdvancingRef.current = false
      setLoadingTrack(false)
    }
  }, [showDJ, playTrack, replenishQueue])

  // ── 系统媒体控制（Windows SMTC / 媒体键 / 锁屏）─────────────────
  // 动作处理（播放/暂停/上下曲/快进退）
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const audio = audioRef.current
    const ms = navigator.mediaSession
    const set = (a, fn) => { try { ms.setActionHandler(a, fn) } catch {} }
    set('play', () => audio.play().catch(() => {}))
    set('pause', () => audio.pause())
    set('nexttrack', () => playNext())
    set('previoustrack', () => { audio.currentTime = 0 })   // 无历史，回到本曲开头
    set('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime })
    set('seekforward', (d) => { audio.currentTime = Math.min(audio.duration || 1e9, audio.currentTime + (d.seekOffset || 10)) })
    set('seekbackward', (d) => { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)) })
    return () => ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto', 'seekforward', 'seekbackward'].forEach(a => set(a, null))
  }, [playNext])

  // 元数据（标题/歌手/专辑/封面）随当前歌更新
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
    if (!currentTrack) { navigator.mediaSession.metadata = null; return }
    const art = currentTrack.album?.images?.[0]?.url
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.name || '',
      artist: currentTrack.artists?.map(a => a.name).join(', ') || '',
      album: currentTrack.album?.name || '',
      artwork: art ? [{ src: art, sizes: '300x300', type: 'image/jpeg' }] : [],
    })
  }, [currentTrack])

  // 播放态 + 进度上报（OS 进度条）
  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])
  useEffect(() => {
    const audio = audioRef.current
    const onTime = () => {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
      if (audio.duration && isFinite(audio.duration)) {
        try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate || 1 }) } catch {}
      }
    }
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [])

  async function startRadio(moodText, energy, valence) {
    setIsLoading(true); setError('')
    let shuffled = null
    try {
      let config
      try {
        config = await analyzeMood(moodText, energy, valence, 'qq')
      } catch {
        config = localMoodConfig(moodText)   // AI 不可用：按关键词本地兜底，比通用歌单更贴心情
      }
      config.energy = energy  // 供 Visualizer 用（analyzeMood 不回传 energy）
      setMoodConfig(config)
      setAnnouncement(config.dj_intro)
      setShowAnnouncement(true)
      setTimeout(() => setShowAnnouncement(false), 6000)

      // 个性化：常听歌手(收藏) + 喜欢过的歌手(记忆) 并入口味信号
      const fav = favRef.current
      const taste = [...new Set([...(fav?.topArtists || []), ...likedArtists()])]
      const artistQueries = taste.slice(0, 8).sort(() => Math.random() - 0.5).slice(0, 2)
      const queries = [...(config.search_queries || []), ...artistQueries]

      // 跨会话记忆：开台就把"不喜欢的歌手"带上，全程过滤
      const dislikedSet = new Set(memoryRef.current.dislikedArtists)
      const blocked = (t) => (t.artists || []).some(a => dislikedSet.has(a.name))

      const allTracks = [], seen = new Set()
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !seen.has(t.mid) && !blocked(t)) { seen.add(t.mid); allTracks.push(t) } }
      const ok = (results) => results.forEach(r => r.status === 'fulfilled' && add(r.value))

      // 0) 收藏样本 + 喜欢过的歌直接进池（AI 精排会按心情筛）
      if (fav?.sample?.length) add(fav.sample)
      if (memoryRef.current.likedTracks.length) add(memoryRef.current.likedTracks.slice(-30))

      // 1) 单曲搜索（并发，翻较深页：避开第 1 页口水热门，更新鲜）
      ok(await Promise.allSettled(queries.map(q => searchTracks(qqCookies, q, 15, 2 + Math.floor(Math.random() * 6)))))

      // 2) 歌单源（并发）：搜人工歌单 → 挑歌量充足的几个 → 捞歌进池
      const plLists = await Promise.allSettled((config.search_queries || []).slice(0, 2).map(q => searchPlaylists(qqCookies, q, 6)))
      const picked = []
      plLists.forEach(r => r.status === 'fulfilled' && r.value.slice(0, 3).forEach(p => { if (!picked.includes(p.id)) picked.push(p.id) }))
      // 3) 你的收藏歌单也并入来源（无限补歌时会从你的收藏里继续捞）
      const playlistIds = [...picked.slice(0, 4), ...(fav?.playlistIds || []).slice(0, 3)]
      ok(await Promise.allSettled(playlistIds.map(id => getPlaylistTracks(qqCookies, id, 50))))

      if (allTracks.length === 0) throw new Error('未找到匹配曲目，请换个描述')

      // 存电台上下文，供无限补歌 + 实时调味复用（disliked 用记忆里的歌手种子）
      radioRef.current = { queries, playlistIds, seen, energy, valence, disliked: dislikedSet }

      // AI 精排：按心情 + 你的口味挑选排序；失败则回退随机洗牌
      try {
        shuffled = await curateTracks(allTracks, config, energy, valence, taste)
      } catch {
        shuffled = allTracks.sort(() => Math.random() - 0.5)
      }
      // 新鲜度/多样性：去最近放过的 + 限每位歌手数量（过滤到太短会自动退回，不清空）
      shuffled = freshen(shuffled, new Set(memoryRef.current.recentMids || []), { maxPer: 3, min: 8 })
      setQueue(shuffled)
      queueRef.current = shuffled   // 让 playNext 立即读到最新队列（state 更新是异步的）
      saveMemory()                  // 持久化"最近放过"（跨会话防重复）
    } catch (e) {
      setError(e.message)
    } finally {
      setIsLoading(false)   // 分析+搜索结束就解除"AI分析中"，播放在后台进行
    }
    if (shuffled) playNext()  // 不 await：UI 立即恢复，逐首试播在后台跑
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio.src) return
    isPlaying ? audio.pause() : audio.play()
  }

  function toggleMini(on) {
    window.electronAPI.setMini(on)
    setMiniMode(on)
  }

  // 播放中实时调味：把新 vibe 的歌插到队首，立即生效（不重开台、不耗 Gemini）
  const VIBE = {
    up:     { key: '燃 快节奏 嗨曲 高能', dE: 0.22, pl: '运动 健身 燃歌', toast: '🔥 更带劲了' },
    down:   { key: '安静 慢歌 抒情 治愈', dE: -0.22, pl: '深夜 安静 助眠', toast: '🌙 冷静下来' },
    flavor: { key: '', dE: 0, pl: '', toast: '🔀 换个味道' },
  }
  async function adjustVibe(mode) {
    const ctx = radioRef.current
    if (!ctx) return
    const v = VIBE[mode]
    if (v.dE) {
      ctx.energy = Math.min(1, Math.max(0, (ctx.energy ?? 0.5) + v.dE))
      setMoodConfig(m => (m ? { ...m, energy: ctx.energy } : m))
    }
    setLoadingTrack(true)
    try {
      const fresh = []
      const disliked = (t) => ctx.disliked && (t.artists || []).some(a => ctx.disliked.has(a.name))
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !ctx.seen.has(t.mid) && !disliked(t)) { ctx.seen.add(t.mid); fresh.push(t) } }
      // 基于当前电台关键词叠加能量描述，翻较深页（新鲜、少口水）
      await Promise.allSettled((ctx.queries || []).slice(0, 4).map(q =>
        searchTracks(qqCookiesRef.current, v.key ? `${q} ${v.key}` : q, 15, 2 + Math.floor(Math.random() * 6)).then(add).catch(() => {})))
      // 嗨/静：再补一个能量专属歌单，落差更明显
      if (v.pl) {
        try {
          const pls = await searchPlaylists(qqCookiesRef.current, v.pl, 8)
          const np = pls.find(p => !ctx.playlistIds.includes(p.id))
          if (np) { ctx.playlistIds.push(np.id); await getPlaylistTracks(qqCookiesRef.current, np.id, 50).then(add).catch(() => {}) }
        } catch {}
      }
      let picked = freshen(fresh, new Set(memoryRef.current.recentMids || []), { maxPer: 2, min: 5 })
      picked.sort(() => Math.random() - 0.5)
      if (!picked.length) { showToast('没找到更多，再试一次'); return }
      if (mode === 'flavor') {
        queueRef.current = [...picked, ...queueRef.current]   // 换味道：同心情换一批新歌排队首，不跑偏
      } else {
        queueRef.current = picked                            // 嗨/静：替换接下来的队列，下一首起明显变味
      }
      setQueue(queueRef.current)
      showToast(v.toast)
    } finally { setLoadingTrack(false) }
  }

  function dislikeCurrent() {
    const ctx = radioRef.current, cur = currentTrackRef.current
    if (!ctx || !cur) return
    ctx.disliked = ctx.disliked || new Set()
    ;(cur.artists || []).forEach(a => ctx.disliked.add(a.name))
    // 跨会话记住"不喜欢这些歌手"
    const mem = memoryRef.current
    ;(cur.artists || []).forEach(a => { if (a.name && !mem.dislikedArtists.includes(a.name)) mem.dislikedArtists.push(a.name) })
    saveMemory()
    const filtered = queueRef.current.filter(t => !(t.artists || []).some(a => ctx.disliked.has(a.name)))
    queueRef.current = filtered; setQueue(filtered)
    showToast('👎 已跳过，少推这类')
    playNext()
  }

  // ❤️ 喜欢：记到本地口味记忆 + 加进 QQ"我喜欢"
  function likeCurrent() {
    const cur = currentTrackRef.current
    if (!cur) return
    const mem = memoryRef.current
    if (!mem.likedTracks.some(t => t.mid === cur.mid)) {
      const ctx = radioRef.current
      mem.likedTracks.push({
        id: cur.id, mid: cur.mid, media_mid: cur.media_mid, name: cur.name, artists: cur.artists, album: cur.album,
        mood: moodConfigRef.current?.mood_name || '', energy: ctx?.energy ?? null, likedAt: Date.now(),  // 带心情记忆
      })
      saveMemory()
      setLikedCount(mem.likedTracks.length)
    }
    showToast('❤️ 已加入「我喜欢的」')   // 本地一定成功，可随时在喜欢列表重听
    // QQ"我喜欢"同步best-effort：QQ 库里有的歌(含多数外文)能成，真·灰色歌(80105)会跳过
    if (cur.id) window.electronAPI.addQQFavorite(Number(cur.id)).then(ok => { if (ok) showToast('❤️ 已同步到 QQ 我喜欢') }).catch(() => {})
  }

  // 一键把本地「喜欢」批量同步到 QQ 我喜欢：QQ 库里有的会成，灰色歌跳过；逐首限速避免限流
  async function syncLikesToQQ() {
    const likes = memoryRef.current.likedTracks.filter(t => t.id)
    if (!likes.length) { showToast('还没有可同步的喜欢'); return }
    showToast(`⏳ 正在同步 ${likes.length} 首到 QQ 我喜欢…`)
    let ok = 0, fail = 0
    for (const t of likes) {
      try { (await window.electronAPI.addQQFavorite(Number(t.id))) ? ok++ : fail++ }
      catch { fail++ }
      await new Promise(r => setTimeout(r, 280))
    }
    showToast(fail ? `✅ 同步 ${ok} 首；${fail} 首 QQ 库里没有，已跳过` : `✅ ${ok} 首已同步到 QQ 我喜欢`)
  }

  // 从喜欢的歌里统计常听歌手，作为口味信号
  const likedArtists = () => {
    const c = {}
    memoryRef.current.likedTracks.forEach(t => (t.artists || []).forEach(a => { c[a.name] = (c[a.name] || 0) + 1 }))
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n)
  }

  // 播放"我喜欢的"：点某首从它开始放，其余接在后面（新→旧）
  function playLiked(track) {
    const likes = memoryRef.current.likedTracks
    if (!likes.length) return
    const rest = likes.filter(t => t.mid !== track?.mid).reverse()
    const ordered = track ? [track, ...rest] : likes.slice().reverse()
    queueRef.current = ordered
    setQueue(ordered)
    setShowLikes(false)
    playNext()
  }
  // 取消喜欢（从本地列表移除）
  function removeLiked(mid) {
    const mem = memoryRef.current
    mem.likedTracks = mem.likedTracks.filter(t => t.mid !== mid)
    saveMemory()
    setLikedCount(mem.likedTracks.length)
  }

  // 播放一个自动分组
  function playGroup(tracks) {
    if (!tracks?.length) return
    queueRef.current = tracks.slice(); setQueue(tracks.slice())
    setShowLikes(false)
    playNext()
  }

  // 喜欢集合的指纹：数量 + 最后一首 mid。口味没变就复用缓存，不再花 AI 配额
  function likesSig() {
    const l = memoryRef.current.likedTracks
    return l.length ? `${l.length}:${l[l.length - 1].mid}` : '0'
  }
  // 画像/分组都按指纹缓存，并持久化到 memory（关闭面板/重开/重启都不重复调用）
  async function getLikesProfile() {
    const sig = likesSig(), c = memoryRef.current.likesCache || {}
    if (c.profileSig === sig && c.profile) return c.profile
    const p = await analyzeTaste(memoryRef.current.likedTracks)
    memoryRef.current.likesCache = { ...c, profileSig: sig, profile: p }; saveMemory()
    return p
  }
  async function getLikesGroups() {
    const sig = likesSig(), c = memoryRef.current.likesCache || {}
    if (c.groupsSig === sig && c.groups) return c.groups
    const g = await clusterLikes(memoryRef.current.likedTracks)
    memoryRef.current.likesCache = { ...c, groupsSig: sig, groups: g }; saveMemory()
    return g
  }

  // 对话点歌：解析意图（歌手/关键词）→ 歌手按本人搜、关键词按曲风搜 → 新点的排队首，保留当前曲
  async function steerRadio(text) {
    const t = (text || '').trim()
    if (!t || !radioRef.current) return
    const ctx = radioRef.current
    const E = ctx.energy ?? 0.5, V = ctx.valence ?? 0.5
    setLoadingTrack(true)
    showToast('🎙️ 在帮你换…')
    try {
      let intent
      try { intent = await interpretRequest(t) }
      catch { intent = { artists: [], keywords: [t], mood_name: t.slice(0, 6) || '点歌', dj_intro: '好嘞，换个味道~' } }
      // 只改名字/回应，配色保留（不突兀）
      setMoodConfig(m => ({ ...(m || {}), mood_name: intent.mood_name, mood_emoji: m?.mood_emoji || '🎙️', dj_intro: intent.dj_intro, energy: E }))
      setAnnouncement(intent.dj_intro); setShowAnnouncement(true); setTimeout(() => setShowAnnouncement(false), 6000)

      const pool = []
      const disliked = (x) => ctx.disliked && (x.artists || []).some(a => ctx.disliked.has(a.name))
      const add = (arr) => { for (const x of arr || []) if (x?.mid && !ctx.seen.has(x.mid) && !disliked(x)) { ctx.seen.add(x.mid); pool.push(x) } }

      // 点名歌手 → 搜本人（singer 过滤），翻两页
      for (const ar of intent.artists.slice(0, 3)) {
        ;(await Promise.allSettled([1, 2].map(p => searchByArtist(qqCookiesRef.current, ar, 20, p)))).forEach(r => r.status === 'fulfilled' && add(r.value))
      }
      // 关键词 → 曲风/心情搜索
      ;(await Promise.allSettled((intent.keywords || []).map(q => searchTracks(qqCookiesRef.current, q, 15, 1 + Math.floor(Math.random() * 3))))).forEach(r => r.status === 'fulfilled' && add(r.value))
      // 没点歌手时，搜歌单补充变化
      if (!intent.artists.length) {
        try {
          const pls = await searchPlaylists(qqCookiesRef.current, intent.keywords?.[0] || t, 6)
          const ids = pls.slice(0, 2).map(p => p.id)
          ctx.playlistIds.push(...ids.filter(id => !ctx.playlistIds.includes(id)))
          ;(await Promise.allSettled(ids.map(id => getPlaylistTracks(qqCookiesRef.current, id, 50)))).forEach(r => r.status === 'fulfilled' && add(r.value))
        } catch {}
      }

      if (!pool.length) { showToast('没找到合适的，换个说法试试'); return }
      const cfg = { mood_name: intent.mood_name, search_queries: intent.keywords, energy: E }
      let ordered
      try { ordered = await curateTracks(pool, cfg, E, V, [...(favRef.current?.topArtists || []), ...intent.artists]) }
      catch { ordered = pool.sort(() => Math.random() - 0.5) }
      const merged = [...ordered, ...queueRef.current]   // 新点的排队首，下一首即生效
      queueRef.current = merged; setQueue(merged)
      ctx.queries = [...(intent.keywords || []), ...intent.artists]   // 后续补歌也带上
      showToast(intent.artists.length ? `🎙️ 来点${intent.artists[0]}` : '🎙️ 换好了，下一首给你')
    } finally { setLoadingTrack(false) }
  }

  function logout() {
    audioRef.current.pause()
    audioRef.current.src = ''
    window.electronAPI.clearQQCookies()
    setQQCookies(null); setCurrentTrack(null); setQueue([]); setMoodConfig(null)
  }

  // 未连接 QQ 或未配置 AI key → 引导页；也可从设置手动重开
  if (!qqCookies || !llmReady || showSetup) {
    return (
      <Onboarding
        qqCookies={qqCookies}
        onQQAuth={setQQCookies}
        onReady={() => setLlmReady(true)}
        onClose={() => setShowSetup(false)}
        canClose={!!qqCookies && llmReady}
      />
    )
  }

  // 优先用当前封面主题色（每首歌不同），无则回退心情色
  const accent = albumColors?.primary || moodConfig?.color_primary || '#31c27c'
  const accent2 = albumColors?.secondary || moodConfig?.color_secondary || '#1db954'
  const vizMood = moodConfig ? { ...moodConfig, color_primary: accent, color_secondary: accent2 } : null
  const ambientArt = currentTrack?.album?.images?.[0]?.url

  // 迷你播放器模式：整窗渲染紧凑卡片（音频/状态共用，不中断播放）
  if (miniMode) {
    return (
      <div style={{ '--accent': accent, position: 'fixed', inset: 0, background: '#0a0a0a', overflow: 'hidden' }}>
        <MiniPlayer
          track={currentTrack} isPlaying={isPlaying} audioRef={audioRef}
          accent={accent} accent2={accent2} lyric={lyric} analyser={analyserRef}
          onTogglePlay={togglePlay} onNext={playNext} onExit={() => toggleMini(false)}
        />
      </div>
    )
  }

  return (
    <div style={{ '--accent': accent, '--accent2': accent2, ...styles.root }}>
      {ambientArt && <img src={ambientArt} alt="" aria-hidden style={styles.ambient} key={ambientArt} />}
      {ambientArt && <div style={styles.ambientVeil} aria-hidden />}
      <div style={styles.titleBar}>
        <span style={styles.appName}><Icon name="headphones" size={17} color={accent} strokeWidth={2.2} /> Mood DJ</span>
        {moodConfig && <span style={{ ...styles.tag, background: `${accent}33`, color: accent }}>{moodConfig.mood_name}</span>}
        {favCount > 0 && <span style={styles.favTag} title="已接入你的 QQ音乐收藏，推荐会参考你的口味"><Icon name="heart" size={11} color="#f9a8d4" filled /> QQ收藏 {favCount}</span>}
        <button style={{ ...styles.likesBtn, ...styles.noDragBtn }} onClick={() => setShowLikes(true)} title="我在 app 里喜欢过的歌，点开可重听"><Icon name="heart" size={12} color="#f472b6" filled /> 我喜欢的 {likedCount}</button>
        <div style={styles.winCtrl}>
          <span style={styles.user} onClick={logout} title="退出登录">QQ音乐 ✕</span>
          <button style={styles.wBtn} onClick={() => setShowSetup(true)} title="设置 / API Key"><Icon name="settings" size={15} color="#9ca3af" /></button>
          <button style={styles.wBtn} onClick={() => toggleMini(true)} title="迷你播放器（置顶小窗）"><Icon name="maximize" size={13} color="#9ca3af" /></button>
          <button style={styles.wBtn} onClick={() => window.electronAPI.minimize()}>—</button>
          <button style={styles.wBtn} onClick={() => window.electronAPI.maximize()}>□</button>
          <button style={{ ...styles.wBtn, color: '#f87171' }} onClick={() => window.electronAPI.close()}>✕</button>
        </div>
      </div>

      <Visualizer moodConfig={vizMood} isPlaying={isPlaying} analyser={analyserRef} track={currentTrack} />

      {error && <div style={styles.errBanner} onClick={() => setError('')}>⚠️ {error} <span style={{ opacity: .5, fontSize: 11 }}>点击关闭</span></div>}

      {update && (
        <div style={{ ...styles.updateBanner, borderColor: `${accent}66` }}>
          {update.state === 'downloaded'
            ? <>🎉 新版本 v{update.version} 已就绪 <button style={{ ...styles.updateBtn, background: accent }} onClick={() => window.electronAPI.installUpdate()}>重启更新</button></>
            : update.state === 'downloading'
              ? <>⬇️ 正在下载新版本… {update.percent ?? 0}%</>
              : <>✨ 发现新版本 v{update.version}，下载中…</>}
        </div>
      )}

      <div style={styles.content}>
        <MoodInput onStart={startRadio} isLoading={isLoading} isActive={!!currentTrack} moodConfig={moodConfig} />
        <NowPlaying
          track={currentTrack}
          isPlaying={isPlaying}
          loadingTrack={loadingTrack}
          audioRef={audioRef}
          onNext={playNext}
          queueCount={queue.length}
          onTogglePlay={togglePlay}
          lyric={lyric}
          accent={accent}
          onVibe={adjustVibe}
          onDislike={dislikeCurrent}
          onSteer={steerRadio}
          onLike={likeCurrent}
        />
      </div>

      <DJAnnouncement text={announcement} visible={showAnnouncement} speak={djSpeak} audioRef={audioRef} />

      <div style={{ ...styles.toast, opacity: toast ? 1 : 0, transform: toast ? 'translate(-50%,0)' : 'translate(-50%,8px)' }}>{toast}</div>

      {showLikes && (
        <LikesPanel
          likedTracks={memoryRef.current.likedTracks}
          accent={accent}
          onClose={() => setShowLikes(false)}
          onPlayTrack={playLiked}
          onRemove={removeLiked}
          onPlayGroup={playGroup}
          onSyncQQ={syncLikesToQQ}
          onGenProfile={getLikesProfile}
          onGenGroups={getLikesGroups}
          initialProfile={memoryRef.current.likesCache?.profileSig === likesSig() ? memoryRef.current.likesCache.profile : null}
          initialGroups={memoryRef.current.likesCache?.groupsSig === likesSig() ? memoryRef.current.likesCache.groups : null}
        />
      )}
    </div>
  )
}

const styles = {
  root: { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', color: '#f9fafb', background: '#0a0a0a' },
  ambient: { position: 'fixed', inset: '-10%', width: '120%', height: '120%', objectFit: 'cover', filter: 'blur(46px) saturate(1.8) brightness(0.95)', opacity: 0.9, zIndex: 0, pointerEvents: 'none', transform: 'scale(1.1)', animation: 'ambientIn 1.1s ease' },
  ambientVeil: { position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 42%, rgba(10,10,10,0.04) 0%, rgba(10,10,10,0.42) 58%, rgba(10,10,10,0.82) 100%)' },
  titleBar: { height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 50, WebkitAppRegion: 'drag', userSelect: 'none' },
  appName: { fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 },
  tag: { fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500 },
  favTag: { fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500, background: 'rgba(244,114,182,0.15)', color: '#f9a8d4', display: 'inline-flex', alignItems: 'center', gap: 4 },
  winCtrl: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' },
  user: { fontSize: 12, color: '#6b7280', marginRight: 8, cursor: 'pointer' },
  wBtn: { width: 28, height: 22, background: 'rgba(255,255,255,0.07)', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  errBanner: { position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '8px 20px', borderRadius: 8, zIndex: 200, cursor: 'pointer', backdropFilter: 'blur(12px)', whiteSpace: 'nowrap' },
  content: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 24, alignItems: 'start', position: 'relative', zIndex: 10, overflowY: 'auto' },
  toast: { position: 'fixed', bottom: 96, left: '50%', transform: 'translate(-50%,8px)', background: 'rgba(10,10,10,0.9)', border: '1px solid rgba(255,255,255,0.12)', color: '#f9fafb', fontSize: 13, padding: '8px 18px', borderRadius: 20, zIndex: 300, pointerEvents: 'none', transition: 'opacity .25s, transform .25s', backdropFilter: 'blur(12px)' },
  updateBanner: { position: 'fixed', top: 48, left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,10,10,0.92)', border: '1px solid', color: '#f9fafb', fontSize: 13, padding: '8px 16px', borderRadius: 10, zIndex: 250, display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(12px)', whiteSpace: 'nowrap' },
  updateBtn: { padding: '5px 12px', borderRadius: 8, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  noDragBtn: { WebkitAppRegion: 'no-drag' },
  likesBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 11px', borderRadius: 20, fontWeight: 600, background: 'rgba(244,114,182,0.14)', color: '#f9a8d4', border: '1px solid rgba(244,114,182,0.3)', cursor: 'pointer' },
}
