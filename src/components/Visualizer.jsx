import { useEffect, useRef } from 'react'

// 每首歌按 id 哈希固定选一种视觉变体：改几何/旋转/频谱样式/主导频段/色相
const VARIANTS = [
  { name: 'orbit',  rot:  0.0016, bars: 112, barLen: 82,  barStyle: 'line',   ringW: 0.9, glowW: 1.0, pBand: 'mid',    pMul: 0.7, hue:   0 },
  { name: 'nebula', rot: -0.0007, bars: 64,  barLen: 44,  barStyle: 'dot',    ringW: 0.5, glowW: 1.5, pBand: 'treble', pMul: 1.6, hue:  20 },
  { name: 'pulse',  rot:  0.0010, bars: 72,  barLen: 64,  barStyle: 'mirror', ringW: 1.35, glowW: 1.2, pBand: 'bass',  pMul: 0.9, hue: -18 },
  { name: 'grid',   rot: -0.0024, bars: 144, barLen: 104, barStyle: 'line',   ringW: 0.7, glowW: 0.8, pBand: 'mid',    pMul: 1.1, hue:  32 },
  { name: 'aurora', rot:  0.0013, bars: 92,  barLen: 74,  barStyle: 'dot',    ringW: 0.8, glowW: 1.35, pBand: 'treble',pMul: 1.3, hue: -32 },
]

