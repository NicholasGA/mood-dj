# Mood DJ 🎧

AI 驱动的「按心情点歌」DJ 电台桌面应用。用一句话说出你此刻的心情，AI 现编一个电台、
用人格化串场陪你听，还会**记得你的口味**、给每首歌讲一句**基于歌词的故事**。

> 音源用 **QQ音乐**，AI 用 **Google Gemini**。
> （仓库/包名里的 `spotify` / `claude` 是历史命名，早期路径已移除。）

## 它和直接用 QQ音乐有什么不一样

QQ音乐是工具——给你歌，算法静默运转。Mood DJ 是一个**会说话的 AI DJ**：

- **任意自然语言心情** → 现编电台（不是固定的「开心/伤感」标签）
- **人格化 DJ 串场**，会聊、会接话
- **会记得你**：你喜欢的歌成为 DJ 的记忆，挑歌偏向你、串场点名你的口味
- **每首歌一句故事**：结合歌词讲它的情绪/主题/创作背景
- 边听边**对话点歌/调味**，无限续播不重复

## 下载使用

到 [Releases](https://github.com/NicholasGA/mood-dj/releases/latest) 下载：

- `MoodDJ-Setup-x.y.z.exe` — 安装版（装了会自动检查并提示更新）
- `MoodDJ-Portable-x.y.z.exe` — 免安装，双击即用

首次启动：① 弹窗内登录 QQ 账号（cookie 存本地）；② 填一个 Google Gemini API Key
（[免费获取](https://aistudio.google.com/apikey)）。部分歌曲需 QQ音乐 VIP 才能播放。

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

`.env` 含密钥，已被 `.gitignore` 忽略，不要提交。分发版不烤入任何 key，用户在应用内填。

## 技术栈

- **Electron 32** 桌面外壳（`electron.js` 主进程，`preload.js` 桥接）
- **React 18 + Vite 5** 前端（`src/`）
- **QQ音乐**（cookie 登录）+ **Google Gemini**（心情分析 / 选歌 / 歌词故事）
- **vitest** 单元测试 + **GitHub Actions** CI + **electron-updater** 自动更新

代码结构与约定见 [CLAUDE.md](CLAUDE.md)。
