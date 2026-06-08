// 从专辑封面提取一对主题色（vibrant 主色 + 较深辅色）。
// 依赖 BrowserWindow 的 webSecurity:false，跨域封面也能 getImageData。失败返回 null（回退心情色）。

const toHex = (r, g, b) =>
  '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')

function ensureVivid(r, g, b) {
  const mx = Math.max(r, g, b)
  if (mx < 110) { const k = 150 / Math.max(mx, 1); r *= k; g *= k; b *= k }   // 太暗就提亮
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)]
}

export async function extractAlbumColors(url) {
  if (!url) return null
  let img
  try {
    img = await new Promise((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('img load failed'))
      i.src = url
    })
  } catch { return null }

  const S = 44
  const cv = document.createElement('canvas')
  cv.width = S; cv.height = S
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, S, S)
  let data
  try { data = ctx.getImageData(0, 0, S, S).data } catch { return null }  // 万一被污染

  let best = null, bestScore = -1
  let ar = 0, ag = 0, ab = 0, an = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (data[i + 3] < 128) continue
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    const l = (mx + mn) / 510
    const sat = mx === 0 ? 0 : (mx - mn) / mx
    ar += r; ag += g; ab += b; an++
    // 偏好中等明度 + 高饱和的"活"色
    const score = sat * (1 - Math.abs(l - 0.5) * 1.1)
    if (score > bestScore) { bestScore = score; best = [r, g, b] }
  }
  if (!an) return null
  if (bestScore < 0.12 || !best) best = [ar / an, ag / an, ab / an]  // 灰度封面用平均色

  const [r, g, b] = ensureVivid(best[0], best[1], best[2])
  return { primary: toHex(r, g, b), secondary: toHex(r * 0.62, g * 0.62, b * 0.62) }
}
