import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import LightStrip from './components/LightStrip'
import LightCapsule from './components/LightCapsule'
import './index.css'

// 未捕获的 Promise 拒绝留痕到 debug.log（主进程已转发渲染层 console），不至于静默
window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason))

// 灯带模式的两个覆盖小窗复用同一个 bundle，按 hash 路由（#strip 底边灯带 / #capsule 顶边胶囊）
const hash = (window.location.hash || '').replace('#', '')
const Root = hash === 'strip' ? LightStrip : hash === 'capsule' ? LightCapsule : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><ErrorBoundary><Root /></ErrorBoundary></React.StrictMode>
)
