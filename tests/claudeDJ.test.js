import { describe, it, expect } from 'vitest'
import { splitKeys, localInterpret, configureLLM, hasLLMKey } from '../src/services/claudeDJ'

describe('splitKeys', () => {
  it('逗号分隔、去空白、丢空项', () => {
    expect(splitKeys('a, b ,c')).toEqual(['a', 'b', 'c'])
    expect(splitKeys('a,,b')).toEqual(['a', 'b'])
  })
  it('空/undefined → []', () => {
    expect(splitKeys('')).toEqual([])
    expect(splitKeys(undefined)).toEqual([])
  })
})

describe('localInterpret（AI 不可用时的本地点歌解析）', () => {
  it('"放点周杰伦的" → 识别为歌手', () => {
    const r = localInterpret('放点周杰伦的')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords).toEqual(['周杰伦'])
    expect(r.mood_name).toBe('周杰伦')
  })

  it('"周杰伦但是要安静" → 歌手 + 心情关键词', () => {
    const r = localInterpret('周杰伦但是要安静')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords[0]).toContain('安静')
  })

  it('多个名字（含空格）不当作单一歌手', () => {
    expect(localInterpret('周杰伦 林俊杰').artists).toEqual([])
  })

  it('空输入 → 不报错、无歌手无关键词', () => {
    const r = localInterpret('')
    expect(r.artists).toEqual([])
    expect(r.keywords).toEqual([])
  })
})

describe('configureLLM / hasLLMKey', () => {
  it('配了 key → true；清空 → false', () => {
    configureLLM({ geminiKey: '', openrouterKey: '' })
    expect(hasLLMKey()).toBe(false)
    configureLLM({ geminiKey: 'AIza-test-key' })
    expect(hasLLMKey()).toBe(true)
    configureLLM({ geminiKey: '', openrouterKey: 'or-key' })
    expect(hasLLMKey()).toBe(true)
    configureLLM({ geminiKey: '', openrouterKey: '' })
    expect(hasLLMKey()).toBe(false)
  })
})
