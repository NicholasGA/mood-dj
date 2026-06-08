import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'

export default function MiniPlayer({ track, isPlaying, audioRef, accent = '#31c27c', accent2 = '#1db954', lyric, analyser, onTogglePlay, onNext, onExit }) {
  const [progress, setProgress] = useState(0)
  const [line, setLine] = useState('')
  const barsRef = useRef(null)
  const rafRef = useRef(null)

  const lines = lyric?.lines || []

  // 进度 + 当前歌词行
  useEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
      let cur = ''
      const t = audio.currentTime
      for (let k = 0; k < lines.length; k++) { if (lines[k].time <= t) cur = lines[k].text; else break }
      setLine(cur)
    }
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [audioRef, lines])

  // 迷你均衡器（5 条，跟 FFT 跳）
  useEffect(() => {
    const draw = () => {
      const el = barsRef.current
      const an = analyser?.current
      if (el) {
        const kids = el.children
        if (an && isPlaying) {
          const d = new Uint8Array(an.frequencyBinCount)
          an.getByteFrequencyData(d)
          const step = Math.floor(d.length * 0.5 / kids.length) || 1
          for (let i = 0; i < kids.length; i++) {
            const v = d[i * step + 2] / 255
            kids[i].style.height = `${15 + v * 85}%`
          }
        } else {
          for (let i = 0; i < kids.length; i++) kids[i].style.height = '15%'
        }
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, isPlaying])

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || '—'
  const artist = track?.artists?.map(a => a.name).join(', ') || ''

  return (
    <div style={{ ...s.root, background: `linear-gradient(120deg, ${accent}22, #0a0a0aee 60%)` }}>
      {art && <img src={art} alt="" aria-hidden style={s.bgArt} />}
      <div style={s.cover}>
        {art ? <img src={art} alt={title} style={s.coverImg} /> : <div style={s.coverPh}>🎵</div>}
      </div>

      <div style={s.mid}>
        <div style={s.title} title={`${title} - ${artist}`}>{title}</div>
        <div style={s.line}>{line || artist}</div>
        <div style={s.bar}><div style={{ ...s.fill, width: `${progress * 100}%`, background: accent }} /></div>
      </div>

      <div style={s.bars} ref={barsRef}>
        {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ ...s.barEq, background: accent2 }} />)}
      </div>

      <div style={s.ctrls}>
        <button style={s.btn} onClick={onTogglePlay} title={isPlaying ? '暂停' : '播放'}><Icon name={isPlaying ? 'pause' : 'play'} size={15} color="#fff" /></button>
        <button style={s.btn} onClick={onNext} title="下一首"><Icon name="next" size={15} color="#fff" /></button>
      </div>

      <button style={s.exit} onClick={onExit} title="还原窗口"><Icon name="maximize" size={11} color="#cbd5e1" /></button>
    </div>
  )
}

const drag = { WebkitAppRegion: 'drag' }
const noDrag = { WebkitAppRegion: 'no-drag' }
const s = {
  root: { ...drag, position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', overflow: 'hidden', userSelect: 'none', color: '#f9fafb', border: '2px solid', borderColor: 'var(--accent, #31c27c)', boxSizing: 'border-box' },
  bgArt: { position: 'absolute', inset: '-40%', width: '180%', height: '180%', objectFit: 'cover', filter: 'blur(40px) brightness(0.4)', opacity: 0.5, zIndex: -1, pointerEvents: 'none' },
  cover: { width: 72, height: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  coverPh: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.08)', fontSize: 28 },
  mid: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  line: { fontSize: 11, color: 'rgba(229,231,235,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: 14 },
  bar: { height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden', marginTop: 2 },
  fill: { height: '100%', borderRadius: 2 },
  bars: { ...noDrag, display: 'flex', alignItems: 'flex-end', gap: 2, height: 22, width: 26, flexShrink: 0 },
  barEq: { width: 3, height: '15%', borderRadius: 2, transition: 'height .08s linear', alignSelf: 'flex-end' },
  ctrls: { ...noDrag, display: 'flex', gap: 6, flexShrink: 0 },
  btn: { width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  exit: { ...noDrag, position: 'absolute', top: 6, right: 8, width: 20, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#cbd5e1', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
