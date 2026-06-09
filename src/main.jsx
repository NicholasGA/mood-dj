import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// 未捕获的 Promise 拒绝留痕到 debug.log（主进程已转发渲染层 console），不至于静默
window.addEventListener('unhandledrejection', (e) => console.error('[unhandledrejection]', e.reason))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
)
