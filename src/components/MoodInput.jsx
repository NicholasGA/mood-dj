import { useState, useEffect } from 'react'
import Icon from './Icon'
import { vivid, tintedGlass } from '../ui/surface'

// 按当前时段 + 工作日/周末给出情境推荐
function getContextSuggestion(d = new Date()) {
  const h = d.getHours()
  const weekend = d.getDay() === 0 || d.getDay() === 6
  if (h >= 5 && h < 8)   return { emoji: '🌅', when: '清晨', text: '清晨刚醒，来点温柔唤醒的音乐', energy: 0.45, valence: 0.7 }
  if (h >= 8 && h < 11)  return weekend
    ? { emoji: '☕', when: '周末上午', text: '悠闲的周末上午，来点轻松惬意的', energy: 0.45, valence: 0.72 }
    : { emoji: '⚡', when: '上午', text: '上午开工，来点提神有活力的', energy: 0.62, valence: 0.65 }
  if (h >= 11 && h < 14) return { emoji: '🍱', when: '午间', text: '午休时间，来点放松慵懒的', energy: 0.4, valence: 0.6 }
  if (h >= 14 && h < 18) return weekend
    ? { emoji: '🛋️', when: '周末午后', text: '慵懒的周末午后，随便听点舒服的', energy: 0.4, valence: 0.66 }
    : { emoji: '🎯', when: '下午', text: '下午继续，来点专注的背景音乐', energy: 0.45, valence: 0.55 }
  if (h >= 18 && h < 21) return { emoji: '🌆', when: '傍晚', text: '忙完一天，来点放松治愈的', energy: 0.4, valence: 0.6 }
  if (h >= 21 && h < 24) return weekend
    ? { emoji: '🌃', when: '周末夜晚', text: '周末夜晚，来点微醺有氛围的', energy: 0.5, valence: 0.6 }
    : { emoji: '🌙', when: '夜晚', text: '夜深了，来点安静抒情的', energy: 0.35, valence: 0.5 }
  return { emoji: '😴', when: '深夜', text: '深夜了，来点安静助眠的 lofi', energy: 0.2, valence: 0.45 }
}

export const PRESET_MOODS = [
  { label: '开心', vibe: '轻快明亮', icon: 'smile', color: '#fbbf24', filled: false, text: '今天很开心，想听轻快的音乐', energy: 0.65, valence: 0.85 },
  { label: '亢奋', vibe: '越嗨越好', icon: 'flame', color: '#fb923c', filled: false, text: '精力充沛想蹦迪，越嗨越好', energy: 0.95, valence: 0.75 },
  { label: '平静', vibe: '舒缓放松', icon: 'leaf', color: '#4ade80', filled: false, text: '想放松一下，安静地听听音乐', energy: 0.25, valence: 0.6 },
  { label: '忧郁', vibe: '治愈安慰', icon: 'cloudRain', color: '#60a5fa', filled: false, text: '有点低落，想听一些安慰人的歌', energy: 0.3, valence: 0.2 },
  { label: '专注', vibe: '无词背景', icon: 'target', color: '#22d3ee', filled: false, text: '需要专注工作，要无歌词的背景音乐', energy: 0.45, valence: 0.55 },
  { label: '浪漫', vibe: '温柔情歌', icon: 'heart', color: '#f472b6', filled: true, text: '想听些浪漫温柔的情歌', energy: 0.4, valence: 0.7 },
]

