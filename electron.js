const { app, BrowserWindow, ipcMain, net, protocol, screen, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')
const { qqSign } = require('./qqSign.cjs')

// 主进程日志落盘，方便排查（dev 下 concurrently 会吞掉 stdout）
const dlog = (...args) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${args.join(' ')}`
  console.log(line)
  try {
    const dir = app.isReady() ? app.getPath('userData') : __dirname   // 打包后 __dirname 在只读 asar 里
    fs.appendFileSync(path.join(dir, 'debug.log'), line + '\n')
  } catch {}
}

// 解析真实 uin：QQ 登录在 `uin`(形如 o0xxxx)，微信登录在 `wxuin`
function resolveUin(cookies) {
  const pick = (name) => cookies.find(c => c.name === name && c.value && c.value !== '0')?.value
  const raw = pick('uin') || pick('wxuin')
  return raw ? raw.replace(/^o0*/, '') : '0'
}

// Must register before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'qq-audio', privileges: { supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
  // 打包后用 app:// 加载页面，避免 file:// 下 ES module 加载失败导致黑屏
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon' }

const isDev = process.env.ELECTRON_DEV === 'true'
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 660,
    frame: false,
    // 注：本想用 Win11 Mica(透明窗口透出桌面)做"无形感"，但本应用 UI 大量用 backdrop-filter
    // 毛玻璃，透明窗口下 Chromium 合成器会丢掉这些图层→整屏只剩纯文字。故保持不透明深色，
    // "氛围感/呼吸感"改由应用内渐变+呼吸动画+专辑色实现（不依赖窗口透明）。
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL('app://bundle/index.html')
  }
  // 加载失败诊断（仅错误时记录）
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => dlog('[did-fail-load]', code, desc, url))
  mainWindow.webContents.on('render-process-gone', (_e, d) => dlog('[render-gone]', JSON.stringify(d)))
  mainWindow.webContents.on('console-message', (_e, level, message, lineNo, src) => { if (level >= 2 && !String(message).includes('Security Warning')) dlog('[renderer]', String(message).slice(0, 400), '@', String(src).split('/').pop() + ':' + lineNo) })
}

// ── qq-audio:// protocol — proxies CDN requests with session cookies ─
app.whenReady().then(() => {
  // app:// — 打包后从 dist 提供前端文件（绕开 file:// 的模块加载限制）
  protocol.handle('app', async (request) => {
    try {
      let rel = decodeURIComponent(new URL(request.url).pathname)
      if (!rel || rel === '/') rel = '/index.html'
      const filePath = path.join(__dirname, 'dist', path.normalize(rel))
      const data = await fs.promises.readFile(filePath)
      return new Response(data, { headers: { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' } })
    } catch (e) {
      dlog('[app protocol]', e.message)
      return new Response('Not Found', { status: 404 })
    }
  })

  protocol.handle('qq-audio', async (request) => {
    try {
      const cdnUrl = new URL(request.url).searchParams.get('u') || ''
      if (!cdnUrl) return new Response('Bad Request', { status: 400 })

      const session = mainWindow?.webContents?.session
      const allCookies = session ? await session.cookies.get({}) : []
      const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')

      const fetchHeaders = {
        'Referer': 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
      }
      const range = request.headers.get('Range')
      if (range) fetchHeaders['Range'] = range

      const res = await net.fetch(cdnUrl, { headers: fetchHeaders })
      const headers = { 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Accept-Ranges': 'bytes' }
      const cl = res.headers.get('Content-Length'); if (cl) headers['Content-Length'] = cl
      const cr = res.headers.get('Content-Range');  if (cr) headers['Content-Range'] = cr
      return new Response(res.body, { status: res.status, headers })
    } catch(e) {
      console.error('[qq-audio protocol]', e.message)
      return new Response('Proxy Error', { status: 502 })
    }
  })
  createWindow()
  setupAutoUpdate()
})

// ── 自动更新（electron-updater，从 GitHub Releases 检查）──────────────
function sendUpdate(payload) { try { mainWindow?.webContents.send('update-status', payload) } catch {} }
function setupAutoUpdate() {
  if (isDev) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (i) => { dlog('[update] available', i.version); sendUpdate({ state: 'available', version: i.version }) })
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => { dlog('[update] downloaded', i.version); sendUpdate({ state: 'downloaded', version: i.version }) })
  autoUpdater.on('update-not-available', () => dlog('[update] up to date'))
  autoUpdater.on('error', (e) => dlog('[update] error', e.message))
  autoUpdater.checkForUpdates().catch(e => dlog('[update] check failed', e.message))
}
ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall() })

// ── QQ Music auth via cookie capture ──────────────────────────────
ipcMain.handle('qq-auth', () => {
  return new Promise((resolve, reject) => {
    let settled = false, timer = null
    const popup = new BrowserWindow({
      width: 1000, height: 700, parent: mainWindow,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    popup.loadURL('https://y.qq.com/')
    popup.setTitle('登录 QQ音乐 — 登录后请稍等片刻')
    const done = (cookies, err) => {
      if (settled) return; settled = true
      if (timer) clearInterval(timer)
      if (!popup.isDestroyed()) popup.close()
      err ? reject(new Error(err)) : resolve(cookies)
    }
    timer = setInterval(async () => {
      try {
        const all = await popup.webContents.session.cookies.get({})
        const keyst = all.find(c => c.name === 'qm_keyst' && c.value)
        if (keyst && !settled) {
          console.log('[QQ Auth] found qm_keyst, waiting 3s...')
          clearInterval(timer); timer = null
          setTimeout(async () => {
            const final = await popup.webContents.session.cookies.get({})
            const uinCk = final.find(c => c.name === 'uin' && c.value && c.value !== '0')
            console.log('[QQ Auth] done, uin:', uinCk?.value || '(none)')
            done(final, null)
          }, 3000)
        }
      } catch (e) { console.error('[QQ Auth] poll error:', e) }
    }, 1500)
    popup.on('closed', () => done(null, 'cancelled'))
    setTimeout(() => done(null, '登录超时'), 15 * 60 * 1000)
  })
})

// ── QQ Music vkey — returns qq-audio:// proxy URL ─────────────────
ipcMain.handle('qq-get-url', async (_e, songmid, mediaMid) => {
  const session = mainWindow.webContents.session
  const allCookies = await session.cookies.get({})
  const uin = resolveUin(allCookies)
  const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
  const guid = Math.random().toString(36).slice(2, 12).padEnd(10, '0')
  const reqHeaders = {
    'Referer': 'https://y.qq.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie': cookieHeader,
  }
  dlog('[vkey] req', songmid, '| uin:', uin, '| qm_keyst:', allCookies.some(c => c.name === 'qm_keyst') ? 'yes' : 'NO')

  // 关键：CDN 文件名用 media_mid（不是 songmid），否则 CDN 报 -46628 file not exist
  const fileMid = mediaMid || songmid
  // 从低码率(免费概率高)到高码率(VIP)依次尝试；一次请求拿全部 purl
  const formats = [`M500${fileMid}.mp3`, `C400${fileMid}.m4a`, `M800${fileMid}.mp3`]
  let infos = []
  let sips = ['https://ws.stream.qqmusic.qq.com/', 'https://dl.stream.qqmusic.qq.com/', 'https://isure.stream.qqmusic.qq.com/']
  try {
    const body = JSON.stringify({
      req_0: {
        module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
        param: {
          guid, uin, loginflag: 1, platform: '20',
          songmid: formats.map(() => songmid),
          songtype: formats.map(() => 0),
          filename: formats,
        },
      },
      loginUin: uin,
      comm: { uin, format: 'json', ct: 19, cv: 1859 },
    })
    const res = await net.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST', headers: { ...reqHeaders, 'Content-Type': 'application/json' }, body,
    })
    const data = await res.json()
    infos = data.req_0?.data?.midurlinfo || []
    const apiSips = (data.req_0?.data?.sip || []).map(s => s.replace(/^http:\/\//, 'https://'))
    // apiSips 是权威地址，优先；去重后最多试 3 个，避免一首歌耗时过久
    sips = [...new Set([...apiSips, ...sips])].slice(0, 3)
  } catch (e) {
    dlog('[vkey] request error:', e.message)
    return null
  }

  // 关键：拿到 purl 不代表能播。逐个 purl × sip 真发一次 Range 请求，只返回 200/206 的
  const verify = async (url) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 3000)
      const r = await net.fetch(url, { method: 'GET', headers: { ...reqHeaders, Range: 'bytes=0-1' }, signal: ctrl.signal })
      clearTimeout(t)
      return r.status
    } catch { return -1 }
  }

  for (const info of infos) {
    if (!info?.purl) continue
    for (const sip of sips) {
      const cdnUrl = (sip + info.purl).replace(/ /g, '%20')
      const st = await verify(cdnUrl)
      if (st === 200 || st === 206) {
        dlog('[vkey] playable', info.filename, '→', st)
        return 'qq-audio://x?u=' + encodeURIComponent(cdnUrl)
      }
    }
  }
  const anyPurl = infos.some(i => i?.purl)
  dlog('[vkey]', anyPurl ? 'purl 有但 CDN 全部失败(需VIP/无版权)' : 'purl 为空(无版权/需VIP)', '—', songmid)
  return null
})

// ── QQ Music 歌词（LRC，base64 解码后返回纯文本） ─────────────────
ipcMain.handle('qq-get-lyric', async (_e, songmid) => {
  try {
    const body = JSON.stringify({
      comm: { ct: 19, cv: 1859 },
      // trans:1 才会返回翻译轨（默认不返回，即使 hasMultiTrans=true）
      req: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param: { songMID: songmid, songID: 0, trans: 1, qrc: 0 } },
    })
    const res = await net.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Referer': 'https://y.qq.com/' },
      body,
    })
    const json = await res.json()
    const d = json.req?.data || {}
    const dec = (b) => b ? Buffer.from(b, 'base64').toString('utf8') : ''
    return { lyric: dec(d.lyric), trans: dec(d.trans) }
  } catch (e) {
    dlog('[lyric] error:', e.message)
    return { lyric: '', trans: '' }
  }
})

// ── 用户收藏：取"我喜欢"等歌单 + 高频歌手 + 样本曲（需登录态，走主进程）──
ipcMain.handle('qq-get-favorites', async () => {
  try {
    const session = mainWindow.webContents.session
    const allCookies = await session.cookies.get({})
    const uin = resolveUin(allCookies)
    if (uin === '0') return null
    const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
    const headers = { 'Referer': 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieHeader }
    const keyst = allCookies.find(c => c.name === 'qm_keyst')?.value || allCookies.find(c => c.name === 'qqmusic_key')?.value || ''
    let g_tk = 5381; for (let i = 0; i < keyst.length; i++) g_tk += (g_tk << 5) + keyst.charCodeAt(i); g_tk &= 2147483647

    // 1) 用户歌单列表
    const listUrl = `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=${uin}&sin=0&size=50&g_tk=${g_tk}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`
    const lr = await net.fetch(listUrl, { headers })
    const lj = await lr.json()
    const disslist = (lj.data?.disslist || []).filter(d => d.tid && d.song_cnt > 0)
    if (!disslist.length) { dlog('[fav] 无歌单'); return null }
    disslist.sort((a, b) => (b.diss_name === '我喜欢') - (a.diss_name === '我喜欢') || (b.song_cnt - a.song_cnt))
    const playlistIds = disslist.slice(0, 5).map(d => String(d.tid))
    const fav = disslist.find(d => d.diss_name === '我喜欢') || disslist[0]

    // 2) 从"我喜欢"随机抽一段做口味样本
    const begin = Math.max(0, Math.floor(Math.random() * Math.max(1, fav.song_cnt - 80)))
    const body = JSON.stringify({
      comm: { ct: 19, cv: 1859, uin, format: 'json' },
      req_1: { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: { disstid: Number(fav.tid), tag: 1, userinfo: 0, song_begin: begin, song_num: 80 } },
    })
    const sr = await net.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body })
    const songs = (await sr.json()).req_1?.data?.songlist || []
    const sample = songs.filter(s => s.mid).map(s => ({
      id: String(s.id ?? s.mid), mid: s.mid, media_mid: s.file?.media_mid || s.mid, name: s.name,
      artists: (s.singer || []).map(a => ({ name: a.name })),
      album: { name: s.album?.name, images: s.album?.mid ? [{ url: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` }] : [] },
      duration_ms: (s.interval || 0) * 1000, uri: `qqmusic:${s.mid}`,
    }))
    const af = {}; sample.forEach(t => t.artists.forEach(a => { af[a.name] = (af[a.name] || 0) + 1 }))
    const topArtists = Object.entries(af).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n]) => n)
    dlog('[fav] 歌单', playlistIds.length, '| 我喜欢', fav.song_cnt, '首 | 样本', sample.length, '| 高频', topArtists.slice(0, 5).join(','))
    return { playlistIds, topArtists, sample, favCount: fav.song_cnt }
  } catch (e) { dlog('[fav] error', e.message); return null }
})

