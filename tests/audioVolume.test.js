import { describe, it, expect } from 'vitest'
import { effectiveVolume, clampVol, DUCK_FACTOR } from '../src/services/audioVolume.js'

describe('clampVol', () => {
  it('夹到 0..1，非法值归 0', () => {
    expect(clampVol(0.5)).toBe(0.5)
    expect(clampVol(1.4)).toBe(1)
    expect(clampVol(-0.2)).toBe(0)
    expect(clampVol(NaN)).toBe(0)
    expect(clampVol(undefined)).toBe(0)
  })
})

describe('effectiveVolume', () => {
  it('不压低时就是用户音量', () => {
    expect(effectiveVolume(0.3, false)).toBe(0.3)
    expect(effectiveVolume(0.8, false)).toBe(0.8)
  })
  it('压低时乘系数', () => {
    expect(effectiveVolume(0.5, true)).toBeCloseTo(0.5 * DUCK_FACTOR, 5)
  })
  it('改了用户音量，压低输出随之变化（不会被旧值卡住）', () => {
    // 用户在说话(ducking)期间把音量从 0.3 调到 0.8：输出应基于新值算
    expect(effectiveVolume(0.8, true)).toBeCloseTo(0.8 * DUCK_FACTOR, 5)
    // 说话结束(ducking=false)：直接是新的 0.8，而非旧快照 0.3
    expect(effectiveVolume(0.8, false)).toBe(0.8)
  })
})
