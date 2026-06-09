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

// 鲜艳渐变玻璃方块（参考霓虹 bento 风格）：一个色相的发光渐变 + 大圆角 + 同色辉光 + 顶部高光。
// 透明窗口下没法真模糊，所以用"饱和渐变 + 辉光 + 半透明"还原玻璃质感。
export function vivid(c1, c2 = c1, radius = 22) {
  return {
    background: `radial-gradient(135% 135% at 26% 16%, ${c1} 0%, ${c2} 58%, color-mix(in srgb, ${c2} 62%, #0a0a0f) 100%)`,
    borderRadius: radius,
    border: '1px solid rgba(255,255,255,0.18)',
    boxShadow: [
      'inset 0 1px 0 rgba(255,255,255,0.32)',                                   // 顶部高光：玻璃吃光
      'inset 0 -20px 36px -22px rgba(0,0,0,0.55)',                              // 底部内阴影：弧面厚度
      `0 16px 38px -16px color-mix(in srgb, ${c1} 60%, transparent)`,           // 远处同色柔阴影
      `0 0 26px -4px color-mix(in srgb, ${c1} 48%, transparent)`,               // 同色辉光
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
