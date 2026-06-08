import { useState, useEffect, useRef } from 'react'

const VIEW_H = 188

export default function Lyrics({ lines, audioRef, accent = '#31c27c', hasTrans }) {
  const [idx, setIdx] = useState(-1)
  const [showTrans, setShowTrans] = useState(false)
  const [seekNonce, setSeekNonce] = useState(0)
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

  if (!lines?.length) return <div style={s.empty}>♪ 纯音乐 / 暂无歌词 ♪</div>

  return (
    <div style={s.wrap}>
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
        style={s.view}
        onWheel={pauseAuto}
        onPointerDown={pauseAuto}
      >
        <div style={{ padding: `${VIEW_H / 2 - 14}px 0` }}>
          {lines.map((l, i) => {
            const active = i === idx
            return (
              <div
                key={i}
                ref={el => (lineRefs.current[i] = el)}
                onClick={() => seekTo(l.time)}
                style={{
                  padding: '5px 10px', textAlign: 'center', cursor: 'pointer',
                  transition: 'color .3s, transform .3s',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <div style={{
                  fontSize: active ? 15 : 13,
                  fontWeight: active ? 700 : 400,
                  color: active ? '#fff' : (l.isChorus ? `${accent}cc` : 'rgba(203,213,225,0.42)'),
                  textShadow: active ? `0 0 16px ${accent}` : 'none',
                  lineHeight: 1.25,
                }}>
                  {l.isChorus && <span style={{ opacity: 0.7, marginRight: 4 }}>✦</span>}
                  {l.text || '♪'}
                </div>
                {showTrans && l.trans && (
                  <div style={{ fontSize: 11, marginTop: 2, color: active ? 'rgba(255,255,255,0.7)' : 'rgba(203,213,225,0.3)' }}>
                    {l.trans}
                  </div>
                )}
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
}
