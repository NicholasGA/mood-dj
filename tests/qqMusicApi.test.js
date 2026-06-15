import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseLRC, detectChoruses, mapSong, getUin, searchTracks, searchByArtist, canonicalArtist, isNonMusic } from '../src/services/qqMusicApi'

describe('isNonMusic（滤掉有声书/播客/广播剧——"放出来好多不是歌"）', () => {
  const s = (name, artist) => ({ mid: 'x', name, singer: [{ name: artist }] })
  it('喜马拉雅等平台 + 章节/有声 标题 → 判为非歌曲', () => {
    expect(isNonMusic(s('第5章 箴言能力的新发现', '喜马拉雅'))).toBe(true)
    expect(isNonMusic(s('第252集 有点小众的癖好', '余良'))).toBe(true)
    expect(isNonMusic(s('某某广播剧 第一期', '某工作室'))).toBe(true)
    expect(isNonMusic(s('三国演义 评书', '单田芳'))).toBe(true)
  })
  it('正常歌曲 → 不误伤', () => {
    expect(isNonMusic(s('晴天', '周杰伦'))).toBe(false)
    expect(isNonMusic(s('勾指起誓', 'ChiliChill'))).toBe(false)
    expect(isNonMusic(s('七里香', '周杰伦'))).toBe(false)
  })
  it('mapSong 对非歌曲返回 null（被 .filter(Boolean) 滤除）', () => {
    expect(mapSong(s('第10章 开端', '喜马拉雅'))).toBe(null)
    expect(mapSong({ mid: 'm', name: '晴天', singer: [{ name: '周杰伦' }] })).not.toBe(null)
  })
})

describe('canonicalArtist（歌手实锤：搜索结果验明候选词是不是真歌手）', () => {
  const tr = (name, ...singers) => ({ name, artists: singers.map(n => ({ name: n })) })

  it('singer 名一致的歌够多 → 实锤，返回官方写法', () => {
    const tracks = [
      tr('勾指起誓', 'ChiliChill'), tr('在你的身边', 'ChiliChill'),
      tr('如果可以', 'ChiliChill'), tr('无关', '某路人'),
    ]
    expect(canonicalArtist(tracks, 'chilichill')).toBe('ChiliChill')
  })

  it('忽略大小写与空格归一匹配', () => {
    const tracks = [tr('a', 'Taylor Swift'), tr('b', 'Taylor Swift'), tr('c', 'Taylor Swift')]
    expect(canonicalArtist(tracks, 'taylor swift')).toBe('Taylor Swift')
  })

  it('心情词/曲风词搜出来 singer 五花八门 → 不实锤', () => {
    const tracks = [tr('chill歌1', '张三'), tr('chill歌2', '李四'), tr('chill歌3', '王五')]
    expect(canonicalArtist(tracks, 'chill')).toBe(null)
  })

  it('部分包含不算实锤（chill ≠ ChiliChill，严格相等才行）', () => {
    const tracks = [tr('a', 'ChiliChill'), tr('b', 'ChiliChill'), tr('c', 'ChiliChill')]
    expect(canonicalArtist(tracks, 'chill')).toBe(null)
  })

  it('命中数不足 min → null；空词/空结果 → null', () => {
    expect(canonicalArtist([tr('a', '周杰伦'), tr('b', '周杰伦')], '周杰伦')).toBe(null)
    expect(canonicalArtist([tr('a', '周杰伦'), tr('b', '周杰伦')], '周杰伦', 2)).toBe('周杰伦')
    expect(canonicalArtist([], 'x')).toBe(null)
    expect(canonicalArtist(null, '')).toBe(null)
  })
})

describe('parseLRC', () => {
  it('解析时间戳与文本', () => {
    const out = parseLRC('[00:12.34]hello\n[01:05]world')
    expect(out).toEqual([
      { time: 12.34, text: 'hello' },
      { time: 65, text: 'world' },
    ])
  })

  it('同一行多个时间戳 → 多条，按时间排序', () => {
    const out = parseLRC('[00:05.00]repeat\n[00:01.00]repeat')
    expect(out.map(l => l.time)).toEqual([1, 5])
    expect(out.every(l => l.text === 'repeat')).toBe(true)
  })

  it('忽略没有时间戳的行；空输入 → []', () => {
    expect(parseLRC('词作：某某\n[00:03.00]词')).toEqual([{ time: 3, text: '词' }])
    expect(parseLRC('')).toEqual([])
    expect(parseLRC(null)).toEqual([])
  })

  it('毫秒三位也能解析', () => {
    expect(parseLRC('[00:10.500]x')[0].time).toBeCloseTo(10.5, 5)
  })
})

