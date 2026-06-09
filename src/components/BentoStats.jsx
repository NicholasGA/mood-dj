import { vivid } from '../ui/surface'

// bento 状态方块（参考霓虹 dashboard）：放歌时一排鲜艳渐变方块，标签在上、大 LED 数字在下。
export default function BentoStats({ accent = '#a78bfa', energy = 0.5, queue = 0, listened = 0, mood = '' }) {
  const tiles = [
    { label: '能量',  value: String(Math.round(energy * 100)), unit: '%', c: '#fb923c', led: true },
    { label: '队列',  value: String(queue),                    unit: '首', c: '#60a5fa', led: true },
    { label: '已听',  value: String(listened),                 unit: '首', c: '#34d399', led: true },
    { label: '当前心情', value: mood || '随心',                 unit: '',   c: accent,   led: false },
  ]
  return (
    <div style={s.row}>
      {tiles.map(t => (
        <div key={t.label} style={{ ...vivid(t.c, t.c, 20), ...s.tile }}>
          <div style={s.label}>{t.label}</div>
          <div style={s.valRow}>
            <span style={t.led ? s.led : s.text} className={t.led ? 'led' : undefined}>{t.value}</span>
            {t.unit && <span style={s.unit}>{t.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

const s = {
  row: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  tile: { padding: '14px 16px', minHeight: 84, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#fff', cursor: 'default' },
  label: { fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.78)', textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  valRow: { display: 'flex', alignItems: 'baseline', gap: 5 },
  led: { fontSize: 28, lineHeight: 1, color: '#fff' },          // .led 类提供 DSEG7 + 辉光
  text: { fontSize: 22, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  unit: { fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.75)' },
}
