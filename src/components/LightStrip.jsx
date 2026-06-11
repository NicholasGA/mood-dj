import { useEffect, useRef } from 'react'

// 灯带模式 · 底边律动灯带：贴任务栏上沿的 3px 光带 + 频谱波峰从光带里隆起。
// 整窗鼠标穿透（主进程设了 setIgnoreMouseEvents），这里只管画：
// 数据由主窗 30fps 推过来（strip-data 的 frame 帧），rAF + 插值让动画丝滑。
export default function LightStrip() {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    target: new Array(20).fill(0),   // 最新一帧频谱（目标值）
    cur: new Array(20).fill(0),      // 插值后的当前值
    alpha: 0,                        // 整体亮度（停播淡出）
    playing: false,
    accent: '#31c27c', accent2: '#1db954',
  })

  useEffect(() => {
    const st = stateRef.current
    window.electronAPI?.onStripData?.((d) => {
      if (d.t === 'frame') { st.target = d.bands || st.target; st.playing = !!d.playing }
      else if (d.t === 'track') { if (d.accent) st.accent = d.accent; if (d.accent2) st.accent2 = d.accent2 }
    })

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr)
      canvas.height = Math.floor(window.innerHeight * dpr)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    resize()
    window.addEventListener('resize', resize)

    let raf
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)
      // 插值逼近目标：上行快（跟拍）、下行慢（余晖）
      for (let i = 0; i < st.cur.length; i++) {
        const t = st.target[i] || 0
        st.cur[i] += (t - st.cur[i]) * (t > st.cur[i] ? 0.5 : 0.12)
      }
      st.alpha += ((st.playing ? 1 : 0) - st.alpha) * 0.06
      if (st.alpha < 0.01) return

      const baseH = 3 * dpr                       // 常驻光带
      const maxPeak = (H - baseH) * 0.9           // 波峰最大高度
      const baseY = H - baseH

      // 频谱波形：把 20 段镜像成中心对称（中间低频、两端高频），平滑曲线围出"光的山脊"
      const n = st.cur.length
      const pts = []
      for (let i = 0; i < n; i++) pts.push(st.cur[n - 1 - i])   // 左半：高频→低频
      for (let i = 0; i < n; i++) pts.push(st.cur[i])           // 右半：低频→高频
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

      // 常驻 3px 光带：双色横向渐变，随整体响度微微提亮
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

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', background: 'transparent' }} />
}

// #rrggbb + 透明度 → rgba()
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return `rgba(49,194,124,${a})`
  const v = parseInt(m[1], 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${Math.max(0, Math.min(1, a))})`
}
