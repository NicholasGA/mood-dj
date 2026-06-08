// 生成 256x256 应用图标（超采样抗锯齿）：深紫靛对角渐变 + 中心辉光 + 圆角均衡器柱
import fs from 'fs'
import zlib from 'zlib'

const OUT = 256, SS = 4, S = OUT * SS            // 1024 渲染再缩小 → 平滑边缘
const RR = 200                                    // 圆角半径(渲染空间)
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
// 渐变三段：深紫 → 靛蓝 → 品红一点点
const G = [[124, 58, 237], [67, 56, 202], [91, 33, 182]]
const grad = (t) => t < 0.5 ? mix(G[0], G[1], t * 2) : mix(G[1], G[2], (t - 0.5) * 2)

// 圆角矩形内部判定
function inCard(x, y) {
  const rx = Math.min(x, S - 1 - x), ry = Math.min(y, S - 1 - y)
  if (rx >= RR || ry >= RR) return true
  const dx = RR - rx, dy = RR - ry
  return dx * dx + dy * dy <= RR * RR
}
// 圆角竖柱（带半圆帽）
const bars = [
  { cx: 0.20, h: 0.34 }, { cx: 0.36, h: 0.58 }, { cx: 0.52, h: 0.74 }, { cx: 0.68, h: 0.50 }, { cx: 0.84, h: 0.30 },
].map(b => ({ cx: b.cx * S, half: 0.055 * S, top: (0.5 - b.h / 2) * S, bot: (0.5 + b.h / 2) * S }))
function inBar(x, y) {
  for (const b of bars) {
    const within = Math.abs(x - b.cx) <= b.half
    if (within && y >= b.top && y <= b.bot) return true
    // 半圆帽
    for (const cy of [b.top, b.bot]) { const dx = x - b.cx, dy = y - cy; if (dx * dx + dy * dy <= b.half * b.half) return true }
  }
  return false
}

const cxC = S / 2, cyC = S / 2, glowR = S * 0.42
const big = Buffer.alloc(S * S * 4)
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    if (!inCard(x, y)) { big[i + 3] = 0; continue }
    const t = (x + y) / (2 * (S - 1))
    let [r, g, b] = grad(t)
    // 中心柔光
    const d = Math.hypot(x - cxC, y - cyC)
    const glow = Math.max(0, 1 - d / glowR) ** 2 * 60
    r += glow; g += glow * 0.9; b += glow * 1.1
    // 顶部高光
    const hl = Math.max(0, 1 - y / (S * 0.5)) * 18
    r += hl; g += hl; b += hl
    if (inBar(x, y)) { r = 255; g = 255; b = 255 }
    big[i] = Math.min(255, r); big[i + 1] = Math.min(255, g); big[i + 2] = Math.min(255, b); big[i + 3] = 255
  }
}

// 降采样 SS×SS → OUT
const raw = Buffer.alloc(OUT * (OUT * 4 + 1))
let p = 0
for (let oy = 0; oy < OUT; oy++) {
  raw[p++] = 0
  for (let ox = 0; ox < OUT; ox++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const i = ((oy * SS + sy) * S + (ox * SS + sx)) * 4
      r += big[i]; g += big[i + 1]; b += big[i + 2]; a += big[i + 3]
    }
    const n = SS * SS
    raw[p++] = Math.round(r / n); raw[p++] = Math.round(g / n); raw[p++] = Math.round(b / n); raw[p++] = Math.round(a / n)
  }
}

// PNG 编码
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', png)
console.log('wrote build/icon.png', png.length, 'bytes')
