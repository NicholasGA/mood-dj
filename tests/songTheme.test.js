import { describe, it, expect } from 'vitest'
import { hashSeed, mulberry32, songTheme } from '../src/ui/songTheme'

describe('hashSeed', () => {
  it('确定性：同串同值', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
  })
  it('不同串不同值（极大概率）', () => {
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'))
  })
  it('空/undefined 不报错，落到 default', () => {
    expect(hashSeed(undefined)).toBe(hashSeed('default'))
  })
})

describe('mulberry32', () => {
  it('确定性序列 + 落在 [0,1)', () => {
    const a = mulberry32(123), b = mulberry32(123)
    for (let i = 0; i < 5; i++) {
      const v = a()
      expect(v).toBe(b())
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('songTheme', () => {
  it('同一首歌 → 完全相同的主题（视觉身份稳定）', () => {
    expect(songTheme('歌A')).toEqual(songTheme('歌A'))
  })

  it('不同歌 → 主题不同', () => {
    expect(songTheme('歌A')).not.toEqual(songTheme('歌B'))
  })

  it('blobs 数量可控且落在 2..5', () => {
    expect(songTheme('x', 3).blobs).toHaveLength(3)
    expect(songTheme('x', 1).blobs).toHaveLength(2)   // 夹到下限
    expect(songTheme('x', 9).blobs).toHaveLength(5)   // 夹到上限
  })

  it('参数落在合理范围', () => {
    const t = songTheme('某首歌')
    expect(t.angle).toBeGreaterThanOrEqual(0)
    expect(t.angle).toBeLessThanOrEqual(360)
    expect(t.speed).toBeGreaterThan(0)
    for (const b of t.blobs) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x).toBeLessThanOrEqual(100)
      expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y).toBeLessThanOrEqual(100)
      expect(b.scale).toBeGreaterThan(0)
      expect(Math.abs(b.hue)).toBeLessThanOrEqual(32)
      expect(b.dur).toBeGreaterThan(0)
      expect(b.delay).toBeLessThanOrEqual(0)
    }
  })
})