// ── 把一首歌加入 QQ "我喜欢"(dirId 201) ───────────────────────────
ipcMain.handle('qq-add-favorite', async (_e, songId) => {
  try {
    const session = mainWindow.webContents.session
    const allCookies = await session.cookies.get({})
    const uin = resolveUin(allCookies)
    if (uin === '0' || !songId) return false
    const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
    const body = JSON.stringify({
      comm: { ct: 24, cv: 0, uin, format: 'json' },
      req_1: { module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: 201, v_songInfo: [{ songId: Number(songId), songType: 0 }] } },
    })
    // 走签名版 musics.fcg：未签名的 musicu.fcg 对版权保护的歌(美人鱼等)会回 80105，签名后明文 body 即可成功
    // 注意：用 u.y.qq.com（与取流同host，net.fetch 可达）；别加 Origin 头，否则 Electron 触发 CORS → net::ERR_FAILED
    const res = await net.fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${qqSign(body)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Referer': 'https://y.qq.com/', 'Cookie': cookieHeader }, body,
    })
    const ok = (await res.json()).req_1?.code === 0
    dlog('[fav-add]', songId, ok ? 'ok' : 'failed')
    return ok
  } catch (e) { dlog('[fav-add] error', e.message); return false }
})

// 签名版 musics.fcg 通用调用（写操作用）：返回 req_1 的解析结果
async function signedMusics(req) {
  const allCookies = await mainWindow.webContents.session.cookies.get({})
  const uin = resolveUin(allCookies)
  if (uin === '0') return null
  const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
  const body = JSON.stringify({ comm: { ct: 24, cv: 0, uin, format: 'json' }, req_1: req })
  const res = await net.fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?_=${Date.now()}&sign=${qqSign(body)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Referer': 'https://y.qq.com/', 'Cookie': cookieHeader }, body,
  })
  return (await res.json()).req_1
}

