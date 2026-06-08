// 全局键盘快捷键 → 动作（纯函数，可单测）。在输入框/文本域内一律不拦截，避免影响打字。
export function keyToAction(e) {
  const tag = (e?.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea' || e?.target?.isContentEditable) return null
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case ' ': case 'Spacebar': return 'playpause'
    case 'ArrowRight': return 'next'
    case 'ArrowLeft': return 'seekback'
    case 'ArrowUp': return 'volup'
    case 'ArrowDown': return 'voldown'
    case 'l': case 'L': return 'like'
    case 'm': case 'M': return 'mute'
    default: return null
  }
}