const seedFrom = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const hexToRgb = (h) => {
  const m = h.replace('#', '')
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
function rotateHue([r, g, b], deg) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h, s, l = (mx + mn) / 2
  if (mx === mn) { h = s = 0 }
  else {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  h = ((h + deg / 360) % 1 + 1) % 1
  const hue2rgb = (p, q, t) => { t = (t % 1 + 1) % 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p }
  let R, G, B
  if (s === 0) { R = G = B = l }
  else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; R = hue2rgb(p, q, h + 1/3); G = hue2rgb(p, q, h); B = hue2rgb(p, q, h - 1/3) }
  return [R * 255, G * 255, B * 255]
}
const a2 = (a) => Math.floor(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')

export default function Visualizer({ moodConfig, isPlaying, analyser, track }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const dataRef = useRef(null)
  const stateRef = useRef({
    time: 0, particles: [], moodConfig: null, isPlaying: false, analyser: null,
    level: 0, bass: 0, mid: 0, treble: 0, prevBass: 0, kick: 0, intensity: 0, rotation: 0,
    variant: VARIANTS[0], C1: '#7c3aed', C2: '#4f46e5',
  })

  // 同步外部状态 + 选变体 + 算配色（粒子仅在数量变化时重建，避免暂停时跳位）
  useEffect(() => {
    const s = stateRef.current
    s.moodConfig = moodConfig
    s.isPlaying = isPlaying
    s.analyser = analyser
    s.variant = VARIANTS[seedFrom(String(track?.id || track?.mid || 'x')) % VARIANTS.length]
    s.C1 = rgbToHex(...rotateHue(hexToRgb(moodConfig?.color_primary || '#7c3aed'), s.variant.hue))
    s.C2 = rgbToHex(...rotateHue(hexToRgb(moodConfig?.color_secondary || '#4f46e5'), s.variant.hue))

    const canvas = canvasRef.current
    if (!canvas) return
    const energy = moodConfig?.energy ?? 0.5
    const count = Math.floor(50 + energy * 110)
    if (s.particles.length !== count) {
      s.particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: 1.5 + Math.random() * 3.5,
        vx: (Math.random() - 0.5) * (0.3 + energy * 2.5),
        vy: (Math.random() - 0.5) * (0.3 + energy * 2.5),
        phase: Math.random() * Math.PI * 2,
        opacity: 0.22 + Math.random() * 0.5,
      }))
    }
  }, [moodConfig, isPlaying, analyser, track])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const s = stateRef.current
      s.particles.forEach(p => { p.x = Math.random() * canvas.width; p.y = Math.random() * canvas.height })
    }
    resize()
    window.addEventListener('resize', resize)

    // 三段频谱：低频(鼓点,重)/中频(人声器乐)/高频(镲片,亮)，各自独立平滑
    function sampleAudio() {
      const s = stateRef.current
      const an = s.analyser?.current
      if (!an || !s.isPlaying) {
        s.level *= 0.92; s.bass *= 0.92; s.mid *= 0.92; s.treble *= 0.92
        return
      }
      const N = an.frequencyBinCount
      if (!dataRef.current || dataRef.current.length !== N) dataRef.current = new Uint8Array(N)
      an.getByteFrequencyData(dataRef.current)
      const d = dataRef.current
      const loEnd = Math.max(1, Math.floor(N * 0.08))
      const midEnd = Math.floor(N * 0.40)
      let lo = 0, md = 0, hi = 0, tot = 0
      for (let i = 0; i < N; i++) {
        const v = d[i]
        tot += v
        if (i < loEnd) lo += v
        else if (i < midEnd) md += v
        else hi += v
      }
      lo = lo / loEnd / 255
      md = md / Math.max(1, midEnd - loEnd) / 255
      hi = hi / Math.max(1, N - midEnd) / 255
      // 低频跟得慢更稳，高频跟得快更灵
      s.bass   = s.bass   * 0.55 + lo  * 0.45
      s.mid    = s.mid    * 0.50 + md  * 0.50
      s.treble = s.treble * 0.35 + hi  * 0.65
      s.level  = s.level  * 0.55 + (tot / N / 255) * 0.45
    }

    function draw() {
      const s = stateRef.current
      const { particles, variant } = s
      const V = variant
      s.time += 0.008
      sampleAudio()

      // 平滑强度：暂停时所有动效缓缓收起，恢复时缓缓涨起
      s.intensity += ((s.isPlaying ? 1 : 0) - s.intensity) * 0.045
      const I = s.intensity
      const level = s.level, bass = s.bass, mid = s.mid, treble = s.treble

      // 鼓点瞬态：低频骤升时积累一个会衰减的 kick，制造爆发
      const dB = bass - s.prevBass; s.prevBass = bass
      if (dB > 0.05) s.kick = Math.min(1.4, s.kick + dB * 3.2)
      s.kick *= 0.88
      const kick = s.kick * I

      // 旋转速度受中频调制 → 不同歌曲律动节奏不同
      s.rotation += V.rot * (1 + mid * 2.4) * (0.3 + I)

      const c1 = s.C1, c2 = s.C2
      const energy = s.moodConfig?.energy ?? 0.5
      const cx = canvas.width / 2, cy = canvas.height / 2

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 背景径向渐变随整体响度呼吸（调淡，让封面氛围背景透出来）
      const gr = ctx.createRadialGradient(cx, canvas.height * 0.55, 0, cx, canvas.height * 0.55, canvas.width * (0.58 + level * 0.28 * I))
      gr.addColorStop(0, `${c1}${a2(0.10 + level * 0.20 * I)}`)
      gr.addColorStop(0.6, `${c1}0a`)
      gr.addColorStop(1, '#0a0a0a00')
      ctx.fillStyle = gr
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 圆环 — 受低频 + kick 驱动（重、慢的那一层）
      const pulse = 1 + (bass * 0.22 + kick * 0.16) * V.ringW * I + Math.sin(s.time * 2.0) * 0.03 * energy * I
      for (let i = 4; i >= 1; i--) {
        ctx.beginPath()
        ctx.arc(cx, cy, (80 + i * 70) * pulse, 0, Math.PI * 2)
        ctx.strokeStyle = `${c1}${a2((0.06 + 0.035 * (5 - i)) + (bass * 0.08 + kick * 0.12) * I)}`
        ctx.lineWidth = 1.2 + (bass + kick) * 2.6 * I
        ctx.stroke()
      }

      // 中心辉光 — 受整体响度 + kick（中等层）
      const glowR = (44 + level * 130 * V.glowW + kick * 70) * (0.5 + 0.5 * I) + 14 * Math.sin(s.time * 1.8)
      const glowGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, glowR))
      glowGr.addColorStop(0, `${c1}${a2(0.30 + level * 0.45 * I + kick * 0.2)}`)
      glowGr.addColorStop(1, `${c1}00`)
      ctx.fillStyle = glowGr
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(1, glowR), 0, Math.PI * 2)
      ctx.fill()

      // 频谱环 — 直接画频谱柱，随变体旋转/样式不同（最"在听歌"的一层）
      const an = s.analyser?.current
      if (an && dataRef.current && I > 0.02) {
        const d = dataRef.current
        const bars = V.bars
        const baseR = 150 * pulse
        const span = Math.floor(d.length * 0.72)
        const step = Math.max(1, Math.floor(span / bars))
        for (let i = 0; i < bars; i++) {
          const v = (d[i * step] / 255) * I
          const ang = (i / bars) * Math.PI * 2 + s.rotation - Math.PI / 2
          const len = 5 + v * V.barLen
          const ca = Math.cos(ang), sa = Math.sin(ang)
          const col = `${c2}${a2(0.22 + v * 0.65)}`
          if (V.barStyle === 'dot') {
            const x = cx + ca * (baseR + len), y = cy + sa * (baseR + len)
            ctx.beginPath(); ctx.arc(x, y, 1.4 + v * 3.2, 0, Math.PI * 2)
            ctx.fillStyle = col; ctx.fill()
          } else if (V.barStyle === 'mirror') {
            ctx.strokeStyle = col; ctx.lineWidth = 2.6
            ctx.beginPath()
            ctx.moveTo(cx + ca * (baseR - len * 0.5), cy + sa * (baseR - len * 0.5))
            ctx.lineTo(cx + ca * (baseR + len), cy + sa * (baseR + len))
            ctx.stroke()
          } else {
            ctx.strokeStyle = col; ctx.lineWidth = 2.2
            ctx.beginPath()
            ctx.moveTo(cx + ca * baseR, cy + sa * baseR)
            ctx.lineTo(cx + ca * (baseR + len), cy + sa * (baseR + len))
            ctx.stroke()
          }
        }
      }

      // 漂浮粒子 — 由变体指定的频段驱动（独立于其它层）
      const pBand = V.pBand === 'bass' ? bass : V.pBand === 'treble' ? treble : mid
      const drift = (0.15 + 0.85 * I) * (1 + pBand * 1.6) * V.pMul
      particles.forEach(p => {
        p.x += p.vx * drift
        p.y += p.vy * drift
        p.phase += 0.012 + (energy * 0.04 + pBand * 0.14) * I
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10
        const size = p.r * (1 + Math.sin(p.phase) * 0.35) * (1 + pBand * 0.7 * I)
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fillStyle = `${c2}${a2(Math.min(p.opacity + level * 0.3 * I, 1))}`
        ctx.fill()
      })

      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} style={{
    position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none',
  }} />
}
