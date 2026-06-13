# Mood DJ 🎧

> 说一句此刻的心情，AI 现编一台电台、用人格化串场陪你听——还**记得你的口味**、给每首歌讲一句**基于歌词的故事**。
> 听腻了大窗？它能化成桌面底边一条随音乐律动的**灯带**。

**不是又一个播放器，是一个会说话、记得你的 AI 电台 DJ。**

🔗 **[在线介绍页](https://nicholasga.github.io/mood-dj/)** ・ ⬇️ **[下载最新版（Windows）](https://github.com/NicholasGA/mood-dj/releases/latest)** ・ 开源免费 ・ 数据只存本地

![灯带模式](docs/screenshots/light-strip.png)

> 灯带模式：主窗收进托盘，屏幕底边留一条随音乐律动的光带；唱到歌词时，胶囊像液滴从光里浮出。

---

## 它和直接用 QQ音乐有什么不一样

QQ音乐是工具——给你歌，算法静默运转。Mood DJ 是一个**会说话的 AI DJ**：

| | 普通播放器 | **Mood DJ** |
|---|---|---|
| 怎么开始 | 自己搜歌 / 选歌单 | **一句自然语言心情** → 现编整台电台 |
| 陪伴感 | 歌就是歌 | **人格化 DJ 串场**，会聊、会接话、有性格 |
| 懂不懂你 | 静默算法 | **记得你的口味**，挑歌偏向你、串场点名你常听的 |
| 听得明白吗 | 只有歌 | **每首歌一句故事**，结合歌词点出情绪/主题/背景 |
| 想换换 | 手动操作 | 边听边**对话点歌/调味**，无限续播不重复 |

## 六个让你留下来的理由

- 🌈 **桌面灯带模式** — 主窗收托盘，屏幕底边一条随音乐律动的光带；唱到歌词时胶囊像液滴浮出、间奏沉回，鼠标穿透不挡操作。
- 🎙️ **人格化 DJ 串场** — 有名字、有调性、有口头禅的固定 DJ，开场/串场/接话都出自同一个「人」。
- 💚 **会记得你** — 你喜欢的歌成为 DJ 的记忆，挑歌偏向你、串场点名你的口味，像老朋友。
- 📖 **每首歌一句故事** — 结合歌词，点出这首歌的情绪、主题或创作背景。
- 💬 **对话点歌 / 调味** — 「来点没听过的」「再安静一点」「想听 chilichill」，AI 听懂并现调。
- ⚡ **零配置开箱即用** — 装好登一下 QQ 就能用，AI 已内置，不必申请任何 API Key。

## 下载使用

到 [Releases](https://github.com/NicholasGA/mood-dj/releases/latest) 下载（二选一）：

- `MoodDJ-Setup-x.y.z.exe` — 安装版（自动检查并提示更新）
- `MoodDJ-Portable-x.y.z.exe` — 免安装，双击即用

**首次启动只需登一下 QQ 账号**（弹窗内登录，cookie 存本地）。AI 已内置、开箱即用；
想要专属完整额度，可在设置里填自己的 [Gemini Key](https://aistudio.google.com/apikey)。
部分歌曲需 QQ音乐 VIP 才能播放。

> **关于 Windows "未知发布者" 提示**：本应用暂未购买代码签名证书，下载运行时 SmartScreen
> 可能弹蓝色窗。点 **「更多信息」→「仍要运行」** 即可。软件开源、数据只存本地、不上传；
> 介意的话可自行拉源码编译。

## 开发

```powershell
npm install
npm run dev            # Vite(5173) + Electron 热更新
npm test               # vitest 单元测试
npm run build          # 打包前端
npm run dist           # 打 Windows 安装包/Portable（electron-builder）
```

开发期把 Gemini Key 放进 `.env`（复制 `.env.example`）：

```
VITE_GEMINI_API_KEY=你的key            # 多个用英文逗号隔开可轮换
```

`.env` 含密钥，已被 `.gitignore` 忽略，不要提交。**分发版不烤入任何 key**——
`.env.production` 强制置空 key，AI 走内置共享代理（`proxy/`，key 在服务端 Worker）。

## 技术栈

- **Electron 32** 桌面外壳（`electron.js` 主进程，`preload.js` 桥接）
- **React 18 + Vite 5** 前端（`src/`）
- **QQ音乐**（cookie 登录）+ **Google Gemini**（心情分析 / 选歌 / 歌词故事）
- **vitest** 单元测试 + **GitHub Actions** CI + **electron-updater** 自动更新
- 零配置 AI：**Cloudflare Worker** 代理（`proxy/`），key 服务端持有、按 IP 限流

代码结构与约定见 [CLAUDE.md](CLAUDE.md)。

---

> 个人学习/自用项目，不附属于腾讯或 Google，请支持正版音乐。
