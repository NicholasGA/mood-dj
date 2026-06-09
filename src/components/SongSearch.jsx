import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'
import { glass } from '../ui/surface'

// 按歌名/歌手直接搜 QQ音乐的面板（和"跟 DJ 说想法"分开，避免混淆）。
// onSearch(query) → Promise<tracks>；onPlay(track) 立刻播；onQueue(track) 加入队列。
export default function SongSearch({ accent = '#31c27c', onSearch, onPlay, onQueue, onClose }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const reqRef = useRef(0)

  // 输入防抖 350ms 再搜；只认最后一次请求的结果（避免乱序覆盖）
  useEffect(() => {
    const query = q.trim()
    if (!query) { setResults([]); setLoading(false); return }
    setLoading(true); setTouched(true)
    const id = ++reqRef.current
    const t = setTimeout(async () => {
      try {
        const r = await onSearch(query)
        if (id === reqRef.current) setResults(Array.isArray(r) ? r : [])
      } catch { if (id === reqRef.current) setResults([]) }
      finally { if (id === reqRef.current) setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, onSearch])

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} className="fade-up" onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <span style={s.searchIcon}><Icon name="search" size={16} color="#9ca3af" /></span>
          <input
            style={s.input} autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="搜歌名 / 歌手，比如「晴天」「周杰伦」"
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          />
          <button style={s.close} onClick={onClose} title="关闭">✕</button>
        </div>

        <div style={s.list} className="lyrics-scroll">
          {loading && <div style={s.hint}>搜索中…</div>}
          {!loading && touched && q.trim() && results.length === 0 && <div style={s.hint}>没找到「{q.trim()}」相关的歌</div>}
          {!touched && !q.trim() && <div style={s.hint}>输入歌名直接搜，点结果即播；右侧 + 加入队列</div>}
          {results.map((t, i) => (
            <div key={`${t.mid}-${i}`} style={s.row} className="like-row">
              <div style={s.meta} onClick={() => onPlay(t)} title="立即播放">
                {t.album?.images?.[0]?.url
                  ? <img src={t.album.images[0].url} alt="" style={s.cover} draggable={false} />
                  : <div style={{ ...s.cover, ...s.coverPh }}>♪</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={s.name}>{t.name}</div>
                  <div style={s.artist}>{t.artists?.map(a => a.name).join(', ')}</div>
                </div>
              </div>
              <button style={{ ...s.act, color: accent }} title="立即播放" onClick={() => onPlay(t)}><Icon name="play" size={14} color={accent} filled /></button>
              <button style={s.act} title="加入队列" onClick={() => onQueue(t)}><Icon name="send" size={14} color="#cbd5e1" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' },
  panel: { ...glass, width: 'min(460px, 92vw)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  searchIcon: { display: 'flex', flexShrink: 0 },
  input: { flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f9fafb', fontSize: 15 },
  close: { width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer', flexShrink: 0 },
  list: { overflowY: 'auto', padding: 10, minHeight: 80 },
  hint: { padding: '28px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12 },
  meta: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' },
  cover: { width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  coverPh: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', fontSize: 18 },
  name: { fontSize: 14, fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  act: { width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
