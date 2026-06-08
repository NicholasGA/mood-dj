import { useState } from 'react'

export default function AuthScreen({ onQQAuth }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function connectQQ() {
    setLoading(true); setError('')
    try {
      const cookies = await window.electronAPI.initiateQQAuth()
      await window.electronAPI.storeQQCookies(cookies)
      onQQAuth(cookies)
    } catch (e) {
      if (e.message !== 'cancelled') setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎧</div>
        <h1 style={s.title}>Mood DJ</h1>
        <p style={s.sub}>AI 驱动的心情电台</p>
        <p style={s.desc}>根据你今天的心情，自动挑选音乐、生成 DJ 播报</p>

        {error && <p style={s.error}>{error}</p>}

        <button style={{ ...s.btn, background: 'linear-gradient(135deg,#31c27c,#1db954)' }}
          onClick={connectQQ} disabled={loading}>
          {loading ? '连接中…' : '🎵 连接 QQ音乐'}
        </button>

        <p style={s.note}>在弹出窗口内登录你的 QQ 账号即可</p>
      </div>
    </div>
  )
}

const s = {
  wrap: { position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center,#1a0a3e 0%,#0a0a0a 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '48px 56px', textAlign: 'center', maxWidth: 400, width: '90%' },
  title: { fontSize: 32, fontWeight: 700, color: '#fff', margin: '0 0 8px' },
  sub: { fontSize: 14, color: '#a78bfa', margin: '0 0 20px', letterSpacing: 2 },
  desc: { fontSize: 14, color: '#9ca3af', margin: '0 0 28px', lineHeight: 1.6 },
  error: { color: '#f87171', fontSize: 13, marginBottom: 16, background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: 8 },
  btn: { width: '100%', padding: '13px 0', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer', marginBottom: 12 },
  note: { fontSize: 11, color: '#6b7280', marginTop: 16 },
}
