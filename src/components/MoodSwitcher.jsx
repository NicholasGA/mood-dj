import { useState, useRef, useLayoutEffect } from 'react'
import Icon from './Icon'
import { vivid, glass } from '../ui/surface'
import { PRESET_MOODS } from './MoodInput'

// 换心情小浮窗：像 Windows 右键菜单——就在点击处弹出，背景不变暗，从点击角落长出来。
// anchor={x,y} 是点击的屏幕坐标；onPick(text, energy, valence) → 走原来的 startRadio。
export default function MoodSwitcher({ anchor = { x: 200, y: 200 }, accent = '#7c3aed', isLoading, onPick, onClose }) {
  const [text, setText] = useState('')
  const popRef = useRef(null)
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, origin: 'left top', visibility: 'hidden' })
  const submit = () => { const t = text.trim(); if (t && !isLoading) onPick(t, 0.5, 0.5) }

  // 测好尺寸后，按点击点定位；贴边就翻转/夹住，别超出窗口（右键菜单的行为）
  useLayoutEffect(() => {
    const el = popRef.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight, pad = 10
    const rightFits = anchor.x + w + pad <= window.innerWidth
    const belowFits = anchor.y + h + pad <= window.innerHeight
    let left = rightFits ? anchor.x : anchor.x - w
    let top = belowFits ? anchor.y : anchor.y - h
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad))
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad))
    setPos({ left, top, origin: `${rightFits ? 'left' : 'right'} ${belowFits ? 'top' : 'bottom'}`, visibility: 'visible' })
  }, [anchor.x, anchor.y])

  return (
    // 透明全屏层：只用来接住外部点击关闭，不变暗
    <div style={s.catcher} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }}>
      <div
        ref={popRef}
        className="dock-panel-in"
        onClick={e => e.stopPropagation()}
        style={{ ...glass, ...s.pop, left: pos.left, top: pos.top, transformOrigin: pos.origin, visibility: pos.visibility }}
      >
        <div style={s.head}>
          <span style={s.title}>换个心情</span>
          <button style={s.close} onClick={onClose} title="关闭">✕</button>
        </div>
        <div style={s.grid}>
          {PRESET_MOODS.map(p => (
            <button key={p.label} style={{ ...vivid(p.color, p.color, 13), ...s.chip }} title={p.vibe}
              onClick={() => !isLoading && onPick(p.text, p.energy, p.valence)} disabled={isLoading}>
              <Icon name={p.icon} size={17} color="#fff" filled={p.filled} strokeWidth={2.3} />
              <span style={s.chipLabel}>{p.label}</span>
            </button>
          ))}
        </div>
        <div style={s.inputRow}>
          <input style={s.input} placeholder="或描述：下班了累但想放松…" value={text} autoFocus disabled={isLoading}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <button style={{ ...s.go, background: accent, opacity: text.trim() && !isLoading ? 1 : 0.5 }}
            disabled={!text.trim() || isLoading} onClick={submit} title="开始">
            <Icon name="send" size={14} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  catcher: { position: 'fixed', inset: 0, zIndex: 400, background: 'transparent' },
  pop: { position: 'fixed', width: 320, maxWidth: '90vw', padding: 14, borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 11 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: 700, color: '#f9fafb' },
  close: { width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af', cursor: 'pointer', fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  chip: { position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 5px', cursor: 'pointer', color: '#fff', border: 'none' },
  chipLabel: { fontSize: 12, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  inputRow: { display: 'flex', gap: 7, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 11, padding: '9px 11px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  go: { flexShrink: 0, width: 38, height: 36, borderRadius: 11, border: 'none', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
