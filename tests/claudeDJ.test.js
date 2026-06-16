import { describe, it, expect, vi, afterEach } from 'vitest'
import { splitKeys, localInterpret, configureLLM, hasLLMKey, usesBuiltinAI, interpretRequest, extractMods, steerEnergyDelta, isContinuation, mergeContinuation, evalBudget, sanitizeHex, safeParse, repairTruncatedJSON } from '../src/services/claudeDJ'

describe('safeParse / repairTruncatedJSON（抗截断 JSON，flash-lite 输出超长被截）', () => {
  it('正常 JSON 直接解析', () => {
    expect(safeParse('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] })
    expect(safeParse('前面废话 [{"name":"x"}] 后面')).toEqual([{ name: 'x' }])
  })
  it('截断在歌名字符串中间 → 丢掉半个、保留前面完整的', () => {
    const raw = '{"mood_name":"放松","songs":[{"name":"晴天","artist":"周杰伦"},{"name":"枫","artist":"周杰伦"},{"name":"半岛铁'
    const r = safeParse(raw)
    expect(r.mood_name).toBe('放松')
    expect(r.songs).toEqual([{ name: '晴天', artist: '周杰伦' }, { name: '枫', artist: '周杰伦' }])
  })
  it('截断在数组元素之间 → 补齐闭合', () => {
    const raw = '[{"name":"a"},{"name":"b"},'
    expect(safeParse(raw)).toEqual([{ name: 'a' }, { name: 'b' }])
  })
  it('截断在对象字段后（缺右括号）→ 补齐', () => {
    expect(safeParse('{"order":[1,2,3,4,5]')).toEqual({ order: [1, 2, 3, 4, 5] })
  })
  it('字符串里的括号/转义不误判', () => {
    expect(safeParse('{"t":"a}b]c","n":1}')).toEqual({ t: 'a}b]c', n: 1 })
    expect(safeParse('{"t":"引号\\"内","n":2}')).toEqual({ t: '引号"内', n: 2 })
  })
  it('无可解析内容 → null', () => {
    expect(safeParse('完全不是json')).toBe(null)
    expect(safeParse('')).toBe(null)
    expect(safeParse(null)).toBe(null)
  })
  it('repairTruncatedJSON 保留到最后一个完整值并补括号', () => {
    expect(repairTruncatedJSON('{"a":[1,2,{"x":3}')).toBe('{"a":[1,2,{"x":3}]}')
  })
})

describe('sanitizeHex（校验模型给的颜色，挡住 NaN 流进 canvas）', () => {
  it('合法 6 位 / 3 位都规整成 #rrggbb 小写', () => {
    expect(sanitizeHex('#A1B2C3')).toBe('#a1b2c3')
    expect(sanitizeHex('#abc')).toBe('#aabbcc')
    expect(sanitizeHex('a1b2c3')).toBe('#a1b2c3')
  })
  it('非法值（颜色名/缺位/非字符串/空）一律兜底', () => {
    expect(sanitizeHex('red')).toBe('#31c27c')
    expect(sanitizeHex('#ff')).toBe('#31c27c')
    expect(sanitizeHex('#12g456')).toBe('#31c27c')
    expect(sanitizeHex(undefined)).toBe('#31c27c')
    expect(sanitizeHex(null, '#1db954')).toBe('#1db954')
  })
})

describe('splitKeys', () => {
  it('逗号分隔、去空白、丢空项', () => {
    expect(splitKeys('a, b ,c')).toEqual(['a', 'b', 'c'])
    expect(splitKeys('a,,b')).toEqual(['a', 'b'])
  })
  it('空/undefined → []', () => {
    expect(splitKeys('')).toEqual([])
    expect(splitKeys(undefined)).toEqual([])
  })
})

describe('localInterpret（AI 不可用时的本地点歌解析）', () => {
  it('"放点周杰伦的" → 识别为歌手', () => {
    const r = localInterpret('放点周杰伦的')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords).toEqual(['周杰伦'])
    expect(r.mood_name).toBe('周杰伦')
  })

  it('"周杰伦但是要安静" → 歌手 + 心情关键词', () => {
    const r = localInterpret('周杰伦但是要安静')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords[0]).toContain('安静')
  })

  it('多个名字（含空格）不当作单一歌手', () => {
    expect(localInterpret('周杰伦 林俊杰').artists).toEqual([])
  })

  it('空输入 → 不报错、无歌手无关键词', () => {
    const r = localInterpret('')
    expect(r.artists).toEqual([])
    expect(r.keywords).toEqual([])
  })

  it('"放点我没听过的" → 探索意图，绝不把"没听过"当关键词', () => {
    const r = localInterpret('放点我没听过的')
    expect(r.mode).toBe('discover')
    expect(r.keywords.join('')).not.toContain('没听过')
    expect(r.artists).toEqual([])
  })

  it('"想听点没听过的日系" → 探索 + 保留曲风关键词', () => {
    const r = localInterpret('想听点没听过的日系')
    expect(r.mode).toBe('discover')
    expect(r.keywords.join('')).toContain('日系')
  })

  it('"放我收藏的歌" → 收藏意图', () => {
    expect(localInterpret('放我收藏的歌').mode).toBe('favorite')
  })

  it('普通点歌 → mode 为 normal', () => {
    expect(localInterpret('放点周杰伦的').mode).toBe('normal')
  })

  // 否定式回归（曾被"听过的"误抓成 favorite——正好反了）
  it('"我想听没有听过的歌" → discover，绝不是 favorite', () => {
    const r = localInterpret('我想听没有听过的歌')
    expect(r.mode).toBe('discover')
    expect(r.artists).toEqual([])
  })

  it('"我想听没收藏过的歌" / "没有收藏过的" → discover', () => {
    expect(localInterpret('我想听没收藏过的歌').mode).toBe('discover')
    expect(localInterpret('放点没有收藏过的').mode).toBe('discover')
  })

  it('"放点我没怎么听过的" → discover', () => {
    const r = localInterpret('放点我没怎么听过的')
    expect(r.mode).toBe('discover')
    expect(r.keywords.join('')).not.toContain('听过')
  })

  it('口语变体"没咋/没太/没啥听过" → 都是 discover（曾被误抓成 favorite）', () => {
    for (const t of ['想听没咋听过的歌', '没太听过的', '来点我没啥听过的']) {
      const r = localInterpret(t)
      expect(r.mode, t).toBe('discover')
      expect(r.keywords.join(''), t).not.toContain('听过')
    }
  })

  it('"想听听过的歌" → 还是 favorite（否定守卫别误伤肯定式）', () => {
    expect(localInterpret('想听听过的歌').mode).toBe('favorite')
  })

  it('"有没有听起来温柔一点的歌" → normal（"没有听"不带"过"不算探索）', () => {
    expect(localInterpret('有没有听起来温柔一点的歌').mode).toBe('normal')
  })

  // 拉丁字母歌手名（chilichill 曾被 AI 当成 chill 心情）
  it('"我想听chilichill的歌" → 识别为歌手', () => {
    const r = localInterpret('我想听chilichill的歌')
    expect(r.mode).toBe('normal')
    expect(r.artists).toEqual(['chilichill'])
  })

  it('英文名带空格（Taylor Swift）→ 允许当单一歌手', () => {
    expect(localInterpret('来点Taylor Swift的歌').artists).toEqual(['Taylor Swift'])
  })
})

