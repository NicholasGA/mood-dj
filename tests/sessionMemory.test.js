import { describe, it, expect } from 'vitest'
import { recordVisit, visitStats, dueMilestone, sessionGreeting } from '../src/services/sessionMemory'

const DAY = 86400000
// 固定一个时间锚点便于推演：2026-01-15（周四）20:00（晚上时段）
const T = new Date(2026, 0, 15, 20, 0, 0).getTime()
const at = (y, mo, d, h) => new Date(y, mo, d, h, 0, 0).getTime()

describe('recordVisit', () => {
  it('追加本次到访、滤脏值、按 cap 裁剪', () => {
    expect(recordVisit([], T)).toEqual([T])
    expect(recordVisit([T - DAY], T)).toEqual([T - DAY, T])
    expect(recordVisit([null, 'x', -1, T + DAY], T)).toEqual([T])   // 未来/脏值丢弃，只剩本次
    expect(recordVisit(Array(80).fill(T - DAY), T, 80).length).toBe(80)  // 81→裁到 80
  })
})

describe('visitStats', () => {
  it('本周到访计数（含 7 天内）', () => {
    const v = [T - 10 * DAY, T - 6 * DAY, T - 2 * DAY, T]
    expect(visitStats(v, T).thisWeek).toBe(3)   // 10 天前那次不算
  })
  it('时段习惯：同一时段≥3 次且过半且此刻正落在该时段 → atHabitSlot', () => {
    // 连续多晚都在"晚上"来，且当前 T 也是晚上
    const v = [at(2026, 0, 10, 20), at(2026, 0, 11, 21), at(2026, 0, 12, 20), T]
    const s = visitStats(v, T)
    expect(s.habitSlot).toBe('evening')
    expect(s.atHabitSlot).toBe(true)
  })
  it('时段分散 → 不成立习惯', () => {
    const v = [at(2026, 0, 10, 8), at(2026, 0, 11, 13), at(2026, 0, 12, 23), T]
    expect(visitStats(v, T).atHabitSlot).toBe(false)
  })
})

describe('dueMilestone', () => {
  it('返回 > 已庆祝的最高阈值，否则 null', () => {
    expect(dueMilestone(0, 0)).toBe(null)
    expect(dueMilestone(49, 0)).toBe(null)
    expect(dueMilestone(50, 0)).toBe(50)
    expect(dueMilestone(250, 0)).toBe(200)     // 50/100/200 都过了，取最高
    expect(dueMilestone(250, 200)).toBe(null)  // 已庆祝到 200，250 还没到 500
    expect(dueMilestone(500, 200)).toBe(500)
  })
})

describe('sessionGreeting（跨会话记忆问候）', () => {
  const p = { name: '阿声' }

  it('里程碑优先且只触发一次（返回 celebrate）', () => {
    const r = sessionGreeting(p, T, { lastSeen: T - DAY, totalPlayed: 120, celebratedPlays: 50 })
    expect(r.line).toContain('100')
    expect(r.celebrate).toBe(100)
  })

  it('久别≥3天 + 上次在听什么 → 点名歌曲', () => {
    const r = sessionGreeting(p, T, { lastSeen: T - 4 * DAY, lastTrack: { name: '晴天', artist: '周杰伦' } })
    expect(r.line).toContain('晴天')
    expect(r.line).toContain('4 天')
  })

  it('同一天再开 → 又见面', () => {
    const earlier = new Date(2026, 0, 15, 9, 0, 0).getTime()
    expect(sessionGreeting(p, T, { lastSeen: earlier }).line).toContain('又见面')
  })

  it('这周来得勤（≥3 次）→ 点出次数', () => {
    const v = [T - 2 * DAY, T - 1 * DAY, T]
    const r = sessionGreeting(p, T, { lastSeen: T - 2 * DAY, visits: v })
    expect(r.line).toContain('这周第 3 次')
  })

  it('首次（无 lastSeen）→ 回落基础问候、含人格名、单行', () => {
    const r = sessionGreeting(p, T, {})
    expect(r.line).toContain('阿声')
    expect(r.line).not.toContain('\n')
    expect(r.celebrate).toBe(0)
  })
})
