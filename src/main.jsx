import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import LightStrip from './components/LightStrip'
import './index.css'

// 未捕获的 Promise 拒绝留痕到 debug.log（主进程已转发渲染层 console），不至于静默
window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason))

// 灯带模式的覆盖小窗复用同一个 bundle，按 hash 路由（#strip：光带+歌词胶囊）
const hash = (window.location.hash || '').replace('#', '')
const Root = hash === 'strip' ? LightStrip : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><ErrorBoundary><Root /></ErrorBoundary></React.StrictMode>
)
