# FunHub — DSH 娱乐工作台插件

DeepSeek Harness（DSH）插件：把小说 / 漫画 / 图片 / 音乐 / 影视 / 小游戏 / RSS 整合进一个本地优先的娱乐工作台。

> 🏠 在线介绍页：**GitHub Pages**（`docs/index.html`，仓库 Settings → Pages → `main / docs` 开启）

## 功能总览

| 板块 | 能力 | 数据来源 |
|---|---|---|
| 首页 | 多列响应式卡片 Dashboard，卡片可隐藏 / 调序 / 调尺寸；亮暗两套氛围背景 | 本地状态 |
| 小说 | 书源搜索、发现（左列源列表随手删）、书架、历史、阅读器（字号 / 行距 / 四主题 / 进度保存）、章末手动翻章 | 阅读3.0 书源（Legado）+ Gutenberg 公版书 |
| 漫画 | 发现（左列源列表 + 失效源自动滑）、搜索、章节目录（正/倒序）、阅读器、书架、收藏、历史 | venera 格式漫画源（ComicSource JS） |
| 图片 | 瀑布流、搜索、全屏浏览、收藏、浏览历史 | Picsum（免 Key）/ Pexels / Unsplash（自配 Key）等 13 源 |
| 音乐 | 网易 / 酷我搜索、洛雪音源解析直链、公版库、本地上传、全局四态播放器 | LX Music 自定义源脚本 + Internet Archive |
| 影视 | Emby 媒体库浏览：剧集按目录归组（单集列表）、电影直连播放、mkv/hevc 自动服务器转码 HLS、页内播放器可全屏 | 用户自己的 Emby 服务器 |
| 小游戏 | 2048 / 扫雷 / 数独 / 俄罗斯方块（DAS 连发）/ 翻翻乐 / 贪吃蛇 / 五子棋（禁手+AI）/ 推箱子（30 关），全套 WebAudio 音效 + 静音开关，AI 绘制贴纸素材 | 内置自研 |
| RSS | 订阅（左列管理）、分类过滤、未读、正文阅读、文章收藏、热门推荐 | 任意 RSS 2.0 / Atom / RDF |
| 收藏 | 跨频道统一收藏入口 | 本地 |
| 设置 | 源管理（导入 / 启停 / 删除 / 在线检测清理 / 一键清空，全部二次确认）、图片源 Key、网络代理、首页布局、数据导出清理 | 本地 |

## 安装

### 方式一：插件市场 / npm 直装（推荐）

FunHub 已发布到 npm（`dsh-funhub`）。在 DSH 的「插件」面板搜索 **dsh-funhub** 安装；或手动加进 desktop profile：

```sh
cd ~/.dsh/profiles/desktop
pnpm add dsh-funhub
# package.json 的 dsh.profile.bundles 数组加 "dsh-funhub"
pnpm install && 重启 DeepSeek Harness
```

### 方式二：从源码安装（开发者）

```sh
git clone https://github.com/ahao430/dsh-funhub.git
cd dsh-funhub && npm install && npm run build

# 在 ~/.dsh/profiles/desktop/package.json 加入
#    "dependencies": { "dsh-funhub": "link:/绝对路径/dsh-funhub" }
#    "dsh": { "profile": { "bundles": [ …, "dsh-funhub" ] } }
cd ~/.dsh/profiles/desktop && pnpm install
# 重启 DeepSeek Harness
```

## 数据与隐私

- **所有源的配置只存在你本机**：书源 / 漫画源 / 音源 / Emby 账密 / 图片 Key / RSS 订阅全部落在 `$DSH_HOME/funhub/state.json`（通常 `~/.dsh/funhub/`），**不在本仓库、不进 git**
- `.gitignore` 防御性排除：`state.json`、`*.local.json/js`、`.env*`、`scripts/feeds.local.js`（个人 RSS 清单模板）——即使误拷进仓库目录也不会被提交
- Emby 的 API Key 只留在宿主侧，浏览器端拿不到（`publicState` 剥离后下发）
- 第三方源脚本（音源 / 漫画源）在子进程沙箱运行，仅可公网访问，无文件系统权限

## 三类第三方源格式

### 阅读3.0 书源（Legado）
- 支持声明式子集：JSONPath（`$.data[*]`）、HTML 链（`class.x@tag.a@href`）、XPath 子集（og:meta）、`{{key}}/{{page}}/{{$.f}}` 模板、`##正则##替换##`、`||`/`&&`、POST + 自定义头
- 带 `<js>` / `@js:` / 登录要求的书源在导入时被标记「不兼容」并给出原因
- **FunHub 不内置书源**：请自行获取阅读3.0 / Legado 格式的书源 JSON（数组或单对象，支持几十 MB 大包），以 URL 或本地文件导入；导入后可「检测清理」在线剔除 404/失效源

