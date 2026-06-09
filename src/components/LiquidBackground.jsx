import React, { useMemo } from 'react'
import { songTheme } from '../ui/songTheme'

// 液体背景：每首歌一套 songTheme，几团专辑色实心光斑缓慢漂移/形变 + 随 --pulse 心跳鼓胀，
// 外层套 SVG goo 滤镜 → 球体靠近时像水银/熔岩一样「融合拉丝」，这才是真正的液体质感。
// 整片 field 用 screen 叠到深色背景上发光。reduced-motion 下静止（见 index.css）。
export default function LiquidBackground({ accent = '#7c3aed', accent2 = '#4f46e5', track, intensity = 1 }) {
  const seed = track?.mid || track?.id || track?.name || 'idle'
  const theme = useMemo(() => songTheme(seed, 4), [seed])

  // 相对色：把 accent 的色相按主题偏移 → 同专辑色系里各团略有不同，更有层次
  const tint = (hue) => `hsl(from ${accent} calc(h + ${hue}) s l)`

  return (
    <div className="liquid-wrap" aria-hidden style={{ opacity: 0.62 * intensity }}>
      <svg className="liquid-goo-def" width="0" height="0" aria-hidden>
        <defs>
          {/* goo：先糊开，再用 alpha 通道高对比度把边缘"收硬" → 相邻团融成一坨，最后轻糊柔化 */}
          <filter id="liquidGoo" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="b" />
            <feColorMatrix in="b" type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -11" result="goo" />
            <feGaussianBlur in="goo" stdDeviation="4" />
          </filter>
        </defs>
      </svg>
      <div className="liquid-field" style={{ filter: 'url(#liquidGoo)', mixBlendMode: 'screen' }}>
        {theme.blobs.map((b, i) => {
          const alt = i % 2 ? accent : accent2
          return (
            <span key={i} className="liquid-blob" style={{
              left: `${b.x}%`, top: `${b.y}%`,
              width: `${(b.scale * 46).toFixed(1)}vmin`, height: `${(b.scale * 46).toFixed(1)}vmin`,
              // 实心一点（goo 靠 alpha 收边），中心到 ~58% 都是色，外缘才透明
              background: `radial-gradient(circle at 40% 36%, ${tint(b.hue)} 0%, ${tint(b.hue)} 32%, color-mix(in srgb, ${alt} 72%, transparent) 58%, transparent 74%)`,
              filter: 'none',        // 模糊交给 goo，blob 本身不预糊（否则没法收成实心团）
              mixBlendMode: 'normal', // 团之间正常叠 → goo 才能融合；screen 留给整片 field
              animationDuration: `${(b.dur / theme.speed).toFixed(2)}s, ${(b.dur * 1.45 / theme.speed).toFixed(2)}s`,
              animationDelay: `${b.delay}s, ${(b.delay * 1.3).toFixed(2)}s`,
              '--drift': `${b.drift}%`,
            }} />
          )
        })}
      </div>
    </div>
  )
}
