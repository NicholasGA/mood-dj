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
  queueCount = 0, nextTrack, upNext = [], lyric, moodConfig, story, djName, analyser, volume = 0.8, onVolume, onRepick, inFav = false,
}) {
  const [cur, setCur] = useState(0)        // 当前播放秒数
  const [rawDur, setRawDur] = useState(0)  // audio.duration（QQ 流有时是 Infinity）
  const [dragRatio, setDragRatio] = useState(null)  // 拖动时的比例（覆盖显示）
  const [steerText, setSteerText] = useState('')
  const barRef = useRef(null)

  useEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    const onTime = () => setCur(audio.currentTime || 0)
    const onMeta = () => setRawDur(audio.duration || 0)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [audioRef])

  // 真实时长：audio.duration 有限就用它，否则退回 QQ 接口给的歌曲时长（修复进度一直 0:00）
  const effDur = (isFinite(rawDur) && rawDur > 0) ? rawDur : (track?.duration_ms || 0) / 1000
  const ratio = dragRatio != null ? dragRatio : (effDur > 0 ? Math.min(1, cur / effDur) : 0)

  const ratioFromEvent = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }
  function onBarDown(e) {
    setDragRatio(ratioFromEvent(e))
    const move = (ev) => setDragRatio(ratioFromEvent(ev))
    const up = (ev) => {
      const r = ratioFromEvent(ev)
      const audio = audioRef?.current
      if (audio && effDur > 0) audio.currentTime = r * effDur
      setDragRatio(null)
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
      <div style={s.body}>
        {/* 左栏：播放器 + 律动/心情 + 接下来 */}
        <div style={s.left}>
          {/* 正在播放（左栏顶，封面更大；accent 辉光晕进背景） */}
          <div key={track?.mid || title} className="song-pop pulse-glow" style={{ ...heroSurf, ...s.hero, boxShadow: `${heroSurf.boxShadow}, 0 20px 70px -20px color-mix(in srgb, ${accent} 50%, transparent), 0 0 calc(var(--pulse,0) * 60px) -12px color-mix(in srgb, ${accent} 80%, transparent)` }}>
            <div style={s.heroArtWrap} className={isPlaying ? 'floaty' : ''}>
              {art ? <img src={art} alt="" style={s.heroArt} className="pulse-art" draggable={false} />
                   : <div style={{ ...s.heroArt, ...s.ph }} className="pulse-art">🎵</div>}
            </div>
            <div style={s.heroMid}>
              <div style={s.heroTitle} title={title}>{title}</div>
              <div style={s.heroSub}>
                <span style={s.heroArtist}>{artist}</span>
                {track && (inFav
                  ? <span style={s.favYes} title="这首已在你的 QQ「我喜欢」里">♥ 已收藏</span>
                  : <span style={s.favNew} title="这是为你新推的歌，喜欢就收藏">✨ 新歌</span>)}
              </div>
              <div style={s.progRow}>
                <span style={{ ...s.time, ...s.timeBig, color: '#fff' }} className="led">{fmt(ratio * effDur)}</span>
                <div ref={barRef} style={s.bar} onPointerDown={onBarDown}>
                  <div style={{ ...s.fill, width: `${ratio * 100}%` }} />
                  <div style={{ ...s.knob, left: `${ratio * 100}%` }} />
                </div>
                <span style={{ ...s.time, color: 'rgba(255,255,255,0.85)' }} className="led">{fmt(effDur)}</span>
              </div>
              <div style={s.heroCtrl}>
                <button style={{ ...s.playBtn, boxShadow: `${s.playBtn.boxShadow}, 0 0 calc(var(--pulse,0) * 30px) color-mix(in srgb, ${accent} 85%, transparent)` }} onClick={onTogglePlay} title="播放/暂停"><Icon name={isPlaying ? 'pause' : 'play'} size={22} color={accent} filled /></button>
                <button style={s.nextBtn} onClick={onNext} title="下一首"><Icon name="next" size={17} color="#fff" filled /></button>
              </div>
            </div>
          </div>

          {/* 律动 | 心情 */}
          <div style={s.leftGrid}>
            <div style={{ ...vivid(pal.energy, pal.energy, 20), ...s.tile }}>
              <div style={s.tLabel}>律动</div>
              <MiniWave analyser={analyser} color={`color-mix(in srgb, ${pal.energy} 50%, #ffffff)`} isPlaying={isPlaying} />
              <div style={s.tValRow}><span className="led" style={s.tLed}>{Math.round(energy * 100)}</span><span style={s.tUnit}>能量</span></div>
            </div>
            <div style={{ ...vivid(accent, accent2, 20), ...s.tile }}>
              <div style={s.tLabel}>心情</div>
              <div style={s.moodMain}><span style={s.moodEmoji}>{emoji}</span><span style={s.moodName}>{mood}</span></div>
              <div style={s.bars}><Bar label="能量" v={energy} /><Bar label="情绪" v={valence} /></div>
            </div>
          </div>

          {/* 接下来：整条待播列表（撑满左栏剩余高度，可滚），点开管理队列 */}
          <div style={{ ...vividDark(pal.next, 20), ...s.tile, flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={onOpenQueue} title="查看/管理队列">
            <div style={s.upHead}><span style={s.tLabel}>接下来</span><span style={s.upCount}>{queueCount} 首待播</span></div>
            <div style={s.upList} className="lyrics-scroll">
              {upNext.slice(0, 30).map((t, i) => (
                <div key={t.mid || i} style={s.upRow}>
                  <span style={s.upNum}>{i + 1}</span>
                  {t.album?.images?.[0]?.url
                    ? <img src={t.album.images[0].url} alt="" style={s.upThumb} draggable={false} />
                    : <div style={{ ...s.upThumb, ...s.ph2 }}>♪</div>}
                  <div style={s.upInfo}>
                    <div style={s.upTitle} title={t.name}>{t.name}</div>
                    <div style={s.upArtist}>{t.artists?.map(a => a.name).join(', ') || ''}</div>
                  </div>
                </div>
              ))}
              {!upNext.length && <div style={s.upEmpty}>自动续上…无限电台</div>}
            </div>
          </div>
        </div>

        {/* 右栏：DJ 故事 + 歌词（撑满高度） */}
        <div style={s.right}>
          <div style={{ ...vividDark(pal.dj, 20), ...s.tile }}>
            <div style={s.tLabel}>DJ · 这首的故事</div>
            <div style={s.djName}><Icon name="mic" size={13} color="#e9d5ff" /> {djName || '你的电台'}</div>
            <div style={s.story}>{story || '正在为这首歌写一句话…'}</div>
          </div>
          <div style={{ ...vividDark(accent, 20), ...s.lyricTile }}>
            <div style={s.tLabel}>♪ 歌词</div>
            <Lyrics fill lines={lyric?.lines || []} hasTrans={lyric?.hasTrans} audioRef={audioRef} accent={accent} />
          </div>
        </div>
      </div>

      {/* 底部控制坞（全宽、不随歌词滚动） */}
      <div style={s.dock}>
        <button style={{ ...s.pill, ...(inFav ? s.pillFav : { color: '#f9a8d4', borderColor: '#f472b640' }) }} onClick={onLike} title={inFav ? '已在 QQ 收藏' : '加入 QQ 我喜欢'}><Icon name="heart" size={14} color="#fff" filled /> {inFav ? '已收藏' : '喜欢'}</button>
        <button style={s.pill} onClick={onDislike}><Icon name="thumbsDown" size={14} color="#cbd5e1" /> 不喜欢</button>
        <span style={s.div} />
        <button style={s.pill} onClick={() => onVibe('up')}><Icon name="flame" size={14} color="#fb923c" /> 嗨</button>
        <button style={s.pill} onClick={() => onVibe('down')}><Icon name="moon" size={14} color="#93c5fd" /> 静</button>
        <button style={s.pill} onClick={() => onVibe('flavor')}><Icon name="shuffle" size={14} color="#c4b5fd" /> 换</button>
        <div style={s.steerWrap}>
          <span style={s.steerMic}><Icon name="mic" size={15} color="#9ca3af" /></span>
          <input style={s.steerInput} placeholder="跟 DJ 说…「放点周杰伦但安静的」" value={steerText}
            onChange={e => setSteerText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }} />
          <button style={{ ...s.steerBtn, background: accent, opacity: steerText.trim() ? 1 : 0.5 }} disabled={!steerText.trim()}
            onClick={() => { if (steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }}>换</button>
        </div>
        <span style={s.volIcon}><Icon name="volume" size={15} color="#9ca3af" /></span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={e => onVolume?.(Number(e.target.value) / 100)} className="mood-slider" style={{ width: 80, flexShrink: 0 }} />
        <span style={s.div} />
        <button style={s.pill} onClick={onRepick} title="重新选心情/换台"><Icon name="refresh" size={14} color="#9ca3af" /> 换心情</button>
      </div>
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
  root: { display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 },
  body: { display: 'flex', gap: 14, flex: 1, minHeight: 0 },
  left: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  leftGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  right: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  lyricTile: { flex: 1, minHeight: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 4 },

  hero: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', flexShrink: 0 },
  heroArtWrap: { flexShrink: 0 },
  heroArt: { width: 104, height: 104, borderRadius: 16, objectFit: 'cover', display: 'block', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' },
  ph: { background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 },
  heroMid: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 19, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.4)' },
  heroSub: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, marginBottom: 10 },
  heroArtist: { fontSize: 13, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  favYes: { flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(244,114,182,0.24)', color: '#fce7f3', border: '1px solid rgba(244,114,182,0.45)' },
  favNew: { flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.22)' },
  progRow: { display: 'flex', alignItems: 'center', gap: 9 },
  time: { fontSize: 11, minWidth: 34, textAlign: 'center' },
  timeBig: { fontSize: 15, minWidth: 46 },
  bar: { position: 'relative', flex: 1, height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 3, cursor: 'pointer', touchAction: 'none' },
  fill: { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 3, background: '#fff', transition: 'width .12s linear' },
  knob: { position: 'absolute', top: '50%', width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.5)' },
  heroCtrl: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 },
  playBtn: { width: 48, height: 48, borderRadius: '50%', background: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(0,0,0,0.35)' },
  nextBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  tile: { padding: '14px 16px', minHeight: 108, display: 'flex', flexDirection: 'column', gap: 8, color: '#fff', position: 'relative' },
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

  ph2: { background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  upHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  upCount: { fontSize: 11.5, color: '#9fb3c8' },
  upList: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, paddingRight: 4 },
  upRow: { display: 'flex', alignItems: 'center', gap: 9 },
  upNum: { fontSize: 11, color: 'rgba(255,255,255,0.38)', width: 16, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  upThumb: { width: 34, height: 34, borderRadius: 7, objectFit: 'cover', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,0,0,0.4)' },
  upInfo: { minWidth: 0, flex: 1 },
  upTitle: { fontSize: 13, fontWeight: 500, color: '#e8edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upArtist: { fontSize: 11, color: '#9fb3c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upEmpty: { fontSize: 12.5, color: '#9fb3c8', padding: '8px 2px' },

  djName: { fontSize: 12.5, fontWeight: 600, color: '#e9d5ff', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 },
  story: { fontSize: 13, color: 'rgba(245,240,255,0.92)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' },

  // 底部控制坞：把分散的喜欢/调味/对话/音量/换心情收成一条，全宽常驻
  dock: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, paddingTop: 2 },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' },
  pillFav: { background: 'rgba(244,114,182,0.85)', border: '1px solid rgba(244,114,182,0.9)', color: '#fff' },
  div: { width: 1, height: 18, background: 'rgba(255,255,255,0.14)', margin: '0 2px' },
  steerWrap: { position: 'relative', flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 6 },
  steerMic: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' },
  steerInput: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '9px 12px 9px 34px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  steerBtn: { flexShrink: 0, padding: '0 15px', height: 36, borderRadius: 12, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  volIcon: { display: 'flex', flexShrink: 0, marginLeft: 4 },
}
