const { app, BrowserWindow, ipcMain, net, protocol, screen, shell, Tray, Menu, nativeImage, powerMonitor, Notification } = require('electron')
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
// dev 活体调试钩子：dev 主进程经 ESM 加载，inspector 注入后拿不到 require/mainModule，
// 从 global 透出 electron 引用（正式包不暴露）。用法见记忆 live-debug-installed-app。
if (isDev) global.__dev = { electron: require('electron') }
let mainWindow
let tray = null
let isQuitting = false   // 只有从托盘「退出」或系统退出时才真退；点 ✕ 只收进托盘
let hintedTray = false   // 首次收进托盘时给一次提示，之后不再打扰

// 单实例锁：再次启动只把已有窗口唤到前台，避免开出第二个实例（曾踩过双开坑）
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 660,
    frame: false, center: true,
    // 不透明实底（去掉了 transparent:true）：拖拽缩放/最大化顺滑、抓边直观、还原不隐形。
    // 代价是不再透出桌面壁纸；液体/可视化/专辑色氛围都画在窗口内、全部保留。
    backgroundColor: '#0a0b12',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
      // 关键：灯带模式下主窗被 hide()，否则 Chromium 会把它的 setInterval 节流到 1Hz，
      // 喂给灯带的频谱/歌词几乎不流动 → 律动和液滴都动不起来。常驻放歌也需要它。
      backgroundThrottling: false,
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

  // 点 ✕ / 关闭：不退出，收进托盘继续后台放歌（后台存在感）。真退出走托盘菜单的「退出」。
  mainWindow.on('close', (e) => {
    if (isQuitting) return
    e.preventDefault(); mainWindow.hide()
    if (!hintedTray) {   // 首次收起给一次系统通知，避免用户以为退出了
      hintedTray = true
      try { new Notification({ title: 'Mood DJ 收进托盘了', body: '还在后台放着 · 点托盘图标唤回 · 右键可退出' }).show() } catch {}
    }
  })

}

// ── 系统托盘：后台存在感（窗口收起仍在放，托盘可控+可唤回）──────────────
function setupTray() {
  if (tray) return
  let img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'))
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 })
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('Mood DJ')
  const showWin = () => { if (mainWindow) { mainWindow.show(); if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() } }
  const sendTray = (action) => { try { mainWindow?.webContents.send('tray-control', action) } catch {} }
  const menu = Menu.buildFromTemplate([
    { label: '显示 Mood DJ', click: showWin },
    { type: 'separator' },
    { label: '播放 / 暂停', click: () => sendTray('playpause') },
    { label: '下一首', click: () => sendTray('next') },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWin)       // 左键单击唤回窗口
}

// 渲染进程回传当前播放 → 更新托盘 tooltip（隐藏时也知道在放什么）
ipcMain.on('tray-nowplaying', (_e, info) => {
  if (!tray) return
  const txt = info?.name ? `Mood DJ · ${info.name}${info.artist ? ' - ' + info.artist : ''}` : 'Mood DJ'
  tray.setToolTip(txt.slice(0, 127))
})

// 系统挂起（合盖/睡眠）→ 让渲染进程暂停，避免唤醒后音频卡死
powerMonitor.on('suspend', () => { try { mainWindow?.webContents.send('tray-control', 'pause') } catch {} })

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
  setupTray()
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
  autoUpdater.on('update-downloaded', (i) => {
    dlog('[update] downloaded', i.version)
    sendUpdate({ state: 'downloaded', version: i.version })
    // 全自动：下载完 → 提示 5 秒 → 自动关掉并静默安装、装完自动启动新版本。
    // 必须先 isQuitting=true，否则 quitAndInstall 关窗时会被"收进托盘"逻辑拦下、装不了。
    setTimeout(() => {
      isQuitting = true
      try { autoUpdater.quitAndInstall(true, true) } catch (e) { dlog('[update] quitAndInstall failed', e.message) }
    }, 5000)
  })
  autoUpdater.on('update-not-available', () => dlog('[update] up to date'))
  autoUpdater.on('error', (e) => dlog('[update] error', e.message))
  autoUpdater.checkForUpdates().catch(e => dlog('[update] check failed', e.message))
}
ipcMain.handle('install-update', () => { isQuitting = true; autoUpdater.quitAndInstall(true, true) })

