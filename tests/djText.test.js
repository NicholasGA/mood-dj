import { describe, it, expect } from 'vitest'
import { localStory, localMoodConfig, memoryNote } from '../src/services/djText'

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

describe('memoryNote（把听歌记忆说成一句「记得你」）', () => {
  it('收藏过这首 + 同心情 → 点出当时的心情', () => {
    const s = memoryNote({ mid: 'm1', artists: [{ name: '周杰伦' }] },
      { likedTracks: [{ mid: 'm1', mood: '伤感' }], currentMood: '伤感' })
    expect(s).toContain('伤感')
    expect(s).toContain('❤️')
  })

  it('收藏过这首 + 不同心情 → 提当时收藏的心情', () => {
    const s = memoryNote({ mid: 'm1' }, { likedTracks: [{ mid: 'm1', mood: '深夜' }], currentMood: '开心' })
    expect(s).toContain('深夜')
  })

  it('收藏过这首但没记心情 → 仍认得', () => {
    expect(memoryNote({ mid: 'm1' }, { likedTracks: [{ mid: 'm1', mood: '' }] })).toContain('❤️')
  })

  it('常听这位歌手 → 点名歌手，且不是「收藏过」', () => {
    const s = memoryNote({ mid: 'new', artists: [{ name: '林俊杰' }] }, { topArtists: ['林俊杰'] })
    expect(s).toContain('林俊杰')
    expect(s).not.toContain('❤️')
  })

  it('放过没收藏 → 老相识', () => {
    const s = memoryNote({ mid: 'h1', artists: [{ name: '陌生人' }] },
      { history: [{ mid: 'h1', artists: [{ name: '陌生人' }] }] })
    expect(s).toContain('听过')
  })

  it('有口味画像时的全新歌手 → 新发现', () => {
    const s = memoryNote({ mid: 'z', artists: [{ name: '新人X' }] },
      { likedTracks: Array.from({ length: 5 }, (_, i) => ({ mid: 'l' + i, artists: [{ name: '老歌手' }] })) })
    expect(s).toContain('新发现')
    expect(s).toContain('新人X')
  })

  it('新用户（没口味画像）→ 不喊「新发现」，返回空让普通故事兜底', () => {
    expect(memoryNote({ mid: 'z', artists: [{ name: '新人X' }] }, {})).toBe('')
  })

  it('优先级：收藏过 > 常听歌手', () => {
    const s = memoryNote({ mid: 'm1', artists: [{ name: 'A' }] },
      { likedTracks: [{ mid: 'm1', mood: '' }], topArtists: ['A'] })
    expect(s).toContain('❤️')
  })

  it('无 mid / 空对象不报错', () => {
    expect(memoryNote(null)).toBe('')
    expect(memoryNote({ mid: '' })).toBe('')
    expect(typeof memoryNote({ mid: 'x' }, {})).toBe('string')
  })
})
