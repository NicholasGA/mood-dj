import { useState, useEffect, useRef, useCallback } from 'react'
import Onboarding from './components/Onboarding'
import MoodInput from './components/MoodInput'
import Visualizer from './components/Visualizer'
import LiquidBackground from './components/LiquidBackground'
import DJAnnouncement from './components/DJAnnouncement'
import MiniPlayer from './components/MiniPlayer'
import NicheDock from './components/NicheDock'
import NowPlayingBento from './components/NowPlayingBento'
import Icon from './components/Icon'
import { searchTracks, getSongUrl, getLyric, searchPlaylists, getPlaylistTracks, searchByArtist } from './services/qqMusicApi'
import { analyzeMood, generateStory, curateTracks, interpretRequest, recommendSongs, configureLLM, hasLLMKey, analyzeTaste, generatePersona, configurePersona, getPersona } from './services/claudeDJ'
import { localStory, localMoodConfig } from './services/djText'
import { greeting, localPersona, vibeReaction } from './services/djPersona'
import { effectiveVolume, clampVol } from './services/audioVolume'
import { glassSoft } from './ui/surface'
import { freshen, pushRecent, removeAt, moveToFront, pushHistory } from './services/radio'
import QueuePanel from './components/QueuePanel'
import MoodSwitcher from './components/MoodSwitcher'
import SongSearch from './components/SongSearch'
import { keyToAction } from './services/shortcuts'
import { remainingLabel, sleepVolume, nextDuration } from './services/sleepTimer'
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
  const [dockMode, setDockMode] = useState(false)        // 壁龛模式：可拖动的悬浮唱片球
  const [dockExpanded, setDockExpanded] = useState(false)
  const [favCount, setFavCount] = useState(0)   // 已接入的 QQ收藏数（仅用于 UI 提示）
  const [favPlaylists, setFavPlaylists] = useState([])   // 我的歌单（我喜欢 + 自建 + 收藏的）供"找歌·我的收藏"浏览
  const [likedCount, setLikedCount] = useState(0)   // 本地喜欢数量（喂口味，不再单独展示面板）
  const [tasteProfile, setTasteProfile] = useState(null)   // AI 音乐画像，无感呈现在主界面
  const [showQueue, setShowQueue] = useState(false)   // 播放队列面板
  const [showPicker, setShowPicker] = useState(false)   // 播放中点"换心情"→ 回到选心情
  const [moodPopAt, setMoodPopAt] = useState(null)      // 播放中点心情名 → 在点击处弹换心情小浮窗(右键菜单式)
  const [showSearch, setShowSearch] = useState(false)   // 按歌名搜歌面板（和"跟 DJ 说想法"分开）
  const [maximized, setMaximized] = useState(false)     // 最大化时去掉窗口圆角
  const [repeatOne, setRepeatOne] = useState(false)     // 单曲循环：放完重头放本首，不续下一首
  const repeatOneRef = useRef(repeatOne)                // 给 onEnded 闭包读最新值
  const [favMids, setFavMids] = useState(() => new Set())   // "我喜欢"全部 mid（标已收藏/新歌）
  const [sleepMin, setSleepMin] = useState(0)   // 睡眠定时（分钟，0=关）
  const [sleepLeft, setSleepLeft] = useState('')   // 剩余 mm:ss
  const sleepEndRef = useRef(0)
  const sleepBaseVolRef = useRef(1)
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

  const audioRef = useRef(null)
  if (!audioRef.current) audioRef.current = new Audio()   // 懒建一次，避免每次 render 都 new Audio()
  const queueRef = useRef([])
  const currentTrackRef = useRef(null)
  const moodConfigRef = useRef(null)
  const qqCookiesRef = useRef(null)
  const isAdvancingRef = useRef(false)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const radioRef = useRef(null)        // 当前电台上下文：{ queries, playlistIds, seen }，用于无限补歌
  const replenishPromiseRef = useRef(null)   // 进行中的补歌 promise（合并并发调用，避免竞态）
  const favMidsRef = useRef(new Set())       // favMids 的 ref 镜像（供补歌等回调读最新值）
  const favRef = useRef(null)          // 用户收藏：{ playlistIds, topArtists, sample, favCount }
  const memoryRef = useRef({ likedTracks: [], dislikedArtists: [] })   // 跨会话口味记忆
  const saveMemory = useCallback(() => { window.electronAPI.storeMemory(memoryRef.current) }, [])
  const lastSpokeRef = useRef(0)         // 上次语音播报时间（节流，文字每首都显示）
  const [djSpeak, setDjSpeak] = useState(false)   // 本次播报是否出声

  // 音量唯一真源：用户音量(userVolRef) × DJ 说话压低(duckRef)。改音量随时生效、
  // 不会被"快照-恢复"覆盖（修复：调过音量过一会儿被拉回默认的 bug）。
  const userVolRef = useRef(0.8)
  const duckRef = useRef(false)
  const [volume, setVolume] = useState(0.8)   // 仅供滑块显示
  const applyVolume = useCallback(() => {
    const a = audioRef.current
    if (a) a.volume = effectiveVolume(userVolRef.current, duckRef.current)
  }, [])
  const setUserVolume = useCallback((v) => {
    userVolRef.current = clampVol(v)
    setVolume(userVolRef.current)
    applyVolume()
  }, [applyVolume])
  const duckForSpeech = useCallback((on) => { duckRef.current = !!on; applyVolume() }, [applyVolume])

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
  useEffect(() => { repeatOneRef.current = repeatOne }, [repeatOne])
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

  // 载入应用配置（API key 等），覆盖默认值。onboarded=用户已走过引导(哪怕没填 key，用本地兜底)
  useEffect(() => {
    window.electronAPI.getConfig().then(cfg => {
      if (cfg) configureLLM(cfg)
      setLlmReady(hasLLMKey() || !!cfg?.onboarded)
    }).catch(() => setLlmReady(hasLLMKey()))
  }, [])

  // 自动更新状态
  useEffect(() => { window.electronAPI.onUpdateStatus?.(setUpdate) }, [])

  // 窗口最大化状态（决定要不要圆角）
  useEffect(() => { window.electronAPI.onWinState?.(s => setMaximized(!!s?.maximized)) }, [])
  useEffect(() => { favMidsRef.current = favMids }, [favMids])   // 同步给 ref，补歌回调读最新

  // 载入"我喜欢"全部 mid（标已收藏/新歌）。先用本地缓存，缓存缺失或超 24h 才后台重拉
  useEffect(() => {
    if (!qqCookies) return
    let cancelled = false
    let cached = null
    try { cached = JSON.parse(localStorage.getItem('mooddj-fav-mids') || 'null') } catch {}
    if (cached?.mids?.length) setFavMids(new Set(cached.mids))
    const stale = !cached?.mids?.length || (Date.now() - (cached.ts || 0)) > 24 * 3600 * 1000
    if (stale) {
      window.electronAPI.getQQFavoriteMids?.().then(res => {
        if (cancelled || !res?.mids?.length) return
        setFavMids(new Set(res.mids))
        try { localStorage.setItem('mooddj-fav-mids', JSON.stringify({ favCount: res.favCount, mids: res.mids, ts: Date.now() })) } catch {}
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [qqCookies])

  // 拉取/刷新 QQ 收藏（"我喜欢"等）：更新个性化样本 + 左上角收藏数
  const refreshFavCount = useCallback(() => {
    window.electronAPI.getQQFavorites().then(f => {
      if (f && (f.sample?.length || f.playlistIds?.length)) {
        favRef.current = f
        setFavCount(f.favCount || f.sample?.length || 0)
        setFavPlaylists(f.playlists || [])
      }
    }).catch(() => {})
  }, [])
  // 登录后拉取，用于个性化推荐
  useEffect(() => {
    if (!qqCookies) { favRef.current = null; setFavCount(0); return }
    refreshFavCount()
  }, [qqCookies, refreshFavCount])

  // AI 音乐画像：无感呈现在主界面。优先 QQ「我喜欢」样本（更代表你），否则 app 喜欢。
  // 命中持久化就不调；AI 不可用(配额/网络)时用本地"常听歌手"兜底，保证这行一定有。
  useEffect(() => {
    if (tasteProfile || !qqCookies) return
    if (memoryRef.current.homeProfile) { setTasteProfile(memoryRef.current.homeProfile); return }
    const sample = favRef.current?.sample || []
    const pool = sample.length >= 8 ? sample : memoryRef.current.likedTracks
    if (!pool || pool.length < 3) return
    const local = () => {
      const arts = favRef.current?.topArtists?.length ? favRef.current.topArtists : likedArtists()
      return arts.length ? { personality: `常听 ${arts.slice(0, 3).join('、')}，品味挺有一套`, genres: [], moods: [], artists: arts.slice(0, 4), explore: '' } : null
    }
    analyzeTaste(pool)
      .then(p => {
        if (p?.personality) { memoryRef.current.homeProfile = p; saveMemory(); setTasteProfile(p) }  // 真画像才持久化
        else { const l = local(); if (l) setTasteProfile(l) }
      })
      .catch(() => { const l = local(); if (l) setTasteProfile(l) })   // AI 不可用(配额/网络) → 本地兜底，不持久化，下次有配额再生成真画像
  }, [favCount, qqCookies, tasteProfile])

  // 固定 DJ 人格（护城河：会记得你的 DJ）：持久化命中→回填；否则据口味生成一次并存住。
  // 本地人格立刻兜底保证一定有"人"，AI 真人格成功才覆盖持久化（留余地以后升级）。
  useEffect(() => {
    const mem = memoryRef.current
    if (mem.djPersona?.name) { configurePersona(mem.djPersona); return }
    const arts = [...new Set([...(favRef.current?.topArtists || []), ...likedArtists()])]
    const seed = tasteProfile || (arts.length ? { artists: arts } : null)
    configurePersona(localPersona(seed || []))   // 立刻有人格可用
    if (!seed) return                            // 还没口味信号 → 先用默认，不持久化
    generatePersona(seed).then(p => {
      if (p?.name && p.source === 'ai') { mem.djPersona = p; saveMemory(); configurePersona(p) }
      else if (p?.name) configurePersona(p)      // 本地人格：用但不持久化，等有 API 再生成真人格
    }).catch(() => {})
  }, [tasteProfile, favCount])

  // 启动问候（本地，零 API）：人格 + 时段 + 上次到访 → 一句"会记得你"的开场。进主界面一次。
  const greetedRef = useRef(false)
  useEffect(() => {
    if (greetedRef.current || !qqCookies || !llmReady) return
    greetedRef.current = true
    const mem = memoryRef.current
    const persona = getPersona() || localPersona([])
    const line = greeting(persona, Date.now(), mem.lastSeen || null)
    mem.lastSeen = Date.now(); saveMemory()
    setAnnouncement(line); setShowAnnouncement(true)
    setTimeout(() => setShowAnnouncement(false), 5200)
  }, [qqCookies, llmReady])

  // 当前播放回传托盘 → 隐藏到后台时 tooltip 也显示在放什么
  useEffect(() => {
    window.electronAPI.notifyNowPlaying?.(currentTrack ? { name: currentTrack.name, artist: currentTrack.artists?.map(a => a.name).join('/') || '' } : null)
  }, [currentTrack])

  // 全局键盘快捷键：空格 播放/暂停、→ 下一首、← 快退5s、↑↓ 音量、L 喜欢、M 静音（输入框内不拦截）
  useEffect(() => {
    const onKey = (e) => {
      const a = keyToAction(e)
      if (!a) return
      const audio = audioRef.current
      if (a === 'playpause') { if (audio?.src) { e.preventDefault(); audio.paused ? audio.play() : audio.pause() } }
      else if (a === 'next') { e.preventDefault(); playNext() }
      else if (a === 'seekback') { if (audio) audio.currentTime = Math.max(0, audio.currentTime - 5) }
      else if (a === 'volup') { e.preventDefault(); setUserVolume(userVolRef.current + 0.1) }
      else if (a === 'voldown') { e.preventDefault(); setUserVolume(userVolRef.current - 0.1) }
      else if (a === 'like') likeCurrent()
      else if (a === 'mute') { if (audio) audio.muted = !audio.muted }
    }
    window.addEventListener('keydown', onKey)
    // 托盘菜单 / 系统挂起发来的指令（和键盘共用 playNext/audio 闭包，同样靠事件触发时读取，规避 TDZ）
    const onTray = (action) => {
      const audio = audioRef.current
      if (action === 'playpause') { if (audio?.src) audio.paused ? audio.play() : audio.pause() }
      else if (action === 'next') playNext()
      else if (action === 'pause') audio?.pause?.()
    }
    window.electronAPI.onTrayControl?.(onTray)
    return () => window.removeEventListener('keydown', onKey)
  }, [])   // 不放 playNext 进依赖：它是后面定义的 const，会触发 TDZ；闭包在事件触发时读取即可

  // 睡眠定时：循环 关→15→30→60 分钟；到点前 15s 渐降音量、到点暂停并恢复音量
  function cycleSleep() {
    const next = nextDuration(sleepMin)
    setSleepMin(next)
    if (!next) { sleepEndRef.current = 0; setSleepLeft(''); showToast('已关闭睡眠定时') }
    else {
      sleepEndRef.current = Date.now() + next * 60000
      sleepBaseVolRef.current = userVolRef.current   // 以用户音量为基准淡出
      showToast(`😴 ${next} 分钟后淡出停止`)
    }
  }
  useEffect(() => {
    if (!sleepMin) { setSleepLeft(''); return }
    const id = setInterval(() => {
      const remaining = sleepEndRef.current - Date.now()
      const audio = audioRef.current
      if (remaining <= 0) {
        if (audio) { audio.pause(); applyVolume() }   // 恢复到用户音量，下次播放正常
        clearInterval(id); setSleepMin(0); setSleepLeft(''); showToast('😴 睡眠定时到，已暂停')
        return
      }
      if (audio) audio.volume = sleepVolume(remaining, sleepBaseVolRef.current, 15000)
      setSleepLeft(remainingLabel(remaining))
    }, 1000)
    return () => clearInterval(id)
  }, [sleepMin])

  // 播放队列面板操作
  function queuePlayAt(i) { const q = queueRef.current.slice(i); queueRef.current = q; setQueue(q); setShowQueue(false); playNext() }
  function queueToFront(i) { const q = moveToFront(queueRef.current, i); queueRef.current = q; setQueue(q) }
  function queueRemove(i) { const q = removeAt(queueRef.current, i); queueRef.current = q; setQueue(q) }
  function queueClear() { queueRef.current = []; setQueue([]); setShowQueue(false) }
  function playFromHistory(track) { if (!track?.mid) return; queueRef.current = [track, ...queueRef.current]; setQueue(queueRef.current); setShowQueue(false); playNext() }
  // 找歌面板：立即播 / 加入队列 / 整批播(随机听收藏)
  function playSearched(track) { if (!track?.mid) return; queueRef.current = [track, ...queueRef.current]; setQueue(queueRef.current); setShowSearch(false); playNext() }
  function queueSearched(track) { if (!track?.mid) return; queueRef.current = [...queueRef.current, track]; setQueue(queueRef.current); showToast(`已加入队列：${track.name}`) }
  function playList(tracks) { if (!tracks?.length) return; queueRef.current = tracks.filter(t => t?.mid); setQueue(queueRef.current); setShowSearch(false); playNext() }
  // 取某歌单的一页歌(渐进加载：先显首页、后台补全) → { tracks, total, hasMore }
  function loadPlaylistPage(id, begin) { return window.electronAPI.getQQPlaylistPage(id, begin, 100) }

  // 把一批歌导出成一个新 QQ 歌单（签名版接口）
  async function exportToQQ(tracks, label) {
    const ids = [...new Set((tracks || []).map(t => t.id).filter(Boolean))]
    if (!ids.length) { showToast('没有可导出的歌'); return }
    showToast('⏳ 正在新建 QQ 歌单…')
    const name = `Mood DJ · ${label || '电台'}`
    const dirId = await window.electronAPI.createQQPlaylist(name)
    if (!dirId) { showToast('建歌单失败（QQ 接口拒绝）'); return }
    const ok = await window.electronAPI.addSongsToQQPlaylist(dirId, ids)
    showToast(`✅ 已建歌单「${name}」，加入 ${ok}/${ids.length} 首`)
  }

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

  // 逃生通道：迷你/壁龛模式下按 Esc 一定能还原
  useEffect(() => {
    if (!miniMode && !dockMode) return
    const onKey = (e) => { if (e.key === 'Escape') { miniMode ? toggleMini(false) : toggleDock(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [miniMode, dockMode])

  // Set up audio element events
  useEffect(() => {
    const audio = audioRef.current
    applyVolume()   // 初始按用户音量(默认0.8)；不再硬设，避免覆盖用户值

    // 单曲循环：放完重头再放本首；否则续下一首（playNext 自带 isAdvancingRef 重入保护）
    const onEnded = () => {
      if (repeatOneRef.current) { const a = audioRef.current; if (a) { a.currentTime = 0; a.play().catch(() => {}) } return }
      playNext()
    }
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
      // 探索电台(ctx.excludeFav)：补歌也排除已收藏，保持整台都是你没听过的
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !ctx.seen.has(t.mid) && !disliked(t) && !(ctx.excludeFav && favMidsRef.current.has(t.mid))) { ctx.seen.add(t.mid); fresh.push(t) } }
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
          memoryRef.current.history = pushHistory(memoryRef.current.history || [], next, 100)       // 播放历史(新→旧)
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

  // 把 AI 推荐的具体歌（歌名-歌手）逐一在 QQ 搜出可播曲目，尽量按同名 + 同歌手匹配
  async function resolveRecommended(recs) {
    if (!recs?.length) return []
    const norm = (s) => (s || '').toLowerCase().replace(/[\s（）()【】[\]『』「」・·,，.。!！?？'"-]/g, '')
    const results = await Promise.allSettled(recs.map(r => searchTracks(qqCookiesRef.current, r.artist ? `${r.name} ${r.artist}` : r.name, 4, 1)))
    const out = [], seen = new Set()
    results.forEach((res, i) => {
      if (res.status !== 'fulfilled' || !res.value?.length) return
      const want = norm(recs[i].name), wa = norm(recs[i].artist)
      const nameMatch = (t) => { const tn = norm(t.name); return tn && want && (tn.includes(want) || want.includes(tn)) }
      const hit = res.value.find(t => nameMatch(t) && (() => { const ta = norm((t.artists || []).map(a => a.name).join('')); return !wa || !ta || ta.includes(wa) || wa.includes(ta) })())
        || res.value.find(nameMatch) || res.value[0]
      if (hit?.mid && !seen.has(hit.mid)) { seen.add(hit.mid); out.push(hit) }
    })
    return out
  }

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
      config.valence = valence  // 供「心情」bento 块显示情绪值
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

      // 0.5) AI 选歌（核心升级）：DJ 像歌单编辑那样推"具体的歌" → QQ 解析成可播，作高优先来源。
      // 比关键词搜出来的泛泛热门精准；AI 不可用/限流就跳过，靠下面关键词/歌单兜底。
      try {
        const recs = await recommendSongs(moodText, { genres: tasteProfile?.genres, artists: taste }, { n: 14 })
        add(await resolveRecommended(recs))
      } catch {}

      // 1) 单曲搜索（并发，翻较深页：避开第 1 页口水热门，更新鲜）
      ok(await Promise.allSettled(queries.map(q => searchTracks(qqCookiesRef.current, q, 15, 2 + Math.floor(Math.random() * 6)))))

      // 2) 歌单源（并发）：搜人工歌单 → 挑歌量充足的几个 → 捞歌进池
      const plLists = await Promise.allSettled((config.search_queries || []).slice(0, 2).map(q => searchPlaylists(qqCookiesRef.current, q, 6)))
      const picked = []
      plLists.forEach(r => r.status === 'fulfilled' && r.value.slice(0, 3).forEach(p => { if (!picked.includes(p.id)) picked.push(p.id) }))
      // 3) 你的收藏歌单也并入来源（无限补歌时会从你的收藏里继续捞）
      const playlistIds = [...picked.slice(0, 4), ...(fav?.playlistIds || []).slice(0, 3)]
      ok(await Promise.allSettled(playlistIds.map(id => getPlaylistTracks(qqCookiesRef.current, id, 50))))

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
    isPlaying ? audio.pause() : audio.play().catch(() => {})   // 自动播放策略拒绝时别变成未捕获 rejection
  }

  function toggleMini(on) {
    window.electronAPI.setMini(on)
    setMiniMode(on)
  }

  // 壁龛模式：进/出；点击悬浮球展开/收起（主进程改窗尺寸，渲染层 CSS 缩放）
  function toggleDock(on) {
    window.electronAPI.setDock?.(on)
    setDockMode(on)
    if (!on) setDockExpanded(false)
  }
  function onDockToggle(expand) {
    setDockExpanded(expand)
    window.electronAPI.dockExpand?.(expand)
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
      // DJ 出声反应（文字、不出声 → 不打扰音乐）：让换味道像"人"在回应你
      const dir = mode === 'up' ? 'energetic' : mode === 'down' ? 'chill' : 'default'
      setDjSpeak(false)
      setAnnouncement(vibeReaction(getPersona(), dir)); setShowAnnouncement(true)
      setTimeout(() => setShowAnnouncement(false), 3200)
    } finally { setLoadingTrack(false) }
  }

  // 心情卡直接拖能量/情绪条 → 即时调味（只用 QQ 搜索按能量+情绪关键词重新偏置接下来的队列，不调 Gemini）
  async function setVibeManual(energy, valence) {
    const ctx = radioRef.current
    if (!ctx) return
    energy = Math.min(1, Math.max(0, energy)); valence = Math.min(1, Math.max(0, valence))
    ctx.energy = energy; ctx.valence = valence
    setMoodConfig(m => (m ? { ...m, energy, valence } : m))   // 先即时更新显示
    const eKey = energy > 0.62 ? '燃 快节奏 高能' : energy < 0.38 ? '安静 慢歌 舒缓' : ''
    const vKey = valence > 0.62 ? '快乐 明亮 温暖' : valence < 0.38 ? '忧郁 伤感 深情' : ''
    const extra = `${eKey} ${vKey}`.trim()
    if (!extra) { showToast(`心情：能量 ${Math.round(energy * 100)} · 情绪 ${Math.round(valence * 100)}`); return }  // 都在中段=不偏置，只更新显示
    setLoadingTrack(true)
    try {
      const fresh = []
      const disliked = (t) => ctx.disliked && (t.artists || []).some(a => ctx.disliked.has(a.name))
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !ctx.seen.has(t.mid) && !disliked(t)) { ctx.seen.add(t.mid); fresh.push(t) } }
      await Promise.allSettled((ctx.queries || []).slice(0, 4).map(q =>
        searchTracks(qqCookiesRef.current, `${q} ${extra}`, 15, 2 + Math.floor(Math.random() * 6)).then(add).catch(() => {})))
      let picked = freshen(fresh, new Set(memoryRef.current.recentMids || []), { maxPer: 2, min: 5 })
      picked.sort(() => Math.random() - 0.5)
      if (picked.length) { queueRef.current = [...picked, ...queueRef.current]; setQueue(queueRef.current) }  // 贴合新心情的歌排到前面，不清空原队列
      showToast(`心情已调：能量 ${Math.round(energy * 100)} · 情绪 ${Math.round(valence * 100)}`)
    } finally { setLoadingTrack(false) }
  }

  // 「接下来」换一批：用当前电台关键词重新搜一批同心情的全新歌，替换接下来的队列（当前播放不变）
  async function shuffleUpNext() {
    const ctx = radioRef.current
    if (!ctx) return
    setLoadingTrack(true)
    try {
      const fresh = []
      const disliked = (t) => ctx.disliked && (t.artists || []).some(a => ctx.disliked.has(a.name))
      const add = (arr) => { for (const t of arr || []) if (t?.mid && !ctx.seen.has(t.mid) && !disliked(t)) { ctx.seen.add(t.mid); fresh.push(t) } }
      await Promise.allSettled((ctx.queries || []).slice(0, 4).map(q =>
        searchTracks(qqCookiesRef.current, q, 15, 2 + Math.floor(Math.random() * 6)).then(add).catch(() => {})))
      let picked = freshen(fresh, new Set(memoryRef.current.recentMids || []), { maxPer: 2, min: 5 })
      picked.sort(() => Math.random() - 0.5)
      if (!picked.length) { showToast('没找到更多，再试一次'); return }
      queueRef.current = picked; setQueue(picked)
      showToast('🔀 接下来换了一批')
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
    // 已在 QQ 收藏就别重复收藏，只提示；否则本地加入 +（去重后）同步到 QQ我喜欢
    if (favMids.has(cur.mid)) {
      showToast('❤️ 这首已经在你的 QQ 收藏里啦')
    } else {
      showToast('❤️ 已加入「我喜欢的」')
      if (cur.id) window.electronAPI.addQQFavorite(Number(cur.id)).then(ok => {
        if (ok) { showToast('❤️ 已同步到 QQ 我喜欢'); refreshFavCount(); setFavMids(prev => new Set(prev).add(cur.mid)) }
      }).catch(() => {})
    }
  }

  // 从喜欢的歌里统计常听歌手，作为口味信号
  const likedArtists = () => {
    const c = {}
    memoryRef.current.likedTracks.forEach(t => (t.artists || []).forEach(a => { c[a.name] = (c[a.name] || 0) + 1 }))
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n)
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
      const tasteHint = { genres: tasteProfile?.genres, artists: [...new Set([...(favRef.current?.topArtists || []), ...likedArtists()])] }
      try { intent = await interpretRequest(t, tasteHint) }
      catch { intent = { mode: 'normal', artists: [], keywords: [t], mood_name: t.slice(0, 6) || '点歌', dj_intro: '好嘞，换个味道~' } }
      const discover = intent.mode === 'discover'   // 想听没听过的 → 排除我收藏过的、翻深页挖新
      const favorite = intent.mode === 'favorite'   // 想听我收藏的 → 从我喜欢里捞
      ctx.excludeFav = discover   // 让后续无限补歌也保持"只给没收藏过的"
      // 只改名字/回应，配色保留（不突兀）
      setMoodConfig(m => ({ ...(m || {}), mood_name: intent.mood_name, mood_emoji: m?.mood_emoji || '🎙️', dj_intro: intent.dj_intro, energy: E }))
      setAnnouncement(intent.dj_intro); setShowAnnouncement(true); setTimeout(() => setShowAnnouncement(false), 6000)

      const pool = []
      const disliked = (x) => ctx.disliked && (x.artists || []).some(a => ctx.disliked.has(a.name))
      // 探索模式：额外排除已在「我喜欢」里的歌，真正只给你没收藏过的
      const add = (arr) => { for (const x of arr || []) if (x?.mid && !ctx.seen.has(x.mid) && !disliked(x) && !(discover && favMids.has(x.mid))) { ctx.seen.add(x.mid); pool.push(x) } }

      if (favorite) {
        // 想听收藏的：直接把「我喜欢」样本 + 我喜欢歌单灌进来
        if (favRef.current?.sample?.length) add(favRef.current.sample)
        const myFav = favRef.current?.playlistIds?.[0]
        if (myFav) { try { await getPlaylistTracks(qqCookiesRef.current, myFav, 60, Math.floor(Math.random() * 3) * 60).then(add).catch(() => {}) } catch {} }
      } else {
        // AI 选歌（核心）：按这次需求 + 口味推"具体的歌" → QQ 解析（探索时挑冷门）。失败靠下面搜索兜底。
        try { add(await resolveRecommended(await recommendSongs(t, tasteHint, { n: 12, discover }))) } catch {}
      }
      // 点名歌手 → 搜本人（singer 过滤），翻两页
      for (const ar of intent.artists.slice(0, 3)) {
        ;(await Promise.allSettled([1, 2].map(p => searchByArtist(qqCookiesRef.current, ar, 20, p)))).forEach(r => r.status === 'fulfilled' && add(r.value))
      }
      // 关键词 → 曲风/心情搜索；探索时翻更深页，避开人人都听过的口水热门
      const kwPage = () => discover ? 3 + Math.floor(Math.random() * 8) : 1 + Math.floor(Math.random() * 3)
      ;(await Promise.allSettled((intent.keywords || []).map(q => searchTracks(qqCookiesRef.current, q, 15, kwPage())))).forEach(r => r.status === 'fulfilled' && add(r.value))
      // 没点歌手时，搜歌单补充变化（探索时专挑冷门/宝藏歌单）
      if (!intent.artists.length && !favorite) {
        try {
          const plQ = discover ? '小众 冷门 宝藏 私藏' : (intent.keywords?.[0] || t)
          const pls = await searchPlaylists(qqCookiesRef.current, plQ, 8)
          const ids = pls.slice(0, discover ? 3 : 2).map(p => p.id)
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
  // 呼吸/漂移周期：能量越高越快（约 5s~9s）。停播时放慢，像静息呼吸。
  const energy = isPlaying ? (moodConfig?.energy ?? 0.5) : 0.2
  const breath = `${(9 - energy * 4).toFixed(1)}s`

  // 迷你播放器模式：整窗渲染紧凑卡片（音频/状态共用，不中断播放）
  if (miniMode) {
    return (
      <div style={{ '--accent': accent, position: 'fixed', inset: 0, background: 'linear-gradient(180deg, rgba(12,12,16,0.52), rgba(8,8,12,0.74))', overflow: 'hidden' }}>
        <MiniPlayer
          track={currentTrack} isPlaying={isPlaying} audioRef={audioRef}
          accent={accent} accent2={accent2} lyric={lyric} analyser={analyserRef}
          onTogglePlay={togglePlay} onNext={playNext} onExit={() => toggleMini(false)}
        />
      </div>
    )
  }

  // 壁龛模式：可拖动的悬浮唱片球，点击展开成播放面板
  if (dockMode) {
    return (
      <NicheDock
        track={currentTrack} isPlaying={isPlaying} audioRef={audioRef}
        accent={accent} accent2={accent2} lyric={lyric}
        expanded={dockExpanded} onToggle={onDockToggle}
        onTogglePlay={togglePlay} onNext={playNext} onVibe={adjustVibe}
        onExit={() => toggleDock(false)} onClose={() => window.electronAPI.close()}
      />
    )
  }

  return (
    <div style={{ '--accent': accent, '--accent2': accent2, '--breath': breath, ...styles.shell, padding: 0 }}>
    {/* 不透明实底窗口：直接铺满，无圆角/边框/外阴影的"浮起"处理（那些是为透明窗准备的） */}
    <div style={styles.root}>
      {ambientArt && <img src={ambientArt} alt="" aria-hidden style={styles.ambient} key={ambientArt} />}
      {ambientArt && <div style={styles.ambientVeil} aria-hidden />}
      <div style={{ ...styles.titleBar, WebkitAppRegion: maximized ? 'no-drag' : 'drag' }}>
        <span style={styles.appName}><Icon name="headphones" size={17} color={accent} strokeWidth={2.2} /> Mood DJ</span>
        {moodConfig && <span style={{ ...styles.tag, background: `${accent}33`, color: accent }}>{moodConfig.mood_name}</span>}
        {favCount > 0 && <span style={styles.favTag} title="已接入你的 QQ音乐收藏；❤️ 的歌会同步到这里，推荐与画像都参考它"><Icon name="heart" size={11} color="#f9a8d4" filled /> QQ收藏 {favCount}</span>}
        <div style={styles.winCtrl}>
          <span style={styles.user} onClick={logout} title="退出登录">QQ音乐 ✕</span>
          <button
            style={{ ...styles.wBtn, ...(sleepMin ? { width: 'auto', padding: '0 7px', gap: 3, color: accent } : {}), display: 'inline-flex', alignItems: 'center' }}
            onClick={cycleSleep}
            title="睡眠定时（关→15→30→60 分钟，到点淡出暂停）"
          >
            <Icon name="moon" size={14} color={sleepMin ? accent : '#9ca3af'} />
            {sleepMin ? <span style={{ fontSize: 10 }}>{sleepLeft || `${sleepMin}m`}</span> : null}
          </button>
          <button style={styles.wBtn} onClick={() => setShowSetup(true)} title="设置 / API Key"><Icon name="settings" size={15} color="#9ca3af" /></button>
          <button style={styles.wBtn} onClick={() => toggleDock(true)} title="壁龛模式（贴右边缘的常驻小条，hover 展开）"><Icon name="dock" size={14} color="#9ca3af" /></button>
          <button style={styles.wBtn} onClick={() => toggleMini(true)} title="迷你播放器（置顶小窗）"><Icon name="maximize" size={13} color="#9ca3af" /></button>
          <button style={styles.wBtn} onClick={() => window.electronAPI.minimize()}>—</button>
          <button style={styles.wBtn} onClick={() => window.electronAPI.maximize()}>□</button>
          <button style={{ ...styles.wBtn, color: '#f87171' }} onClick={() => window.electronAPI.close()}>✕</button>
        </div>
      </div>

      <Visualizer moodConfig={vizMood} isPlaying={isPlaying} analyser={analyserRef} track={currentTrack} />
      <LiquidBackground accent={accent} accent2={accent2} track={currentTrack} intensity={currentTrack ? 1 : 0.7} />

      {error && <div style={styles.errBanner} onClick={() => setError('')}>⚠️ {error} <span style={{ opacity: .5, fontSize: 11 }}>点击关闭</span></div>}

      {update && (
        <div style={{ ...styles.updateBanner, borderColor: `${accent}66` }}>
          {update.state === 'downloaded'
            ? <>🎉 新版本 v{update.version} 已下载，即将自动重启更新… <button style={{ ...styles.updateBtn, background: accent }} onClick={() => window.electronAPI.installUpdate()}>立即重启</button></>
            : update.state === 'downloading'
              ? <>⬇️ 正在下载新版本… {update.percent ?? 0}%</>
              : <>✨ 发现新版本 v{update.version}，下载中…</>}
        </div>
      )}

      <div style={styles.content}>
        {currentTrack && !showPicker ? (
          /* 听歌时：bento 仪表盘 */
          <NowPlayingBento
            track={currentTrack} isPlaying={isPlaying} loadingTrack={loadingTrack} audioRef={audioRef}
            accent={accent} accent2={accent2}
            onTogglePlay={togglePlay} onNext={playNext} onLike={likeCurrent} onDislike={dislikeCurrent}
            onVibe={adjustVibe} onSteer={steerRadio} onOpenQueue={() => setShowQueue(true)} onPlayAt={queuePlayAt} onSetVibe={setVibeManual} onShuffleNext={shuffleUpNext} onOpenSearch={() => setShowSearch(true)}
            queueCount={queue.length} nextTrack={queue[0]} upNext={queue} lyric={lyric} moodConfig={moodConfig}
            story={memoryRef.current.songStories?.[currentTrack.mid] || localStory(currentTrack)}
            djName={getPersona()?.name} analyser={analyserRef} volume={volume} onVolume={setUserVolume}
            inFav={favMids.has(currentTrack.mid)}
            onRepick={(rect) => setMoodPopAt(rect)}
            repeatOne={repeatOne} onToggleRepeat={() => setRepeatOne(v => !v)}
          />
        ) : (
          /* 选心情：未开台，或播放中点了"换心情"。整屏 bento 心情选择器，居中 */
          <div style={styles.pickWrap}>
            {currentTrack && (
              <div style={styles.repickBar}>
                <button style={styles.backBtn} onClick={() => setShowPicker(false)}><Icon name="play" size={14} color={accent} filled /> 返回正在播放</button>
                <span style={styles.repickHint}>选个新心情会换一整台新歌单</span>
              </div>
            )}
            <MoodInput onStart={(t, e, v) => { setShowPicker(false); startRadio(t, e, v) }} isLoading={isLoading} isActive={!!currentTrack} moodConfig={moodConfig} taste={tasteProfile} />
          </div>
        )}
      </div>

      <DJAnnouncement text={announcement} visible={showAnnouncement} speak={djSpeak} onDuck={duckForSpeech} />

      <div style={{ ...styles.toast, opacity: toast ? 1 : 0, transform: toast ? 'translate(-50%,0)' : 'translate(-50%,8px)' }}>{toast}</div>

      {showQueue && (
        <QueuePanel
          queue={queue}
          history={memoryRef.current.history || []}
          accent={accent}
          onClose={() => setShowQueue(false)}
          onPlayAt={queuePlayAt}
          onToFront={queueToFront}
          onRemove={queueRemove}
          onClear={queueClear}
          onPlayHistory={playFromHistory}
          onExport={exportToQQ}
        />
      )}

      {showSearch && (
        <SongSearch
          accent={accent}
          playlists={favPlaylists}
          onSearch={(query) => searchTracks(qqCookiesRef.current, query, 20)}
          onLoadPage={loadPlaylistPage}
          onPlay={playSearched}
          onQueue={queueSearched}
          onPlayList={playList}
          onClose={() => setShowSearch(false)}
        />
      )}

      {moodPopAt && (
        <MoodSwitcher
          anchorRect={moodPopAt}
          accent={accent}
          accent2={accent2}
          seed={currentTrack?.mid || currentTrack?.name || 'mood'}
          isLoading={isLoading}
          onClose={() => setMoodPopAt(null)}
          onPick={(t, e, v) => { setMoodPopAt(null); startRadio(t, e, v) }}
        />
      )}
    </div>
    </div>
  )
}

const styles = {
  // 圆角窗口 + 半透明深色层 + 心情色辉光：壁纸隐约透出(无形感)，又压暗保证可读(氛围感)。
  // position:relative + overflow:hidden 让圆角能裁住里面的氛围背景/可视化。
  // shell = 整个透明窗口，留内边距让里面的卡片浮起来（带投影）；最大化时 padding 归 0
  shell: { height: '100vh', boxSizing: 'border-box', background: 'transparent' },
  root: { position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', color: '#f9fafb', background: 'radial-gradient(130% 90% at 50% -14%, color-mix(in srgb, var(--accent) 28%, transparent) 0%, transparent 54%), radial-gradient(120% 70% at 50% 116%, color-mix(in srgb, var(--accent2) 18%, transparent) 0%, transparent 50%), linear-gradient(180deg, #0c0c14 0%, #06060b 100%)' },
  // 专辑封面氛围背景：缓慢漂移呼吸，跟着音乐"活着"（absolute 以便被根节点圆角裁住）
  ambient: { position: 'absolute', inset: '-12%', width: '124%', height: '124%', objectFit: 'cover', filter: 'blur(52px) saturate(1.8) brightness(0.9)', opacity: 0.82, zIndex: 0, pointerEvents: 'none', animation: 'ambientIn 1.2s ease, drift var(--breath,7s) ease-in-out infinite' },
  ambientVeil: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 42%, rgba(9,9,12,0.02) 0%, rgba(9,9,12,0.40) 58%, rgba(7,7,11,0.84) 100%)' },
  titleBar: { ...glassSoft, height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 11, flexShrink: 0, zIndex: 50, WebkitAppRegion: 'drag', userSelect: 'none' },
  appName: { fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 },
  tag: { fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500 },
  favTag: { fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500, background: 'rgba(244,114,182,0.15)', color: '#f9a8d4', display: 'inline-flex', alignItems: 'center', gap: 4 },
  winCtrl: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' },
  user: { fontSize: 12, color: '#6b7280', marginRight: 8, cursor: 'pointer' },
  wBtn: { width: 30, height: 26, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', color: '#9ca3af', fontSize: 11, cursor: 'pointer', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  errBanner: { position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)', background: 'rgba(60,16,16,0.92)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '8px 20px', borderRadius: 8, zIndex: 200, cursor: 'pointer', whiteSpace: 'nowrap' },
  content: { flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: 24, position: 'relative', zIndex: 10, overflowY: 'auto' },
  cardRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' },
  pickWrap: { width: '100%', maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 },
  repickBar: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#f3f4f6', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  repickHint: { fontSize: 12.5, color: '#9ca3af', lineHeight: 1.5, margin: 0 },
  toast: { position: 'fixed', bottom: 96, left: '50%', transform: 'translate(-50%,8px)', background: 'rgba(12,12,16,0.94)', border: '1px solid rgba(255,255,255,0.12)', color: '#f9fafb', fontSize: 13, padding: '8px 18px', borderRadius: 20, zIndex: 300, pointerEvents: 'none', transition: 'opacity .25s, transform .25s' },
  updateBanner: { position: 'fixed', top: 48, left: '50%', transform: 'translateX(-50%)', background: 'rgba(12,12,16,0.95)', border: '1px solid', color: '#f9fafb', fontSize: 13, padding: '8px 16px', borderRadius: 10, zIndex: 250, display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' },
  updateBtn: { padding: '5px 12px', borderRadius: 8, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  noDragBtn: { WebkitAppRegion: 'no-drag' },
  likesBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 11px', borderRadius: 20, fontWeight: 600, background: 'rgba(244,114,182,0.14)', color: '#f9a8d4', border: '1px solid rgba(244,114,182,0.3)', cursor: 'pointer' },
}
