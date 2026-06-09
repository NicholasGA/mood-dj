import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'
import { glass } from '../ui/surface'

// 找歌面板：「搜歌」按歌名/歌手搜 QQ音乐；「我的收藏」浏览我的歌单(我喜欢/自建/收藏的)→打开看歌→播。
// 都和"跟 DJ 说想法"分开。onSearch(q)→Promise<tracks>；onLoadPlaylist(id)→Promise<tracks>；
// onPlay(track) 立即播；onQueue(track) 加入队列；onPlayList(tracks) 整批播(随机听)。
export default function SongSearch({ accent = '#31c27c', playlists = [], onSearch, onLoadPlaylist, onPlay, onQueue, onPlayList, onClose }) {
  const [tab, setTab] = useState('search')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(null)        // 选中的歌单
  const [plTracks, setPlTracks] = useState([])
  const [oldFirst, setOldFirst] = useState(false)   // 排序：默认新→旧；开 = 旧→新
  const reqRef = useRef(0)

  // 「搜歌」防抖搜 QQ；只认最后一次请求
  useEffect(() => {
    if (tab !== 'search') return
    const query = q.trim()
    if (!query) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqRef.current
    const t = setTimeout(async () => {
      try { const r = await onSearch(query); if (id === reqRef.current) setResults(Array.isArray(r) ? r : []) }
      catch { if (id === reqRef.current) setResults([]) }
      finally { if (id === reqRef.current) setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [q, tab, onSearch])

  // 打开某歌单 → 拉它的歌
  useEffect(() => {
    if (!sel) { setPlTracks([]); return }
    let cancelled = false
    setLoading(true); setPlTracks([])
    Promise.resolve(onLoadPlaylist?.(sel.id)).then(ts => { if (!cancelled) setPlTracks(Array.isArray(ts) ? ts : []) })
      .catch(() => { if (!cancelled) setPlTracks([]) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sel, onLoadPlaylist])

  const ql = q.trim().toLowerCase()
  const matchT = (t) => (t.name || '').toLowerCase().includes(ql) || (t.artists || []).some(a => (a.name || '').toLowerCase().includes(ql))
  const trackList = (() => {
    let arr = ql ? plTracks.filter(matchT) : plTracks
    if (oldFirst) arr = [...arr].reverse()
    return arr
  })()
  const plShown = ql ? playlists.filter(p => (p.name || '').toLowerCase().includes(ql)) : playlists
  const inPlaylist = tab === 'fav' && sel

  const Tab = ({ id, label }) => (
    <button style={{ ...s.tab, ...(tab === id ? { color: accent, borderColor: accent } : {}) }}
      onClick={() => { setTab(id); setQ(''); setSel(null) }}>{label}</button>
  )
  const goBack = () => { setSel(null); setQ('') }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} className="fade-up" onClick={e => e.stopPropagation()}>
        <div style={s.tabs}>
          {inPlaylist
            ? <button style={s.back} onClick={goBack} title="返回歌单列表">‹ {sel.name}</button>
            : (<><Tab id="search" label="搜歌" /><Tab id="fav" label={`我的收藏${playlists.length ? ` ${playlists.length}` : ''}`} /></>)}
          {inPlaylist && trackList.length > 0 && (
            <>
              <button style={{ ...s.miniBtn, color: accent, borderColor: `${accent}66` }} title="按收藏时间排序（我喜欢按加入先后；其它歌单按歌单顺序）" onClick={() => setOldFirst(v => !v)}>
                <Icon name="clock" size={11} color={accent} /> {oldFirst ? '最早收藏' : '最近收藏'}
              </button>
              <button style={{ ...s.miniBtn, color: accent, borderColor: `${accent}66` }} title="随机播放这个歌单" onClick={() => onPlayList?.([...trackList].sort(() => Math.random() - 0.5))}>
                <Icon name="shuffle" size={11} color={accent} /> 随机听
              </button>
            </>
          )}
          <button style={s.close} onClick={onClose} title="关闭">✕</button>
        </div>

        {(tab === 'search' || inPlaylist) && (
          <div style={s.head}>
            <span style={s.searchIcon}><Icon name="search" size={16} color="#9ca3af" /></span>
            <input style={s.input} autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder={tab === 'search' ? '搜歌名 / 歌手，比如「晴天」「周杰伦」' : `在「${sel.name}」里筛选…`}
              onKeyDown={e => { if (e.key === 'Escape') (inPlaylist ? goBack() : onClose()) }} />
          </div>
        )}

        <div style={s.list} className="lyrics-scroll">
          {/* 搜歌结果 */}
          {tab === 'search' && (<>
            {loading && <div style={s.hint}>搜索中…</div>}
            {!loading && q.trim() && results.length === 0 && <div style={s.hint}>没找到「{q.trim()}」相关的歌</div>}
            {!loading && !q.trim() && <div style={s.hint}>输入歌名直接搜，点结果即播；右侧 ✈ 加入队列</div>}
            {results.map((t, i) => <TrackRow key={`${t.mid}-${i}`} t={t} accent={accent} onPlay={onPlay} onQueue={onQueue} />)}
          </>)}

          {/* 我的收藏：歌单列表 */}
          {tab === 'fav' && !sel && (<>
            {playlists.length === 0 && <div style={s.hint}>还没读到你的歌单（先登录 QQ，收藏些歌单/歌）</div>}
            {plShown.map(p => (
              <div key={p.id} style={s.row} className="like-row" onClick={() => { setSel(p); setQ(''); setOldFirst(false) }} title="打开看歌">
                {p.cover ? <img src={p.cover} alt="" style={s.cover} draggable={false} /> : <div style={{ ...s.cover, ...s.coverPh }}>♪</div>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={s.name}>{p.name}</div>
                  <div style={s.artist}>{p.count} 首</div>
                </div>
                <Icon name="play" size={14} color="#cbd5e1" />
              </div>
            ))}
          </>)}

          {/* 我的收藏：某歌单里的歌 */}
          {inPlaylist && (<>
            {loading && <div style={s.hint}>读取「{sel.name}」…</div>}
            {!loading && plTracks.length > 0 && trackList.length === 0 && <div style={s.hint}>这个歌单里没有「{q.trim()}」</div>}
            {!loading && plTracks.length === 0 && <div style={s.hint}>这个歌单没取到歌</div>}
            {trackList.map((t, i) => <TrackRow key={`${t.mid}-${i}`} t={t} accent={accent} onPlay={onPlay} onQueue={onQueue} />)}
          </>)}
        </div>
      </div>
    </div>
  )
}

function TrackRow({ t, accent, onPlay, onQueue }) {
  return (
    <div style={s.row} className="like-row">
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
  )
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' },
  panel: { ...glass, width: 'min(460px, 92vw)', maxHeight: '72vh', display: 'flex', flexDirection: 'column', borderRadius: 18, overflow: 'hidden' },
  tabs: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0', flexWrap: 'wrap' },
  tab: { padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#cbd5e1', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  back: { padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#f3f4f6', fontSize: 13, fontWeight: 600, cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '5px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  close: { marginLeft: 'auto', width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer', flexShrink: 0 },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
  searchIcon: { display: 'flex', flexShrink: 0 },
  input: { flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#f9fafb', fontSize: 15 },
  list: { overflowY: 'auto', padding: 10, minHeight: 80 },
  hint: { padding: '28px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13, lineHeight: 1.5 },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, cursor: 'pointer' },
  meta: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' },
  cover: { width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  coverPh: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', fontSize: 18 },
  name: { fontSize: 14, fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  act: { width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
}