### 洛雪音源（LX Music 自定义源）
- `node:vm` 隔离运行：无 require/process/fs，`lx.request` 全部经宿主安全抓取通道
- 导入时探测 `inited.sources` 能力（平台 / 音质档位），显示实际支持项
- **FunHub 不内置音源脚本**：请自行获取洛雪自定义源 .js 文件导入

### venera 漫画源
- 兼容 venera `ComicSource` 格式脚本：Network / fetch / Convert / HtmlDocument / ComicSource 基类完整垫片
- 同样走 node:vm 隔离 + 受控网络；按源隔离 data/settings 存储空间
- **FunHub 不内置漫画源**：支持单脚本 URL 或清单 index.json 批量导入

### Emby 影视
- 设置 → 影视源 填服务器地址账密登录（或 API Key 方式）
- mp4/h264 直连播放（Range 拖动）；mkv/hevc 等浏览器放不了的格式自动走服务器转码 HLS（h264/aac）
- 剧集按目录归组展示，点单集直接在页内播放器开播，可全屏

## 架构

```text
dsh-funhub/
├── src/host/            # Node 半片（cordis 插件）
│   ├── index.js         #   apply(): 注册 /funhub 前缀路由
│   ├── api.js           #   HTTP 路由（读端点 + /op 写入口 + 代理 + 后台检测任务）
│   ├── store.js         #   $DSH_HOME/funhub/state.json 持久化（mtime 重读 + 串行写）
│   ├── ops.js           #   全部写操作（单一入口）
│   ├── fetcher.js       #   安全抓取器（URL 校验 / SSRF / 端口黑名单 / 超时 / 大小上限 / 代理熔断）
│   ├── legado.js        #   阅读3.0 书源规则引擎
│   ├── lx-runtime.js    #   洛雪音源 vm 隔离运行时
│   ├── venera-runtime.js#   venera 漫画源 vm 隔离运行时
│   ├── music-search.js  #   网易 / 酷我搜索通道
│   ├── video.js         #   Emby 客户端 + HLS 转码地址 + m3u8 代理重写
│   ├── proxy.js         #   Gutenberg / 图片源 / Archive 适配
│   ├── rss.js           #   RSS / Atom / RDF 解析（含转义 HTML 修复）
│   └── sanitize.js      #   HTML 白名单清理
├── src/client/          # 浏览器半片（esbuild → dist/client.js）
│   ├── index.jsx        #   slots 注册：main 面板 + sidebar 图标 + 播放器 portal
│   ├── app.jsx          #   App Shell（侧栏 + 各频道路由 + 亮暗背景切换）
│   ├── home.jsx         #   Dashboard 卡片
│   ├── novel/comic/gallery/music/video/rss/…jsx
│   ├── video-player.jsx #   页内播放器（HLS + 全屏 + 转码降级）
│   ├── player.js        #   音频引擎（全局单例 Audio，UI 分离）
│   ├── player-ui.jsx    #   播放器四态 UI（body portal）
│   ├── games/           #   八款内置游戏 + sfx.js（WebAudio 合成音效）
│   └── styles.js        #   全部样式（含页头吸顶、亮暗主题）
├── assets/              # AI 生成素材（背景 ×10 亮暗两套 + 游戏贴纸 ×18，webp）
├── docs/                # GitHub Pages 落地页 + AI skill 预留文档
├── scripts/build.mjs    # esbuild 打包（__ModuleLoader__ CJS 工厂包装）
└── test/                # 20 个测试文件（单元 + 端到端 + jsdom 挂载 + 失效保护）
```

## 安全设计

- 所有出站请求经统一 fetcher：仅 http(s)、拒凭据 URL、数据库等敏感端口黑名单、DNS 解析后拒内网地址（SSRF）、超时、响应大小上限、内容类型校验
- 第三方脚本（洛雪 / venera）在 `node:vm` 沙箱执行：无宿主对象、无文件系统、定时器上限、同步执行超时、console 捕获
- 外部 HTML（RSS 正文等）渲染前白名单清理；`javascript:` / `data:` 链接剥除；外链 `noopener noreferrer nofollow`
- 漫画 / RSS / 影视远程媒体统一经宿主代理（Emby api_key 不下发浏览器），避免混源与泄漏
- 源脚本不出现在引导数据中；游戏存档按 gameId 隔离

## 测试

```sh
npm test          # 或逐个 node test/*.mjs
```

覆盖：RSS 解析与转义修复、HTML 清理、书源兼容检测 / 搜索 / 详情 / 目录 / 正文（真实 API）、书源大包导入、失效源在线清理（E2E 并发不变量）、洛雪能力探测、网易搜索、播放链仿真、MangaDex 章节、五子棋禁手 + AI、推箱子 30 关可解性、音效模块 SSR 安全、URL 端口策略、影视 Emby 全链路（含转码 m3u8 代理）、渲染冒烟（全部页面 + 游戏挂载）、jsdom 真实挂载（含 dist 产物）

## License

MIT
