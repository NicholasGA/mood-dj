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
        st.progress = d.progress || 0
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

  // ── canvas：辉光 + 频谱山脊（双色渐变 + 顶缘高光）+ 进度光带 + 节拍光粒 ──
  // rAF 插值（上行快下行慢的余晖手感）；停播保留微弱呼吸底光（"一直能看到"）。
  useEffect(() => {
    const st = stateRef.current
    st.sparks = st.sparks || []
    st.prevLoud = 0; st.prog = 0
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
    const curve = (pts, seg, baseY, maxPeak) => {
      ctx.beginPath()
      ctx.moveTo(0, baseY)
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = i * seg, x2 = (i + 1) * seg
        const y1 = baseY - pts[i] * maxPeak, y2 = baseY - pts[i + 1] * maxPeak
        ctx.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2)
      }
    }
    let raf
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      for (let i = 0; i < st.cur.length; i++) {
        const t = st.target[i] || 0
        st.cur[i] += (t - st.cur[i]) * (t > st.cur[i] ? 0.5 : 0.12)
      }
      // 停播不归零：保留 0.2 底光 → 桌面上始终有一条安静的光带
      st.alpha += ((st.playing ? 1 : 0.2) - st.alpha) * 0.06
      const A = st.alpha
      st.prog += ((st.progress || 0) - st.prog) * 0.2
      const now = performance.now()
      const baseH = 3 * dpr
      const baseY = H - baseH
      const maxPeak = 58 * dpr
      const n = st.cur.length
      const pts = []
      for (let i = 0; i < n; i++) pts.push(st.cur[n - 1 - i])
      for (let i = 0; i < n; i++) pts.push(st.cur[i])
      const seg = W / (pts.length - 1)
      const loud = (st.cur[0] + st.cur[1] + st.cur[2] + st.cur[3]) / 4

      // 1) 辉光：光带上方柔光，随响度涨落（像真在发光，不是一条死线）
      const bloomH = (24 + loud * 46) * dpr
      const bg = ctx.createLinearGradient(0, baseY - bloomH, 0, baseY)
      bg.addColorStop(0, hexA(st.accent, 0))
      bg.addColorStop(1, hexA(st.accent, 0.18 * A * (0.55 + loud * 0.45)))
      ctx.fillStyle = bg
      ctx.fillRect(0, baseY - bloomH, W, bloomH)

      // 2) 频谱山脊：竖向双色渐变（顶 accent2 淡 → 底 accent 亮）+ 顶缘高光描边
      curve(pts, seg, baseY, maxPeak)
      ctx.lineTo(W, baseY); ctx.closePath()
      const grad = ctx.createLinearGradient(0, baseY - maxPeak, 0, baseY)
      grad.addColorStop(0, hexA(st.accent2, 0))
      grad.addColorStop(0.55, hexA(st.accent2, 0.3 * A))
      grad.addColorStop(1, hexA(st.accent, 0.62 * A))
      ctx.fillStyle = grad
      ctx.fill()
      curve(pts, seg, baseY, maxPeak)
      ctx.lineWidth = 1.5 * dpr
      ctx.strokeStyle = hexA(st.accent2, 0.4 * A)
      ctx.stroke()

      // 3) 光带 + 播放进度：整条暗底（停播缓慢呼吸），已播部分提亮，播放头一点辉光
      const breath = st.playing ? 1 : 0.5 + 0.5 * Math.sin(now / 1400)
      const dim = ctx.createLinearGradient(0, 0, W, 0)
      dim.addColorStop(0, hexA(st.accent2, 0.22 * A * breath))
      dim.addColorStop(0.5, hexA(st.accent, 0.3 * A * breath))
      dim.addColorStop(1, hexA(st.accent2, 0.22 * A * breath))
      ctx.fillStyle = dim
      ctx.fillRect(0, baseY, W, baseH)
      if (st.prog > 0.001 && st.playing) {
        const pw = W * st.prog
        const lit = ctx.createLinearGradient(0, 0, pw, 0)
        lit.addColorStop(0, hexA(st.accent2, (0.6 + loud * 0.4) * A))
        lit.addColorStop(1, hexA(st.accent, (0.9 + loud * 0.1) * A))
        ctx.fillStyle = lit
        ctx.fillRect(0, baseY - 0.5 * dpr, pw, baseH + 0.5 * dpr)
        const cy = baseY + baseH / 2
        const ph = ctx.createRadialGradient(pw, cy, 0, pw, cy, 5 * dpr)
        ph.addColorStop(0, hexA('#ffffff', 0.85 * A))
        ph.addColorStop(1, hexA(st.accent, 0))
        ctx.fillStyle = ph
        ctx.beginPath(); ctx.arc(pw, cy, 5 * dpr, 0, Math.PI * 2); ctx.fill()
      }

      // 4) 节拍光粒：强拍时从波峰溅起几点光，缓升淡出（加性混合，像火花飘起）
      if (st.playing && loud > 0.5 && loud > st.prevLoud + 0.07 && st.sparks.length < 28) {
        const k = Math.random() < 0.5 ? 2 : 1
        for (let j = 0; j < k; j++) {
          const idx = Math.floor(Math.random() * pts.length)
          st.sparks.push({ x: idx * seg, y: baseY - pts[idx] * maxPeak, vy: (0.6 + Math.random() * 1.2) * dpr, r: (1.2 + Math.random() * 1.6) * dpr, life: 1 })
        }
      }
      st.prevLoud = loud
      if (st.sparks.length) {
        ctx.globalCompositeOperation = 'lighter'
        for (let i = st.sparks.length - 1; i >= 0; i--) {
          const p = st.sparks[i]
          p.y -= p.vy; p.vy *= 0.99; p.life -= 0.018
          if (p.life <= 0) { st.sparks.splice(i, 1); continue }
          const r = p.r * 3
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
          g.addColorStop(0, hexA(st.accent2, 0.7 * p.life * A))
          g.addColorStop(1, hexA(st.accent2, 0))
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalCompositeOperation = 'source-over'
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  // 内容自然宽度 → 容器宽度走 CSS 过渡：歌词长短变化时胶囊"液体拉伸"而不是跳变
  const rowRef = useRef(null)
  const [natural, setNatural] = useState({ w: 200, h: 26 })
  useEffect(() => {
    const el = rowRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setNatural({ w: el.offsetWidth, h: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 相位机：破水(rising)/自由悬浮(afloat)/溅落(sinking)/沉底(closed)。
  // 连接元素（水丘/液颈/液滴）只在 rising/sinking 出现——浮稳后液颈断开、胶囊自由漂，
  // 不再一直和液池粘着；沉回时重新接上，有"溅落"的呼应。
  const [phase, setPhase] = useState('closed')
  useEffect(() => {
    if (open) {
      setPhase('rising')
      const t = setTimeout(() => setPhase('afloat'), 680)
      return () => clearTimeout(t)
    }
    setPhase(p => (p === 'closed' ? 'closed' : 'sinking'))
    const t = setTimeout(() => setPhase('closed'), 520)
    return () => clearTimeout(t)
  }, [open])

  const cmd = (c) => window.electronAPI?.stripCmd?.(c)
  const a = track.accent
  const text = line || (track.name ? `${track.name} · ${track.artist}` : 'Mood DJ')
  const connected = phase === 'rising' || phase === 'sinking'
  const floating = phase === 'afloat'
  const W = Math.min(560, natural.w + 28), H = natural.h + 16   // 容器 = 内容 + padding(14/8)，夹上限保持居中
  const moundW = Math.round(W * 1.25)                   // 水丘跟着胶囊宽度走
  // 浮出带弹性过冲（液滴破水），沉回先加速再吸入
  const rise = open ? 'translateY(0)' : 'translateY(96px)'
  const spring = open ? 'transform .6s cubic-bezier(.34,1.6,.64,1)' : 'transform .42s cubic-bezier(.55,-.15,.75,.35)'
  const widthT = 'width .5s cubic-bezier(.3,1.3,.45,1), margin-left .5s cubic-bezier(.3,1.3,.45,1)'
  // 连接元素：rising/sinking 跟着升降；afloat 时缩回光带（goo 下有"液颈拉断"的瞬间）
  const subRise = (open && connected) ? 'translateY(0)' : 'translateY(96px)'
  const subT = connected ? `${spring}, opacity .25s ease` : 'transform .35s ease-in, opacity .3s ease'
  const skinColor = `color-mix(in srgb, ${a} 26%, #0b0d13)`   // 胶囊皮：accent 调进深色，跟光带同族

  return (
    <div style={s.wrap}>
      <canvas ref={canvasRef} style={s.canvas} />

      {/* goo 液体层：水丘 + 胶囊皮 + 液颈 + 液滴全在滤镜里 → 形状真正粘成一体。
          皮=胶囊在液体世界的身体；颈/滴只在升降的瞬间出现，浮稳后断开。 */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -12" />
          </filter>
        </defs>
      </svg>
      <div style={{ ...s.gooLayer, filter: 'url(#goo)', opacity: playing || open ? 1 : 0 }} aria-hidden>
        <div style={{ ...s.surface, width: moundW, marginLeft: -moundW / 2, background: a, opacity: connected ? 0.95 : 0, transform: `scaleY(${connected ? 1 + level * 0.5 : 0.12})`, transition: `${s.surface.transition}, ${widthT}` }} />
        <div
          className={floating && playing ? 'cap-skin-live' : ''}
          style={{
            ...s.skin, width: W, height: H, marginLeft: -W / 2,
            borderRadius: H / 2, background: skinColor, transform: rise, transition: `${spring}, ${widthT}`,
          }}
        />
        <div style={{ ...s.neck, background: a, transform: subRise, transition: subT, transitionDelay: connected ? '60ms' : '0ms', opacity: connected ? 0.95 : 0 }} />
        <div style={{ ...s.drop, width: 10, height: 10, marginLeft: -30, background: a, transform: subRise, transition: subT, transitionDelay: '110ms', opacity: connected ? 1 : 0 }} />
        <div style={{ ...s.drop, width: 7, height: 7, marginLeft: 26, background: a, transform: subRise, transition: subT, transitionDelay: '170ms', opacity: connected ? 1 : 0 }} />
      </div>

      {/* 托光晕：托住胶囊的柔光（浮稳时最亮），让它落在光里而不是像贴纸浮着 */}
      <div aria-hidden style={{
        ...s.halo, width: W * 1.7, height: H * 2.6, marginLeft: -(W * 1.7) / 2,
        background: `radial-gradient(50% 50% at 50% 50%, ${a}4d, ${a}00 72%)`,
        opacity: open ? (floating ? 0.9 : 0.55) : 0, transform: rise, transition: `${spring}, opacity .45s ease`,
      }} />

      {/* 胶囊内容（滤镜外，文字锐利）：宽度与皮同步液体拉伸；浮稳后随 cap-bob 轻微漂浮 */}
      <div className={floating ? 'cap-bob' : ''} style={{ ...s.capsule, width: W, height: H, marginLeft: -W / 2, borderRadius: H / 2, transform: rise, transition: `${spring}, ${widthT}` }}>
        <div aria-hidden style={s.sheen} />
        <div ref={rowRef} style={s.capRow}>
          {track.cover
            ? <img src={track.cover} alt="" style={{ ...s.cover, boxShadow: `0 0 0 1.5px ${a}66, 0 2px 10px -2px ${a}cc`, animation: playing ? 'spin 12s linear infinite' : 'none' }} draggable={false} />
            : <span style={{ ...s.dot, background: a, boxShadow: `0 0 8px 1px ${a}aa` }} />}
          <span key={text} className="cap-lyric-in" style={s.lyric} title={text}>{text}</span>
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
  // 水丘：半沉在窗口下沿的椭圆（露出上半），goo 揉圆后是有机的液面隆起而非一块板
  surface: {
    position: 'absolute', bottom: -11, left: '50%', marginLeft: -150, width: 300, height: 24,
    borderRadius: '50%', transformOrigin: 'center bottom',
    transition: 'transform .45s cubic-bezier(.3,1.2,.5,1), opacity .4s ease',
  },
  skin: { position: 'absolute', bottom: 17, left: '50%' },
  neck: {
    position: 'absolute', bottom: 2, left: '50%', width: 46, height: 30, marginLeft: -23,
    borderRadius: '50%',
  },
  drop: { position: 'absolute', bottom: 4, left: '50%', borderRadius: '50%' },

  // 托光晕（清晰层，goo 滤镜外）：柔和径向光，垫在胶囊下托住它
  halo: { position: 'absolute', bottom: 6, left: '50%', pointerEvents: 'none', borderRadius: '50%' },

  // 胶囊内容（清晰层）：无底无框，身体由 goo 层的"皮"提供；
  // 宽度由测量驱动 + CSS 过渡（液体拉伸），居中用 marginLeft（translate 留给漂浮动画）
  capsule: {
    position: 'absolute', bottom: 17, left: '50%', boxSizing: 'border-box',
    pointerEvents: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', maxWidth: 560, padding: '8px 14px',
    color: '#f3f5fa', whiteSpace: 'nowrap', textShadow: '0 1px 6px rgba(0,0,0,0.7)',
  },
  // 顶部玻璃高光：覆在 goo 皮之上，给胶囊"湿润反光"的质感
  sheen: {
    position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 42%, rgba(255,255,255,0) 66%)',
  },
  capRow: { position: 'relative', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', width: 'max-content' },
  cover: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  lyric: { fontSize: 13, fontWeight: 500, letterSpacing: '0.2px', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360 },
  eq: { display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 14, flexShrink: 0 },
  eqBar: { width: 2.5, borderRadius: 2, display: 'block', transition: 'height .12s ease, opacity .2s ease' },
  ctrls: { display: 'flex', gap: 4, marginLeft: 2, flexShrink: 0 },
  btn: {
    width: 26, height: 26, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.07)', color: '#e8eaf0', fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
}
