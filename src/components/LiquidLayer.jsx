import React, { useMemo } from 'react'
import { songTheme } from '../ui/songTheme'

// bento 卡片内嵌的液体光泽层。放在卡片里作 absolute + z-index:-1（父级 isolation:isolate），
// 于是它落在卡片渐变「之上、文字之下」流动，无需改动任何内容结构。
// 与背景 LiquidBackground 同一套 songTheme/配色 → 前后景是同一种液体材质，自然融合。
// 尺寸用 % 相对卡片（背景版用 vmin 相对视口），所以小卡里也比例得当。
export default function LiquidLayer({ accent = '#7c3aed', seed, count = 2, opacity = 0.38, blur = 6 }) {
  const theme = useMemo(() => songTheme(seed, count), [seed, count])
  const tint = (hue) => `hsl(from ${accent} calc(h + ${hue}) s l)`
  return (
    <div className="liquid-layer" aria-hidden style={{ opacity }}>
      {theme.blobs.map((b, i) => (
        <span key={i} className="liquid-blob" style={{
          left: `${b.x}%`, top: `${b.y}%`,
          width: `${(b.scale * 72).toFixed(1)}%`, height: `${(b.scale * 72).toFixed(1)}%`,
          background: `radial-gradient(circle at 38% 34%, ${tint(b.hue)} 0%, transparent 68%)`,
          filter: `blur(${blur}px)`,
          animationDuration: `${(b.dur / theme.speed).toFixed(2)}s, ${(b.dur * 1.5 / theme.speed).toFixed(2)}s`,
          animationDelay: `${b.delay}s, ${(b.delay * 1.2).toFixed(2)}s`,
          '--drift': `${b.drift}%`,
        }} />
      ))}
    </div>
  )
}
