import { useState, useEffect, useRef } from 'react'
import Lyrics from './Lyrics'
import Icon from './Icon'
import { vivid, vividDark, albumPalette } from '../ui/surface'

// 听歌仪表盘（bento）：把"正在播放"拆成有意义、画面填满的方块。
// 每块都是独立信息：正在播放 / 实时律动 / 心情 / 接下来 / DJ的故事 / 控制 / 歌词。

// 实时频谱小条（填满"律动"块，不再是空图标）
function MiniWave({ analyser, color, isPlaying }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf, t = 0
    const N = 32
    const buf = new Uint8Array(512)
    const draw = () => {
      raf = requestAnimationFrame(draw)
      t += 0.05
      const w = canvas.width = canvas.clientWidth * 2
      const h = canvas.height = canvas.clientHeight * 2
      ctx.clearRect(0, 0, w, h)
      const an = analyser?.current
      let live = false
      if (an && isPlaying) { an.getByteFrequencyData(buf); live = true }
      const bw = w / N
      for (let i = 0; i < N; i++) {
        const v = live
          ? Math.pow(buf[Math.floor((i / N) * an.frequencyBinCount * 0.55)] / 255, 1.1)
          : 0.16 + 0.12 * (Math.sin(t + i * 0.5) * 0.5 + 0.5)   // 静止时的轻微待机波
        const bh = Math.max(3, v * h)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.45 + v * 0.55
        const x = i * bw + 1.5
        const r = Math.min((bw - 3) / 2, 3)
        ctx.beginPath()
        ctx.roundRect(x, h - bh, bw - 3, bh, r)
        ctx.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser, color, isPlaying])
  return <canvas ref={ref} style={{ width: '100%', height: 44, display: 'block' }} />
}

