import { describe, it, expect } from 'vitest'
import { remainingLabel, sleepVolume, nextDuration } from '../src/services/sleepTimer'

describe('remainingLabel', () => {
  it('格式化 mm:ss，向上取整', () => {
    expect(remainingLabel(0)).toBe('00:00')
    expect(remainingLabel(1000)).toBe('00:01')
    expect(remainingLabel(59500)).toBe('01:00')   // 59.5s → 进位到 60s
    expect(remainingLabel(90000)).toBe('01:30')
    expect(remainingLabel(-5)).toBe('00:00')
  })
})

describe('sleepVolume', () => {
  it('fade 窗口外保持原音量，窗口内线性降到 0', () => {
    expect(sleepVolume(60000, 1, 15000)).toBe(1)       // 还早，原音量
    expect(sleepVolume(15000, 1, 15000)).toBe(1)       // 刚进窗口
    expect(sleepVolume(7500, 1, 15000)).toBe(0.5)      // 一半
    expect(sleepVolume(0, 1, 15000)).toBe(0)
    expect(sleepVolume(-1, 1, 15000)).toBe(0)
  })
  it('按 baseVol 缩放', () => {
    expect(sleepVolume(7500, 0.8, 15000)).toBe(0.4)
  })
})

describe('nextDuration', () => {
  it('关→15→30→60→关 循环', () => {
    expect(nextDuration(0)).toBe(15)
    expect(nextDuration(15)).toBe(30)
    expect(nextDuration(30)).toBe(60)
    expect(nextDuration(60)).toBe(0)
  })
})