// ── 新建歌单 → 返回新歌单 dirId（失败 0）────────────────────────────
ipcMain.handle('qq-create-playlist', async (_e, name) => {
  try {
    if (!name) return 0
    const r = await signedMusics({ module: 'music.musicasset.PlaylistBaseWrite', method: 'AddPlaylist', param: { dirName: String(name).slice(0, 30) } })
    const dirId = r?.code === 0 ? (r?.data?.result?.dirId || 0) : 0
    dlog('[pl-create]', name, '→ dirId', dirId, '(code', r?.code, ')')
    return dirId
  } catch (e) { dlog('[pl-create] error', e.message); return 0 }
})

// ── 把若干歌加入某歌单(dirId)，分批 → 返回成功首数 ──────────────────
ipcMain.handle('qq-add-songs', async (_e, dirId, songIds) => {
  try {
    const ids = (songIds || []).map(Number).filter(Boolean)
    if (!dirId || !ids.length) return 0
    let ok = 0
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40)
      const r = await signedMusics({ module: 'music.musicasset.PlaylistDetailWrite', method: 'AddSonglist', param: { dirId: Number(dirId), v_songInfo: chunk.map(id => ({ songId: id, songType: 0 })) } })
      ok += (r?.data?.result?.songlist || []).filter(s => s.backendSongId).length
      await new Promise(res => setTimeout(res, 150))
    }
    dlog('[pl-add]', dirId, ok + '/' + ids.length)
    return ok
  } catch (e) { dlog('[pl-add] error', e.message); return 0 }
})

