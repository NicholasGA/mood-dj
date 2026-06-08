import { describe, it, expect } from 'vitest'
import { capPerArtist, excludeRecent, pushRecent, freshen } from '../src/services/radio'

const mk = (mid, artist) => ({ mid, artists: [{ name: artist }] })

describe('capPerArtist', () => {
  it('每位歌手最多 N 首，保持顺序', () => {
    const list = [mk('1', 'A'), mk('2', 'A'), mk('3', 'A'), mk('4', 'B')]
    expect(capPerArtist(list, 2).map(t => t.mid)).toEqual(['1', '2', '4'])
  })
  it('默认上限 2', () => {
    expect(capPerArtist([mk('1', 'A'), mk('2', 'A'), mk('3', 'A')]).length).toBe(2)
  })
})

describe('excludeRecent', () => {
  it('过滤掉在集合里的 mid', () => {
    const list = [mk('1', 'A'), mk('2', 'B'), mk('3', 'C')]
    expect(excludeRecent(list, new Set(['2'])).map(t => t.mid)).toEqual(['1', '3'])
  })
  it('空集合 → 原样返回（副本）', () => {
    const list = [mk('1', 'A')]
    const out = excludeRecent(list, new Set())
    expect(out).toEqual(list)
    expect(out).not.toBe(list)
  })
})

describe('pushRecent', () => {
  it('追加到末尾、去掉旧的同 mid', () => {
    expect(pushRecent(['a', 'b'], 'a')).toEqual(['b', 'a'])
  })
  it('封顶 cap，丢最旧的', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd'])
  })
  it('空 mid → 原样副本', () => {
    expect(pushRecent(['a'], '')).toEqual(['a'])
  })
})

describe('freshen', () => {
  it('去最近重复 + 限歌手数', () => {
    const list = [mk('1', 'A'), mk('2', 'A'), mk('3', 'A'), mk('4', 'B'), mk('5', 'C'), mk('6', 'D'), mk('7', 'E')]
    const out = freshen(list, new Set(['1']), { maxPer: 1, min: 3 })
    expect(out.map(t => t.mid)).toEqual(['2', '4', '5', '6', '7'])
  })
  it('过滤到太短 → 退回只限歌手数（不清空）', () => {
    const list = [mk('1', 'A'), mk('2', 'B')]
    const out = freshen(list, new Set(['1', '2']), { maxPer: 2, min: 6 })
    expect(out.map(t => t.mid)).toEqual(['1', '2'])
  })
})
