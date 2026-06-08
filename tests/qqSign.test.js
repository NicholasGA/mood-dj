import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { qqSign } = require('../qqSign.cjs')

describe('qqSign（musics.fcg zzc 签名）', () => {
  it('对官方文章公开的测试向量产出正确签名', () => {
    expect(qqSign('123')).toBe('zzcec1b555gzqzg7laztguyjl2bu20r6x1w50c55f60')
    expect(qqSign('hello world')).toBe('zzcfb3415bc4nfoxmd9uik71mkomtubjfjp141a1cbbcc')
  })

  it('格式：zzc 前缀、全小写、长度稳定', () => {
    const s = qqSign('{"req_1":{"method":"AddSonglist"}}')
    expect(s.startsWith('zzc')).toBe(true)
    expect(s).toBe(s.toLowerCase())
    expect(s.length).toBeGreaterThan(40)   // zzc+head(7)+b64(去掉/+=后≤27)+tail(8)，长度随 b64 略浮动
    expect(s.length).toBeLessThanOrEqual(45)
  })
})
