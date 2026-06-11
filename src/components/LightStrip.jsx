import { useEffect, useRef, useState } from 'react'

// 灯带模式（单窗）：贴任务栏上沿的 3px 光带 + 频谱波峰（canvas），
// 歌词胶囊像液滴一样从光带里"浮出/沉回"（SVG goo 粘连滤镜 + 弹性过冲 + 跟随液滴）。
// 整窗默认鼠标穿透；主进程在悬停底部中央感应区时把鼠标交还本窗（召出胶囊/点控制键）。
const HOLD_LYRIC = 4200, HOLD_CHORUS = 6500, HOLD_TRACK = 5000

export default function LightStrip() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    target: new Array(20).fill(0), cur: new Array(20).fill(0),
    alpha: 0, playing: false,
    accent: '#31c27c', accent2: '#1db954',
  })
  const [track, setTrack] = useState({ name: '', artist: '', cover: '', accent: '#31c27c', accent2: '#1db954' })
  const [line, setLine] = useState('')
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [level, setLevel] = useState(0)
  const untilRef = useRef(0)
  const hoverRef = useRef(false)

  // ── 数据流：频谱帧喂 canvas（ref，零重渲）；歌词/曲目走 state 驱动胶囊 ──
  useEffect(() => {
    const st = stateRef.current
    const expand = (ms) => { untilRef.current = Math.max(untilRef.current, Date.now() + ms); setOpen(true) }
    window.electronAPI?.onStripData?.((d) => {
      if (d.t === 'frame') {
        st.target = d.bands || st.target; st.playing = !!d.playing
        setPlaying(!!d.playing); setLevel(d.level || 0)
      } else if (d.t === 'track') {
        if (d.accent) st.accent = d.accent
        if (d.accent2) st.accent2 = d.accent2
        setTrack(t => ({ ...t, ...d })); setLine('')
        if (d.name) expand(HOLD_TRACK)
      } else if (d.t === 'lyric') {
        setLine(d.line); expand(d.isChorus ? HOLD_CHORUS : HOLD_LYRIC)
      }
    })
    window.electronAPI?.onStripHover?.((v) => { hoverRef.current = v; setHover(v); if (v) setOpen(true) })
    const id = setInterval(() => {   // 到点且没悬停 → 胶囊沉回光带
      if (!hoverRef.current && Date.now() > untilRef.current) setOpen(false)
    }, 400)
    return () => clearInterval(id)
  }, [])

  // ── canvas：光带 + 频谱山脊（rAF 插值，上行快下行慢的余晖手感）──
  useEffect(() => {
    const st = stateRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = '100%'; canvas.style.height = '100%'
    }
    resize()
    window.addEventListener('resize', resize)
    let raf
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < st.cur.length; i++) {
        const t = st.target[i] || 0
        st.cur[i] += (t - st.cur[i]) * (t > st.cur[i] ? 0.5 : 0.12)
      }
      st.alpha += ((st.playing ? 1 : 0) - st.alpha) * 0.06
      if (st.alpha < 0.01) return
      const baseH = 3 * dpr
      const baseY = H - baseH
      const maxPeak = 58 * dpr                       // 波峰上限（给胶囊留出上方空间）
      const n = st.cur.length
      const pts = []
      for (let i = 0; i < n; i++) pts.push(st.cur[n - 1 - i])
      for (let i = 0; i < n; i++) pts.push(st.cur[i])
      const seg = W / (pts.length - 1)
      ctx.beginPath()
      ctx.moveTo(0, baseY)
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = i * seg, x2 = (i + 1) * seg
        const y1 = baseY - pts[i] * maxPeak, y2 = baseY - pts[i + 1] * maxPeak
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2)
      }
      ctx.lineTo(W, baseY); ctx.closePath()
      const grad = ctx.createLinearGradient(0, baseY - maxPeak, 0, baseY)
      grad.addColorStop(0, hexA(st.accent, 0))
      grad.addColorStop(1, hexA(st.accent, 0.55 * st.alpha))
      ctx.fillStyle = grad
      ctx.fill()
      const loud = (st.cur[0] + st.cur[1] + st.cur[2] + st.cur[3]) / 4
      const bar = ctx.createLinearGradient(0, 0, W, 0)
      bar.addColorStop(0, hexA(st.accent2, (0.5 + loud * 0.5) * st.alpha))
      bar.addColorStop(0.5, hexA(st.accent, (0.7 + loud * 0.3) * st.alpha))
      bar.addColorStop(1, hexA(st.accent2, (0.5 + loud * 0.5) * st.alpha))
      ctx.fillStyle = bar
      ctx.fillRect(0, baseY, W, baseH)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  // 胶囊内容尺寸 → 同步给 goo 层里的"胶囊皮"（皮在滤镜里才有粘连，内容在滤镜外保持锐利）
  const capRef = useRef(null)
  const [capSize, setCapSize] = useState({ w: 220, h: 42 })
  useEffect(() => {
    const el = capRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setCapSize({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cmd = (c) => window.electronAPI?.stripCmd?.(c)
  const a = track.accent
  const text = line || (track.name ? `${track.name} · ${track.artist}` : 'Mood DJ')
  // 浮出/沉回：浮出带弹性过冲（液滴破水），沉回先加速再吸入
  const rise = open ? 'translateY(0)' : 'translateY(96px)'
  const spring = open ? 'transform .6s cubic-bezier(.34,1.6,.64,1)' : 'transform .42s cubic-bezier(.55,-.15,.75,.35)'
  const skinColor = `color-mix(in srgb, ${a} 26%, #0b0d13)`   // 胶囊皮：accent 调进深色，跟光带同族

  return (
    <div style={s.wrap}>
      <canvas ref={canvasRef} style={s.canvas} />

      {/* goo 液体层：液面 + 胶囊皮 + 液颈 + 液滴，全在滤镜里 → 形状真正粘成一体。
          胶囊皮和液颈是关键：皮=胶囊在液体世界的身体，颈=浮起后仍连着光带的"液桥"。 */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12" />
          </filter>
        </defs>
      </svg>
      <div style={{ ...s.gooLayer, filter: 'url(#goo)', opacity: playing || open ? 1 : 0 }} aria-hidden>
        <div style={{ ...s.surface, background: a, transform: `scaleY(${1 + level * 1.6})` }} />
        <div
          className={open && playing ? 'cap-blob' : ''}
          style={{
            ...s.skin, width: capSize.w, height: capSize.h, marginLeft: -capSize.w / 2,
            borderRadius: capSize.h / 2, background: skinColor, transform: rise, transition: spring,
          }}
        />
        <div style={{ ...s.neck, background: a, transform: rise, transition: `${spring}, opacity .3s`, transitionDelay: '60ms', opacity: open ? 0.95 : 0.5 }} />
        <div style={{ ...s.drop, width: 10, height: 10, marginLeft: -30, background: a, transform: rise, transition: spring, transitionDelay: '110ms' }} />
        <div style={{ ...s.drop, width: 7, height: 7, marginLeft: 26, background: a, transform: rise, transition: spring, transitionDelay: '170ms' }} />
      </div>

      {/* 胶囊内容（滤镜外，文字锐利）：无底色无边框，身体由 goo 层的皮提供 → 不再是两个图层 */}
      <div ref={capRef} style={{ ...s.capsule, transform: rise, transition: spring }}>
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

// #rrggbb + 透明度 → rgba()
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(49,194,124,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a))})`
}

const s = {
  wrap: {
    position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: 'transparent',
    fontFamily: '"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif',
  },
  canvas: { position: 'absolute', inset: 0, pointerEvents: 'none' },

  // 液体层（goo 滤镜内只放"形状"）：液面/液颈/液滴用 accent 光色，胶囊皮用 accent 调暗 →
  // 滤镜把它们的 alpha 粘成一体，交界处颜色自然过渡（光把胶囊"裹"起来）
  gooLayer: { position: 'absolute', inset: 0, pointerEvents: 'none', transition: 'opacity .5s ease' },
  surface: {
    position: 'absolute', bottom: 0, left: '50%', marginLeft: -220, width: 440, height: 8,
    borderRadius: 4, transformOrigin: 'bottom', transition: 'transform .12s ease',
  },
  skin: { position: 'absolute', bottom: 17, left: '50%' },
  neck: {
    position: 'absolute', bottom: 2, left: '50%', width: 46, height: 30, marginLeft: -23,
    borderRadius: '50%',
  },
  drop: { position: 'absolute', bottom: 4, left: '50%', borderRadius: '50%' },

  // 胶囊内容（清晰层）：无底无框，身体由 goo 层的"皮"提供
  capsule: {
    position: 'absolute', bottom: 17, left: '50%', translate: '-50% 0',
    pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
    maxWidth: 540, padding: '8px 14px',
    color: '#eef0f5', whiteSpace: 'nowrap', textShadow: '0 1px 5px rgba(0,0,0,0.65)',
  },
  cover: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  lyric: { fontSize: 13, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 },
  eq: { display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 14, flexShrink: 0 },
  eqBar: { width: 2.5, borderRadius: 2, display: 'block', transition: 'height .12s ease, opacity .2s ease' },
  ctrls: { display: 'flex', gap: 4, marginLeft: 2, flexShrink: 0 },
  btn: {
    width: 26, height: 26, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
}
