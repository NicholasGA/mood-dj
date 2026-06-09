// @vitest-environment jsdom
//
// 冒烟测试：真正把 <App/> mount 到 jsdom。
// 目的不是测交互，而是兜住"渲染就崩"这一类灾难——比如 effect 依赖数组里引用了
// 后面才定义的 const 触发 TDZ（曾导致整屏黑）。build / 纯逻辑测试都抓不到这种，
// 因为它们不渲染 React 树。
//
// 两个分支都要覆盖：未登录走 <Onboarding>，已登录走主播放器（Visualizer/键盘快捷键
// effect 等真正出过黑屏的代码路径都在这条分支上）。
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import App from '../src/App.jsx'

// 假的 2D 画布上下文：Visualizer 会狂调 ctx，jsdom 不实现 canvas，这里给个全 no-op 的。
function fakeCtx() {
  const grad = { addColorStop() {} }
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient' || prop === 'createPattern') return () => grad
      if (prop === 'canvas') return undefined
      return () => {}        // 其余方法一律 no-op；属性赋值(fillStyle 等)走默认 set，不报错
    },
    set() { return true },
  })
}

// 装一套 window.electronAPI：按方法名返回测试需要的值，其余返回 resolve(null)。
function installElectronAPI(overrides = {}) {
  const base = {
    getQQCookies: () => Promise.resolve(null),
    getMemory: () => Promise.resolve(null),
    getConfig: () => Promise.resolve(null),
    getQQFavorites: () => Promise.resolve(null),
    onUpdateStatus: () => {},
    storeMemory: () => {}, storeConfig: () => {},
  }
  globalThis.window.electronAPI = new Proxy({ ...base, ...overrides }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => Promise.resolve(null)   // 没显式定义的方法：吞掉
    },
  })
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => fakeCtx()
  // 别让兜底 effect 真打网络
  globalThis.fetch = () => Promise.reject(new Error('no network in test'))
})

afterEach(() => cleanup())

const noFatal = (spy) => {
  const fatal = spy.mock.calls.find(c => String(c[0]).includes('before initialization'))
  expect(fatal, fatal && String(fatal[0])).toBeUndefined()
}

describe('App 冒烟', () => {
  it('未登录：mount 到 <Onboarding> 不抛错', () => {
    installElectronAPI()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let container
    expect(() => { container = render(<App />).container }).not.toThrow()
    expect(container.childElementCount).toBeGreaterThan(0)
    noFatal(spy)
    spy.mockRestore()
  })

  it('已登录：进入主播放器分支（Visualizer/键盘 effect）不抛错', async () => {
    installElectronAPI({
      getQQCookies: () => Promise.resolve([{ name: 'uin', value: 'o123' }]),
      getConfig: () => Promise.resolve({ onboarded: true }),   // 让 llmReady=true，越过引导门
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let container
    await act(async () => { container = render(<App />).container })
    // 等异步 cookie/config resolve 后重渲染到主界面
    const logout = await screen.findByTitle('退出登录')   // 仅主播放器有
    expect(logout).toBeTruthy()
    expect(container.textContent).not.toContain('初次使用')   // 已越过引导
    noFatal(spy)
    spy.mockRestore()
  })
})
