import { useEffect, useRef } from 'react'
import Icon from './Icon'

export default function DJAnnouncement({ text, visible, speak = true, audioRef }) {
  const spokenRef = useRef('')
  const duckingRef = useRef(false)   // 当前是否正在压低音乐
  const baseVolRef = useRef(1)       // 压低前的原始音量

  useEffect(() => {
    if (!visible || !text || text === spokenRef.current) return
    spokenRef.current = text
    // 文字每首都显示；只有 speak 时才出声（App 已做 ≥45s 节流）
    if (!speak || !('speechSynthesis' in window)) return

    const audio = audioRef?.current
    let safety = null
    const restore = () => {
      if (safety) { clearTimeout(safety); safety = null }
      if (audio && duckingRef.current) { audio.volume = baseVolRef.current; duckingRef.current = false }
    }

    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 1.05; u.volume = 0.9
    const cn = speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'))
    if (cn) u.voice = cn
    u.onstart = () => {
      if (!audio) return
      if (!duckingRef.current) baseVolRef.current = audio.volume   // 记下真实音量
      duckingRef.current = true
      audio.volume = +(baseVolRef.current * 0.28).toFixed(2)       // 像电台一样把音乐压低
      safety = setTimeout(restore, 12000)                          // 兜底：万一 onend 不触发也能复原
    }
    u.onend = restore
    u.onerror = restore

    speechSynthesis.cancel()
    speechSynthesis.speak(u)
    return () => { speechSynthesis.cancel(); restore() }
  }, [text, visible, speak])

  return (
    <div style={{
      ...styles.wrap,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
    }}>
      <span style={styles.mic}><Icon name="mic" size={16} color="#c4b5fd" /></span>
      <span style={styles.text}>{text}</span>
    </div>
  )
}

const styles = {
  wrap: {
    position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(10,10,12,0.9)',
    border: '1px solid rgba(124,58,237,0.4)', borderRadius: 40,
    padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 10,
    transition: 'opacity .4s, transform .4s', zIndex: 100,
    boxShadow: '0 0 30px rgba(124,58,237,0.2)',
    maxWidth: '70vw',
  },
  mic: { display: 'inline-flex', flexShrink: 0 },
  text: { fontSize: 15, color: '#e5e7eb', fontWeight: 500, lineHeight: 1.4 },
}
