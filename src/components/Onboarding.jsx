import { useState, useEffect } from 'react'
import { configureLLM } from '../services/claudeDJ'

// 既是首次新手引导，也是设置面板（canClose=true 时可关闭返回）
export default function Onboarding({ qqCookies, onQQAuth, onReady, onClose, canClose }) {
  const [connecting, setConnecting] = useState(false)
  const [geminiKey, setGeminiKey] = useState('')
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    window.electronAPI.getConfig().then(cfg => {
      if (cfg?.geminiKey) setGeminiKey(cfg.geminiKey)
      if (cfg?.openrouterKey) setOpenrouterKey(cfg.openrouterKey)
    }).catch(() => {})
  }, [])

  const qqDone = !!qqCookies
  const keyDone = !!geminiKey.trim() || !!openrouterKey.trim()
  const open = (url) => window.electronAPI.openExternal(url)

  async function connectQQ() {
    setConnecting(true); setErr('')
    try {
      const cookies = await window.electronAPI.initiateQQAuth()
      await window.electronAPI.storeQQCookies(cookies)
      onQQAuth(cookies)
    } catch (e) { if (e.message !== 'cancelled') setErr(e.message) }
    finally { setConnecting(false) }
  }

  async function saveKey() {
    const cfg = { geminiKey: geminiKey.trim(), openrouterKey: openrouterKey.trim() }
    await window.electronAPI.storeConfig(cfg)
    configureLLM(cfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function finish() {
    const cfg = { geminiKey: geminiKey.trim(), openrouterKey: openrouterKey.trim(), onboarded: true }
    configureLLM(cfg)
    window.electronAPI.storeConfig(cfg)
    onReady?.()
    onClose?.()
  }

  return (
    <div style={s.wrap}>
      <div style={s.card} className="fade-up">
        {canClose && <button style={s.x} onClick={onClose} title="关闭">✕</button>}
        <div style={{ fontSize: 44, textAlign: 'center' }}>🎧</div>
        <h1 style={s.title}>Mood DJ</h1>
        <p style={s.sub}>{canClose ? '设置' : '初次使用 · 两步开始'}</p>

        {err && <p style={s.err}>{err}</p>}

        {/* Step 1: QQ */}
        <div style={s.step}>
          <div style={s.stepHead}>
            <span style={{ ...s.dot, background: qqDone ? '#31c27c' : 'rgba(255,255,255,0.15)' }}>{qqDone ? '✓' : '1'}</span>
            <span style={s.stepTitle}>连接 QQ音乐</span>
          </div>
          <p style={s.hint}>用来搜索、播放歌曲和读取你的"我喜欢"。会弹窗，登录你的 QQ 账号即可。</p>
          {qqDone
            ? <div style={s.okRow}>已连接 ✓ <span style={s.relink} onClick={connectQQ}>重新连接</span></div>
            : <button style={{ ...s.btn, background: 'linear-gradient(135deg,#31c27c,#1db954)' }} onClick={connectQQ} disabled={connecting}>{connecting ? '连接中…' : '🎵 连接 QQ音乐'}</button>}
        </div>

        {/* Step 2: AI key */}
        <div style={s.step}>
          <div style={s.stepHead}>
            <span style={{ ...s.dot, background: keyDone ? '#31c27c' : 'rgba(255,255,255,0.15)' }}>{keyDone ? '✓' : '2'}</span>
            <span style={s.stepTitle}>配置 AI（可选）</span>
          </div>
          <p style={s.hint}>
            填了才有「AI 分析心情 / 智能选歌 / 基于歌词的歌曲介绍」；<b style={{ color: '#cbd5e1' }}>不填也能用</b>——这些会用本地兜底，随时能回设置里补。
            <span style={s.link} onClick={() => open('https://aistudio.google.com/apikey')}>　免费获取 Gemini Key →</span>
          </p>
          <input style={s.input} type="password" placeholder="Gemini API Key（多个逗号分隔，可留空）"
            value={geminiKey} onChange={e => setGeminiKey(e.target.value)} />
          <details style={s.adv}>
            <summary style={s.advSum}>高级（可选）：OpenRouter 兜底</summary>
            <p style={s.hint}>所有 Gemini key 限流后用它兜底（注：免费层可能需先充值）。<span style={s.link} onClick={() => open('https://openrouter.ai/keys')}>获取 →</span></p>
            <input style={s.input} type="password" placeholder="OpenRouter API Key（可留空）"
              value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} />
          </details>
          <div style={s.saveRow}>
            <button style={{ ...s.btnSm, opacity: keyDone ? 1 : 0.5 }} onClick={saveKey} disabled={!keyDone}>保存 Key</button>
            {saved && <span style={{ color: '#31c27c', fontSize: 12 }}>已保存 ✓</span>}
          </div>
        </div>

        <button
          style={{ ...s.btn, marginTop: 6, background: qqDone ? 'linear-gradient(135deg,#7c3aed,#4f46e5)' : '#374151', cursor: qqDone ? 'pointer' : 'not-allowed' }}
          onClick={() => qqDone && finish()} disabled={!qqDone}>
          {canClose ? '保存并返回' : (keyDone ? '开始使用 →' : '先用着（不填 key 也行）→')}
        </button>

        <p style={s.foot}>
          数据只存在你本地电脑（userData），不上传。
          <span style={s.link} onClick={() => open('https://aistudio.google.com/apikey')}>　Key 教程</span>
        </p>
      </div>
    </div>
  )
}

const s = {
  // 透明窗口：壁纸从半透明深色渐变透出（无形感）；卡片用半透明深色纯色，不再用毛玻璃模糊。
  wrap: { position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, rgba(26,10,62,0.55) 0%, rgba(8,8,12,0.72) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, overflowY: 'auto', padding: 20 },
  card: { position: 'relative', background: 'rgba(15,15,22,0.74)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 22, padding: '32px 34px', maxWidth: 440, width: '100%', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' },
  x: { position: 'absolute', top: 14, right: 16, background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 16, cursor: 'pointer' },
  title: { fontSize: 28, fontWeight: 700, color: '#fff', textAlign: 'center', margin: '6px 0 2px' },
  sub: { fontSize: 13, color: '#a78bfa', textAlign: 'center', margin: '0 0 18px', letterSpacing: 1 },
  err: { color: '#f87171', fontSize: 13, background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: 8, marginBottom: 12 },
  step: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 14 },
  stepHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  dot: { width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 },
  stepTitle: { fontSize: 15, fontWeight: 600, color: '#f9fafb' },
  hint: { fontSize: 12.5, color: '#9ca3af', lineHeight: 1.6, margin: '0 0 10px' },
  link: { color: '#a78bfa', cursor: 'pointer', whiteSpace: 'nowrap' },
  btn: { width: '100%', padding: '12px 0', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 600, border: 'none', cursor: 'pointer' },
  btnSm: { padding: '8px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.85)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' },
  okRow: { fontSize: 13, color: '#31c27c', display: 'flex', alignItems: 'center', gap: 10 },
  relink: { fontSize: 12, color: '#6b7280', cursor: 'pointer', textDecoration: 'underline' },
  input: { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 12px', color: '#f9fafb', fontSize: 13, outline: 'none', marginBottom: 8 },
  adv: { marginBottom: 8 },
  advSum: { fontSize: 12, color: '#9ca3af', cursor: 'pointer', marginBottom: 6 },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12 },
  foot: { fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 14, lineHeight: 1.6 },
}
