import { useState, useEffect, useRef, useCallback } from 'react'
import AuthScreen from './components/AuthScreen'
import MoodInput from './components/MoodInput'
import NowPlaying from './components/NowPlaying'
import Visualizer from './components/Visualizer'
import DJAnnouncement from './components/DJAnnouncement'
import { searchTracks, getSongUrl } from './services/qqMusicApi'
import { analyzeMood, generateAnnouncement, curateTracks } from './services/claudeDJ'

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
  const [error, setError] = useState('')

  const audioRef = useRef(new Audio())
  const queueRef = useRef([])
  const currentTrackRef = useRef(null)
  const moodConfigRef = useRef(null)
  const qqCookiesRef = useRef(null)
  const isAdvancingRef = useRef(false)

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { moodConfigRef.current = moodConfig }, [moodConfig])
  useEffect(() => { qqCookiesRef.current = qqCookies }, [qqCookies])

  // Load stored QQ cookies on startup
  useEffect(() => {
    window.electronAPI.getQQCookies().then(c => { if (c?.length) setQQCookies(c) })
  }, [])

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

  const showDJ = useCallback(async (next) => {
    try {
      // TTS 由 DJAnnouncement 统一负责；这里只产出文案与显隐
      const text = await generateAnnouncement(currentTrackRef.current, next, moodConfigRef.current?.mood_name || '未知')
      if (!text) return // 冷却期返回空串时不弹空气泡
      setAnnouncement(text)
      setShowAnnouncement(true)
      setTimeout(() => setShowAnnouncement(false), 6000)
    } catch { /* non-critical */ }
  }, [])

  // 加载并播放单首；地址已在主进程校验过可播，拿不到地址会抛错
  const playTrack = useCallback(async (track) => {
    const url = await getSongUrl(qqCookiesRef.current, track.mid, track.media_mid)
    audioRef.current.src = url
    audioRef.current.load()
    await audioRef.current.play()
  }, [])

  // 从队列依次试播，自动跳过需 VIP / 无版权的歌，直到放出一首或试完
  const playNext = useCallback(async () => {
    if (isAdvancingRef.current) return
    isAdvancingRef.current = true
    setLoadingTrack(true)
    try {
      const q = [...queueRef.current]
      const hadTracks = q.length > 0
      let tried = 0
      while (q.length > 0 && tried < 15) {
        tried++
        const next = q.shift()
        try {
          await playTrack(next)
          showDJ(next)            // 此时 currentTrackRef 仍是上一首，作为"刚播"
          setCurrentTrack(next)
          setQueue(q)
          setError('')
          return
        } catch { /* 这首放不了，试下一首 */ }
      }
      // 走到这里：队列空了
      setQueue([])
      setCurrentTrack(null)
      setIsPlaying(false)
      if (hadTracks) setError('这批歌大多需要 QQ音乐 VIP 或暂无版权，换个心情描述、或登录 VIP 账号再试')
    } finally {
      isAdvancingRef.current = false
      setLoadingTrack(false)
    }
  }, [showDJ, playTrack])

  async function startRadio(moodText, energy, valence) {
    setIsLoading(true); setError('')
    let shuffled = null
    try {
      let config
      try {
        config = await analyzeMood(moodText, energy, valence, 'qq')
      } catch {
        config = {
          mood_name: moodText.slice(0, 6) || '随心',
          search_queries: ['流行音乐', '好听的歌 轻快', '华语流行'],
          color_primary: '#31c27c', color_secondary: '#1db954',
          mood_emoji: '🎵', dj_intro: '音乐开始，感受当下~',
        }
      }
      setMoodConfig(config)
      setAnnouncement(config.dj_intro)
      setShowAnnouncement(true)
      setTimeout(() => setShowAnnouncement(false), 6000)

      const allTracks = [], seen = new Set()
      for (const q of config.search_queries) {
        const tracks = await searchTracks(qqCookies, q, 15)
        for (const t of tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTracks.push(t) }
        }
      }
      if (allTracks.length === 0) throw new Error('未找到匹配曲目，请换个描述')

      // AI 精排：按心情挑选+排序；失败则回退随机洗牌
      try {
        shuffled = await curateTracks(allTracks, config, energy, valence)
      } catch {
        shuffled = allTracks.sort(() => Math.random() - 0.5)
      }
      setQueue(shuffled)
      queueRef.current = shuffled   // 让 playNext 立即读到最新队列（state 更新是异步的）
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

  function logout() {
    audioRef.current.pause()
    audioRef.current.src = ''
    window.electronAPI.clearQQCookies()
    setQQCookies(null); setCurrentTrack(null); setQueue([]); setMoodConfig(null)
  }

  if (!qqCookies) {
    return <AuthScreen onQQAuth={setQQCookies} />
  }

  const accent = moodConfig?.color_primary || '#31c27c'
  const accent2 = moodConfig?.color_secondary || '#1db954'

  return (
    <div style={{ '--accent': accent, '--accent2': accent2, ...styles.root }}>
      <div style={styles.titleBar}>
        <span style={styles.appName}>Mood DJ {moodConfig?.mood_emoji || '🎵'}</span>
        {moodConfig && <span style={{ ...styles.tag, background: `${accent}33`, color: accent }}>{moodConfig.mood_name}</span>}
        <div style={styles.winCtrl}>
          <span style={styles.user} onClick={logout} title="退出登录">QQ音乐 ✕</span>
          <button style={styles.wBtn} onClick={() => window.electronAPI.minimize()}>—</button>
          <button style={styles.wBtn} onClick={() => window.electronAPI.maximize()}>□</button>
          <button style={{ ...styles.wBtn, color: '#f87171' }} onClick={() => window.electronAPI.close()}>✕</button>
        </div>
      </div>

      <Visualizer moodConfig={moodConfig} isPlaying={isPlaying} />

      {error && <div style={styles.errBanner} onClick={() => setError('')}>⚠️ {error} <span style={{ opacity: .5, fontSize: 11 }}>点击关闭</span></div>}

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
        />
      </div>

      <DJAnnouncement text={announcement} visible={showAnnouncement} />
    </div>
  )
}

const styles = {
  root: { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'system-ui,sans-serif', color: '#f9fafb', background: '#0a0a0a' },
  titleBar: { height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 50, WebkitAppRegion: 'drag', userSelect: 'none' },
  appName: { fontSize: 14, fontWeight: 700 },
  tag: { fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 500 },
  winCtrl: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, WebkitAppRegion: 'no-drag' },
  user: { fontSize: 12, color: '#6b7280', marginRight: 8, cursor: 'pointer' },
  wBtn: { width: 28, height: 22, background: 'rgba(255,255,255,0.07)', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', borderRadius: 4 },
  errBanner: { position: 'fixed', top: 44, left: '50%', transform: 'translateX(-50%)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, padding: '8px 20px', borderRadius: 8, zIndex: 200, cursor: 'pointer', backdropFilter: 'blur(12px)', whiteSpace: 'nowrap' },
  content: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, padding: 24, alignItems: 'start', position: 'relative', zIndex: 10, overflowY: 'auto' },
}
