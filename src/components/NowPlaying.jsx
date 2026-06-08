import { useState, useEffect, useRef } from 'react'

export default function NowPlaying({ track, isPlaying, loadingTrack, audioRef, onNext, queueCount, onTogglePlay }) {
  const [progress, setProgress] = useState(0)
  const [vol, setVol] = useState(80)

  useEffect(() => {
    if (!audioRef?.current) return
    const audio = audioRef.current
    const update = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
    }
    audio.addEventListener('timeupdate', update)
    return () => audio.removeEventListener('timeupdate', update)
  }, [audioRef])

  function changeVolume(v) {
    setVol(v)
    if (audioRef?.current) audioRef.current.volume = v / 100
  }

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || (loadingTrack ? '正在加载歌曲…' : '—')
  const artist = track?.artists?.map(a => a.name).join(', ') || (loadingTrack ? '正在为你挑选可播放的歌曲' : '等待播放中')

  return (
    <div style={s.card}>
      <div style={s.albumWrap}>
        {art
          ? <img src={art} alt={title} style={{ ...s.album, boxShadow: isPlaying ? '0 0 50px rgba(49,194,124,0.5)' : 'none' }} />
          : <div style={{ ...s.album, ...s.ph }}>🎵</div>
        }
        {isPlaying && <div style={s.ring} />}
      </div>

      <div style={s.info}>
        <div style={s.title} title={title}>{title}</div>
        <div style={s.artist}>{artist}</div>
      </div>

      <div style={s.bar}><div style={{ ...s.fill, width: `${progress * 100}%` }} /></div>

      <div style={s.controls}>
        <button style={s.btn} onClick={onTogglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button style={s.btn} onClick={onNext}>⏭</button>
        <span style={s.badge}>队列 {queueCount}</span>
      </div>

      <div style={s.volRow}>
        <span style={{ fontSize: 13 }}>🔈</span>
        <input type="range" min={0} max={100} value={vol}
          onChange={e => changeVolume(Number(e.target.value))}
          className="mood-slider" style={{ flex: 1 }} />
        <span style={{ fontSize: 13 }}>🔊</span>
      </div>
    </div>
  )
}

const s = {
  card: { background: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' },
  albumWrap: { position: 'relative', width: 180, height: 180 },
  album: { width: 180, height: 180, borderRadius: 12, objectFit: 'cover', display: 'block', transition: 'box-shadow .5s' },
  ph: { background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 },
  ring: { position: 'absolute', inset: -6, borderRadius: 18, border: '2px solid rgba(49,194,124,0.4)', animation: 'spin 8s linear infinite', pointerEvents: 'none' },
  info: { textAlign: 'center', width: '100%' },
  title: { fontSize: 16, fontWeight: 700, color: '#f9fafb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 },
  artist: { fontSize: 13, color: '#9ca3af' },
  bar: { width: '100%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', background: 'linear-gradient(90deg,#31c27c,#a7f3d0)', borderRadius: 2, transition: 'width .5s linear' },
  controls: { display: 'flex', alignItems: 'center', gap: 16 },
  btn: { width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badge: { fontSize: 12, color: '#6b7280', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: 20 },
  volRow: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
}
