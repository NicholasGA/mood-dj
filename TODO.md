# Mood DJ — 夜间可自跑 backlog

> 给 `/loop` 用的待办池。每项都能**自我验证、不需要人在场判断、不烧 QQ/Gemini 配额**。
>
> **工作规则（loop 请遵守）：**
> 1. 一次挑一项，做成**一个小提交**；先 `npm test` + `npm run build` 确认绿，推送后看 GitHub Actions CI 绿再继续。
> 2. 不打真实 QQ/Gemini 接口——外部依赖一律 mock。
> 3. **写断言前先跑一遍核对真实输出**（如 `detectChoruses` 有「副歌占比 >45% 则撤销标记」的规则，样本太小会被触发）。
> 4. 碰到「需要你拍板」清单里的事（UX 手感、文案口吻、删功能、改默认行为）就**停下来留言，别猜**。
> 5. 做完把 `[ ]` 勾成 `[x]`，并在下面「进度」追一行。

## 1. 测试覆盖（最稳，优先）
- [ ] 抽出 `App.jsx` 的纯逻辑到 util 并测：按 `mid` 去重、爱的歌×发现交错、`likedArtists` 口味统计、能量/情绪 clamp
- [ ] `parseLRC` 边界：元数据标签（`[ti:]`/`[ar:]`）、CRLF、空行、无毫秒位、乱序时间戳
- [ ] `mapSong` 边界：`songname` 回退、缺 `singer`/`album`、`id` 取值规则
- [ ] `localInterpret` 更多说法：「来首…」「换成…」「…的歌」「想听很燃的」「放点轻音乐」
- [ ] `detectChoruses`：显式覆盖 >45% 撤销规则、钩子向两侧扩展、跳转点 >10s 去重

## 2. 健壮性加固（每个修复配测试）
- [ ] 抽 `extractJSON(raw)` 公共解析（剥 ```json 围栏/前后缀文字），`claudeDJ` 各处统一用 + 测
- [ ] analyzeMood/curateTracks/interpretRequest/analyzeTaste/clusterLikes/generateStory 对畸形响应优雅降级（部分已有，补齐 + 测）
- [ ] `qqMusicApi`：`searchPlaylists`（≥5 首过滤）、`getPlaylistTracks` 映射的 mock 测试
- [ ] 无歌词歌曲的故事路径：不报错、走「暂无歌词讲风格」分支

## 3. 离线 / 多语言
- [ ] `localMoodConfig` 扩词：英文 + 日文心情关键词
- [ ] 更多兜底简介模板，降低重复感（仍按 mid 稳定）

## 4. 工具链
- [ ] 加 ESLint + CI lint 步骤（先修现有告警再开启）
- [ ] `vitest --coverage`，CI 输出覆盖率
- [ ] README 加 CI 状态徽章 + 截图占位

## ⚠️ 需要先问、别擅自动
- 任何改 **UX 手感 / 文案口吻 / 动效** 的
- **删功能 / 改默认行为 / 大重构**
- 任何要打真实 API 或动用户 key / cookie 的

## 进度
- 2026-06-08：建立 backlog。已完成基线——vitest（28 测试）+ Actions CI + djText 离线兜底 + 文档/清死代码。
