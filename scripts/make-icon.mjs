// 生成 256x256 应用图标 PNG（圆角渐变底 + 白色均衡器柱），无需任何图像库
import fs from 'fs'
import zlib from 'zlib'

const S = 256, R = 56
const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const top = [139, 92, 246], bot = [79, 70, 229]   // 紫 → 靛
const bars = [
  { x: 40, h: 96 }, { x: 84, h: 168 }, { x: 128, h: 210 }, { x: 172, h: 150 }, { x: 216, h: 84 },
] // 中心 x，高度
const BW = 30

function inRoundRect(x, y) {
  const rx = Math.min(x, S - 1 - x), ry = Math.min(y, S - 1 - y)
  if (rx >= R || ry >= R) return true
  const dx = R - rx, dy = R - ry
  return dx * dx + dy * dy <= R * R
}
function inBar(x, y) {
  for (const b of bars) {
    if (x >= b.x - BW / 2 && x <= b.x + BW / 2 && y >= (S - b.h) / 2 && y <= (S + b.h) / 2) return true
  }
  return false
}

const raw = Buffer.alloc(S * (S * 4 + 1))
let p = 0
for (let y = 0; y < S; y++) {
  raw[p++] = 0 // filter: none
  for (let x = 0; x < S; x++) {
    if (!inRoundRect(x, y)) { raw[p++] = 0; raw[p++] = 0; raw[p++] = 0; raw[p++] = 0; continue }
    const t = y / (S - 1)
    let r = lerp(top[0], bot[0], t), g = lerp(top[1], bot[1], t), b = lerp(top[2], bot[2], t)
    if (inBar(x, y)) { r = 255; g = 255; b = 255 }
    raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = 255
  }
}

// PNG 编码
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/icon.png', png)
console.log('wrote build/icon.png', png.length, 'bytes')
