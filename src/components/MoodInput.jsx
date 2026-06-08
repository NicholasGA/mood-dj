import { useState } from 'react'

const PRESET_MOODS = [
  { label: '开心', emoji: '😄', text: '今天很开心，想听轻快的音乐', energy: 0.65, valence: 0.85 },
  { label: '亢奋', emoji: '🔥', text: '精力充沛想蹦迪，越嗨越好', energy: 0.95, valence: 0.75 },
  { label: '平静', emoji: '🌿', text: '想放松一下，安静地听听音乐', energy: 0.25, valence: 0.6 },
  { label: '忧郁', emoji: '🌧️', text: '有点低落，想听一些安慰人的歌', energy: 0.3, valence: 0.2 },
  { label: '专注', emoji: '🎯', text: '需要专注工作，要无歌词的背景音乐', energy: 0.45, valence: 0.55 },
  { label: '浪漫', emoji: '💕', text: '想听些浪漫温柔的情歌', energy: 0.4, valence: 0.7 },
]

export default function MoodInput({ onStart, isLoading, isActive, moodConfig }) {
  const [text, setText] = useState('')
  const [energy, setEnergy] = useState(0.5)
  const [valence, setValence] = useState(0.5)

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
    <div style={styles.panel}>
      <h2 style={styles.heading}>今日心情</h2>

      <div style={styles.presets}>
        {PRESET_MOODS.map(p => (
          <button key={p.label} style={styles.preset} onClick={() => applyPreset(p)}>
            <span>{p.emoji}</span>
            <span style={styles.presetLabel}>{p.label}</span>
          </button>
        ))}
      </div>

      <textarea
        style={styles.textarea}
        placeholder="或者用文字描述你的心情…比如「下班了累但是想放松」"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
      />

      <div style={styles.sliderGroup}>
        <SliderRow
          label="能量感"
          leftTip="平静放松"
          rightTip="亢奋激烈"
          value={energy}
          onChange={setEnergy}
          accent={accent}
        />
        <SliderRow
          label="情绪值"
          leftTip="低落忧郁"
          rightTip="开心愉快"
          value={valence}
          onChange={setValence}
          accent={accent}
        />
      </div>

      <button
        style={{ ...styles.startBtn, background: isLoading ? '#374151' : `linear-gradient(135deg, ${accent}, ${moodConfig?.color_secondary || '#4f46e5'})` }}
        onClick={submit}
        disabled={isLoading || !text.trim()}
      >
        {isLoading ? '🎵 AI 分析中…' : isActive ? '🔄 换个风格' : '🎙️ 开启电台'}
      </button>
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
  panel: {
    background: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
    padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
  },
  heading: { fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 },
  presets: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  preset: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '8px 4px', cursor: 'pointer', color: '#e5e7eb',
    fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    transition: 'background .15s',
  },
  presetLabel: { fontSize: 11, color: '#9ca3af' },
  textarea: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12, padding: '12px 14px', color: '#f9fafb', fontSize: 14,
    resize: 'none', fontFamily: 'inherit', lineHeight: 1.6, outline: 'none',
  },
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
  },
}