// ── QQ Music auth via cookie capture ──────────────────────────────
ipcMain.handle('qq-auth', () => {
  return new Promise((resolve, reject) => {
    let settled = false, timer = null
    // 关键：用标准 Chrome UA 加载。默认 Electron UA(带 "Electron/mood-dj")会让 y.qq.com 返回乱码/异常页面。
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const popup = new BrowserWindow({
      width: 1000, height: 700, parent: mainWindow,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })
    popup.webContents.setUserAgent(UA)
    popup.loadURL('https://y.qq.com/', { userAgent: UA })
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
    const created = disslist.map(d => ({ id: String(d.tid), name: d.diss_name, count: d.song_cnt, cover: d.diss_cover || '' }))

    // 收藏的歌单（别人做的、我收藏的）——另一个接口，best-effort，拿不到也不影响自建歌单
    let collected = []
    try {
      const colUrl = `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg?ct=20&cid=205360956&userid=${uin}&reqtype=3&sin=0&ein=40&g_tk=${g_tk}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`
      const cj = await (await net.fetch(colUrl, { headers })).json()
      collected = (cj.data?.cdlist || []).filter(d => d.dissid && d.songnum > 0)
        .map(d => ({ id: String(d.dissid), name: d.dissname, count: d.songnum, cover: d.logo || '' }))
    } catch (e) { dlog('[fav] 收藏歌单取不到', e.message) }
    const seenPl = new Set(); const playlists = []
    for (const p of [...created, ...collected]) { if (p.id && !seenPl.has(p.id)) { seenPl.add(p.id); playlists.push(p) } }

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
    dlog('[fav] 歌单', playlists.length, '(自建', created.length, '+收藏', collected.length, ') | 我喜欢', fav.song_cnt, '首 | 样本', sample.length)
    return { playlists, playlistIds, topArtists, sample, favCount: fav.song_cnt }
  } catch (e) { dlog('[fav] error', e.message); return null }
})

// ── 登录态体检：QQ 的 key cookie（qm_keyst/qqmusic_key）只活约 3 天，到期被 session 静默丢弃，
//    而 app 还以为登录着（mooddj-qq.json 还在）→ VIP 歌全部取不到地址、收藏同步悄悄失败。
//    实测结论：QQ 的读接口全是公开的（歌单/资料/免费歌 vkey 匿名都通），服务端探针测不出过期；
//    权威信号就是本地 key cookie 的存在与有效期。──
ipcMain.handle('qq-check-auth', async () => {
  try {
    const session = mainWindow.webContents.session
    const allCookies = await session.cookies.get({})
    const uin = resolveUin(allCookies)
    const now = Date.now() / 1000
    const key = allCookies.find(c => (c.name === 'qm_keyst' || c.name === 'qqmusic_key') && c.value)
    if (uin === '0' || !key) { dlog('[auth-check] 关键 cookie 缺失，uin:', uin, 'key:', !!key); return { ok: false, reason: 'no-key' } }
    if (key.expirationDate && key.expirationDate < now) { dlog('[auth-check] key 已过期'); return { ok: false, reason: 'expired' } }
    const expiresInDays = key.expirationDate ? (key.expirationDate - now) / 86400 : null
    return { ok: true, expiresInDays }
  } catch (e) {
    dlog('[auth-check] error:', e.message)
    return { ok: true }   // 体检自身出错别误报打扰
  }
})

// ── 取某个歌单(我喜欢/自建/收藏的)的一页歌：走主进程，带登录 cookie，能读别人公开歌单。
//    返回 { tracks, total, hasMore }，渲染层据此渐进加载(先显首页、后台补全)，能读别人公开歌单 ──
ipcMain.handle('qq-get-playlist-page', async (_e, dissid, begin = 0, num = 100) => {
  const EMPTY = { tracks: [], total: 0, hasMore: false }
  try {
    if (!dissid) return EMPTY
    const session = mainWindow.webContents.session
    const allCookies = await session.cookies.get({})
    const uin = resolveUin(allCookies)
    const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
    const headers = { 'Referer': 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieHeader, 'Content-Type': 'application/json' }
    const b = Number(begin) || 0, n = Number(num) || 100
    const body = JSON.stringify({
      comm: { ct: 19, cv: 1859, uin, format: 'json' },
      req_1: { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: { disstid: Number(dissid), tag: 1, userinfo: 0, song_begin: b, song_num: n } },
    })
    const r = await net.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', { method: 'POST', headers, body })
    const d = (await r.json()).req_1?.data || {}
    const songs = d.songlist || []
    const tracks = songs.filter(s => s.mid).map(s => ({
      id: String(s.id ?? s.mid), mid: s.mid, media_mid: s.file?.media_mid || s.mid, name: s.name,
      artists: (s.singer || []).map(a => ({ name: a.name })),
      album: { name: s.album?.name, images: s.album?.mid ? [{ url: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` }] : [] },
      duration_ms: (s.interval || 0) * 1000, uri: `qqmusic:${s.mid}`,
    }))
    const total = d.dirinfo?.songnum ?? d.total_song_num ?? d.songnum ?? (b + songs.length)
    const hasMore = songs.length > 0 && (total ? (b + songs.length < total) : songs.length >= n)
    return { tracks, total, hasMore }
  } catch (e) { dlog('[pl-page] error', e.message); return EMPTY }
})

// ── 取"我喜欢"的全部 mid（用于标"已收藏/新歌"，避免重复收藏）。分页拉，调用方缓存 ──
ipcMain.handle('qq-get-favorite-mids', async () => {
  try {
    const session = mainWindow.webContents.session
    const allCookies = await session.cookies.get({})
    const uin = resolveUin(allCookies)
    if (uin === '0') return null
    const cookieHeader = allCookies.filter(c => c.domain?.includes('qq.com')).map(c => `${c.name}=${c.value}`).join('; ')
    const headers = { 'Referer': 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0', 'Cookie': cookieHeader }
    const keyst = allCookies.find(c => c.name === 'qm_keyst')?.value || allCookies.find(c => c.name === 'qqmusic_key')?.value || ''
    let g_tk = 5381; for (let i = 0; i < keyst.length; i++) g_tk += (g_tk << 5) + keyst.charCodeAt(i); g_tk &= 2147483647
    const lj = await (await net.fetch(`https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=${uin}&sin=0&size=50&g_tk=${g_tk}&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`, { headers })).json()
    const disslist = (lj.data?.disslist || []).filter(d => d.tid && d.song_cnt > 0)
    const fav = disslist.find(d => d.diss_name === '我喜欢') || disslist.sort((a, b) => b.song_cnt - a.song_cnt)[0]
    if (!fav) return null
    const tid = Number(fav.tid), total = fav.song_cnt, PAGE = 100
    const mids = []
    for (let begin = 0; begin < total && begin < 8000; begin += PAGE) {
      const body = JSON.stringify({ comm: { ct: 19, cv: 1859, uin, format: 'json' }, req_1: { module: 'music.srfDissInfo.aiDissInfo', method: 'uniform_get_Dissinfo', param: { disstid: tid, tag: 1, userinfo: 0, song_begin: begin, song_num: PAGE } } })
      const list = (await (await net.fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body })).json()).req_1?.data?.songlist || []
      if (!list.length) break
      for (const s of list) if (s.mid) mids.push(s.mid)
      if (list.length < PAGE) break
    }
    dlog('[fav-mids]', mids.length, '/', total)
    return { favCount: total, mids }
  } catch (e) { dlog('[fav-mids] error', e.message); return null }
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
// □ 按钮 = 最大化/还原（真·系统最大化，便于"锁住"）。isMaximized()/'maximize' 事件在无边框透明窗不可靠 →
// 自己记 winMax 显式回报；前端据此把背景转不透明铺满 + 最大化时禁掉标题栏拖拽（否则能把全屏窗拖跑）。
let winMax = false
ipcMain.on('win-maximize', () => {
  if (!mainWindow) return
  winMax = !winMax
  winMax ? mainWindow.maximize() : mainWindow.unmaximize()
  try { mainWindow.webContents.send('win-state', { maximized: winMax }) } catch {}
})
ipcMain.on('win-close',    () => mainWindow.close())

// 透明窗 Windows 坑：从小尺寸(迷你/壁龛)放大还原后，新增区域常不重绘 → 整窗透明=隐形。
// show() 对已显示窗口不强制重绘，故还原后 invalidate + 抖 1px 逼 Windows 整窗重画。
function showAndRepaint() {
  // 不透明实底窗口放大不再有"隐形/不重绘"问题 → 直接显示聚焦即可（不需再抖 opacity/最小化还原）。
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show(); mainWindow.focus()
}

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
      showAndRepaint()
      dlog('[mini] OFF →', JSON.stringify(mainWindow.getBounds()))
    }
  } catch (e) { dlog('[mini] error', e.message) }
})

// ── 壁龛模式：可自由拖动的悬浮球，点击展开成播放面板 ───────────────────
// 小窗不占满屏 → 不触发分辨率 OSD；展开靠"一次性改窗尺寸 + 渲染层 CSS 缩放"→ 平滑不补间。
let dockPrevBounds = null
const ORB = 152, PANEL_W = 348, PANEL_H = 476
function clampToWorkArea(b, margin = 12) {
  const wa = screen.getPrimaryDisplay().workArea
  return {
    width: b.width, height: b.height,
    x: Math.max(wa.x + margin, Math.min(Math.round(b.x), wa.x + wa.width - b.width - margin)),
    y: Math.max(wa.y + margin, Math.min(Math.round(b.y), wa.y + wa.height - b.height - margin)),
  }
}
ipcMain.handle('set-dock', (_e, on) => {
  if (!mainWindow) return
  try {
    if (on) {
      dockPrevBounds = mainWindow.getBounds()
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      const wa = screen.getPrimaryDisplay().workArea
      mainWindow.setMinimumSize(ORB, ORB)
      mainWindow.setResizable(true)        // dock 期间保持可 setBounds（Win 坑：false 时 setBounds 不生效）
      mainWindow.setBounds({ x: wa.x + wa.width - ORB - 30, y: wa.y + wa.height - ORB - 30, width: ORB, height: ORB })  // 默认右下角
      mainWindow.setAlwaysOnTop(true, 'floating')
      mainWindow.show()
      dlog('[dock] ON')
    } else {
      mainWindow.setAlwaysOnTop(false)
      mainWindow.setMinimumSize(960, 660)
      mainWindow.setResizable(true)
      if (dockPrevBounds) mainWindow.setBounds(dockPrevBounds)
      else mainWindow.setSize(1280, 820)
      showAndRepaint()
      dlog('[dock] OFF')
    }
  } catch (e) { dlog('[dock] error', e.message) }
})
// 展开/收起：保持中心不变地一次性改尺寸（内容动画交给 CSS），并夹进工作区不出屏
ipcMain.handle('dock-expand', (_e, expand) => {
  if (!mainWindow) return
  try {
    const b = mainWindow.getBounds()
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2
    const width = expand ? PANEL_W : ORB, height = expand ? PANEL_H : ORB
    mainWindow.setBounds(clampToWorkArea({ x: cx - width / 2, y: cy - height / 2, width, height }))
  } catch (e) { dlog('[dock] expand error', e.message) }
})
// 拖动：按鼠标位移挪窗（渲染层区分点击/拖动）
ipcMain.handle('dock-move', (_e, dx, dy) => {
  if (!mainWindow) return
  try { const b = mainWindow.getBounds(); mainWindow.setBounds(clampToWorkArea({ ...b, x: b.x + dx, y: b.y + dy })) } catch {}
})

// ── 灯带模式：贴任务栏上沿的单条灯带窗——光带律动 + 歌词胶囊从光带里"浮出"────
// 主窗隐藏继续放歌；灯带窗默认全程鼠标穿透（绝不挡操作），
// 光标轮询发现悬停在底部中央（胶囊区）时才临时接管鼠标（召出胶囊/显示控制按钮）。
// 数据流：主窗渲染层 30fps 推频谱/歌词（strip-data）→ 主进程转发。
let stripWin = null, stripPoll = null, stripOn = false
const STRIP_H = 132                 // 灯带窗高：3px 光带 + 波峰 + 胶囊浮出的空间（其余全透明）
const HOVER_W = 640, HOVER_H = 64   // 底部中央的悬停感应区（摸到就召出胶囊）

function stripUrl(hash) {
  return isDev ? `http://localhost:5173/#${hash}` : `app://bundle/index.html#${hash}`
}
function makeOverlayWin(width, height) {
  const w = new BrowserWindow({
    width, height, frame: false, transparent: true, resizable: false, movable: false,
    skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webSecurity: false, backgroundThrottling: false },
  })
  // screen-saver 层：盖在最大化/普通窗口之上（floating 层会被最大化窗口挡住）。
  // 全屏独占应用（游戏）仍会盖住，那是 OS 行为。visibleOnAllWorkspaces 保证切桌面也在。
  w.setAlwaysOnTop(true, 'screen-saver')
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.setIgnoreMouseEvents(true)      // 默认穿透：仅悬停胶囊区时临时接管
  return w
}
function layoutStripWins() {
  if (!stripWin || stripWin.isDestroyed()) return
  const wa = screen.getPrimaryDisplay().workArea
  stripWin.setBounds({ x: wa.x, y: wa.y + wa.height - STRIP_H, width: wa.width, height: STRIP_H })
}
function stopStrip({ showMain = true } = {}) {
  stripOn = false
  if (stripPoll) { clearInterval(stripPoll); stripPoll = null }
  try { stripWin && !stripWin.isDestroyed() && stripWin.hide() } catch {}
  try { mainWindow?.webContents.send('strip-cmd', 'exited') } catch {}   // 同步渲染层 React 状态
  if (showMain && mainWindow) { mainWindow.show(); mainWindow.focus() }
  dlog('[strip] OFF')
}
ipcMain.handle('set-strip', (_e, on) => {
  try {
    if (!on) { stopStrip({ showMain: true }); return true }
    if (!stripWin || stripWin.isDestroyed()) {
      stripWin = makeOverlayWin(800, STRIP_H)
      stripWin.loadURL(stripUrl('strip'))
      stripWin.on('closed', () => { stripWin = null })
      // 分辨率/任务栏变化时重排（screen 模块必须 app ready 后才能用，所以挂在这里）
      if (!global.__stripScreenHook) {
        global.__stripScreenHook = true
        screen.on('display-metrics-changed', () => { if (stripOn) layoutStripWins() })
      }
    }
    layoutStripWins()
    stripWin.showInactive()
    stripOn = true
    mainWindow?.hide()
    // 托盘/任务栏唤回主窗 → 自动退出灯带（避免双形态并存）。只挂一次。
    if (mainWindow && !mainWindow.__stripShowHook) {
      mainWindow.__stripShowHook = true
      mainWindow.on('show', () => { if (stripOn) stopStrip({ showMain: false }) })
    }
    // 光标轮询（8Hz，仅灯带模式期间）：悬停底部中央胶囊区 → 接管鼠标；离开 → 还回穿透
    // 顺带每 ~2s 重夺一次置顶（被全屏/置顶应用切走 z 序后自愈，保证"一直能看到"）
    let hovering = false, tick = 0
    if (stripPoll) clearInterval(stripPoll)
    stripPoll = setInterval(() => {
      try {
        if (!stripWin || stripWin.isDestroyed()) return
        if (++tick % 16 === 0 && !hovering) stripWin.setAlwaysOnTop(true, 'screen-saver')
        const p = screen.getCursorScreenPoint()
        const b = stripWin.getBounds()
        const ix = p.x - b.x, iy = p.y - b.y
        const inside = iy >= b.height - HOVER_H && iy <= b.height &&
                       Math.abs(ix - b.width / 2) <= HOVER_W / 2
        if (inside !== hovering) {
          hovering = inside
          stripWin.setIgnoreMouseEvents(!inside)
          stripWin.webContents.send('strip-hover', inside)
        }
      } catch {}
    }, 125)
    dlog('[strip] ON')
    return true
  } catch (e) { dlog('[strip] error', e.message); return false }
})
// 主窗渲染层的频谱/歌词流 → 转发灯带窗
ipcMain.on('strip-data', (_e, data) => {
  if (!stripOn) return
  try { stripWin && !stripWin.isDestroyed() && stripWin.webContents.send('strip-data', data) } catch {}
})
// 胶囊上的控制按钮 → 转给主窗执行（播放/下一首）；show-main = 退出灯带回大窗
ipcMain.on('strip-cmd', (_e, cmd) => {
  if (cmd === 'show-main') { stopStrip({ showMain: true }); return }
  try { mainWindow?.webContents.send('strip-cmd', cmd) } catch {}
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
