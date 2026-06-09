import { useState, useRef, useLayoutEffect } from 'react'
import Icon from './Icon'
import { vivid } from '../ui/surface'
import { PRESET_MOODS } from './MoodInput'
import LiquidLayer from './LiquidLayer'

// 换心情小浮窗：固定从「心情卡」长出来，用心情卡的同色液体材质（和心情融为一体），
// 弹出时像一滴水汇聚成面板（liquid-pop-in：scale + 圆角形变 + 液体光斑）。
// anchorRect = 心情卡的 getBoundingClientRect()；onPick(text, energy, valence) → 原来的 startRadio。
export default function MoodSwitcher({ anchorRect, accent = '#7c3aed', seed = 'mood', isLoading, onPick, onClose }) {
  const [text, setText] = useState('')
  const popRef = useRef(null)
  const [pos, setPos] = useState({ left: 0, top: 0, origin: 'left top', visibility: 'hidden' })
  const submit = () => { const t = text.trim(); if (t && !isLoading) onPick(t, 0.5, 0.5) }

  // 把浮窗的一个角贴到心情卡的同侧角，朝有空间的方向展开 → 像从卡片那里涨开
  useLayoutEffect(() => {
    const el = popRef.current
    const r = anchorRect
    if (!el || !r) return
    const w = el.offsetWidth, h = el.offsetHeight, pad = 10
    const rightFits = r.left + w + pad <= window.innerWidth
    const belowFits = r.top + h + pad <= window.innerHeight
    let left = rightFits ? r.left : r.right - w
    let top = belowFits ? r.top : r.bottom - h
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad))
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad))
    setPos({ left, top, origin: `${rightFits ? 'left' : 'right'} ${belowFits ? 'top' : 'bottom'}`, visibility: 'visible' })
  }, [anchorRect])

  return (
    // 透明层：只接住外部点击关闭，不变暗
    <div style={s.catcher} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }}>
      <div
        ref={popRef}
        className="liquid-pop-in"
        onClick={e => e.stopPropagation()}
        style={{
          ...s.pop, left: pos.left, top: pos.top, transformOrigin: pos.origin, visibility: pos.visibility,
          background: `radial-gradient(135% 130% at 28% 0%, color-mix(in srgb, ${accent} 42%, #14121a) 0%, color-mix(in srgb, ${accent} 16%, #0c0b12) 68%, #0a0a10 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 26px 60px -24px color-mix(in srgb, ${accent} 45%, transparent), 0 0 70px -18px color-mix(in srgb, ${accent} 40%, transparent)`,
        }}
      >
        <LiquidLayer accent={accent} seed={`${seed}-pop`} count={3} opacity={0.55} blur={8} />
        <div style={s.inner}>
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
    </div>
  )
}

const s = {
  catcher: { position: 'fixed', inset: 0, zIndex: 400, background: 'transparent' },
  // 容器：液体层在渐变之上、内容之下（z-index:-1 + isolation）；overflow hidden 让入场形变裁出水珠形状
  pop: { position: 'fixed', width: 320, maxWidth: '90vw', borderRadius: 18, padding: 14, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', isolation: 'isolate' },
  inner: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 11 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: 700, color: '#f9fafb', textShadow: '0 1px 6px rgba(0,0,0,0.45)' },
  close: { width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', color: '#e5e7eb', cursor: 'pointer', fontSize: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  chip: { position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 5px', cursor: 'pointer', color: '#fff', border: 'none' },
  chipLabel: { fontSize: 12, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  inputRow: { display: 'flex', gap: 7, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 11, padding: '9px 11px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  go: { flexShrink: 0, width: 38, height: 36, borderRadius: 11, border: 'none', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
