import { describe, it, expect } from 'vitest'
import { localPersona, timeOfDay, personaSystemPrefix, greeting, vibeReaction, PERSONAS } from '../src/services/djPersona.js'

describe('localPersona', () => {
  it('同一口味稳定选同一个人格', () => {
    const t = { artists: ['周杰伦', '林俊杰'], genres: ['华语'] }
    expect(localPersona(t).name).toBe(localPersona(t).name)
  })
  it('日系/vocaloid 口味 → Nana', () => {
    expect(localPersona({ artists: ['初音未来', 'YOASOBI'] }).name).toBe('Nana')
  })
  it('摇滚/电子口味 → 阿K', () => {
    expect(localPersona({ artists: ['ONE OK ROCK'], genres: ['摇滚'] }).name).toBe('阿K')
  })
  it('纯音乐口味 → 清和', () => {
    expect(localPersona({ genres: ['纯音乐', '钢琴'] }).name).toBe('清和')
  })
  it('接受字符串数组 + 空输入也有兜底', () => {
    expect(localPersona(['爵士', 'blues']).name).toBe('老周')
    expect(PERSONAS.some(p => p.name === localPersona(null).name)).toBe(true)
  })
})

describe('timeOfDay', () => {
  const at = (h) => timeOfDay(new Date(2026, 0, 1, h, 0, 0)).slot
  it('按小时分段', () => {
    expect(at(2)).toBe('lateNight')
    expect(at(7)).toBe('morning')
    expect(at(10)).toBe('forenoon')
    expect(at(13)).toBe('noon')
    expect(at(16)).toBe('afternoon')
    expect(at(20)).toBe('evening')
    expect(at(23)).toBe('lateNight')
  })
})

describe('personaSystemPrefix', () => {
  it('带人格名，不带则空串', () => {
    expect(personaSystemPrefix({ name: '阿声', vibe: '深夜老友' })).toContain('阿声')
    expect(personaSystemPrefix(null)).toBe('')
    expect(personaSystemPrefix({})).toBe('')
  })
})

describe('greeting', () => {
  const p = { name: '阿声' }
  const noon = new Date(2026, 0, 10, 12, 0, 0).getTime()
  it('首次见面会自我介绍', () => {
    expect(greeting(p, noon, null)).toContain('阿声')
  })
  it('同一天再开 → 又见面', () => {
    const earlier = new Date(2026, 0, 10, 9, 0, 0).getTime()
    expect(greeting(p, noon, earlier)).toContain('又见面')
  })
  it('久别 → 好些天没见', () => {
    const longAgo = noon - 10 * 86400000
    expect(greeting(p, noon, longAgo)).toContain('没见')
  })
  it('永远是一行短句', () => {
    expect(greeting(p, noon, null)).not.toContain('\n')
  })
})

describe('vibeReaction', () => {
  it('每个方向都给非空短句，且稳定', () => {
    for (const d of ['happier', 'sadder', 'energetic', 'chill', 'unknownDir']) {
      const r = vibeReaction({ name: '阿声' }, d)
      expect(r).toBeTruthy()
      expect(vibeReaction({ name: '阿声' }, d)).toBe(r)
    }
  })
})
