import React, { useEffect, useId, useMemo, useRef } from 'react'
import { hashSeed, mulberry32 } from '../ui/songTheme'

// 液体方块（goo metaball）：方块实体 + 一圈「小水珠」一起送进 goo 滤镜 → 边缘鼓出圆润水珠、相邻拉丝粘连。
// 跟着歌动：rAF 每帧——① 算干净鼓点强度 --beat（水珠大小 = 音量×系数 + 鼓点，踩拍）；
//   ② 让每颗水珠绕边框「公转」（各自速度/方向不同）→ 突起点位满四周漂移、永不固定（随机感）。
// 无声 → --pulse→0 → 水珠收平。feDropShadow 给融合轮廓描 accent 辉光边。文字在另一层(z:1)不进滤镜 → 清晰。
export default function LiquidBox({ accent = '#7c3aed', seed, radius = 20, ring = 14, blobSize = 44 }) {
  const fid = `lqbox-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const fieldRef = useRef(null)
  const blobRefs = useRef([])
  const floorRef = useRef(0.32)
  const beatRef = useRef(0)
  const bodyBg = '#0b0e16'   // 与水珠同色 → 水珠内半截隐入实体、不留暗斑

  // 每颗水珠：起始角 + 公转速度（随机方向/快慢）+ 大小系数
  const blobs = useMemo(() => {
    const rnd = mulberry32(hashSeed(String(seed) + '-box'))
    return Array.from({ length: ring }, (_, i) => ({
      baseAng: (i / ring) * Math.PI * 2 + (rnd() - 0.5) * 0.4,
      speed: (0.05 + rnd() * 0.14) * (rnd() < 0.5 ? -1 : 1),   // rad/s，正负=两个方向
      f: +(0.55 + rnd() * 1.1).toFixed(2),
    }))
  }, [seed, ring])

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
    let raf
    const root = document.documentElement
    const tick = () => {
      const t = performance.now() / 1000
      // 鼓点强度 --beat：减掉常态底噪、放大到 0..1，attack 快 release 慢
      if (fieldRef.current) {
        const p = parseFloat(getComputedStyle(root).getPropertyValue('--pulse')) || 0
        const f = floorRef.current
        floorRef.current = p < f ? p : f + 0.0006
        const target = Math.min(1, Math.max(0, (p - floorRef.current - 0.03) * 2.6))
        const cur = beatRef.current
        beatRef.current = cur + (target - cur) * (target > cur ? 0.6 : 0.12)
        fieldRef.current.style.setProperty('--beat', beatRef.current.toFixed(3))
      }
      // 公转：更新每颗水珠位置（满四周漂移）
      for (let i = 0; i < blobs.length; i++) {
        const el = blobRefs.current[i]
        if (!el) continue
        const a = blobs[i].baseAng + t * blobs[i].speed
        el.style.left = (50 + Math.cos(a) * 50).toFixed(2) + '%'
        el.style.top = (50 + Math.sin(a) * 50).toFixed(2) + '%'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [blobs])

  return (
    <div className="liquid-box" aria-hidden>
      <svg width="0" height="0" aria-hidden>
        <defs>
          <filter id={fid} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo" />
            <feDropShadow in="goo" dx="0" dy="0" stdDeviation="5" floodColor={accent} floodOpacity="0.9" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="goo" /></feMerge>
          </filter>
        </defs>
      </svg>
      <div ref={fieldRef} className="liquid-box-field" style={{ filter: `url(#${fid})` }}>
        <div className="liquid-box-body" style={{ background: bodyBg, borderRadius: radius }} />
        {blobs.map((b, i) => (
          <span key={i} ref={el => (blobRefs.current[i] = el)} className="liquid-box-blob" style={{
            left: `${(50 + Math.cos(b.baseAng) * 50).toFixed(2)}%`,
            top: `${(50 + Math.sin(b.baseAng) * 50).toFixed(2)}%`,
            width: blobSize, height: blobSize, '--f': b.f,
          }} />
        ))}
      </div>
    </div>
  )
}
