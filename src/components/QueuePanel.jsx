import { useState } from 'react'
import Icon from './Icon'

// 播放队列 + 历史面板：「接下来」可播某首/置顶/移除/清空；「最近」点歌即重听
export default function QueuePanel({ queue = [], history = [], accent = '#31c27c', onClose, onPlayAt, onToFront, onRemove, onClear, onPlayHistory, onExport }) {
  const [tab, setTab] = useState('queue')
  const curList = tab === 'queue' ? queue : history

  const Tab = ({ id, label, n }) => (
    <button
      style={{ ...s.tab, ...(tab === id ? { color: accent, borderColor: accent } : {}) }}
      onClick={() => setTab(id)}
    >{label} {n}</button>
  )

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} className="fade-up" onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <Tab id="queue" label="接下来" n={queue.length} />
          <Tab id="history" label="最近" n={history.length} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {onExport && curList.length > 0 && (
              <button style={{ ...s.clear, color: accent, borderColor: `${accent}66`, display: 'inline-flex', alignItems: 'center', gap: 4 }} title="把这些歌存成一个 QQ 歌单"
                onClick={() => onExport(curList, tab === 'queue' ? '电台' : '最近在听')}>
                <Icon name="heart" size={11} color={accent} filled /> 导出歌单
              </button>
            )}
            {tab === 'queue' && queue.length > 0 && <button style={s.clear} onClick={onClear}>清空</button>}
            <button style={s.close} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={s.list} className="lyrics-scroll">
          {tab === 'queue'
            ? (queue.length === 0
              ? <div style={s.empty}>队列空了～开个电台就会自动续上</div>
              : queue.map((t, i) => (
                <div key={`q-${t.mid}-${i}`} style={s.row} className="like-row">
                  <span style={{ ...s.num, color: accent }}>{i + 1}</span>
                  <Cover t={t} />
                  <div style={s.meta} onClick={() => onPlayAt(i)} title="从这首开始播"><Name t={t} /></div>
                  {i > 0 && <button style={s.act} title="下一首就播" onClick={() => onToFront(i)}><Icon name="flame" size={14} color="#cbd5e1" /></button>}
                  <button style={s.act} title="从队列移除" onClick={() => onRemove(i)}><Icon name="thumbsDown" size={14} color="#cbd5e1" /></button>
                </div>
              )))
            : (history.length === 0
              ? <div style={s.empty}>还没有播放历史～放几首就有了</div>
              : history.map((t, i) => (
                <div key={`h-${t.mid}-${i}`} style={s.row} className="like-row" onClick={() => onPlayHistory(t)} title="重听这首">
                  <Cover t={t} />
                  <div style={s.meta}><Name t={t} /></div>
                  <span style={s.ago}>{timeAgo(t.at)}</span>
                  <Icon name="play" size={13} color="#cbd5e1" />
                </div>
              )))}
        </div>
      </div>
    </div>
  )
}

function Cover({ t }) {
  return t.album?.images?.[0]?.url
    ? <img src={t.album.images[0].url} alt="" style={s.cover} />
    : <div style={{ ...s.cover, ...s.coverPh }}>♪</div>
}
function Name({ t }) {
  return (
    <>
      <div style={s.name}>{t.name}</div>
      <div style={s.artist}>{t.artists?.map(a => a.name).join(', ')}</div>
    </>
  )
}
function timeAgo(at) {
  if (!at) return ''
  const d = Math.max(0, Date.now() - at)
  const m = Math.floor(d / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  return `${Math.floor(h / 24)}天前`
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { width: 'min(460px, 92vw)', maxHeight: '78vh', display: 'flex', flexDirection: 'column', background: 'rgba(16,16,22,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px 10px' },
  tab: { padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  clear: { marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 12, cursor: 'pointer' },
  close: { marginLeft: 'auto', width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' },
  list: { overflowY: 'auto', padding: 10 },
  empty: { padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, cursor: 'pointer' },
  num: { width: 20, textAlign: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  cover: { width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  coverPh: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', fontSize: 18 },
  meta: { flex: 1, minWidth: 0, cursor: 'pointer' },
  name: { fontSize: 14, fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  ago: { fontSize: 11, color: '#6b7280', flexShrink: 0, whiteSpace: 'nowrap' },
  act: { width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
