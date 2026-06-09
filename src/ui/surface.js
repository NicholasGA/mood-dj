// 统一的"高级感表面"配方。透明窗口下不能用 backdrop-filter 毛玻璃，
// 所以靠：微渐变填充(上亮下暗的光感) + 顶部高光描边(像玻璃斜切边缘吃光) + 分层景深阴影，
// 让卡片像一块有厚度的烟熏玻璃浮在桌面上，而不是一块廉价的半透明色板。

// 主卡片（心情输入 / 播放中 / 引导 / 队列）：近不透明的烟熏玻璃板，只透出一丝身后，
// 不让身后的窗口/桌面糊在文字上（无 backdrop-filter 时，半透明叠在繁杂背景上正是"廉价感"来源）。
// 无形感交给卡片之间的空隙 + 根部薄纱去体现，卡片本身保持厚重高级。
export const glass = {
  background: 'linear-gradient(155deg, rgba(28,28,36,0.95) 0%, rgba(16,16,22,0.97) 48%, rgba(12,12,17,0.975) 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: [
    'inset 0 1px 0 rgba(255,255,255,0.14)',   // 顶部高光：玻璃边缘吃光，关键质感
    'inset 0 0 0 1px rgba(255,255,255,0.02)',  // 极淡内描边：让边缘更"实"
    'inset 0 -18px 40px -28px rgba(0,0,0,0.55)',// 底部内阴影：一点点厚度/弧面感
    '0 1px 2px rgba(0,0,0,0.25)',             // 近处硬阴影：贴合感
    '0 28px 70px -24px rgba(0,0,0,0.82)',     // 远处柔阴影：悬浮景深
    '0 10px 26px -14px rgba(0,0,0,0.55)',
  ].join(', '),
}

// 轻表面（标题栏等贴边的条）：偏透一点露出桌面氛围，但够实保证文字可读
export const glassSoft = {
  background: 'linear-gradient(180deg, rgba(20,20,26,0.82) 0%, rgba(14,14,19,0.72) 100%)',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
}

// 浮层药丸（DJ 串场 / toast）：圆润、有高光、阴影更聚拢
export const glassPill = {
  background: 'linear-gradient(180deg, rgba(26,26,34,0.96) 0%, rgba(14,14,20,0.97) 100%)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 16px 40px -12px rgba(0,0,0,0.72)',
}

// 从专辑主色推导一套"协调但有色相变化"的 bento 调色板：邻近色 + 一个补色，
// 既不单一(色相跨度大)，又永远和当前这首歌和谐(都从专辑色旋转出来，不会撞)。
function hexToHsl(hex) {
  let m = String(hex).replace('#', '')
  if (m.length === 3) m = m.split('').map(c => c + c).join('')
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255
  if ([r, g, b].some(v => Number.isNaN(v))) throw new Error('bad hex')
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2
  if (mx === mn) { h = s = 0 }
  else { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6 }
  return [h * 360, s * 100, l * 100]
}
export function albumPalette(accent = '#7c3aed') {
  let h, s
  try { [h, s] = hexToHsl(accent) } catch { [h, s] = [265, 70] }
  const sat = Math.max(58, Math.min(s, 84))                 // 收一下饱和，别太灰也别太荧光
  const C = (dh, ll, ds = 0) => `hsl(${((h + dh) % 360 + 360) % 360} ${Math.max(40, Math.min(sat + ds, 88))}% ${ll}%)`
  return {
    energy: C(40, 58, 6),    // 律动：邻近暖移、亮（最跳）
    mood:   C(0, 54),        // 心情：专辑本色，呼应 hero
    next:   C(182, 50),      // 接下来：近补色（冷），交给 vividDark 压暗——制造对比色但仍同源
    dj:     C(-42, 50),      // DJ：另一侧邻近色，交给 vividDark 压暗
  }
}

// 鲜艳渐变玻璃方块（参考霓虹 bento 风格）：一个色相的发光渐变 + 大圆角 + 同色辉光 + 顶部高光。
// 透明窗口下没法真模糊，所以用"饱和渐变 + 辉光 + 半透明"还原玻璃质感。
export function vivid(c1, c2 = c1, radius = 22) {
  return {
    background: [
      'radial-gradient(78% 52% at 50% -10%, rgba(255,255,255,0.24), rgba(255,255,255,0) 62%)',   // 顶部玻璃反光
      `radial-gradient(135% 135% at 26% 16%, ${c1} 0%, ${c2} 58%, color-mix(in srgb, ${c2} 60%, #0a0a0f) 100%)`,
    ].join(', '),
    borderRadius: radius,
    border: '1px solid rgba(255,255,255,0.08)',   // 降低整圈描边的"贴纸感"，质感靠下面的方向性内阴影
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.30)',                                   // 顶部高光：玻璃吃光（亮）
      'inset 0 -20px 36px -22px rgba(0,0,0,0.55)',                              // 底部内阴影：弧面厚度（暗）
      `0 16px 38px -16px color-mix(in srgb, ${c1} 55%, transparent)`,           // 远处同色柔阴影
      `0 0 24px -6px color-mix(in srgb, ${c1} 42%, transparent)`,               // 同色辉光
    ].join(', '),
  }
}

// 暗块（接下来/DJ 故事这类文字多的块）：深色 + 一丝色相染色，不发光，用来托住亮块、建立两亮两暗的层级
export function vividDark(tint, radius = 20) {
  return {
    background: `radial-gradient(125% 105% at 28% 0%, color-mix(in srgb, ${tint} 30%, #0c0f17) 0%, #0a0c12 82%)`,
    borderRadius: radius,
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.11), inset 0 -18px 34px -24px rgba(0,0,0,0.5), 0 14px 30px -18px rgba(0,0,0,0.6)',
  }
}

// 深色卡叠一层心情/专辑色的渐变染色（密集文字卡用：够读，又有参考图的彩味）
export function tintedGlass(accent, radius = 26) {
  return {
    ...glass, borderRadius: radius,
    background: `radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, ${accent} 26%, transparent) 0%, transparent 58%), ${glass.background}`,
    boxShadow: `${glass.boxShadow}, 0 0 30px -10px color-mix(in srgb, ${accent} 40%, transparent)`,
  }
}

// 给某张卡片叠一层专辑/心情色的微光（可选，传 accent 进来更有氛围、更统一）
export const accentGlow = (accent) =>
  accent ? { boxShadow: `${glass.boxShadow}, 0 0 0 1px color-mix(in srgb, ${accent} 14%, transparent), 0 18px 50px -24px color-mix(in srgb, ${accent} 45%, transparent)` } : null
