import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { glass } from '../ui/surface'

// 壁龛模式：贴右边缘的常驻竖条（无形感/和电脑融为一体）。
// 收起=一条会呼吸的光线 + 小封面；hover 向左展开成播放面板。
// 窗口宽度由主进程补间（76⇄372），这里只负责内容的淡入与呼吸。
const RIBBON_W = 76
const PANEL_W = 296   // = DOCK_EXPANDED(372) - RIBBON_W(76)

export default function NicheDock({ track, isPlaying, audioRef, accent = '#31c27c', accent2 = '#1db954', lyric, onTogglePlay, onNext, onVibe, onExit, onClose, expanded, onHover }) {
  const [progress, setProgress] = useState(0)
  const [curLine, setCurLine] = useState('')
  const lines = lyric?.lines || []

  useEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    const onTime = () => {
      if (audio.duration) setProgress(audio.currentTime / audio.duration)
      if (lines.length) {
        let t = ''
        for (let i = 0; i < lines.length; i++) { if (lines[i].time <= audio.currentTime) t = lines[i].text; else break }
        setCurLine(t)
      }
    }
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [audioRef, lines])

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || 'Mood DJ'
  const artist = track?.artists?.map(a => a.name).join(' / ') || '边缘电台'

  return (
    <div
      style={{ ...s.root, '--accent': accent, '--accent2': accent2 }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {/* 展开面板（在 ribbon 左侧；收起时被窄窗裁掉 + 淡出） */}
      <div style={{ ...s.panel, opacity: expanded ? 1 : 0, transform: expanded ? 'translateX(0)' : 'translateX(24px)', pointerEvents: expanded ? 'auto' : 'none' }}>
        <div style={s.panelInner}>
          <div style={s.artWrap} className={isPlaying ? 'floaty' : ''}>
            {art ? <img src={art} alt="" style={{ ...s.art, boxShadow: `0 18px 50px -16px ${accent}88` }} />
                 : <div style={{ ...s.art, ...s.artPh }}><Icon name="headphones" size={40} color={accent} /></div>}
          </div>
          <div style={s.title} title={title}>{title}</div>
          <div style={s.artist} title={artist}>{artist}</div>

          <div style={s.bar}><div style={{ ...s.barFill, width: `${progress * 100}%`, background: `linear-gradient(90deg, ${accent2}, ${accent})` }} /></div>

          <div style={s.transport}>
            <button style={{ ...s.tBtn, ...s.play, background: `linear-gradient(135deg, ${accent}, ${accent2})`, boxShadow: `0 10px 26px -8px ${accent}aa` }} onClick={onTogglePlay} title="播放/暂停">
              <Icon name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" filled />
            </button>
            <button style={s.tBtn} onClick={onNext} title="下一首"><Icon name="next" size={17} color="#e5e7eb" filled /></button>
          </div>

          <div style={s.vibes}>
            <button style={s.vibe} onClick={() => onVibe?.('up')} title="再嗨点"><Icon name="flame" size={14} color="#fb923c" /> 嗨</button>
            <button style={s.vibe} onClick={() => onVibe?.('down')} title="冷静些"><Icon name="moon" size={14} color="#93c5fd" /> 静</button>
            <button style={s.vibe} onClick={() => onVibe?.('flavor')} title="换味道"><Icon name="shuffle" size={14} color="#c4b5fd" /> 换</button>
          </div>

          {curLine && <div style={s.lyric}>{curLine}</div>}

          <div style={s.foot}>
            <button style={s.footBtn} onClick={onExit} title="回到大窗">⤢ 大窗</button>
            <button style={s.footBtn} onClick={onClose} title="收进托盘">收起</button>
          </div>
        </div>
      </div>

      {/* 常驻 ribbon（右边缘，永远可见） */}
      <div style={s.ribbon}>
        <div style={{ ...s.edge, background: `linear-gradient(180deg, ${accent2}, ${accent})` }} className="breathe" />
        <div style={s.ribbonInner}>
          <div style={{ ...s.thumb, animation: isPlaying ? 'spin 9s linear infinite' : 'none' }}>
            {art ? <img src={art} alt="" style={s.thumbImg} />
                 : <div style={{ ...s.thumbImg, ...s.artPh }}><Icon name="headphones" size={20} color={accent} /></div>}
          </div>
          <div style={{ ...s.dot, background: isPlaying ? accent : 'rgba(255,255,255,0.3)', boxShadow: isPlaying ? `0 0 10px ${accent}` : 'none' }} className={isPlaying ? 'breathe' : ''} />
          <div style={s.vtitle} title={title}>{title}</div>
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', color: '#f9fafb', fontFamily: 'system-ui,sans-serif', WebkitAppRegion: 'no-drag' },

  // ribbon：半透明竖条，与桌面相融；右缘一条呼吸光线
  ribbon: { position: 'absolute', right: 0, top: 0, width: RIBBON_W, height: '100%', background: 'linear-gradient(180deg, rgba(16,16,22,0.55) 0%, rgba(10,10,15,0.62) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  edge: { position: 'absolute', right: 0, top: 0, width: 3, height: '100%', opacity: 0.9 },
  ribbonInner: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  thumb: { width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.12)' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  dot: { width: 7, height: 7, borderRadius: '50%' },
  vtitle: { writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 11, color: 'rgba(229,231,235,0.62)', maxHeight: 150, overflow: 'hidden', letterSpacing: 1, WebkitAppRegion: 'no-drag' },

  // 展开面板：在 ribbon 左侧
  panel: { position: 'absolute', right: RIBBON_W, top: 0, width: PANEL_W, height: '100%', transition: 'opacity .26s ease, transform .26s cubic-bezier(.22,.61,.36,1)' },
  panelInner: { ...glass, height: '100%', borderRadius: '18px 0 0 18px', padding: '26px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, overflowY: 'auto' },
  artWrap: { marginTop: 6 },
  art: { width: 150, height: 150, borderRadius: 16, objectFit: 'cover', display: 'block' },
  artPh: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', marginTop: 8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  artist: { fontSize: 12.5, color: '#9ca3af', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bar: { width: '100%', height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  barFill: { height: '100%', borderRadius: 2 },
  transport: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 },
  tBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  play: { width: 54, height: 54, border: 'none' },
  vibes: { display: 'flex', gap: 8, marginTop: 14 },
  vibe: { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12, cursor: 'pointer' },
  lyric: { fontSize: 13, color: 'rgba(229,231,235,0.85)', textAlign: 'center', marginTop: 16, lineHeight: 1.5, minHeight: 20 },
  foot: { marginTop: 'auto', display: 'flex', gap: 8, paddingTop: 14, width: '100%' },
  footBtn: { flex: 1, padding: '7px 8px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 11.5, cursor: 'pointer' },
}
