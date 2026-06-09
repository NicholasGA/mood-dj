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
  const sat = Math.max(60, Math.min(s, 82))                 // 收一下饱和，别太灰也别太荧光
  const C = (dh, ll, ds = 0) => `hsl(${((h + dh) % 360 + 360) % 360} ${Math.max(48, Math.min(sat + ds, 88))}% ${ll}%)`
  // 配色法则：两个亮块用「邻近色」分跨在专辑本色两侧(暖侧 energy + 冷侧 mood)，和 hero(本色)凑成一组
  // 邻近色三重奏(像日落渐变)——不单调又同家族；两个暗块用「补色 + 分裂补色」做冷暖反差点缀。
  return {
    energy: C(32, 60, 8),    // 律动：暖侧邻近色 + 更亮更饱和（"被点亮的专辑色"=能量），和 mood 拉开
    mood:   C(-18, 54),      // 心情：冷侧邻近色（和 hero 本色错开一点，不再两块同色显闷）
    next:   C(176, 50, -2),  // 接下来：补色（冷暖反差最大的那块），交给 vividDark 压暗成"深蓝/深青"
    dj:     C(-50, 52),      // DJ：另一侧分裂补色，交给 vividDark 压暗
  }
}

// 鲜艳渐变玻璃方块（参考霓虹 bento 风格）："从内发光"的层次感——左上一个亮光斑(掺白) → 本色 →
// 同色更深的暗角(掺一点深色但仍保留色相，不发灰)，配大圆角 + 同色 bloom 辉光 + 顶部柔光，无描边。
// 关键：参考图的高级感来自"卡片像在发光"——亮光斑+向暗角的 falloff 是灵魂。
//   · 旧版 A：falloff 收到 20% 本色掺黑 → 发灰发脏。
//   · 旧版 B：干脆整块同亮度(72% 本色)无 falloff → 变平，"发光氛围"消失。
//   · 现版：亮光斑 → 34% 处本色 → 暗角 42% 本色掺 #0b0a12，强 falloff 但暗角仍是同色深色，干净又有光感。
export function vivid(c1, c2 = c1, radius = 30) {
  return {
    background: [
      'radial-gradient(120% 85% at 26% -2%, rgba(255,255,255,0.16), rgba(255,255,255,0) 46%)',   // 顶部柔光（玻璃斜切吃光）
      `radial-gradient(135% 120% at 28% 6%, color-mix(in srgb, ${c1} 82%, #fff) 0%, ${c1} 34%, color-mix(in srgb, ${c1} 42%, #0b0a12) 100%)`,  // 从内发光：亮光斑→本色→同色深角
    ].join(', '),
    borderRadius: radius,
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.26)',                                   // 柔顶部高光
      'inset 0 -40px 70px -46px rgba(0,0,0,0.30)',                              // 极柔底部弧面（托住光斑层次）
      `0 24px 56px -24px color-mix(in srgb, ${c1} 50%, transparent)`,           // 柔投影（更大更散，带色）
      `0 0 80px -22px color-mix(in srgb, ${c1} 40%, transparent)`,              // 柔光晕（大而散，像参考的 bloom）
    ].join(', '),
  }
}

// 暗块（接下来/DJ 故事这类文字多的块）：深色但「色相读得出来」——顶部光斑掺较多 tint(像参考的深蓝/深青卡)，
// 向下沉到近黑，托住亮块、建立两亮两暗的层级，同时让补色/分裂补色的冷暖反差看得见。无描边。
export function vividDark(tint, radius = 30) {
  return {
    background: `radial-gradient(120% 105% at 30% -6%, color-mix(in srgb, ${tint} 52%, #0e1118) 0%, color-mix(in srgb, ${tint} 20%, #0b0d14) 52%, #090b11 100%)`,
    borderRadius: radius,
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.12)',
      'inset 0 -34px 54px -38px rgba(0,0,0,0.42)',
      `0 22px 50px -24px color-mix(in srgb, ${tint} 30%, transparent)`,   // 带色柔投影（暗块也有一点氛围）
      `0 0 60px -26px color-mix(in srgb, ${tint} 30%, transparent)`,
    ].join(', '),
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