describe('detectChoruses', () => {
  it('无重复行 → 不标记、返回 []', () => {
    const lines = [
      { time: 0, text: '第一句' },
      { time: 4, text: '第二句' },
      { time: 8, text: '第三句' },
    ]
    expect(detectChoruses(lines)).toEqual([])
    expect(lines.some(l => l.isChorus)).toBe(false)
  })

  it('重复钩子行 → 标记 isChorus 并给出跳转起点', () => {
    // 副歌占比需 <45%，否则视为全曲高度重复、撤销标记（只留跳转点）
    const lines = [
      { time: 0, text: '主歌一甲' },
      { time: 5, text: '主歌一乙' },
      { time: 10, text: '副歌钩子' },
      { time: 30, text: '主歌二甲' },
      { time: 35, text: '主歌二乙' },
      { time: 40, text: '副歌钩子' },
      { time: 60, text: '尾声一句' },
      { time: 65, text: '尾声二句' },
    ]
    const starts = detectChoruses(lines)
    expect(lines[2].isChorus).toBe(true)
    expect(lines[5].isChorus).toBe(true)
    expect(lines[0].isChorus).toBeFalsy()
    expect(starts).toContain(10)
    expect(starts).toContain(40)
  })
})

describe('mapSong', () => {
  it('media_mid 优先取 file.media_mid，缺失则回退 mid', () => {
    expect(mapSong({ mid: 'm1', file: { media_mid: 'media1' }, singer: [] }).media_mid).toBe('media1')
    expect(mapSong({ mid: 'm2', singer: [] }).media_mid).toBe('m2')
  })

  it('歌手、时长、封面 URL', () => {
    const t = mapSong({ mid: 'm', id: 99, name: '歌', interval: 200, singer: [{ name: 'A' }, { name: 'B' }], album: { mid: 'alb' } })
    expect(t.id).toBe('99')
    expect(t.artists.map(a => a.name)).toEqual(['A', 'B'])
    expect(t.duration_ms).toBe(200000)
    expect(t.album.images[0].url).toContain('alb')
  })

  it('无 album.mid → 封面空数组；无 mid → null', () => {
    expect(mapSong({ mid: 'm', singer: [] }).album.images).toEqual([])
    expect(mapSong({ singer: [] })).toBe(null)
    expect(mapSong(null)).toBe(null)
  })
})

describe('getUin', () => {
  it('优先 uin，并去掉前导 o0', () => {
    expect(getUin([{ name: 'uin', value: 'o00123456' }])).toBe('123456')
    expect(getUin([{ name: 'uin', value: '12345' }])).toBe('12345')
  })

  it('uin 缺失/为0 → 退回 wxuin（微信登录）', () => {
    expect(getUin([{ name: 'uin', value: '0' }, { name: 'wxuin', value: '777' }])).toBe('777')
    expect(getUin([{ name: 'wxuin', value: '888' }])).toBe('888')
  })

  it('都没有 → "0"', () => {
    expect(getUin([])).toBe('0')
    expect(getUin(null)).toBe('0')
  })
})

describe('searchByArtist（mock fetch，不打真实接口）', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function stubSongs(list) {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ req_1: { data: { body: { song: { list } } } } }),
    })))
  }

  it('searchTracks 映射列表', async () => {
    stubSongs([{ mid: 'a', id: 1, name: '歌1', singer: [{ name: '周杰伦' }] }])
    const out = await searchTracks([], '周杰伦')
    expect(out).toHaveLength(1)
    expect(out[0].artists[0].name).toBe('周杰伦')
  })

  it('按歌手过滤：剔除标题含该词但歌手不符的杂歌', async () => {
    stubSongs([
      { mid: 'a', id: 1, name: '本人的歌', singer: [{ name: '周杰伦' }] },
      { mid: 'b', id: 2, name: '周杰伦的翻唱', singer: [{ name: '某翻唱歌手' }] },
    ])
    const out = await searchByArtist([], '周杰伦')
    expect(out.map(t => t.mid)).toEqual(['a'])
  })
})
