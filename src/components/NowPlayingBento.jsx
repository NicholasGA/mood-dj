import { useState, useEffect, useRef } from 'react'
import Lyrics from './Lyrics'
import Icon from './Icon'
import LiquidLayer from './LiquidLayer'
import LiquidBox from './LiquidBox'
import { vivid, vividDark, albumPalette } from '../ui/surface'

// 听歌仪表盘（bento）：把"正在播放"拆成有意义、画面填满的方块。
// 每块都是独立信息：正在播放 / 实时律动 / 心情 / 接下来 / DJ的故事 / 控制 / 歌词。

// 实时频谱小条（填满"律动"块，不再是空图标）
function MiniWave({ analyser, color, isPlaying }) {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf, t = 0
    const N = 32
    const buf = new Uint8Array(512)
    const draw = () => {
      raf = requestAnimationFrame(draw)
      t += 0.05
      const w = canvas.width = canvas.clientWidth * 2
      const h = canvas.height = canvas.clientHeight * 2
      ctx.clearRect(0, 0, w, h)
      if (w < 8 || h < 4) return   // 画布还没布局好/极小（如还原瞬间）：跳过本帧，否则 roundRect 负半径会崩溃整块
      const an = analyser?.current
      let live = false
      if (an && isPlaying) { an.getByteFrequencyData(buf); live = true }
      const bw = w / N
      const barW = Math.max(1, bw - 3)        // 夹到 ≥1，避免负宽/负半径
      for (let i = 0; i < N; i++) {
        const v = live
          ? Math.pow(buf[Math.floor((i / N) * an.frequencyBinCount * 0.55)] / 255, 1.1)
          : 0.16 + 0.12 * (Math.sin(t + i * 0.5) * 0.5 + 0.5)   // 静止时的轻微待机波
        const bh = Math.max(3, v * h)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.45 + v * 0.55
        const x = i * bw + 1.5
        const r = Math.max(0, Math.min(barW / 2, 3))
        ctx.beginPath()
        ctx.roundRect(x, h - bh, barW, bh, r)
        ctx.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [analyser, color, isPlaying])
  return <canvas ref={ref} style={{ width: '100%', height: 44, display: 'block' }} />
}

export default function NowPlayingBento({
  track, isPlaying, loadingTrack, audioRef, accent = '#31c27c', accent2 = '#4f46e5',
  onTogglePlay, onNext, onLike, onDislike, onVibe, onSteer, onOpenQueue, onPlayAt, onSetVibe,
  queueCount = 0, nextTrack, upNext = [], lyric, moodConfig, story, djName, analyser, volume = 0.8, onVolume, onRepick, inFav = false,
  repeatOne = false, onToggleRepeat,
}) {
  const [cur, setCur] = useState(0)        // 当前播放秒数
  const [rawDur, setRawDur] = useState(0)  // audio.duration（QQ 流有时是 Infinity）
  const [dragRatio, setDragRatio] = useState(null)  // 拖动时的比例（覆盖显示）
  const [barHover, setBarHover] = useState(false)   // 鼠标悬停进度条 → 展开高亮，明确"已移到可拖区"
  const [hoverRow, setHoverRow] = useState(null)    // 待播列表悬停的行 → 高亮 + 序号变播放键，点一下直切
  const [steerText, setSteerText] = useState('')
  const barRef = useRef(null)

  useEffect(() => {
    const audio = audioRef?.current
    if (!audio) return
    const onTime = () => setCur(audio.currentTime || 0)
    const onMeta = () => setRawDur(audio.duration || 0)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('loadedmetadata', onMeta)
    }
  }, [audioRef])

  // 真实时长：audio.duration 有限就用它，否则退回 QQ 接口给的歌曲时长（修复进度一直 0:00）
  const effDur = (isFinite(rawDur) && rawDur > 0) ? rawDur : (track?.duration_ms || 0) / 1000
  const ratio = dragRatio != null ? dragRatio : (effDur > 0 ? Math.min(1, cur / effDur) : 0)

  const ratioFromEvent = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }
  function onBarDown(e) {
    setDragRatio(ratioFromEvent(e))
    const move = (ev) => setDragRatio(ratioFromEvent(ev))
    const up = (ev) => {
      const r = ratioFromEvent(ev)
      const audio = audioRef?.current
      // 立即把 cur 同步到松手位置，再清 dragRatio → ratio 不会先弹回旧 cur 再跳到新位置（圆点闪现）
      if (audio && effDur > 0) { audio.currentTime = r * effDur; setCur(r * effDur) }
      setDragRatio(null)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const fmt = (s) => { if (!s || !isFinite(s)) return '0:00'; const m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss.toString().padStart(2, '0')}` }

  const art = track?.album?.images?.[0]?.url
  const title = track?.name || (loadingTrack ? '正在加载…' : '—')
  const artist = track?.artists?.map(a => a.name).join(', ') || (loadingTrack ? '挑选可播放的歌曲' : '等待播放')
  const energy = moodConfig?.energy ?? 0.5
  const valence = moodConfig?.valence ?? 0.5
  const mood = moodConfig?.mood_name || '随心'
  const emoji = moodConfig?.mood_emoji || '🎧'
  const nextArt = nextTrack?.album?.images?.[0]?.url
  const dots = Math.min(queueCount, 9)
  const heroSurf = vivid(accent, accent2, 30)
  const pal = albumPalette(accent)   // 从专辑色推导的协调调色板（邻近色+补色）
  const seed = track?.mid || track?.id || title   // 每首歌的视觉种子
  // 让卡片成为内嵌液体层的容器：液体落在渐变之上、文字之下（z-index:-1 + isolation）
  const clip = { position: 'relative', overflow: 'hidden', isolation: 'isolate' }

  return (
    <div style={s.root}>
      <div style={s.body}>
        {/* 左栏：播放器 + 律动/心情 + 接下来 */}
        <div style={s.left}>
          {/* 正在播放（左栏顶，封面更大；accent 辉光晕进背景） */}
          <div key={track?.mid || title} className="song-pop pulse-glow" style={{ ...heroSurf, ...s.hero, boxShadow: `${heroSurf.boxShadow}, 0 20px 70px -20px color-mix(in srgb, ${accent} 50%, transparent), 0 0 calc(var(--pulse,0) * 100px) -10px color-mix(in srgb, ${accent} 88%, transparent)` }}>
            <div style={s.heroArtWrap} className={isPlaying ? 'floaty' : ''}>
              {art ? <img src={art} alt="" style={{ ...s.heroArt, boxShadow: `${s.heroArt.boxShadow}, 0 0 calc(8px + var(--pulse,0) * 60px) calc(var(--pulse,0) * 6px) color-mix(in srgb, ${accent} 85%, transparent)` }} className="pulse-art" draggable={false} />
                   : <div style={{ ...s.heroArt, ...s.ph }} className="pulse-art">🎵</div>}
            </div>
            <div style={s.heroMid}>
              <div style={s.heroTitle} title={title}>{title}</div>
              <div style={s.heroSub}>
                <span style={s.heroArtist}>{artist}</span>
                {track && (inFav
                  ? <span style={s.favYes} title="这首已在你的 QQ「我喜欢」里">♥ 已收藏</span>
                  : <span style={s.favNew} title="这是为你新推的歌，喜欢就收藏">✨ 新歌</span>)}
              </div>
              <div style={s.progRow}>
                <span style={{ ...s.time, ...s.timeBig, color: '#fff' }} className="led">{fmt(ratio * effDur)}</span>
                <div
                  ref={barRef}
                  style={s.barHit}
                  onPointerDown={onBarDown}
                  onPointerEnter={() => setBarHover(true)}
                  onPointerLeave={() => setBarHover(false)}
                >
                  {(() => {
                    const active = barHover || dragRatio != null   // 悬停或拖动 → 展开高亮
                    return (
                      <div style={{ ...s.bar, ...(active ? { height: 9, background: 'rgba(255,255,255,0.32)', boxShadow: `0 2px 12px -2px color-mix(in srgb, ${accent} 60%, transparent)` } : null) }}>
                        <div style={{ ...s.fill, width: `${ratio * 100}%`, transition: dragRatio != null ? 'none' : s.fill.transition, ...(active ? { boxShadow: `0 0 10px color-mix(in srgb, ${accent} 70%, transparent)` } : null) }} />
                        <div style={{ ...s.knob, left: `${ratio * 100}%`, transition: dragRatio != null ? 'none' : s.knob.transition, ...(active ? { width: 15, height: 15, boxShadow: `0 0 0 4px color-mix(in srgb, ${accent} 30%, transparent), 0 2px 8px rgba(0,0,0,0.55)` } : null) }} />
                      </div>
                    )
                  })()}
                </div>
                <span style={{ ...s.time, color: 'rgba(255,255,255,0.85)' }} className="led">{fmt(effDur)}</span>
              </div>
              <div style={s.heroCtrl}>
                <button style={{ ...s.playBtn, boxShadow: `${s.playBtn.boxShadow}, 0 0 calc(var(--pulse,0) * 44px) calc(var(--pulse,0) * 3px) color-mix(in srgb, ${accent} 90%, transparent)` }} onClick={onTogglePlay} title="播放/暂停"><Icon name={isPlaying ? 'pause' : 'play'} size={22} color={accent} filled /></button>
                <button style={s.nextBtn} onClick={onNext} title="下一首"><Icon name="next" size={17} color="#fff" filled /></button>
                <button
                  style={{ ...s.nextBtn, ...(repeatOne ? { background: '#fff', borderColor: '#fff' } : {}) }}
                  onClick={onToggleRepeat}
                  title={repeatOne ? '单曲循环已开：放完重头再放本首' : '单曲循环'}>
                  <Icon name="repeat1" size={16} color={repeatOne ? accent : '#fff'} />
                </button>
              </div>
            </div>
          </div>

          {/* 律动 | 心情 */}
          <div style={s.leftGrid}>
            <div style={{ ...vivid(pal.energy, pal.energy, 28), ...s.tile, ...clip }}>
              <LiquidLayer accent={pal.energy} seed={`${seed}-e`} opacity={0.42} />
              <div style={s.tLabel}>律动</div>
              <MiniWave analyser={analyser} color={`color-mix(in srgb, ${pal.energy} 50%, #ffffff)`} isPlaying={isPlaying} />
              <div style={s.tValRow}><span className="led" style={s.tLed}>{Math.round(energy * 100)}</span><span style={s.tUnit}>能量</span></div>
            </div>
            <div style={{ ...vivid(accent, accent2, 28), ...s.tile, ...clip }}>
              <LiquidLayer accent={accent} seed={`${seed}-m`} opacity={0.42} />
              <div style={s.tLabel}>心情</div>
              <div style={s.moodMain} onClick={onRepick} title="点这里换个心情" role="button">
                <span style={s.moodEmojiWrap}><span style={s.moodEmoji}>{emoji}</span></span>
                <span style={s.moodName}>{mood}</span>
                <span style={s.moodEdit} title="换心情"><Icon name="refresh" size={13} color="rgba(255,255,255,0.7)" /></span>
              </div>
              <div style={s.gauges}>
                <MoodGauge label="能量" v={energy} accent={accent} onCommit={(val) => onSetVibe?.(val, valence)} />
                <MoodGauge label="情绪" v={valence} accent={accent} onCommit={(val) => onSetVibe?.(energy, val)} />
              </div>
            </div>
          </div>

          {/* 接下来：整条待播列表（撑满左栏剩余高度，可滚），点开管理队列 */}
          <div style={{ ...vividDark(pal.next, 28), ...s.tile, flex: 1, ...clip }}>
            <LiquidLayer accent={pal.next} seed={`${seed}-n`} opacity={0.32} />
            <div style={s.upHead}>
              <span style={s.tLabel}>接下来</span>
              <span style={s.upManage} onClick={onOpenQueue} title="展开管理：重排 / 移除">{queueCount} 首 · 管理 ›</span>
            </div>
            <div style={s.upList} className="lyrics-scroll">
              {upNext.slice(0, 30).map((t, i) => {
                const hov = hoverRow === i
                return (
                  <div key={t.mid || i}
                    style={{ ...s.upRow, ...(hov ? { background: 'rgba(255,255,255,0.10)' } : null) }}
                    onClick={() => onPlayAt?.(i)}
                    onMouseEnter={() => setHoverRow(i)}
                    onMouseLeave={() => setHoverRow(v => (v === i ? null : v))}
                    title={`点击播放：${t.name}`}
                  >
                    <span style={{ ...s.upNum, ...(hov ? { color: '#fff' } : null) }}>
                      {hov ? <Icon name="play" size={10} color="#fff" filled /> : (i + 1)}
                    </span>
                    {t.album?.images?.[0]?.url
                      ? <img src={t.album.images[0].url} alt="" style={s.upThumb} draggable={false} />
                      : <div style={{ ...s.upThumb, ...s.ph2 }}>♪</div>}
                    <div style={s.upInfo}>
                      <div style={{ ...s.upTitle, ...(hov ? { color: '#fff' } : null) }} title={t.name}>{t.name}</div>
                      <div style={s.upArtist}>{t.artists?.map(a => a.name).join(', ') || ''}</div>
                    </div>
                  </div>
                )
              })}
              {!upNext.length && <div style={s.upEmpty}>自动续上…无限电台</div>}
            </div>
          </div>
        </div>

        {/* 右栏：DJ 故事 + 歌词（撑满高度） */}
        <div style={s.right}>
          <div style={{ ...vividDark(pal.dj, 28), ...s.tile, ...clip }}>
            <LiquidLayer accent={pal.dj} seed={`${seed}-d`} opacity={0.4} />
            <div style={s.tLabel}>DJ · 这首的故事</div>
            <div style={s.djName}><Icon name="mic" size={13} color="#e9d5ff" /> {djName || '你的电台'}</div>
            <div style={s.story}>{story || '正在为这首歌写一句话…'}</div>
          </div>
          <div style={{ ...s.lyricTile, position: 'relative' }}>
            <LiquidBox accent={accent} seed={`${seed}-l`} radius={28} />
            <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={s.tLabel}>♪ 歌词</div>
              <Lyrics fill lines={lyric?.lines || []} hasTrans={lyric?.hasTrans} audioRef={audioRef} accent={accent} />
            </div>
          </div>
        </div>
      </div>

      {/* 底部控制坞（全宽、不随歌词滚动） */}
      <div style={s.dock}>
        <button style={{ ...s.pill, ...(inFav ? s.pillFav : { color: '#f9a8d4', borderColor: '#f472b640' }) }} onClick={onLike} title={inFav ? '已在 QQ 收藏' : '加入 QQ 我喜欢'}><Icon name="heart" size={14} color="#fff" filled /> {inFav ? '已收藏' : '喜欢'}</button>
        <button style={s.pill} onClick={onDislike}><Icon name="thumbsDown" size={14} color="#cbd5e1" /> 不喜欢</button>
        <span style={s.div} />
        <button style={s.pill} onClick={() => onVibe('up')}><Icon name="flame" size={14} color="#fb923c" /> 嗨</button>
        <button style={s.pill} onClick={() => onVibe('down')}><Icon name="moon" size={14} color="#93c5fd" /> 静</button>
        <button style={s.pill} onClick={() => onVibe('flavor')}><Icon name="shuffle" size={14} color="#c4b5fd" /> 换</button>
        <div style={s.steerWrap}>
          <span style={s.steerMic}><Icon name="mic" size={15} color="#9ca3af" /></span>
          <input style={s.steerInput} placeholder="跟 DJ 说…「放点周杰伦但安静的」" value={steerText}
            onChange={e => setSteerText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }} />
          <button style={{ ...s.steerBtn, background: accent, opacity: steerText.trim() ? 1 : 0.5 }} disabled={!steerText.trim()}
            onClick={() => { if (steerText.trim()) { onSteer(steerText.trim()); setSteerText('') } }}>换</button>
        </div>
        <span style={s.volIcon}><Icon name="volume" size={15} color="#9ca3af" /></span>
        <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={e => onVolume?.(Number(e.target.value) / 100)} className="mood-slider" style={{ width: 80, flexShrink: 0 }} />
        <span style={s.div} />
        <button style={s.pill} onClick={onRepick} title="重新选心情/换台"><Icon name="refresh" size={14} color="#9ca3af" /> 换心情</button>
      </div>
    </div>
  )
}