export default function NowPlayingBento({
  track, isPlaying, loadingTrack, audioRef, accent = '#31c27c', accent2 = '#4f46e5',
  onTogglePlay, onNext, onLike, onDislike, onVibe, onSteer, onOpenQueue,
  queueCount = 0, nextTrack, lyric, moodConfig, story, djName, analyser, volume = 0.8, onVolume, onRepick,
}) {
  const [progress, setProgress] = useState(0)
  const [dur, setDur] = useState(0)
  const [steerText, setSteerText] = useState('')
  const barRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    const update = () => { if (audio.duration && !draggingRef.current) setProgress(audio.currentTime / audio.duration) }
    const onMeta = () => setDur(audio.duration || 0)
    audio.addEventListener('timeupdate', update)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('timeupdate', update)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [audioRef])

  const ratioFromEvent = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }
  function onBarDown(e) {
    draggingRef.current = true
    setProgress(ratioFromEvent(e))
    const move = (ev) => setProgress(ratioFromEvent(ev))
    const up = (ev) => {
      draggingRef.current = false
      const audio = audioRef?.current
      if (audio?.duration) audio.currentTime = ratioFromEvent(ev) * audio.duration
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const fmt = (s) => { if (!s || !isFinite(s)) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}` }

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || (loadingTrack ? '正在加载…' : '—')
  const artist = track?.artists?.map(a => a.name).join(', ') || (loadingTrack ? '挑选可播放的歌曲' : '等待播放')
  const energy = moodConfig?.energy ?? 0.5
  const valence = moodConfig?.valence ?? 0.5
  const mood = moodConfig?.mood_name || '随心'
  const emoji = moodConfig?.mood_emoji || '🎧'
  const nextArt = nextTrack?.album?.images?.[0]?.url
  const dots = Math.min(queueCount, 9)
  const heroSurf = vivid(accent, accent2, 26)
  const pal = albumPalette(accent)   // 从专辑色推导的协调调色板（邻近色+补色）

  return (
    <div style={s.root}>
      {/* 正在播放（大卡，占满宽）。额外一团 accent 辉光向四周晕染，把卡缝进氛围背景 */}
      <div style={{ ...heroSurf, ...s.hero, boxShadow: `${heroSurf.boxShadow}, 0 20px 76px -18px color-mix(in srgb, ${accent} 55%, transparent)` }}>
        <div style={s.heroArtWrap} className={isPlaying ? 'floaty' : ''}>
          {art ? <img src={art} alt="" style={s.heroArt} draggable={false} />
               : <div style={{ ...s.heroArt, ...s.ph }}>🎵</div>}
        </div>
        <div style={s.heroMid}>
          <div style={s.heroTitle} title={title}>{title}</div>
          <div style={s.heroArtist}>{artist}</div>
          <div style={s.progRow}>
            <span style={{ ...s.time, ...s.timeBig, color: '#fff' }} className="led">{fmt(progress * dur)}</span>
            <div ref={barRef} style={s.bar} onPointerDown={onBarDown}>
              <div style={{ ...s.fill, width: `${progress * 100}%` }} />
              <div style={{ ...s.knob, left: `${progress * 100}%` }} />
            </div>
            <span style={{ ...s.time, color: 'rgba(255,255,255,0.85)' }} className="led">{fmt(dur)}</span>
          </div>
        </div>
        <div style={s.heroCtrl}>
          <button style={s.playBtn} onClick={onTogglePlay} title="播放/暂停"><Icon name={isPlaying ? 'pause' : 'play'} size={24} color={accent} filled /></button>
          <button style={s.nextBtn} onClick={onNext} title="下一首"><Icon name="next" size={18} color="#fff" filled /></button>
        </div>
      </div>

      {/* 四块 bento */}
      <div style={s.grid}>
        {/* 律动：实时频谱 + LED 能量（亮块，邻近暖移色，最跳） */}
        <div style={{ ...vivid(pal.energy, pal.energy, 20), ...s.tile }}>
          <div style={s.tLabel}>律动</div>
          <MiniWave analyser={analyser} color={`color-mix(in srgb, ${pal.energy} 50%, #ffffff)`} isPlaying={isPlaying} />
          <div style={s.tValRow}><span className="led" style={s.tLed}>{Math.round(energy * 100)}</span><span style={s.tUnit}>能量</span></div>
        </div>

        {/* 心情：名字 + emoji + 能量/情绪条 */}
        <div style={{ ...vivid(accent, accent2, 20), ...s.tile }}>
          <div style={s.tLabel}>心情</div>
          <div style={s.moodMain}><span style={s.moodEmoji}>{emoji}</span><span style={s.moodName}>{mood}</span></div>
          <div style={s.bars}>
            <Bar label="能量" v={energy} />
            <Bar label="情绪" v={valence} />
          </div>
        </div>

        {/* 接下来：下一首 + 队列点阵（暗块，近补色染色，和亮块拉开色相对比） */}
        <div style={{ ...vividDark(pal.next, 20), ...s.tile, cursor: 'pointer' }} onClick={onOpenQueue} title="查看/管理队列">
          <div style={s.tLabel}>接下来</div>
          <div style={s.nextRow}>
            {nextArt ? <img src={nextArt} alt="" style={s.nextThumb} draggable={false} /> : <div style={{ ...s.nextThumb, ...s.ph2 }}>♪</div>}
            <div style={s.nextInfo}>
              <div style={s.nextTitle} title={nextTrack?.name}>{nextTrack?.name || '自动续上…'}</div>
              <div style={s.nextArtist}>{nextTrack?.artists?.map(a => a.name).join(', ') || '无限电台'}</div>
            </div>
          </div>
          <div style={s.dotsRow}>
            {Array.from({ length: 9 }).map((_, i) => <span key={i} style={{ ...s.dot, opacity: i < dots ? 1 : 0.22 }} />)}
            <span style={s.queueNum}>{queueCount}</span>
          </div>
        </div>

        {/* DJ · 这首的故事（暗块，另一侧邻近色染色） */}
        <div style={{ ...vividDark(pal.dj, 20), ...s.tile }}>
          <div style={s.tLabel}>DJ · 这首的故事</div>
          <div style={s.djName}><Icon name="mic" size={13} color="#e9d5ff" /> {djName || '你的电台'}</div>
          <div style={s.story}>{story || '正在为这首歌写一句话…'}</div>
        </div>
      </div>

      {/* 控制条 */}
      <div style={s.controls}>
        <button style={{ ...s.pill, color: '#f9a8d4', borderColor: '#f472b640' }} onClick={onLike}><Icon name="heart" size={14} color="#f9a8d4" filled /> 喜欢</button>
        <button style={s.pill} onClick={onDislike}><Icon name="thumbsDown" size={14} color="#cbd5e1" /> 不喜欢</button>
        <span style={s.div} />
        <button style={s.pill} onClick={() => onVibe('up')}><Icon name="flame" size={14} color="#fb923c" /> 嗨</button>
        <button style={s.pill} onClick={() => onVibe('down')}><Icon name="moon" size={14} color="#93c5fd" /> 静</button>
        <button style={s.pill} onClick={() => onVibe('flavor')}><Icon name="shuffle" size={14} color="#c4b5fd" /> 换</button>
        <span style={s.div} />
        <button style={s.pill} onClick={onRepick} title="重新选心情/换台"><Icon name="refresh" size={14} color="#9ca3af" /> 换心情</button>
      </div>

      {/* 跟 DJ 说 + 音量 */}
      <div style={s.steerRow}>
        <span style={s.steerMic}><Icon name="mic" size={15} color="#9ca3af" /></span>
        <input style={s.steerInput} placeholder="跟 DJ 说…「放点周杰伦但安静的」" value={steerText}
          onChange={e => setSteerText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }} />
        <button style={{ ...s.steerBtn, background: accent, opacity: steerText.trim() ? 1 : 0.5 }} disabled={!steerText.trim()}
          onClick={() => { if (steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }}>换</button>
        <span style={s.volIcon}><Icon name="volume" size={15} color="#9ca3af" /></span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={e => onVolume?.(Number(e.target.value) / 100)} className="mood-slider" style={{ width: 90 }} />
      </div>

      {/* 歌词 */}
      {track && <div style={s.lyricWrap}><Lyrics lines={lyric?.lines || []} hasTrans={lyric?.hasTrans} audioRef={audioRef} accent={accent} /></div>}
    </div>
  )
}

function Bar({ label, v }) {
  return (
    <div style={s.barRow}>
      <span style={s.barLabel}>{label}</span>
      <div style={s.barTrack}><div style={{ ...s.barFill, width: `${Math.round(v * 100)}%` }} /></div>
    </div>
  )
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 14 },

  hero: { display: 'flex', alignItems: 'center', gap: 18, padding: '18px 22px' },
  heroArtWrap: { flexShrink: 0 },
  heroArt: { width: 92, height: 92, borderRadius: 16, objectFit: 'cover', display: 'block', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' },
  ph: { background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 },
  heroMid: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 19, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.4)' },
  heroArtist: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 2, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  progRow: { display: 'flex', alignItems: 'center', gap: 9 },
  time: { fontSize: 11, minWidth: 34, textAlign: 'center' },
  timeBig: { fontSize: 15, minWidth: 46 },
  bar: { position: 'relative', flex: 1, height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, cursor: 'pointer', touchAction: 'none' },
  fill: { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 3, background: '#fff', transition: 'width .12s linear' },
  knob: { position: 'absolute', top: '50%', width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.5)' },
  heroCtrl: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  playBtn: { width: 56, height: 56, borderRadius: '50%', background: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(0,0,0,0.35)' },
  nextBtn: { width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 },
  tile: { padding: '14px 16px', minHeight: 112, display: 'flex', flexDirection: 'column', gap: 8, color: '#fff', position: 'relative' },
  tLabel: { fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  tValRow: { display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 'auto' },
  tLed: { fontSize: 26, color: '#fff' },
  tUnit: { fontSize: 12, color: 'rgba(255,255,255,0.78)' },

  moodMain: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 },
  moodEmoji: { fontSize: 28 },
  moodName: { fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)' },
  bars: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 },
  barRow: { display: 'flex', alignItems: 'center', gap: 8 },
  barLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', width: 28, flexShrink: 0 },
  barTrack: { flex: 1, height: 6, background: 'rgba(0,0,0,0.28)', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', background: 'rgba(255,255,255,0.9)', borderRadius: 3 },

  nextRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  nextThumb: { width: 40, height: 40, borderRadius: 9, objectFit: 'cover', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
  ph2: { background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  nextInfo: { minWidth: 0, flex: 1 },
  nextTitle: { fontSize: 14, fontWeight: 600, color: '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nextArtist: { fontSize: 11.5, color: '#9fb3c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dotsRow: { display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#7dd3fc' },
  queueNum: { marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#bae6fd' },

  djName: { fontSize: 12.5, fontWeight: 600, color: '#e9d5ff', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 },
  story: { fontSize: 13, color: 'rgba(245,240,255,0.92)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' },

  controls: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' },
  div: { width: 1, height: 18, background: 'rgba(255,255,255,0.14)', margin: '0 2px' },

  steerRow: { display: 'flex', gap: 8, alignItems: 'center', position: 'relative' },
  steerMic: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' },
  steerInput: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '9px 12px 9px 34px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  steerBtn: { flexShrink: 0, padding: '0 16px', height: 36, borderRadius: 12, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  volIcon: { display: 'flex', flexShrink: 0, marginLeft: 4 },

  lyricWrap: { marginTop: 2 },
}
