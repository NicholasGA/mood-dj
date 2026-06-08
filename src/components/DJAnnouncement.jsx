import { useEffect, useRef } from 'react'

export default function DJAnnouncement({ text, visible }) {
  const spokenRef = useRef('')

  useEffect(() => {
    if (!visible || !text || text === spokenRef.current) return
    spokenRef.current = text
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'zh-CN'
      u.rate = 1.05
      u.pitch = 1.1
      // pick a Chinese voice if available
      const voices = speechSynthesis.getVoices()
      const cn = voices.find(v => v.lang.startsWith('zh'))
      if (cn) u.voice = cn
      speechSynthesis.speak(u)
    }
  }, [text, visible])

  return (
    <div style={{
      ...styles.wrap,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(20px)',
    }}>
      <span style={styles.mic}>🎙️</span>
      <span style={styles.text}>{text}</span>
    </div>
  )
}

const styles = {
  wrap: {
    position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(124,58,237,0.4)', borderRadius: 40,
    padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 10,
    transition: 'opacity .4s, transform .4s', zIndex: 100,
    boxShadow: '0 0 30px rgba(124,58,237,0.2)',
    maxWidth: '70vw',
  },
  mic: { fontSize: 18, flexShrink: 0 },
  text: { fontSize: 15, color: '#e5e7eb', fontWeight: 500, lineHeight: 1.4 },
}
