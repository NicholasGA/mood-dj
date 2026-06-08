import { describe, it, expect } from 'vitest'
import { keyToAction } from '../src/services/shortcuts'

const ev = (key, opts = {}) => ({ key, target: { tagName: opts.tag || 'BODY' }, ctrlKey: !!opts.ctrl, metaKey: !!opts.meta, altKey: !!opts.alt })

describe('keyToAction', () => {
  it('基础键映射', () => {
    expect(keyToAction(ev(' '))).toBe('playpause')
    expect(keyToAction(ev('ArrowRight'))).toBe('next')
    expect(keyToAction(ev('ArrowLeft'))).toBe('seekback')
    expect(keyToAction(ev('ArrowUp'))).toBe('volup')
    expect(keyToAction(ev('ArrowDown'))).toBe('voldown')
    expect(keyToAction(ev('l'))).toBe('like')
    expect(keyToAction(ev('M'))).toBe('mute')
  })

  it('在输入框/文本域内不拦截', () => {
    expect(keyToAction(ev(' ', { tag: 'INPUT' }))).toBe(null)
    expect(keyToAction(ev(' ', { tag: 'TEXTAREA' }))).toBe(null)
  })

  it('带修饰键(ctrl/meta/alt)不拦截，留给系统快捷键', () => {
    expect(keyToAction(ev(' ', { ctrl: true }))).toBe(null)
    expect(keyToAction(ev('ArrowRight', { meta: true }))).toBe(null)
  })

  it('未映射的键返回 null', () => {
    expect(keyToAction(ev('a'))).toBe(null)
    expect(keyToAction(ev('Enter'))).toBe(null)
  })
})