describe('多轮对话点歌：extractMods / steerEnergyDelta', () => {
  it('安静类 → 负能量增量 + 安静关键词', () => {
    const r = extractMods('再安静一点的')
    expect(r.keywords).toContain('安静')
    expect(r.dE).toBeLessThan(0)
  })
  it('嗨/燃类 → 正能量增量', () => {
    expect(steerEnergyDelta('更嗨的').dE).toBeGreaterThan(0)
    expect(steerEnergyDelta('快一点').dE).toBeGreaterThan(0)
  })
  it('甜/伤 → 情绪增量正/负', () => {
    expect(steerEnergyDelta('来点甜的').dV).toBeGreaterThan(0)
    expect(steerEnergyDelta('更伤感的').dV).toBeLessThan(0)
  })
  it('无修饰词 → 零增量', () => {
    expect(steerEnergyDelta('随便')).toEqual({ dE: 0, dV: 0 })
  })
  it('增量夹在 ±0.4', () => {
    const r = extractMods('又安静又慢又柔又轻')   // 多个负向词叠加
    expect(r.dE).toBeGreaterThanOrEqual(-0.4)
  })
})

describe('多轮对话点歌：isContinuation / mergeContinuation', () => {
  const prev = { mode: 'normal', artists: ['周杰伦'], keywords: ['抒情'] }

  it('续接句识别：再来点这种/更安静/他的快歌 → true', () => {
    expect(isContinuation('再来点这种')).toBe(true)
    expect(isContinuation('更安静的')).toBe(true)
    expect(isContinuation('他的快歌')).toBe(true)
  })
  it('全新点名 → 非续接', () => {
    expect(isContinuation('想听林俊杰', { artists: ['林俊杰'] })).toBe(false)
  })

  it('"再安静点" → 继承上次歌手，关键词换成安静', () => {
    const r = mergeContinuation(prev, { mode: 'normal', artists: [], keywords: [], mood_name: '', dj_intro: '好' }, '再安静一点的')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords).toContain('安静')
  })
  it('"再来点这种"（无新修饰）→ 沿用上次歌手与方向', () => {
    const r = mergeContinuation(prev, { mode: 'normal', artists: [], keywords: [] }, '再来点这种')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords).toEqual(['抒情'])
  })
  it('本地把续接词误当歌手（"再来点"）→ 被过滤、回落上次歌手', () => {
    const r = mergeContinuation(prev, { mode: 'normal', artists: ['再来点'], keywords: [] }, '再来点这种')
    expect(r.artists).toEqual(['周杰伦'])
  })
  it('全新独立请求 → 原样返回（不接上次）', () => {
    const cur = { mode: 'normal', artists: ['林俊杰'], keywords: [] }
    expect(mergeContinuation(prev, cur, '想听林俊杰').artists).toEqual(['林俊杰'])
  })
  it('无 prev → 原样返回', () => {
    const cur = { mode: 'normal', artists: ['A'], keywords: [] }
    expect(mergeContinuation(null, cur, '再来点')).toBe(cur)
  })

  // 回归：含"这种/一样"但自带新方向的句子，绝不能被锁回上次歌手（评审 #1/#2/#5）
  it('"想听这种感觉的民谣"（自带新方向）→ 不锁旧歌手', () => {
    const cur = { mode: 'normal', artists: [], keywords: ['民谣'] }
    const r = mergeContinuation(prev, cur, '想听这种感觉的民谣')
    expect(r.artists).toEqual([])
    expect(r.keywords).toContain('民谣')
  })
  it('"一样是华语但要新歌手"（discover）→ 不锁旧歌手、保 discover', () => {
    const cur = { mode: 'discover', artists: [], keywords: ['华语'] }
    const r = mergeContinuation(prev, cur, '一样是华语但要新歌手')
    expect(r.artists).toEqual([])
    expect(r.mode).toBe('discover')
  })
  it('上次 normal + "再来点没听过的"（discover）→ 切 discover 且不锁旧歌手', () => {
    const cur = { mode: 'discover', artists: [], keywords: ['小众宝藏'] }
    const r = mergeContinuation(prev, cur, '再来点没听过的')
    expect(r.mode).toBe('discover')
    expect(r.artists).toEqual([])
  })
  it('本地把"再安静"误当歌手 → 滤掉、回落上次歌手（续接修饰）', () => {
    const cur = { mode: 'normal', artists: ['再安静'], keywords: ['再安静'] }
    const r = mergeContinuation(prev, cur, '再安静一点的')
    expect(r.artists).toEqual(['周杰伦'])
    expect(r.keywords).toContain('安静')
  })
  it('续接残词不进 keywords（"再安静一"被滤，只留干净的"安静"）', () => {
    const cur = { mode: 'normal', artists: ['再安静一'], keywords: ['再安静一'] }
    const r = mergeContinuation(prev, cur, '再安静一点的')
    expect(r.keywords).toEqual(['安静'])           // 不含"再安静一"
    expect(r.artists).toEqual(['周杰伦'])
  })
  it('点名含修饰字的歌名"快乐崇拜" → 非续接、原样保留', () => {
    const cur = { mode: 'normal', artists: ['快乐崇拜'], keywords: [] }
    expect(isContinuation('想听快乐崇拜', cur)).toBe(false)
    expect(mergeContinuation(prev, cur, '想听快乐崇拜').artists).toEqual(['快乐崇拜'])
  })
})