// ── Token / cookie persistence ─────────────────────────────────────
const dataDir  = () => app.getPath('userData')
const qqFile    = () => path.join(dataDir(), 'mooddj-qq.json')
const memFile   = () => path.join(dataDir(), 'mooddj-memory.json')

const readJson = (f) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null } catch { return null } }
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v))

ipcMain.handle('get-qq-cookies',  () => readJson(qqFile()))
ipcMain.handle('store-qq-cookies',(_e, v) => writeJson(qqFile(), v))
ipcMain.handle('clear-qq-cookies',() => { try { fs.unlinkSync(qqFile()) } catch {} })
ipcMain.handle('get-memory',      () => readJson(memFile()))
ipcMain.handle('store-memory',    (_e, v) => writeJson(memFile(), v))

// ── 应用配置（API key 等，打包分发后由用户在应用内填写）─────────────
const cfgFile = () => path.join(dataDir(), 'mooddj-config.json')
ipcMain.handle('get-config',   () => readJson(cfgFile()))
ipcMain.handle('store-config', (_e, v) => writeJson(cfgFile(), v))

// ── 用默认浏览器打开外链（教程/获取 key 跳转）─────────────────────
ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})

// ── Window controls ───────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow.minimize())
ipcMain.on('win-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('win-close',    () => mainWindow.close())

// ── 迷你播放器：把主窗口切成置顶小窗 / 还原 ───────────────────────
let prevBounds = null
ipcMain.handle('set-mini', (_e, on) => {
  if (!mainWindow) return
  try {
    if (on) {
      prevBounds = mainWindow.getBounds()
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      const W = 400, H = 112
      const wa = screen.getPrimaryDisplay().workArea
      const x = Math.max(wa.x, wa.x + wa.width - W - 20)
      const y = Math.max(wa.y, wa.y + wa.height - H - 20)
      mainWindow.setMinimumSize(300, 96)
      mainWindow.setResizable(true)               // 必须先可调整，setBounds 才生效（Win 坑）
      mainWindow.setBounds({ x, y, width: W, height: H })
      mainWindow.setResizable(false)
      mainWindow.setAlwaysOnTop(true, 'floating')
      mainWindow.show(); mainWindow.focus()
      dlog('[mini] ON →', JSON.stringify(mainWindow.getBounds()))
    } else {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setResizable(true)
      mainWindow.setMinimumSize(960, 660)
      if (prevBounds) mainWindow.setBounds(prevBounds)
      else mainWindow.setSize(1280, 820)
      mainWindow.show(); mainWindow.focus()
      dlog('[mini] OFF →', JSON.stringify(mainWindow.getBounds()))
    }
  } catch (e) { dlog('[mini] error', e.message) }
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
