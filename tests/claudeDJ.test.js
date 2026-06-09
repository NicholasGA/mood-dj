import { describe, it, expect } from 'vitest'
import { splitKeys, localInterpret, configureLLM, hasLLMKey, evalBudget } from '../src/services/claudeDJ'

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

  it('"放点我没听过的" → 探索意图，绝不把"没听过"当关键词', () => {
    const r = localInterpret('放点我没听过的')
    expect(r.mode).toBe('discover')
    expect(r.keywords.join('')).not.toContain('没听过')
    expect(r.artists).toEqual([])
  })

  it('"想听点没听过的日系" → 探索 + 保留曲风关键词', () => {
    const r = localInterpret('想听点没听过的日系')
    expect(r.mode).toBe('discover')
    expect(r.keywords.join('')).toContain('日系')
  })

  it('"放我收藏的歌" → 收藏意图', () => {
    expect(localInterpret('放我收藏的歌').mode).toBe('favorite')
  })

  it('普通点歌 → mode 为 normal', () => {
    expect(localInterpret('放点周杰伦的').mode).toBe('normal')
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

describe('evalBudget（每日 LLM 预算：让免费额度撑一天）', () => {
  const today = evalBudget(null).date

  it('无记录 → 计数 0、核心与故事都放行', () => {
    const b = evalBudget(null, Date.now(), 200)
    expect(b.count).toBe(0)
    expect(b.blockCore).toBe(false)
    expect(b.blockStory).toBe(false)
  })

  it('用到 65%（130/200）→ 先拦故事，核心仍放行', () => {
    const b = evalBudget({ date: today, count: 130 }, Date.now(), 200)
    expect(b.blockStory).toBe(true)
    expect(b.blockCore).toBe(false)
  })

  it('用满上限 → 核心也拦', () => {
    const b = evalBudget({ date: today, count: 200 }, Date.now(), 200)
    expect(b.blockCore).toBe(true)
    expect(b.blockStory).toBe(true)
  })

  it('跨天 → 计数清零、恢复放行', () => {
    const b = evalBudget({ date: '1999-01-01', count: 999 }, Date.now(), 200)
    expect(b.count).toBe(0)
    expect(b.blockCore).toBe(false)
  })
})