describe('configureLLM / hasLLMKey', () => {
  it('配了 key → true；清空 → false', () => {
    configureLLM({ geminiKey: '', openrouterKey: '', proxyUrl: '' })
    expect(hasLLMKey()).toBe(false)
    configureLLM({ geminiKey: 'AIza-test-key' })
    expect(hasLLMKey()).toBe(true)
    configureLLM({ geminiKey: '', openrouterKey: 'or-key' })
    expect(hasLLMKey()).toBe(true)
    configureLLM({ geminiKey: '', openrouterKey: '' })
    expect(hasLLMKey()).toBe(false)
  })
})

describe('内置共享代理（零配置开箱即用）', () => {
  it('只配了代理地址 → hasLLMKey true 且 usesBuiltinAI true（首启无需 key）', () => {
    configureLLM({ geminiKey: '', openrouterKey: '', proxyUrl: 'https://proxy.test' })
    expect(hasLLMKey()).toBe(true)
    expect(usesBuiltinAI()).toBe(true)
  })
  it('用户填了自己的 key → 不再算"吃内置代理"（走自己的额度）', () => {
    configureLLM({ proxyUrl: 'https://proxy.test', geminiKey: 'AIza-mine' })
    expect(usesBuiltinAI()).toBe(false)
    expect(hasLLMKey()).toBe(true)
  })
  it('既无 key 也无代理 → 全 false', () => {
    configureLLM({ geminiKey: '', openrouterKey: '', proxyUrl: '' })
    expect(hasLLMKey()).toBe(false)
    expect(usesBuiltinAI()).toBe(false)
  })
})

