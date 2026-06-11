import { useEffect, useRef, useState } from 'react'

// 灯带模式 · 顶边灵动胶囊：常态是屏幕顶边中央一条微光线（随节拍呼吸），
// 唱到新歌词/换歌/鼠标碰到时弹性展开成胶囊（封面 + 当前句 + 迷你频谱），
// 悬停时主进程把鼠标交还给本窗 → 显示控制键（播放/下一首/回大窗）。
const HOLD_LYRIC = 4200, HOLD_CHORUS = 6500, HOLD_TRACK = 5000

export default function LightCapsule() {
  const [track, setTrack] = useState({ name: '', artist: '', cover: '', accent: '#31c27c', accent2: '#1db954' })
  const [line, setLine] = useState('')
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [level, setLevel] = useState(0)
  const untilRef = useRef(0)
  const hoverRef = useRef(false)

  useEffect(() => {
    const expand = (ms) => { untilRef.current = Math.max(untilRef.current, Date.now() + ms); setOpen(true) }
    window.electronAPI?.onStripData?.((d) => {
      if (d.t === 'frame') { setPlaying(!!d.playing); setLevel(d.level || 0) }
      else if (d.t === 'track') { setTrack(t => ({ ...t, ...d })); setLine(''); if (d.name) expand(HOLD_TRACK) }
      else if (d.t === 'lyric') { setLine(d.line); expand(d.isChorus ? HOLD_CHORUS : HOLD_LYRIC) }
    })
    window.electronAPI?.onStripHover?.((v) => { hoverRef.current = v; setHover(v); if (v) setOpen(true) })
    const id = setInterval(() => {   // 到点且没悬停 → 收回微光线
      if (!hoverRef.current && Date.now() > untilRef.current) setOpen(false)
    }, 400)
    return () => clearInterval(id)
  }, [])

  const cmd = (c) => window.electronAPI?.stripCmd?.(c)
  const a = track.accent, text = line || (track.name ? `${track.name} · ${track.artist}` : 'Mood DJ')

  return (
    <div style={s.wrap}>
      {open ? (
        <div style={{ ...s.capsule, borderColor: `${a}55` }} className="cap-in">
          {track.cover
            ? <img src={track.cover} alt="" style={{ ...s.cover, animation: playing ? 'spin 12s linear infinite' : 'none' }} draggable={false} />
            : <span style={{ ...s.dot, background: a }} />}
          <span style={s.lyric} title={text}>{text}</span>
          <Eq level={level} accent={a} playing={playing} />
          {hover && (
            <span style={s.ctrls}>
              <button style={s.btn} onClick={() => cmd('toggle')} title="播放/暂停">{playing ? '⏸' : '▶'}</button>
              <button style={s.btn} onClick={() => cmd('next')} title="下一首">⏭</button>
              <button style={s.btn} onClick={() => cmd('show-main')} title="退出灯带，回大窗">⤢</button>
            </span>
          )}
        </div>
      ) : (
        <div style={{
          ...s.lineBar,
          width: 110 + level * 70,
          background: a,
          opacity: playing ? 0.45 + level * 0.45 : 0.18,
        }} />
      )}
    </div>
  )
}

// 迷你频谱：4 根小柱按响度起伏（纯装饰，CSS 过渡补间）
function Eq({ level, accent, playing }) {
  const hs = playing ? [0.5, 1, 0.7, 0.9] : [0.2, 0.2, 0.2, 0.2]
  return (
    <span style={s.eq} aria-hidden>
      {hs.map((m, i) => (
        <i key={i} style={{ ...s.eqBar, background: accent, height: 3 + m * level * 11, opacity: 0.5 + level * 0.5 }} />
      ))}
    </span>
  )
}

const s = {
  wrap: {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: 6, pointerEvents: 'none', fontFamily: '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif',
    overflow: 'hidden', background: 'transparent',
  },
  lineBar: { height: 4, borderRadius: 3, marginTop: 2, transition: 'width .25s ease, opacity .3s ease', pointerEvents: 'none' },
  capsule: {
    pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
    maxWidth: 520, padding: '7px 14px', borderRadius: 18,
    background: 'rgba(15,17,23,0.92)', border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 6px 24px -8px rgba(0,0,0,0.6)', color: '#e8eaf0',
  },
  cover: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  lyric: { fontSize: 13, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 },
  eq: { display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 14, flexShrink: 0 },
  eqBar: { width: 2.5, borderRadius: 2, display: 'block', transition: 'height .12s ease, opacity .2s ease' },
  ctrls: { display: 'flex', gap: 4, marginLeft: 2, flexShrink: 0 },
  btn: {
    width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
}
