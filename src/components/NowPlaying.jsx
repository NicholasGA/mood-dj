import { useState, useEffect, useRef } from 'react'
import Lyrics from './Lyrics'
import Icon from './Icon'

export default function NowPlaying({ track, isPlaying, loadingTrack, audioRef, onNext, queueCount, onTogglePlay, lyric, accent = '#31c27c', onVibe, onDislike, onSteer, onLike, onOpenQueue }) {
  const [progress, setProgress] = useState(0)
  const [dur, setDur] = useState(0)
  const [vol, setVol] = useState(80)
  const [steerText, setSteerText] = useState('')
  const barRef = useRef(null)
  const draggingRef = useRef(false)

  const lines = lyric?.lines || []
  const choruses = lyric?.choruses || []

  useEffect(() => {
    if (!audioRef?.current) return
    const audio = audioRef.current
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

  function changeVolume(v) {
    setVol(v)
    if (audioRef?.current) audioRef.current.volume = v / 100
  }

  const ratioFromEvent = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }
  const seekToRatio = (r) => {
    const audio = audioRef?.current
    if (audio?.duration) audio.currentTime = r * audio.duration
  }
  function onBarDown(e) {
    draggingRef.current = true
    const r = ratioFromEvent(e); setProgress(r)
    const move = (ev) => { const rr = ratioFromEvent(ev); setProgress(rr) }
    const up = (ev) => {
      draggingRef.current = false
      seekToRatio(ratioFromEvent(ev))
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function jumpChorus() {
    const audio = audioRef?.current
    if (!audio || !choruses.length) return
    const t = audio.currentTime + 0.6
    const next = choruses.find(c => c > t) ?? choruses[0]   // 没有更靠后的就回到第一段，循环
    audio.currentTime = next
    if (audio.paused) audio.play().catch(() => {})
  }

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60), ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || (loadingTrack ? '正在加载歌曲…' : '—')
  const artist = track?.artists?.map(a => a.name).join(', ') || (loadingTrack ? '正在为你挑选可播放的歌曲' : '等待播放中')

  return (
    <div style={s.card} className="fade-up">
      <div style={s.albumWrap} className={isPlaying ? 'floaty' : ''}>
        {art
          ? <img src={art} alt={title} style={{ ...s.album, boxShadow: isPlaying ? `0 12px 50px ${accent}99` : '0 8px 28px rgba(0,0,0,0.5)' }} />
          : <div style={{ ...s.album, ...s.ph }}>🎵</div>
        }
        {isPlaying && <div style={{ ...s.ring, borderColor: `${accent}66` }} />}
      </div>

      <div style={s.info}>
        <div style={s.title} title={title}>{title}</div>
        <div style={s.artist}>{artist}</div>
      </div>

      <div style={s.progRow}>
        <span style={s.time}>{fmt(progress * dur)}</span>
        <div ref={barRef} style={s.bar} onPointerDown={onBarDown}>
          <div style={{ ...s.fill, width: `${progress * 100}%`, background: `linear-gradient(90deg, ${accent}, ${accent}cc)` }} />
          <div style={{ ...s.knob, left: `${progress * 100}%`, background: accent }} />
        </div>
        <span style={s.time}>{fmt(dur)}</span>
      </div>

      <div style={s.controls}>
        <button style={{ ...s.btn, ...s.btnMain, background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 6px 20px ${accent}66` }} onClick={onTogglePlay}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={24} color="#fff" />
        </button>
        <button style={s.btn} onClick={onNext}><Icon name="next" size={20} color="#fff" /></button>
        {choruses.length > 0 && (
          <button
            style={{ ...s.chorusBtn, borderColor: `${accent}66`, color: accent }}
            onClick={jumpChorus}
            title="跳到下一段副歌"
          ><Icon name="star" size={13} color={accent} /> 副歌</button>
        )}
        <button style={{ ...s.badge, cursor: 'pointer', border: 'none' }} onClick={onOpenQueue} title="查看/管理播放队列">队列 {queueCount}</button>
      </div>

      {track && onVibe && (
        <div style={s.vibeRow}>
          <button style={{ ...s.vibeBtn, borderColor: '#f472b640', color: '#f9a8d4', background: 'rgba(244,114,182,0.08)' }} onClick={onLike} title="喜欢，收藏到 QQ我喜欢"><Icon name="heart" size={14} color="#f9a8d4" filled /> 喜欢</button>
          <button style={s.vibeBtn} onClick={onDislike} title="不喜欢这首，少推这类"><Icon name="thumbsDown" size={14} color="#cbd5e1" /> 不喜欢</button>
          <span style={s.vibeDiv} />
          <button style={s.vibeBtn} onClick={() => onVibe('up')} title="再嗨一点"><Icon name="flame" size={14} color="#fb923c" /> 再嗨点</button>
          <button style={s.vibeBtn} onClick={() => onVibe('down')} title="冷静一些"><Icon name="moon" size={14} color="#93c5fd" /> 冷静些</button>
          <button style={s.vibeBtn} onClick={() => onVibe('flavor')} title="换个味道"><Icon name="shuffle" size={14} color="#cbd5e1" /> 换味道</button>
        </div>
      )}

      {track && onSteer && (
        <div style={s.steerRow}>
          <span style={s.steerMic}><Icon name="mic" size={15} color="#9ca3af" /></span>
          <input
            style={s.steerInput}
            placeholder="跟 DJ 说…「放点周杰伦但安静的」"
            value={steerText}
            onChange={e => setSteerText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }}
          />
          <button
            style={{ ...s.steerBtn, background: accent, opacity: steerText.trim() ? 1 : 0.5 }}
            onClick={() => { if (steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }}
            disabled={!steerText.trim()}
          >换</button>
        </div>
      )}

      <div style={s.volRow}>
        <Icon name="volume" size={16} color="#9ca3af" />
        <input type="range" min={0} max={100} value={vol}
          onChange={e => changeVolume(Number(e.target.value))}
          className="mood-slider" style={{ flex: 1 }} />
        <span style={s.volPct}>{vol}</span>
      </div>

      {track && <Lyrics lines={lines} hasTrans={lyric?.hasTrans} audioRef={audioRef} accent={accent} />}
    </div>
  )
}

const s = {
  card: { background: 'rgba(12,12,16,0.68)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 22, padding: 26, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' },
  albumWrap: { position: 'relative', width: 180, height: 180 },
  album: { width: 180, height: 180, borderRadius: 12, objectFit: 'cover', display: 'block', transition: 'box-shadow .5s' },
  ph: { background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 },
  ring: { position: 'absolute', inset: -6, borderRadius: 18, border: '2px solid rgba(49,194,124,0.4)', animation: 'spin 8s linear infinite', pointerEvents: 'none' },
  info: { textAlign: 'center', width: '100%' },
  title: { fontSize: 16, fontWeight: 700, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 },
  artist: { fontSize: 13, color: '#9ca3af' },
  progRow: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  time: { fontSize: 10, color: '#6b7280', minWidth: 30, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  bar: { position: 'relative', flex: 1, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3, cursor: 'pointer', touchAction: 'none' },
  fill: { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 3, transition: 'width .12s linear' },
  knob: { position: 'absolute', top: '50%', width: 11, height: 11, borderRadius: '50%', transform: 'translate(-50%,-50%)', boxShadow: '0 0 8px rgba(0,0,0,0.4)' },
  controls: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  chorusBtn: { height: 30, padding: '0 12px', borderRadius: 16, background: 'rgba(255,255,255,0.05)', border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btn: { width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  btnMain: { width: 58, height: 58, fontSize: 24, border: 'none' },
  badge: { fontSize: 12, color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 20 },
  volRow: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  vibeRow: { display: 'flex', gap: 6, width: '100%', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  vibeBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  vibeDiv: { width: 1, height: 18, background: 'rgba(255,255,255,0.12)', margin: '0 2px' },
  steerMic: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' },
  volPct: { fontSize: 11, color: '#6b7280', minWidth: 22, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  steerRow: { display: 'flex', gap: 6, width: '100%', position: 'relative' },
  steerInput: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px 8px 34px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  steerBtn: { flexShrink: 0, padding: '0 14px', borderRadius: 10, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
}
