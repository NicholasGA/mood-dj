import React from 'react'

// 兜底错误边界：任何渲染期抛错(如某次改名留下的悬空引用)会被这里接住，
// 显示一个可恢复的面板而不是整屏黑。刻意只用内联样式、不引任何 app 组件/主题工具，
// 因为那些本身就是潜在的抛错源——兜底界面必须最简、零依赖。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 主进程已捕获渲染层 console（level≥2 → debug.log），这里打出来即可留痕
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const msg = String(this.state.error?.message || this.state.error || '未知错误')
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.title}>😵 界面出了点问题</div>
          <div style={S.desc}>渲染时遇到一个错误，已经接住、没有崩整个程序。可以先重试；不行就重置一下。</div>
          <pre style={S.err}>{msg}</pre>
          <div style={S.row}>
            <button style={{ ...S.btn, ...S.primary }} onClick={() => this.setState({ error: null })}>重试</button>
            <button style={S.btn} onClick={() => location.reload()}>重新加载</button>
          </div>
        </div>
      </div>
    )
  }
}

const S = {
  wrap: { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(180deg,#0c0c14,#06060b)', fontFamily: '-apple-system,Segoe UI,system-ui,sans-serif', color: '#f3f4f6' },
  card: { width: 'min(440px,92vw)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 22, boxShadow: '0 24px 60px -24px rgba(0,0,0,0.8)' },
  title: { fontSize: 17, fontWeight: 800, marginBottom: 8 },
  desc: { fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 12 },
  err: { fontSize: 11.5, color: '#fca5a5', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', margin: 0, marginBottom: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 140, overflow: 'auto' },
  row: { display: 'flex', gap: 10 },
  btn: { flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#f3f4f6', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' },
  primary: { background: '#31c27c', border: '1px solid #31c27c', color: '#06231a' },
}
