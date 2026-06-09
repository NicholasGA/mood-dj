import { useState } from 'react'
import Icon from './Icon'
import { vivid, glass } from '../ui/surface'
import { PRESET_MOODS } from './MoodInput'

// 换心情小悬浮窗：不离开播放页，点出来一个浮层，6 个预设心情一点即换 + 文字描述。
// onPick(text, energy, valence) → 走和原来一样的 startRadio。
export default function MoodSwitcher({ accent = '#7c3aed', isLoading, onPick, onClose }) {
  const [text, setText] = useState('')
  const submit = () => { const t = text.trim(); if (t && !isLoading) onPick(t, 0.5, 0.5) }
  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={{ ...glass, ...s.pop }} className="dock-panel-in" onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <span style={s.title}>换个心情</span>
          <button style={s.close} onClick={onClose} title="关闭">✕</button>
        </div>
        <div style={s.grid} className="stagger">
          {PRESET_MOODS.map(p => (
            <button key={p.label} style={{ ...vivid(p.color, p.color, 14), ...s.chip }} title={p.vibe}
              onClick={() => !isLoading && onPick(p.text, p.energy, p.valence)} disabled={isLoading}>
              <Icon name={p.icon} size={18} color="#fff" filled={p.filled} strokeWidth={2.3} />
              <span style={s.chipLabel}>{p.label}</span>
            </button>
          ))}
        </div>
        <div style={s.inputRow}>
          <input style={s.input} placeholder="或描述：下班了累但想放松…" value={text} autoFocus disabled={isLoading}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          <button style={{ ...s.go, background: accent, opacity: text.trim() && !isLoading ? 1 : 0.5 }}
            disabled={!text.trim() || isLoading} onClick={submit} title="开始">
            <Icon name="send" size={15} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  backdrop: { position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(6,6,11,0.55)' },
  pop: { width: 380, maxWidth: '90vw', padding: 18, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: 700, color: '#f9fafb' },
  close: { width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9ca3af', cursor: 'pointer', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9 },
  chip: { position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '12px 6px', cursor: 'pointer', color: '#fff', border: 'none' },
  chipLabel: { fontSize: 12.5, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  inputRow: { display: 'flex', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  go: { flexShrink: 0, width: 40, height: 38, borderRadius: 12, border: 'none', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
