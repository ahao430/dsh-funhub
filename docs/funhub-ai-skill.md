# FunHub AI Skill（预留）

让 DSH 对话中的 AI 助手替你管理 FunHub 源与内容。本文档是给 AI 看的操作说明（skill/MCP 接入点预留）。

## 接入方式（预留，按优先级）

1. **DSH Skill**：把本文件放进 `~/.zcode/skills/funhub/SKILL.md`（或让 AI 读仓库内此文件），AI 即可按下方 API 语义调用。
2. **MCP Server（待实现）**：计划提供 `funhub-mcp`，暴露 `add_book_source / import_comic_source / add_lx_source / add_rss / import_playlist` 五个工具，底层转发到 FunHub HTTP API。

## 鉴权

FunHub API 挂在 DSH webServer 下（`/funhub/api/*`），需要 DSH 会话 Cookie（`credentials: same-origin`）。
AI 侧调用请走宿主同源通道：在 DSH 宿主进程内 `fetch('http://127.0.0.1:<webServerPort>/funhub/api/...', { headers: webServer 注入的会话头 })`；或者引导用户在 FunHub 面板内粘贴导入。

## 常用操作（语义）

| 意图 | 端点 | 载荷 |
|---|---|---|
| 导入阅读3.0书源 | `POST /funhub/api/booksource/import` | `{ url }` 或 `{ text }`（书源 JSON） |
| 导入 venera 漫画源 | `POST /funhub/api/comicsource/import` | `{ url }`（单脚本或清单 index.json） |
| 导入洛雪音源 | `POST /funhub/api/lxsource/probe` | `{ script }`（音源 JS 脚本全文） |
| 添加 RSS 订阅 | `POST /funhub/api/op` | `{ op: 'rss_add', url }` |
| 导入网易歌单 | `POST /funhub/api/music2/playlist-import` | `{ input: '<歌单链接或ID>' }` |
| 上传本地音乐 | `POST /funhub/api/music/item/upload` | multipart 文件 |
| 设置出站代理 | `POST /funhub/api/op` | `{ op: 'settings_save', settings: { proxy: { enabled, host, port } } }` |
| 读状态 | `GET /funhub/api/state` | — |

## 注意

- 全部源不内置：书源/漫画源/音源需用户提供（URL / 文件 / 脚本全文）。
- 第三方脚本运行在子进程沙箱，只可公网访问，30s 超时。
- 写操作统一走 `POST /funhub/api/op`（`{ op, ...args }`）。
