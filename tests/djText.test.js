import { describe, it, expect } from 'vitest'
import { localStory, localMoodConfig } from '../src/services/djText'

describe('localStory（零 API 兜底简介）', () => {
  it('同一首歌每次返回同一句（按 mid 稳定）', () => {
    const t = { mid: 'abc', name: '晴天', artists: [{ name: '周杰伦' }] }
    expect(localStory(t)).toBe(localStory(t))
  })

  it('有歌手时句子里带歌名与歌手', () => {
    const s = localStory({ mid: 'x', name: '夜曲', artists: [{ name: '周杰伦' }] })
    expect(s).toContain('夜曲')
    expect(s).toContain('周杰伦')
  })

  it('无歌手 / 空对象也不报错', () => {
    expect(typeof localStory({ mid: 'y', name: '无名' })).toBe('string')
    expect(typeof localStory(null)).toBe('string')
  })
})

describe('localMoodConfig（AI 失败时按关键词兜底）', () => {
  it('命中关键词 → 对应心情与搜索词', () => {
    expect(localMoodConfig('有点伤感想哭').mood_name).toBe('伤感')
    expect(localMoodConfig('想跑步出汗').mood_name).toBe('燃')
    expect(localMoodConfig('想安静地睡一会').mood_name).toBe('安静')
    expect(localMoodConfig('好开心啊今天').mood_name).toBe('开心')
  })

  it('返回完整的电台配置结构', () => {
    const c = localMoodConfig('伤感')
    expect(Array.isArray(c.search_queries)).toBe(true)
    expect(c.search_queries.length).toBeGreaterThan(0)
    for (const k of ['mood_name', 'color_primary', 'color_secondary', 'mood_emoji', 'dj_intro']) {
      expect(c[k]).toBeTruthy()
    }
  })

  it('未命中关键词 → 通用兜底（mood_name 取输入前缀）', () => {
    const c = localMoodConfig('随便放放')
    expect(c.mood_name).toBe('随便放放')
    expect(c.search_queries).toContain('流行音乐')
  })

  it('空输入 → 随心', () => {
    expect(localMoodConfig('').mood_name).toBe('随心')
  })
})