describe('代理路由（stub fetch 验证零配置确实走代理）', () => {
  afterEach(() => { vi.unstubAllGlobals(); configureLLM({ geminiKey: '', openrouterKey: '', proxyUrl: '' }) })
  it('只配代理时，点歌解析经 gemini() 打到 PROXY_URL 并解析返回的 {text}', async () => {
    const calls = []
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url))
      return { ok: true, status: 200, json: async () => ({ text: '{"mode":"normal","artists":["周杰伦"],"keywords":["抒情"],"mood_name":"周式情歌","dj_intro":"来点周董"}' }) }
    })
    configureLLM({ geminiKey: '', openrouterKey: '', proxyUrl: 'https://proxy.test/llm' })
    const r = await interpretRequest('我想听周杰伦的歌')
    expect(calls.some(u => u.includes('proxy.test'))).toBe(true)   // 确实打到代理
    expect(calls.some(u => u.includes('generativelanguage') || u.includes('openrouter'))).toBe(false)  // 没碰真上游
    expect(r.artists).toEqual(['周杰伦'])
  })
})

describe('evalBudget（每日 LLM 预算：让免费额度撑一天）', () => {
  const today = evalBudget(null).date

  it('无记录 → 计数 0、核心与故事都放行', () => {
    const b = evalBudget(null, Date.now(), 200)
    expect(b.count).toBe(0)
    expect(b.blockCore).toBe(false)
    expect(b.blockStory).toBe(false)
  })

  it('用到 65%（130/200）→ 先拦故事，核心仍放行', () => {
    const b = evalBudget({ date: today, count: 130 }, Date.now(), 200)
    expect(b.blockStory).toBe(true)
    expect(b.blockCore).toBe(false)
  })

  it('用满上限 → 核心也拦', () => {
    const b = evalBudget({ date: today, count: 200 }, Date.now(), 200)
    expect(b.blockCore).toBe(true)
    expect(b.blockStory).toBe(true)
  })

  it('跨天 → 计数清零、恢复放行', () => {
    const b = evalBudget({ date: '1999-01-01', count: 999 }, Date.now(), 200)
    expect(b.count).toBe(0)
    expect(b.blockCore).toBe(false)
  })
})
