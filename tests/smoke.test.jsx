// @vitest-environment jsdom
//
// 冒烟测试：真正把 <App/> mount 到 jsdom。
// 目的不是测交互，而是兜住"渲染就崩"这一类灾难——比如 effect 依赖数组里引用了
// 后面才定义的 const 触发 TDZ（曾导致整屏黑）。build / 纯逻辑测试都抓不到这种，
// 因为它们不渲染 React 树。这条测试一旦 mount 抛错就红。
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import App from '../src/App.jsx'

// 把 window.electronAPI 全量 stub 成"任意方法都返回 resolve(null) 的函数"。
// App 启动时会调 getQQCookies/getMemory/getConfig/onUpdateStatus 等，Proxy 一把兜住。
beforeAll(() => {
  globalThis.window.electronAPI = new Proxy({}, {
    get: () => (...args) => {
      // onXxx 注册类回调：拿到 cb 就忽略；其余按 invoke 返回 Promise。
      const cb = args.find(a => typeof a === 'function')
      if (cb) return undefined
      return Promise.resolve(null)
    },
  })
})

afterEach(() => cleanup())

describe('App 冒烟', () => {
  it('能 mount 到 DOM 而不抛错（兜住 TDZ/黑屏类崩溃）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let container
    expect(() => { container = render(<App />).container }).not.toThrow()
    expect(container.childElementCount).toBeGreaterThan(0)
    // 未捕获的渲染错误会走 console.error；这里只断言没有 React 抛出的崩溃。
    const fatal = spy.mock.calls.find(c => String(c[0]).includes('before initialization'))
    expect(fatal, fatal && String(fatal[0])).toBeUndefined()
    spy.mockRestore()
  })
})