export default function MoodInput({ onStart, isLoading, isActive, moodConfig, taste }) {
  const [text, setText] = useState('')
  const [energy, setEnergy] = useState(0.5)
  const [valence, setValence] = useState(0.5)
  const [now, setNow] = useState(() => new Date())

  // 每 5 分钟刷新一次，跨时段时推荐随之更新
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  const sug = getContextSuggestion(now)

  function applyPreset(p) {
    setText(p.text)
    setEnergy(p.energy)
    setValence(p.valence)
  }

  function submit() {
    if (!text.trim()) return
    onStart(text.trim(), energy, valence)
  }

  const accent = moodConfig?.color_primary || '#7c3aed'

  return (
    <div style={styles.bento} className="fade-up">
      {/* hero：标题 + 口味 + 情境推荐 + 文字描述 + 开启电台 */}
      <div style={{ ...tintedGlass(accent, 22), ...styles.hero }}>
        <h2 style={styles.heading}>今天想听点什么？</h2>
        {taste?.personality && (
          <div style={styles.taste} title="AI 读你的口味，挑歌与串场都会照着来">
            <Icon name="sparkles" size={14} color={accent} />
            <span style={styles.tasteText}>{taste.personality}</span>
          </div>
        )}
        <div style={{ ...styles.suggest, borderColor: `${accent}55`, background: `linear-gradient(120deg, ${accent}22, rgba(255,255,255,0.03))` }}>
          <span style={styles.suggestEmoji}>{sug.emoji}</span>
          <div style={styles.suggestBody}>
            <div style={styles.suggestLabel}>情境推荐 · {sug.when}</div>
            <div style={styles.suggestText}>{sug.text}</div>
          </div>
          <button
            style={{ ...styles.suggestBtn, background: accent, opacity: isLoading ? 0.5 : 1 }}
            onClick={() => !isLoading && onStart(sug.text, sug.energy, sug.valence)}
            disabled={isLoading}
          ><Icon name="play" size={13} color="#fff" /> 就这个</button>
        </div>
        <textarea
          style={styles.textarea}
          placeholder="或者用文字描述你的心情…比如「下班了累但是想放松」"
          value={text} onChange={e => setText(e.target.value)} rows={2}
        />
        <button
          style={{ ...styles.startBtn, background: isLoading ? '#374151' : `linear-gradient(135deg, ${accent}, ${moodConfig?.color_secondary || '#4f46e5'})` }}
          onClick={submit} disabled={isLoading || !text.trim()}
        >
          {isLoading ? <>AI 分析中…</> : <><Icon name={isActive ? 'refresh' : 'mic'} size={17} color="#fff" /> {isActive ? '换个风格' : '开启电台'}</>}
        </button>
      </div>

      {/* 6 心情方块：左上图标 + 左下名字/氛围词 + 角落水印图标（填满不空） */}
      <div style={styles.moodGrid} className="stagger">
        {PRESET_MOODS.map(p => (
          <button key={p.label} style={{ ...vivid(p.color, p.color, 18), ...styles.moodTile }} onClick={() => applyPreset(p)}>
            <Icon name={p.icon} size={22} color="#fff" filled={p.filled} strokeWidth={2.3} />
            <div style={styles.moodName}>{p.label}</div>
            <div style={styles.moodVibe}>{p.vibe}</div>
            <span style={styles.moodMark}><Icon name={p.icon} size={70} color="rgba(255,255,255,0.18)" filled={p.filled} strokeWidth={2} /></span>
          </button>
        ))}
      </div>

      {/* 能量 / 情绪 双滑块 */}
      <div style={{ ...tintedGlass(accent, 18), ...styles.sliderTile }}>
        <SliderRow label="能量感" leftTip="平静放松" rightTip="亢奋激烈" value={energy} onChange={setEnergy} accent={accent} />
        <SliderRow label="情绪值" leftTip="低落忧郁" rightTip="开心愉快" value={valence} onChange={setValence} accent={accent} />
      </div>
    </div>
  )
}

function SliderRow({ label, leftTip, rightTip, value, onChange, accent }) {
  return (
    <div style={styles.sliderRow}>
      <div style={styles.sliderHeader}>
        <span style={styles.sliderLabel}>{label}</span>
        <span style={styles.sliderVal}>{Math.round(value * 100)}%</span>
      </div>
      <div style={styles.sliderWrap}>
        <span style={styles.tip}>{leftTip}</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ '--accent': accent, flex: 1 }}
          className="mood-slider"
        />
        <span style={styles.tip}>{rightTip}</span>
      </div>
    </div>
  )
}

const styles = {
  bento: { display: 'flex', flexDirection: 'column', gap: 14 },
  hero: { padding: 22, display: 'flex', flexDirection: 'column', gap: 12 },
  heading: { fontSize: 20, fontWeight: 800, color: '#f9fafb', margin: 0 },
  taste: { display: 'flex', alignItems: 'center', gap: 7, marginTop: -8, fontSize: 12.5, color: '#cbd5e1', fontWeight: 500, lineHeight: 1.4 },
  tasteText: { opacity: 0.92 },
  suggest: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 14, border: '1px solid' },
  suggestEmoji: { fontSize: 24, flexShrink: 0 },
  suggestBody: { flex: 1, minWidth: 0 },
  suggestLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 2, letterSpacing: 0.5 },
  suggestText: { fontSize: 13, color: '#f3f4f6', fontWeight: 500, lineHeight: 1.3 },
  suggestBtn: { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 10, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  moodGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  moodTile: { position: 'relative', overflow: 'hidden', minHeight: 92, padding: '14px 15px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', cursor: 'pointer', color: '#fff' },
  moodName: { marginTop: 'auto', fontSize: 16, fontWeight: 800, color: '#fff', textShadow: '0 1px 5px rgba(0,0,0,0.45)' },
  moodVibe: { fontSize: 11, color: 'rgba(255,255,255,0.82)', marginTop: 2, textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  moodMark: { position: 'absolute', right: -10, bottom: -14, pointerEvents: 'none', transform: 'rotate(-8deg)' },
  textarea: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '11px 14px', color: '#f9fafb', fontSize: 14,
    resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
  },
  sliderTile: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  sliderGroup: { display: 'flex', flexDirection: 'column', gap: 14 },
  sliderRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  sliderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sliderLabel: { fontSize: 13, color: '#d1d5db', fontWeight: 500 },
  sliderVal: { fontSize: 12, color: '#9ca3af' },
  sliderWrap: { display: 'flex', alignItems: 'center', gap: 8 },
  tip: { fontSize: 10, color: '#6b7280', whiteSpace: 'nowrap' },
  startBtn: {
    padding: '13px 0', borderRadius: 12, color: '#fff',
    fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer',
    letterSpacing: 0.5, transition: 'opacity .2s',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
}
