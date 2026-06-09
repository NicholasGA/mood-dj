import { useState, useEffect, useRef } from 'react'
import Icon from './Icon'

const VIEW_H = 188

export default function Lyrics({ lines, audioRef, accent = '#31c27c', hasTrans, fill = false }) {
  const [idx, setIdx] = useState(-1)
  const [showTrans, setShowTrans] = useState(false)
  const [seekNonce, setSeekNonce] = useState(0)
  const [hoverIdx, setHoverIdx] = useState(null)   // 悬停的歌词行（只在字上才高亮/可点）
  const rafRef = useRef(null)
  const containerRef = useRef(null)
  const lineRefs = useRef([])
  const manualUntilRef = useRef(0)   // 用户手动滑动后暂停自动跟随到此时间戳

  // 跟随播放进度更新当前行；seek 后恢复自动跟随并强制重新居中
  useEffect(() => {
    setIdx(-1)
    lineRefs.current = []
    const audio = audioRef?.current
    if (!audio || !lines?.length) return
    const tick = () => {
      const t = audio.currentTime
      let i = -1
      for (let k = 0; k < lines.length; k++) { if (lines[k].time <= t) i = k; else break }
      setIdx(prev => (prev === i ? prev : i))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    const onSeeked = () => { manualUntilRef.current = 0; setSeekNonce(n => n + 1) }
    audio.addEventListener('seeked', onSeeked)
    return () => { cancelAnimationFrame(rafRef.current); audio.removeEventListener('seeked', onSeeked) }
  }, [lines, audioRef])

  // 当前行变化（或 seek）时自动居中（除非用户刚手动滑动过）
  useEffect(() => {
    if (idx < 0 || Date.now() < manualUntilRef.current) return
    const el = lineRefs.current[idx]
    const box = containerRef.current
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' })
  }, [idx, seekNonce])

  const pauseAuto = () => { manualUntilRef.current = Date.now() + 4000 }

  const seekTo = (time) => {
    const audio = audioRef?.current
    if (!audio) return
    audio.currentTime = time
    manualUntilRef.current = 0           // 点歌词跳转后恢复自动跟随
    if (audio.paused) audio.play().catch(() => {})
  }

  if (!lines?.length) return <div style={fill ? s.emptyFill : s.empty}>♪ 纯音乐 / 暂无歌词 ♪</div>

  return (
    <div style={fill ? s.wrapFill : s.wrap}>
      {hasTrans && (
        <button
          style={{ ...s.langBtn, color: showTrans ? accent : 'rgba(203,213,225,0.6)', borderColor: showTrans ? accent : 'rgba(255,255,255,0.15)' }}
          onClick={() => setShowTrans(v => !v)}
          title="切换翻译"
        >{showTrans ? '译' : '原'}</button>
      )}
      <div
        ref={containerRef}
        className="lyrics-scroll"
        style={fill ? s.viewFill : s.view}
        onWheel={pauseAuto}
        onPointerDown={pauseAuto}
      >
        <div style={{ padding: `${fill ? 150 : VIEW_H / 2 - 14}px 0` }}>
          {lines.map((l, i) => {
            const active = i === idx
            const hov = hoverIdx === i
            return (
              // 外层撑满宽度只负责居中/滚动定位，不可交互；交互交给内层贴字的 span
              <div
                key={i}
                ref={el => (lineRefs.current[i] = el)}
                style={{
                  padding: '2px 0', textAlign: 'center',
                  transition: 'transform .3s',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span
                  onClick={() => seekTo(l.time)}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(v => (v === i ? null : v))}
                  title="点这句跳到这里"
                  style={{
                    display: 'inline-block', cursor: 'pointer', padding: '3px 10px', borderRadius: 9,
                    background: hov ? 'rgba(255,255,255,0.08)' : 'transparent',
                    transform: hov && !active ? 'scale(1.04)' : 'scale(1)',
                    transition: 'background .15s ease, transform .2s ease',
                  }}
                >
                  <div style={{
                    fontSize: active ? 15 : 13,
                    fontWeight: active ? 700 : 400,
                    color: active ? '#fff' : hov ? 'rgba(255,255,255,0.88)' : (l.isChorus ? `${accent}cc` : 'rgba(203,213,225,0.42)'),
                    textShadow: active ? `0 0 16px ${accent}` : hov ? `0 0 12px ${accent}88` : 'none',
                    lineHeight: 1.25,
                    transition: 'color .2s ease, text-shadow .2s ease',
                  }}>
                    {l.isChorus && <Icon name="star" size={10} color={accent} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4, marginTop: -2 }} />}
                    {l.text || '♪'}
                  </div>
                  {showTrans && l.trans && (
                    <div style={{ fontSize: 11, marginTop: 2, color: active ? 'rgba(255,255,255,0.7)' : hov ? 'rgba(255,255,255,0.6)' : 'rgba(203,213,225,0.3)' }}>
                      {l.trans}
                    </div>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  wrap: { position: 'relative', width: '100%' },
  langBtn: {
    position: 'absolute', top: -2, right: 0, zIndex: 2,
    width: 26, height: 26, borderRadius: 8, fontSize: 12, fontWeight: 700,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer',
  },
  view: {
    height: VIEW_H, width: '100%', overflowY: 'auto',
    maskImage: 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)',
    WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 20%, #000 80%, transparent)',
  },
  empty: {
    height: VIEW_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(203,213,225,0.35)', fontSize: 13, letterSpacing: 1,
  },
  // fill 模式：撑满右栏剩余高度
  wrapFill: { position: 'relative', width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
  viewFill: {
    flex: 1, minHeight: 0, width: '100%', overflowY: 'auto',
    maskImage: 'linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)',
    WebkitMaskImage: 'linear-gradient(180deg, transparent, #000 18%, #000 82%, transparent)',
  },
  emptyFill: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'rgba(203,213,225,0.35)', fontSize: 13, letterSpacing: 1,
  },
}
