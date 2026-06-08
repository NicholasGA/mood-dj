# spotify-mood-dj

AI 驱动的「按心情点歌」DJ 电台桌面应用。用户输入当下心情，由 Gemini 分析心情、生成
DJ 串场词与搜索词，据此在 **QQ音乐** 上搜索/播放歌曲。

> 项目名仍叫 spotify-mood-dj 是历史原因；当前音源是 QQ音乐，AI 用的是 Google Gemini。
> 早期的 Spotify + Claude 路径已移除。

## 技术栈
- **Electron 32**（桌面外壳，入口 `electron.js`，预加载 `preload.js`）
- **React 18 + Vite 5**（前端，源码在 `src/`）
- **QQ音乐**（音源，cookie 登录）+ **Google Gemini API**（心情分析与 DJ 串场词）

## 怎么跑
```powershell
npm install            # 首次或依赖变动后
npm run dev            # 开发：起 Vite(5173) + Electron，热更新
npm run build          # 用 Vite 打包前端
npm start              # 仅启动 Electron（需先 build 或有 dev server）
npm test               # 跑单元测试（vitest，纯逻辑，不打真实接口）
npm run test:watch     # 测试 watch 模式
```
也可双击 `launch.ps1` / `launch.vbs` 启动。

## 配置（必须）
复制 `.env.example` 为 `.env` 并填写：
- `VITE_GEMINI_API_KEY` — Google AI Studio（https://aistudio.google.com/apikey）获取

QQ音乐无需 API Key：首次启动在弹窗内登录 QQ 账号，cookie 会本地保存到
`userData/mooddj-qq.json`。部分歌曲需 QQ音乐 VIP 才能取到播放地址。

`.env` 含密钥，**不要提交到 git**。

## 代码结构
- `electron.js` — Electron 主进程：无边框窗口、QQ 登录弹窗抓 cookie、`qq-get-url`
  取 vkey、`qq-audio://` 协议带 cookie 代理 CDN 音频、cookie 持久化、窗口控制。
- `preload.js` — 渲染进程与主进程的安全桥接（`window.electronAPI`）。
- `src/main.jsx` / `src/App.jsx` — React 入口与主组件（播放队列、自动续播、DJ 播报调度）。
- `src/components/` — UI：`AuthScreen`（QQ 登录）、`MoodInput`（心情输入）、
  `NowPlaying`（播放中）、`DJAnnouncement`（DJ 串场）、`Visualizer`（可视化）。
- `src/services/` — 外部接口封装：
  - `claudeDJ.js` — 调 Gemini：心情分析、AI 选歌精排、每首歌「基于歌词的故事」(`generateStory`)、
    对话点歌解析；多 key 轮换 + OpenRouter 兜底，AI 不可用时有本地兜底（`localInterpret` 等）。文件名保留历史命名。
  - `qqMusicApi.js` — QQ音乐搜索/歌单/歌词；播放地址经主进程 `qq-get-url` 获取。纯解析函数有单元测试。
- `tests/` — vitest 单元测试（纯逻辑：LRC 解析、副歌识别、QQ 歌曲映射、uin 解析、本地点歌解析、key 配置）。

## 约定
- 前端环境变量必须以 `VITE_` 开头才能被 Vite 注入。
- 音频通过渲染进程的 `<Audio>` 播放 `qq-audio://` 代理地址（主进程带 QQ cookie 转发 CDN）。

## 现状
- git 已初始化，远端 GitHub `NicholasGA/mood-dj`（公开）；`.env`、`node_modules`、`release/` 已忽略。
- 测试 + CI：`tests/` 下 vitest 覆盖纯逻辑；GitHub Actions（`.github/workflows/ci.yml`）在 push/PR 跑 `npm install` + build + test。
- 分发 + 自动更新：electron-builder 打 NSIS 安装版 + Portable；electron-updater 从 GitHub Releases 自动更新。

## 发版/打包/自动更新
1. 改 `package.json` 的 `version`，`npm run build`。
2. **先停掉所有 electron / dev 进程**，否则 electron-builder 重命名 `release\win-unpacked` 会 EPERM（文件锁）。
3. **先 `git push` 提交并打/推 tag `vX.Y.Z`**，否则 publish 会 422「Published releases must have a valid tag」。
4. `$env:GH_TOKEN=(gh auth token); npx electron-builder --win --publish always`；或用 `gh release create vX.Y.Z release\MoodDJ-Setup-*.exe release\*.blockmap release\MoodDJ-Portable-*.exe release\latest.yml` 直接传已打好的产物。
5. 核对 release：要有 `latest.yml`（自动更新源，里面 `version:` 必须是新版本）+ Setup + Portable，且非 draft。
   - 坑：publish 半途失败时磁盘上的 `latest.yml` 可能是上个版本的，务必检查后再传。
