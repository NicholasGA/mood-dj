import { useEffect, useRef } from 'react'

export default function Visualizer({ moodConfig, isPlaying }) {
  const canvasRef = useRef(null)
  const frameRef = useRef(null)
  const stateRef = useRef({ time: 0, particles: [], moodConfig: null, isPlaying: false })

  useEffect(() => {
    stateRef.current.moodConfig = moodConfig
    stateRef.current.isPlaying = isPlaying

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const energy = moodConfig?.energy ?? 0.5
    const count = Math.floor(40 + energy * 100)

    stateRef.current.particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 1.5 + Math.random() * 3.5,
      vx: (Math.random() - 0.5) * (0.3 + energy * 2.5),
      vy: (Math.random() - 0.5) * (0.3 + energy * 2.5),
      phase: Math.random() * Math.PI * 2,
      opacity: 0.25 + Math.random() * 0.55,
    }))
  }, [moodConfig, isPlaying])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const s = stateRef.current
      if (s.particles.length > 0) {
        s.particles.forEach(p => {
          p.x = Math.random() * canvas.width
          p.y = Math.random() * canvas.height
        })
      }
    }
    resize()
    window.addEventListener('resize', resize)

    function draw() {
      const s = stateRef.current
      const { moodConfig, isPlaying, particles } = s
      s.time += 0.008

      const c1 = moodConfig?.color_primary || '#7c3aed'
      const c2 = moodConfig?.color_secondary || '#4f46e5'
      const energy = moodConfig?.energy ?? 0.5

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Radial gradient background
      const gr = ctx.createRadialGradient(
        canvas.width / 2, canvas.height * 0.55, 0,
        canvas.width / 2, canvas.height * 0.55, canvas.width * 0.72
      )
      gr.addColorStop(0, `${c1}44`)
      gr.addColorStop(0.6, `${c1}12`)
      gr.addColorStop(1, '#0a0a0a00')
      ctx.fillStyle = gr
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Breathing rings
      const pulse = isPlaying ? 1 + Math.sin(s.time * 2.4) * 0.06 * energy : 1
      const cx = canvas.width / 2
      const cy = canvas.height / 2
      for (let i = 4; i >= 1; i--) {
        ctx.beginPath()
        ctx.arc(cx, cy, (80 + i * 70) * pulse, 0, Math.PI * 2)
        const alpha = Math.floor((0.08 + 0.04 * (5 - i)) * 255).toString(16).padStart(2, '0')
        ctx.strokeStyle = `${c1}${alpha}`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // Central glow
      const glowR = (50 + 20 * Math.sin(s.time * 1.8)) * pulse
      const glowGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
      glowGr.addColorStop(0, `${c1}66`)
      glowGr.addColorStop(1, `${c1}00`)
      ctx.fillStyle = glowGr
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fill()

      // Particles
      particles.forEach(p => {
        if (isPlaying) {
          p.x += p.vx
          p.y += p.vy
          p.phase += 0.04 + energy * 0.04
        } else {
          p.x += p.vx * 0.15
          p.y += p.vy * 0.15
          p.phase += 0.012
        }
        if (p.x < -10) p.x = canvas.width + 10
        if (p.x > canvas.width + 10) p.x = -10
        if (p.y < -10) p.y = canvas.height + 10
        if (p.y > canvas.height + 10) p.y = -10

        const size = p.r * (1 + Math.sin(p.phase) * 0.35)
        const alpha = Math.floor(p.opacity * 255).toString(16).padStart(2, '0')
        ctx.beginPath()
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
        ctx.fillStyle = `${c2}${alpha}`
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
    position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none',
  }} />
}
