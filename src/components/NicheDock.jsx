import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { glass } from '../ui/surface'

// 壁龛模式 v2：可自由拖动的悬浮唱片球，点击展开成播放面板（点击≠拖动，避免误触）。
// 收起态是一颗实心唱片球（封面+光晕+高光+缓慢旋转），不透明、有质感；
// 展开/收起由主进程一次性改窗尺寸，内容用 CSS 缩放过渡 → 平滑、无补间、不弹分辨率提示。

// 区分"点击"和"拖动"：按下后跟踪鼠标位移挪窗；几乎没动就当点击。
function useDragOrClick(onClick) {
  return (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    let lx = e.screenX, ly = e.screenY, moved = 0
    const move = (ev) => {
      const dx = ev.screenX - lx, dy = ev.screenY - ly
      lx = ev.screenX; ly = ev.screenY
      moved += Math.abs(dx) + Math.abs(dy)
      window.electronAPI.dockMove?.(dx, dy)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (moved < 5) onClick?.()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
}

export default function NicheDock({ track, isPlaying, audioRef, accent = '#31c27c', accent2 = '#1db954', lyric, expanded, onToggle, onTogglePlay, onNext, onVibe, onExit, onClose }) {
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
  const dragExpand = useDragOrClick(() => onToggle?.(true))
  const dragOnly = useDragOrClick(() => {})

  // ── 收起：实心唱片球 ──
  if (!expanded) {
    return (
      <div style={s.center}>
        <div style={s.orbWrap} className="dock-orb-in" onMouseDown={dragExpand} title="点击展开 · 拖动移动">
          <div style={{ ...s.glow, boxShadow: `0 0 26px 2px ${accent}aa, 0 0 60px 8px ${accent}33` }} className="breathe" />
          <div style={{ ...s.orb, animation: isPlaying ? 'spin 14s linear infinite' : 'none' }}>
            {art ? <img src={art} alt="" style={s.orbImg} draggable={false} />
                 : <div style={{ ...s.orbImg, background: `linear-gradient(145deg, ${accent}, ${accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="headphones" size={34} color="#fff" /></div>}
            <div style={s.gloss} />
            <div style={s.hole} />
          </div>
          {!isPlaying && <div style={s.pausePip}><Icon name="play" size={16} color="#fff" filled /></div>}
        </div>
      </div>
    )
  }

  // ── 展开：播放面板 ──
  return (
    <div style={s.center}>
      <div style={{ ...glass, ...s.panel }} className="dock-panel-in">
        <div style={s.handle} onMouseDown={dragOnly} title="拖动移动">
          <span style={s.grip} />
          <button style={s.iconBtn} onMouseDown={e => e.stopPropagation()} onClick={() => onToggle?.(false)} title="收成小球"><Icon name="dock" size={14} color="#9ca3af" /></button>
        </div>

        <div style={{ ...s.artWrap }} className={isPlaying ? 'floaty' : ''}>
          {art ? <img src={art} alt="" style={{ ...s.art, boxShadow: `0 18px 50px -16px ${accent}99` }} draggable={false} />
               : <div style={{ ...s.art, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(145deg, ${accent}, ${accent2})` }}><Icon name="headphones" size={40} color="#fff" /></div>}
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
          <button style={s.footBtn} onClick={onClose} title="收进托盘">托盘</button>
        </div>
      </div>
    </div>
  )
}

const s = {
  center: { width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f9fafb', fontFamily: 'system-ui,sans-serif', overflow: 'hidden', WebkitAppRegion: 'no-drag' },

  // 唱片球
  orbWrap: { position: 'relative', width: 100, height: 100, cursor: 'grab' },
  glow: { position: 'absolute', inset: 6, borderRadius: '50%', pointerEvents: 'none' },
  orb: { position: 'relative', width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 12px 30px -6px rgba(0,0,0,0.7)' },
  orbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  gloss: { position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(120% 90% at 30% 22%, rgba(255,255,255,0.34), rgba(255,255,255,0) 46%)', pointerEvents: 'none' },
  hole: { position: 'absolute', top: '50%', left: '50%', width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: '50%', background: 'rgba(10,10,14,0.92)', border: '1px solid rgba(255,255,255,0.18)', pointerEvents: 'none' },
  pausePip: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: '50%', background: 'rgba(14,14,18,0.92)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' },

  // 面板
  panel: { width: 320, height: 448, borderRadius: 22, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative' },
  handle: { width: '100%', height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', position: 'relative', marginBottom: 2 },
  grip: { width: 38, height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.18)' },
  iconBtn: { position: 'absolute', right: 0, top: -2, width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  artWrap: { marginTop: 2 },
  art: { width: 152, height: 152, borderRadius: 16, objectFit: 'cover', display: 'block' },
  title: { fontSize: 17, fontWeight: 700, textAlign: 'center', marginTop: 8, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  artist: { fontSize: 12.5, color: '#9ca3af', textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bar: { width: '100%', height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden', marginTop: 12 },
  barFill: { height: '100%', borderRadius: 2 },
  transport: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 },
  tBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  play: { width: 52, height: 52, border: 'none' },
  vibes: { display: 'flex', gap: 8, marginTop: 14, width: '100%' },
  vibe: { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12, cursor: 'pointer' },
  lyric: { fontSize: 12.5, color: 'rgba(229,231,235,0.8)', textAlign: 'center', marginTop: 12, lineHeight: 1.45, minHeight: 18, overflow: 'hidden' },
  foot: { marginTop: 'auto', display: 'flex', gap: 8, width: '100%' },
  footBtn: { flex: 1, padding: '7px 8px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af', fontSize: 11.5, cursor: 'pointer' },
}
