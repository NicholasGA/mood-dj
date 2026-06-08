// 睡眠定时器纯逻辑（可单测）：剩余时间显示 + 收尾渐降音量曲线。

// 毫秒 → mm:ss
export function remainingLabel(ms) {
  if (!ms || ms <= 0) return '00:00'
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 最后 fadeMs 内把音量从 baseVol 线性降到 0；之前保持 baseVol
export function sleepVolume(remainingMs, baseVol = 1, fadeMs = 15000) {
  if (remainingMs <= 0) return 0
  if (remainingMs >= fadeMs) return baseVol
  return +(baseVol * (remainingMs / fadeMs)).toFixed(3)
}

// 时长选择循环：关 → 15 → 30 → 60 → 关（分钟，0 表示关）
export function nextDuration(curMin) {
  const seq = [0, 15, 30, 60]
  const i = seq.indexOf(curMin)
  return seq[(i + 1) % seq.length]
}
