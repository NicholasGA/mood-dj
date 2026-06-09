import { useState, useRef, useLayoutEffect } from 'react'
import Icon from './Icon'
import { vivid } from '../ui/surface'
import { PRESET_MOODS } from './MoodInput'
import LiquidLayer from './LiquidLayer'

// 换心情小浮窗：一滴水成形。和「心情卡」一摸一样的材质(同 vivid 渐变 + 同 seed 的 LiquidLayer)。
// 两层：水滴层(纯渐变,从小圆点 morph 成面板,丝滑) + 内容层(水纹+选项,水滴成形后淡入)。
// anchorRect = 心情卡的 getBoundingClientRect()；onPick(text, energy, valence) → 原来的 startRadio。
export default function MoodSwitcher({ anchorRect, accent = '#7c3aed', accent2 = '#4f46e5', seed = 'mood', isLoading, onPick, onClose }) {
  const [text, setText] = useState('')
  const popRef = useRef(null)
  const [pos, setPos] = useState({ left: 0, top: 0, origin: 'left top', visibility: 'hidden' })
  const submit = () => { const t = text.trim(); if (t && !isLoading) onPick(t, 0.5, 0.5) }
  const card = vivid(accent, accent2, 28)   // 与心情卡完全相同的材质

  // 贴着心情卡的同侧角展开；transformOrigin 指到那个角 → 水滴从心情卡那里冒出来成形
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
      <div ref={popRef} onClick={e => e.stopPropagation()} style={{ ...s.pop, left: pos.left, top: pos.top, visibility: pos.visibility }}>
        {/* 1) 水滴层：纯渐变(无模糊)，从圆点 morph 成面板 → 又像水又顺 */}
        <div className="mood-blob" aria-hidden style={{ ...s.blob, background: card.background, boxShadow: card.boxShadow, transformOrigin: pos.origin }} />
        {/* 2) 内容层：水纹 + 选项，水滴成形后淡入；border-radius 固定不参与形变 */}
        <div className="mood-body" style={s.body}>
          <LiquidLayer accent={accent} seed={`${seed}-m`} opacity={0.42} />
          <div style={s.inner}>
            <div style={s.head}>
              <span style={s.title}>换个心情</span>
              <button style={s.close} onClick={onClose} title="关闭">✕</button>
            </div>
            <div style={s.grid}>
              {PRESET_MOODS.map(p => (
                <button key={p.label} style={s.chip} title={p.vibe}
                  onClick={() => !isLoading && onPick(p.text, p.energy, p.valence)} disabled={isLoading}>
                  <Icon name={p.icon} size={17} color="#fff" filled={p.filled} strokeWidth={2.3} />
                  <span style={s.chipLabel}>{p.label}</span>
                </button>
              ))}
            </div>
            <div style={s.inputRow}>
              <input className="mood-pop-input" style={s.input} placeholder="或描述：下班了累但想放松…" value={text} autoFocus disabled={isLoading}
                onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
              <button style={{ ...s.go, opacity: text.trim() && !isLoading ? 1 : 0.5 }}
                disabled={!text.trim() || isLoading} onClick={submit} title="开始">
                <Icon name="send" size={14} color="#fff" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const s = {
  catcher: { position: 'fixed', inset: 0, zIndex: 400, background: 'transparent' },
  // pop 只负责定位/尺寸；背景透明，圆角由水滴层与内容层各自负责（pop 不裁剪，让水滴圆角能露出来）
  pop: { position: 'fixed', width: 320, maxWidth: '90vw' },
  blob: { position: 'absolute', inset: 0, borderRadius: 28, zIndex: 0 },
  // 内容层：固定 28 圆角 + 裁掉溢出的水纹；isolation 让 LiquidLayer(z-index:-1)落在水纹位但在文字下
  body: { position: 'relative', zIndex: 1, padding: '16px 18px', borderRadius: 28, overflow: 'hidden', isolation: 'isolate' },
  inner: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 12 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)' },
  close: { width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', cursor: 'pointer', fontSize: 12, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  chip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '11px 6px', borderRadius: 13, cursor: 'pointer', color: '#fff', background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.22)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' },
  chipLabel: { fontSize: 12, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  inputRow: { display: 'flex', gap: 7, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 11, padding: '9px 11px', color: '#fff', fontSize: 13, outline: 'none' },
  go: { flexShrink: 0, width: 38, height: 36, borderRadius: 11, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' },
}
