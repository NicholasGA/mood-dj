// 每首歌的「视觉身份」：由歌曲标识派生一组稳定参数——同一首歌永远长一个样，
// 不同歌各有性格（光源角度、流动快慢、几团液体光斑的位置/大小/色相/形变节奏）。
// 纯函数、确定性，便于单测；UI 层（LiquidBackground / 渐变光源）据此呈现。

// FNV-1a：字符串 → 32bit 无符号种子
export function hashSeed(str) {
  let h = 2166136261
  const s = String(str ?? 'default')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// mulberry32：种子 → 0..1 伪随机序列（确定性）
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 返回一首歌的视觉主题。blobs 的 hue 是相对 accent 的色相偏移（度）。
export function songTheme(seed, count = 3) {
  const rnd = mulberry32(hashSeed(seed))
  const n = Math.max(2, Math.min(count, 5))
  const blobs = Array.from({ length: n }, () => ({
    x: Math.round(12 + rnd() * 76),       // 位置 %（横）
    y: Math.round(14 + rnd() * 72),       // 位置 %（纵）
    scale: +(0.8 + rnd() * 1.05).toFixed(3),  // 大小系数
    hue: Math.round((rnd() * 2 - 1) * 32),    // 相对 accent 的色相偏移 ±32°
    dur: +(8 + rnd() * 9).toFixed(2),         // 形变周期 s（越大越慢；调快让它更"流"）
    delay: +(-rnd() * 14).toFixed(2),         // 起始相位错开
    drift: Math.round(12 + rnd() * 16),       // 漂移幅度 %（加大→blob 真的会汇合/分离）
  }))
  return {
    angle: Math.round(rnd() * 360),            // 渐变/光源角度
    speed: +(0.7 + rnd() * 0.85).toFixed(3),   // 整体流动快慢（驱动形变/漂移时长）
    blobs,
  }
}
