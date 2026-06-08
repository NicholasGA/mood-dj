import { useState } from 'react'
import Icon from './Icon'
import { analyzeTaste, clusterLikes } from '../services/claudeDJ'

export default function LikesPanel({ likedTracks, accent = '#f472b6', onClose, onPlayTrack, onRemove, onPlayRadio, onPlayGroup }) {
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [groups, setGroups] = useState(null)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [err, setErr] = useState('')

  const n = likedTracks.length

  async function genProfile() {
    if (n < 3) { setErr('喜欢的歌太少，多 ❤️ 几首再看画像'); return }
    setProfileLoading(true); setErr('')
    try { setProfile(await analyzeTaste(likedTracks)) }
    catch { setErr('画像生成失败（AI 配额可能用完了，明天再试）') }
    finally { setProfileLoading(false) }
  }
  async function genGroups() {
    if (n < 4) { setErr('喜欢的歌太少，多 ❤️ 几首再分组'); return }
    setGroupsLoading(true); setErr('')
    try { const g = await clusterLikes(likedTracks); setGroups(g.length ? g : []); if (!g.length) setErr('暂时分不出组，再多喜欢点歌') }
    catch { setErr('分组失败（AI 配额可能用完了，明天再试）') }
    finally { setGroupsLoading(false) }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.panel} className="fade-up" onClick={e => e.stopPropagation()}>
        <div style={s.head}>
          <span style={s.title}><Icon name="heart" size={16} color={accent} filled /> 我喜欢的 · {n} 首</span>
          <button style={s.close} onClick={onClose}>✕</button>
        </div>

        {/* 三个差异化入口 */}
        <div style={s.actions}>
          <button style={{ ...s.action, background: accent, color: '#fff', border: 'none' }} onClick={onPlayRadio} title="爱的歌 × AI 发现的同好新歌，无限续">
            <Icon name="play" size={13} color="#fff" /> 喜欢电台
          </button>
          <button style={s.action} onClick={genProfile} disabled={profileLoading}>
            🪞 {profileLoading ? '分析中…' : '音乐画像'}
          </button>
          <button style={s.action} onClick={genGroups} disabled={groupsLoading}>
            🗂️ {groupsLoading ? '分组中…' : '自动分组'}
          </button>
        </div>
        <div style={s.hintLine}>喜欢电台 = 你爱的歌 + AI 挖的同类新歌，越听越懂你（QQ 收藏夹给不了的）</div>
        {err && <div style={s.err}>{err}</div>}

        {/* AI 音乐画像 */}
        {profile && (
          <div style={{ ...s.profile, borderColor: `${accent}44` }}>
            <div style={s.profileLine}>🪞 {profile.personality}</div>
            <div style={s.chipRow}>
              {profile.genres.map(g => <span key={g} style={s.chip}>{g}</span>)}
              {profile.moods.map(m => <span key={m} style={{ ...s.chip, background: `${accent}22`, color: accent }}>{m}</span>)}
            </div>
            {profile.explore && <div style={s.explore}>↗ {profile.explore}</div>}
          </div>
        )}

        {/* 自动 vibe 分组 */}
        {groups && groups.length > 0 && (
          <div style={s.groupRow}>
            {groups.map(g => (
              <button key={g.name} style={s.groupChip} onClick={() => onPlayGroup(g.tracks)} title={`播放「${g.name}」${g.tracks.length}首`}>
                {g.emoji} {g.name} <span style={{ opacity: 0.5 }}>{g.tracks.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* 列表 */}
        <div style={s.list} className="lyrics-scroll">
          {n === 0
            ? <div style={s.empty}>还没有喜欢的歌～<br />播放时点 ❤️，就会加到这里，还能开"喜欢电台"挖新歌</div>
            : likedTracks.slice().reverse().map(t => (
              <div key={t.mid} style={s.row} className="like-row" onClick={() => onPlayTrack(t)}>
                {t.album?.images?.[0]?.url
                  ? <img src={t.album.images[0].url} alt="" style={s.cover} />
                  : <div style={{ ...s.cover, ...s.coverPh }}>♪</div>}
                <div style={s.meta}>
                  <div style={s.name}>{t.name}</div>
                  <div style={s.artist}>{t.artists?.map(a => a.name).join(', ')}{t.mood ? ` · ${t.mood}时喜欢` : ''}</div>
                </div>
                <button style={s.remove} className="like-remove" title="取消喜欢" onClick={e => { e.stopPropagation(); onRemove(t.mid) }}>✕</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  panel: { width: 'min(500px, 92vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'rgba(16,16,22,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.6)', overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', padding: '16px 18px 12px' },
  title: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: '#f9fafb' },
  close: { marginLeft: 'auto', width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' },
  actions: { display: 'flex', gap: 8, padding: '0 18px', flexWrap: 'wrap' },
  action: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  hintLine: { padding: '8px 18px 0', fontSize: 11, color: '#6b7280', lineHeight: 1.5 },
  err: { margin: '8px 18px 0', padding: '7px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: 12 },
  profile: { margin: '12px 18px 0', padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid' },
  profileLine: { fontSize: 14, color: '#f3f4f6', fontWeight: 600, lineHeight: 1.5, marginBottom: 8 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 11, padding: '3px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' },
  explore: { marginTop: 8, fontSize: 12, color: '#9ca3af' },
  groupRow: { display: 'flex', flexWrap: 'wrap', gap: 7, padding: '12px 18px 0' },
  groupChip: { padding: '6px 12px', borderRadius: 16, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' },
  list: { overflowY: 'auto', padding: 10, marginTop: 8 },
  empty: { padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13, lineHeight: 1.8 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: 8, borderRadius: 12, cursor: 'pointer', transition: 'background .15s' },
  cover: { width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  coverPh: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', fontSize: 20 },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  artist: { fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 },
  remove: { width: 26, height: 26, borderRadius: '50%', background: 'transparent', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
}