// 心情仪表条：暗槽内嵌 + accent 渐变辉光填充 + 发光游标 + LED 读数（和「律动」一个质感）
function MoodGauge({ label, v, accent, onCommit }) {
  const trackRef = useRef(null)
  const [drag, setDrag] = useState(null)   // 拖动时的实时比例（覆盖显示），松手后落定再清空
  const cur = drag != null ? drag : (v || 0)
  const pct = Math.max(0, Math.min(100, Math.round(cur * 100)))
  const active = drag != null
  const ratioFromEvent = (e) => {
    const r = trackRef.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }
  function onDown(e) {
    if (!onCommit) return
    e.stopPropagation()        // 别触发卡片层其它点击
    setDrag(ratioFromEvent(e))
    const move = (ev) => setDrag(ratioFromEvent(ev))
    const up = (ev) => {
      const val = ratioFromEvent(ev)
      setDrag(null)
      onCommit(val)            // 松手才落定 → 不会每拖一像素就打一次接口
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div style={s.gRow}>
      <span style={s.gLabel}>{label}</span>
      <div ref={trackRef} style={{ ...s.gTrack, ...(onCommit ? { cursor: 'pointer', touchAction: 'none' } : null) }} onPointerDown={onDown}>
        <div style={{ ...s.gFill, width: `${pct}%`, transition: active ? 'none' : s.gFill.transition,
          background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 50%, #ffffff), #ffffff)`,
          boxShadow: `0 0 10px color-mix(in srgb, ${accent} 55%, rgba(255,255,255,0.55))` }} />
        <div style={{ ...s.gDot, left: `${pct}%`, transition: active ? 'none' : s.gDot.transition,
          ...(active ? { width: 14, height: 14 } : null),
          boxShadow: `0 0 8px color-mix(in srgb, ${accent} 70%, #ffffff), 0 1px 3px rgba(0,0,0,0.6)${active ? `, 0 0 0 4px color-mix(in srgb, ${accent} 26%, transparent)` : ''}` }} />
      </div>
      <span className="led" style={s.gVal}>{pct}</span>
    </div>
  )
}

const s = {
  root: { display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 },
  body: { display: 'flex', gap: 16, flex: 1, minHeight: 0 },
  left: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  leftGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  right: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  lyricTile: { flex: 1, minHeight: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 },

  hero: { display: 'flex', alignItems: 'center', gap: 18, padding: '20px 24px', flexShrink: 0 },
  heroArtWrap: { flexShrink: 0 },
  heroArt: { width: 104, height: 104, borderRadius: 16, objectFit: 'cover', display: 'block', boxShadow: '0 10px 30px rgba(0,0,0,0.45)' },
  ph: { background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 },
  heroMid: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 19, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textShadow: '0 1px 8px rgba(0,0,0,0.4)' },
  heroSub: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, marginBottom: 10 },
  heroArtist: { fontSize: 13, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  favYes: { flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(244,114,182,0.24)', color: '#fce7f3', border: '1px solid rgba(244,114,182,0.45)' },
  favNew: { flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, background: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.22)' },
  progRow: { display: 'flex', alignItems: 'center', gap: 9 },
  time: { fontSize: 11, minWidth: 34, textAlign: 'center' },
  timeBig: { fontSize: 15, minWidth: 46 },
  // 命中区比可见条高（上下留白），鼠标更容易落上去/抓住，防误触；可见条居中。宽度=命中区宽，取比例不受影响
  barHit: { position: 'relative', flex: 1, height: 18, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' },
  bar: { position: 'relative', width: '100%', height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 5, transition: 'height .16s ease, background .16s ease, box-shadow .16s ease' },
  fill: { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 5, background: '#fff', transition: 'width .12s linear, box-shadow .16s ease' },
  knob: { position: 'absolute', top: '50%', width: 12, height: 12, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.5)', transition: 'width .16s ease, height .16s ease, box-shadow .16s ease' },
  heroCtrl: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 },
  playBtn: { width: 48, height: 48, borderRadius: '50%', background: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 22px rgba(0,0,0,0.35)' },
  nextBtn: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  tile: { padding: '18px 20px', minHeight: 124, display: 'flex', flexDirection: 'column', gap: 8, color: '#fff', position: 'relative' },
  tLabel: { fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', textShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  tValRow: { display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 'auto' },
  tLed: { fontSize: 26, color: '#fff' },
  tUnit: { fontSize: 12, color: 'rgba(255,255,255,0.78)' },

  moodMain: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, cursor: 'pointer', padding: '3px 6px', margin: '3px -6px 0', borderRadius: 12 },
  moodEdit: { marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', opacity: 0.7 },
  moodEmojiWrap: { width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.2)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.25)' },
  moodEmoji: { fontSize: 21, lineHeight: 1 },
  moodName: { fontSize: 17, fontWeight: 800, color: '#fff', textShadow: '0 1px 6px rgba(0,0,0,0.4)', lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', minWidth: 0 },
  gauges: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  gRow: { display: 'flex', alignItems: 'center', gap: 9 },
  gLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', width: 28, flexShrink: 0 },
  gTrack: { position: 'relative', flex: 1, height: 8, borderRadius: 5, background: 'rgba(0,0,0,0.34)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)' },
  gFill: { position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 5, transition: 'width .4s cubic-bezier(.22,.61,.36,1)' },
  gDot: { position: 'absolute', top: '50%', width: 11, height: 11, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: '#fff', transition: 'left .4s cubic-bezier(.22,.61,.36,1)' },
  gVal: { fontSize: 14, color: '#fff', width: 26, textAlign: 'right', flexShrink: 0 },

  ph2: { background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 },
  upHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  upCount: { fontSize: 11.5, color: '#9fb3c8' },
  upManage: { fontSize: 11.5, color: '#9fb3c8', cursor: 'pointer', flexShrink: 0, padding: '2px 4px', borderRadius: 6 },
  upList: { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, paddingRight: 4 },
  upRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 8px', margin: '0 -4px', borderRadius: 10, cursor: 'pointer', transition: 'background .14s ease' },
  upNum: { fontSize: 11, color: 'rgba(255,255,255,0.38)', width: 16, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  upThumb: { width: 34, height: 34, borderRadius: 7, objectFit: 'cover', flexShrink: 0, boxShadow: '0 3px 10px rgba(0,0,0,0.4)' },
  upInfo: { minWidth: 0, flex: 1 },
  upTitle: { fontSize: 13, fontWeight: 500, color: '#e8edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upArtist: { fontSize: 11, color: '#9fb3c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  upEmpty: { fontSize: 12.5, color: '#9fb3c8', padding: '8px 2px' },

  djName: { fontSize: 12.5, fontWeight: 600, color: '#e9d5ff', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 2 },
  story: { fontSize: 13, color: 'rgba(245,240,255,0.92)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' },

  // 底部控制坞：把分散的喜欢/调味/对话/音量/换心情收成一条，全宽常驻
  dock: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0, paddingTop: 2 },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' },
  pillFav: { background: 'rgba(244,114,182,0.85)', border: '1px solid rgba(244,114,182,0.9)', color: '#fff' },
  div: { width: 1, height: 18, background: 'rgba(255,255,255,0.14)', margin: '0 2px' },
  steerWrap: { position: 'relative', flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 6 },
  steerMic: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' },
  steerInput: { flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '9px 12px 9px 34px', color: '#f9fafb', fontSize: 13, outline: 'none' },
  steerBtn: { flexShrink: 0, padding: '0 15px', height: 36, borderRadius: 12, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  volIcon: { display: 'flex', flexShrink: 0, marginLeft: 4 },
}
