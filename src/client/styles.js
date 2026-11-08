// FunHub 全站样式：单注入 <style>，DSH 主题令牌 + 自有变量，暗色优先。
export const CSS = `
:root {
  /* 强调色：设置里可选覆盖（--fh-accent-override），默认跟随 DSH 主色（缺省靛蓝） */
  --fh-accent: var(--fh-accent-override, var(--dsw-alias-primary, #6c7bff));
  --fh-accent-grad: linear-gradient(135deg, var(--fh-accent), color-mix(in srgb, var(--fh-accent) 52%, #b44bff));
  --fh-accent-soft: color-mix(in srgb, var(--fh-accent) 16%, transparent);
  --fh-warning: #f5a623;
  --fh-bg: var(--dsw-alias-bg-canvas, #16171a);
  --fh-panel: var(--dsw-alias-bg-surface, #1d1f24);
  --fh-panel-2: var(--dsw-alias-bg-surface-raised, #24262c);
  --fh-line: color-mix(in srgb, var(--dsw-alias-label-primary, #fff) 10%, transparent);
  --fh-ink: var(--dsw-alias-label-primary, #e8e9ec);
  --fh-ink2: var(--dsw-alias-label-secondary, #a8abaf);
  --fh-ink3: var(--dsw-alias-label-tertiary, #6d7076);
  --fh-danger: var(--dsw-alias-danger, #e5484d);
  --fh-good: var(--dsw-alias-success, #46a758);
  --fh-hero-ink: #f2f4fa;
  --fh-hero-sub: rgba(226, 231, 244, .78);
  --fh-mini-h: 58px;
  --fh-r-md: 10px;
  --fh-r-lg: 14px;
}
/* ---- 浅色主题（设置 → 外观 → 主题：浅色）----
   只覆盖变量与少数硬编码暗色层；沉浸式全屏播放器保持深色（封面氛围）。 */
html.fh-light {
  --fh-bg: #f3f4f7;
  --fh-panel: #ffffff;
  --fh-panel-2: #eceef3;
  --fh-line: rgba(18, 22, 33, .10);
  --fh-ink: #1d212a;
  --fh-ink2: #565c68;
  --fh-ink3: #9096a3;
  --fh-hero-ink: #1a1e27;
  --fh-hero-sub: rgba(28, 33, 44, .72);
}
html.fh-light .fh-hero-hi { text-shadow: 0 1px 10px rgba(255,255,255,.65); }
html.fh-light .fh-hero-date { text-shadow: 0 1px 8px rgba(255,255,255,.6); }
html.fh-light .fh-hero::before { background-image:
  linear-gradient(100deg, rgba(246,247,250,.94) 0%, rgba(246,247,250,.68) 46%, rgba(246,247,250,.36) 100%),
  var(--fh-bg-home, url('/funhub/api/asset/home-bg.webp')); }
html.fh-light .fh-no-atmo .fh-hero::before { background-image:
  linear-gradient(100deg, rgba(246,247,250,.92) 0%, rgba(246,247,250,.6) 50%, rgba(246,247,250,.4) 100%),
  radial-gradient(60% 130% at 15% 10%, color-mix(in srgb, var(--fh-accent) 22%, transparent), transparent 70%),
  radial-gradient(50% 120% at 90% 0%, color-mix(in srgb, #b44bff 18%, transparent), transparent 72%); }
html.fh-light .fh-hero-input .fh-input { background: rgba(255,255,255,.74); border-color: rgba(20,26,40,.15); }
html.fh-light .fh-hero-input .fh-input:focus { background: #fff; }
html.fh-light .fh-card-type-novel::after { background-image: linear-gradient(160deg, rgba(250,251,253,.84), rgba(247,248,251,.6)), var(--fh-bg-novel, url('/funhub/api/asset/novel-bg-light.webp')); }
html.fh-light .fh-card-type-music::after { background-image: linear-gradient(185deg, rgba(246,247,251,.5), rgba(246,247,251,.86)), var(--fh-bg-music, url('/funhub/api/asset/music-bg-light.webp')); background-position: center 22%; }
html.fh-light .fh-card-type-rss::after { background-image: linear-gradient(200deg, rgba(248,249,252,.78), rgba(248,249,252,.58)), var(--fh-bg-rss, url('/funhub/api/asset/rss-bg-light.webp')); }
html.fh-light .fh-toast { box-shadow: 0 8px 30px rgba(20, 26, 40, .18); }

.fh-root { position: relative; height: 100%; width: 100%; display: flex; flex-direction: column; color: var(--fh-ink); font-size: 13.5px; overflow: hidden;
  background: var(--fh-bg); }
/* 氛围底图：低调星云，叠加深色渐变保证可读性 */
.fh-home-hero { position: relative; }
.fh-home-hero::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; background:
  radial-gradient(52% 38% at 18% 8%, color-mix(in srgb, var(--fh-accent) 14%, transparent) 0%, transparent 70%),
  radial-gradient(46% 34% at 88% 0%, color-mix(in srgb, #b44bff 11%, transparent) 0%, transparent 72%),
  radial-gradient(60% 42% at 55% 26%, color-mix(in srgb, var(--fh-accent) 7%, transparent) 0%, transparent 75%),
  conic-gradient(from 200deg at 70% 12%, transparent 0deg, color-mix(in srgb, var(--fh-accent) 6%, transparent) 40deg, transparent 90deg); }

/* ---- 顶部欢迎区：星云氛围图（关闭氛围背景时只剩 CSS 渐变） ---- */
.fh-hero { position: relative; border: 1px solid var(--fh-line); border-radius: var(--fh-r-lg); overflow: hidden;
  min-height: 168px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;
  padding: 18px 20px 16px; isolation: isolate; }
.fh-hero::before { content: ''; position: absolute; inset: 0; z-index: -1;
  background-image:
    linear-gradient(100deg, rgba(7, 9, 18, .92) 0%, rgba(7, 9, 18, .62) 46%, rgba(7, 9, 18, .30) 100%),
    var(--fh-bg-home, url('/funhub/api/asset/home-bg.webp'));
  background-size: cover; background-position: center 30%; }
.fh-no-atmo .fh-hero::before { background-image:
  linear-gradient(100deg, rgba(7, 9, 18, .9) 0%, rgba(7, 9, 18, .55) 50%, rgba(7, 9, 18, .35) 100%),
  radial-gradient(60% 130% at 15% 10%, color-mix(in srgb, var(--fh-accent) 20%, transparent), transparent 70%),
  radial-gradient(50% 120% at 90% 0%, color-mix(in srgb, #b44bff 16%, transparent), transparent 72%); }
.fh-hero-top { display: flex; align-items: flex-start; gap: 12px; }
.fh-hero-hi { font-size: 21px; font-weight: 700; letter-spacing: .01em; color: var(--fh-hero-ink); text-shadow: 0 1px 12px rgba(0,0,0,.5); }
.fh-hero-date { margin-top: 6px; font-size: 12.5px; color: var(--fh-hero-sub); text-shadow: 0 1px 8px rgba(0,0,0,.55); }
.fh-hero-search { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fh-hero-input { display: flex; gap: 8px; flex: 1; min-width: 300px; }
.fh-hero-input .fh-input { flex: 1; background: rgba(10, 13, 22, .66); border-color: rgba(255,255,255,.14); }
.fh-hero-input .fh-input:focus { border-color: var(--fh-accent); background: rgba(10, 13, 22, .84); }

/* ---- 音乐卡片迷你播放器 ---- */
.fh-hero-player { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.fh-hero-player .row { display: flex; align-items: center; gap: 12px; min-width: 0; }
.fh-hero-player .cover { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; flex: none;
  box-shadow: 0 4px 18px color-mix(in srgb, var(--fh-accent) 26%, transparent); }
.fh-hero-player .cover.ph { display: flex; align-items: center; justify-content: center; font-size: 24px; background: var(--fh-panel-2); }
.fh-hero-player .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.fh-hero-player .title { border: none; background: none; padding: 0; text-align: left; cursor: pointer;
  font-size: 14px; font-weight: 650; color: var(--fh-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-hero-player .title:hover { color: var(--fh-accent); }
.fh-hero-player .artist { font-size: 11.5px; color: var(--fh-ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-hero-player .ctrls { display: flex; align-items: center; gap: 6px; flex: none; }
.fh-hero-player .ctrls button { border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; color: var(--fh-ink2); background: color-mix(in srgb, var(--fh-panel-2) 80%, transparent); }
.fh-hero-player .ctrls button:hover { color: var(--fh-ink); background: var(--fh-panel-2); }
.fh-hero-player .ctrls .side { width: 30px; height: 30px; }
.fh-hero-player .ctrls .main { width: 38px; height: 38px; color: #fff;
  background: linear-gradient(135deg, var(--fh-accent), color-mix(in srgb, var(--fh-accent) 55%, #b44bff)); }
.fh-hero-player .progress { display: flex; align-items: center; gap: 8px; }
.fh-hero-player .progress .t { font-size: 10.5px; color: var(--fh-ink3); flex: none; font-variant-numeric: tabular-nums; }
.fh-hero-player .progress .bar { flex: 1; height: 5px; border-radius: 3px; background: var(--fh-panel-2); cursor: pointer; overflow: hidden; }
.fh-hero-player .progress .bar:hover { height: 7px; }
.fh-hero-player .progress .fill { height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, var(--fh-accent), color-mix(in srgb, var(--fh-accent) 45%, #b44bff)); }
.fh-root *, .fh-player-root * { box-sizing: border-box; font-family: inherit; }
.fh-root button, .fh-player-root button { font-family: inherit; }

/* ---- 布局 ---- */
.fh-shell { flex: 1; display: flex; min-height: 0; }
.fh-side { flex: none; width: 168px; display: flex; flex-direction: column; gap: 2px; padding: 14px 10px; border-right: 1px solid var(--fh-line); overflow-y: auto; }
.fh-side-title { font-size: 11px; color: var(--fh-ink3); letter-spacing: .12em; padding: 6px 10px 8px; }
.fh-side-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--fh-r-md); border: none; background: none; color: var(--fh-ink2); font-size: 13px; cursor: pointer; text-align: left; width: 100%; }
.fh-side-item:hover { background: var(--fh-panel-2); color: var(--fh-ink); }
.fh-side-item.is-on { background: var(--fh-accent-soft); color: var(--fh-accent); font-weight: 550; box-shadow: inset 2px 0 0 var(--fh-accent); }
.fh-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px 24px 28px; }
.fh-main.has-mini { padding-bottom: 96px; }
.fh-page { position: relative; max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; animation: fh-rise .25s ease both; }
.fh-page > * { position: relative; z-index: 1; }
@keyframes fh-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
/* 页头吸顶：所有频道/详情页的返回与工具条滚动时固定在顶部（含 RSS 文章页、影视详情页）。
   负边距吃掉 .fh-main 的内边距 → 通栏覆盖；毛玻璃底避免正文透出。 */
.fh-page-head { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: -20px -24px 0; padding: 14px 24px 10px;
  background: color-mix(in srgb, var(--fh-bg) 86%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in srgb, var(--fh-line) 60%, transparent); }
.fh-page-title { font-size: 19px; font-weight: 650; letter-spacing: .02em; }
.fh-page-sub { color: var(--fh-ink3); font-size: 12px; }
.fh-spacer { flex: 1; }

/* ---- 通用控件 ---- */
.fh-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--fh-line); background: var(--fh-panel-2); color: var(--fh-ink); font-size: 12.5px; cursor: pointer; transition: all .15s; white-space: nowrap; }
.fh-btn:hover { border-color: color-mix(in srgb, var(--fh-accent) 45%, transparent); }
.fh-btn:disabled { opacity: .45; cursor: not-allowed; }
.fh-btn-primary { background: var(--fh-accent-grad); border-color: transparent; color: #fff; }
.fh-btn-primary:hover { filter: brightness(1.08); }
.fh-btn-danger { color: var(--fh-danger); border-color: color-mix(in srgb, var(--fh-danger) 40%, transparent); }
.fh-btn-ghost { background: transparent; }
.fh-btn-sm { padding: 3px 10px; font-size: 11.5px; }
.fh-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: none; background: none; color: var(--fh-ink2); cursor: pointer; }
.fh-icon-btn:hover { background: var(--fh-panel-2); color: var(--fh-ink); }
.fh-input { padding: 7px 12px; border-radius: var(--fh-r-md); border: 1px solid var(--fh-line); background: var(--fh-panel); color: var(--fh-ink); font-size: 13px; outline: none; min-width: 0; }
.fh-input:focus { border-color: var(--fh-accent); }
.fh-select { padding: 6px 10px; border-radius: var(--fh-r-md); border: 1px solid var(--fh-line); background: var(--fh-panel); color: var(--fh-ink); font-size: 12.5px; outline: none; }
.fh-toggle { width: 36px; height: 20px; border-radius: 999px; border: none; background: var(--fh-line); position: relative; cursor: pointer; flex: none; transition: background .2s; }
.fh-toggle-dot { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .2s; }
.fh-toggle.is-on { background: var(--fh-accent-grad); }
.fh-toggle.is-on .fh-toggle-dot { left: 18px; }
.fh-spinner { display: inline-block; border: 2px solid var(--fh-line); border-top-color: var(--fh-accent); border-radius: 50%; animation: fh-spin .7s linear infinite; }
@keyframes fh-spin { to { transform: rotate(360deg); } }
.fh-loading { display: flex; align-items: center; gap: 10px; color: var(--fh-ink2); padding: 30px 4px; font-size: 12.5px; }
.fh-error { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--fh-r-md); background: color-mix(in srgb, var(--fh-danger) 12%, transparent); color: var(--fh-ink); font-size: 12.5px; flex-wrap: wrap; }
.fh-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 20px; color: var(--fh-ink3); text-align: center; }
.fh-empty-title { font-size: 13.5px; color: var(--fh-ink2); }
.fh-empty-hint { font-size: 12px; max-width: 380px; line-height: 1.7; }
.fh-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 300; padding: 24px; }
.fh-modal { width: 520px; max-width: 100%; max-height: min(82vh, 760px); display: flex; flex-direction: column; background: var(--fh-panel); border: 1px solid var(--fh-line); border-radius: var(--fh-r-lg); box-shadow: 0 18px 60px rgba(0,0,0,.4); }
.fh-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--fh-line); }
.fh-modal-title { font-weight: 600; font-size: 14px; }
.fh-modal-body { padding: 16px 18px; overflow-y: auto; font-size: 13px; line-height: 1.7; }
.fh-modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--fh-line); }
.fh-toast { position: fixed; left: 50%; bottom: 108px; transform: translateX(-50%); padding: 9px 18px; border-radius: 999px; background: var(--fh-panel-2); border: 1px solid var(--fh-line); color: var(--fh-ink); font-size: 12.5px; z-index: 400; box-shadow: 0 8px 30px rgba(0,0,0,.35); animation: fh-rise .2s ease both; }
.fh-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--fh-panel-2); color: var(--fh-ink2); font-size: 11px; border: 1px solid var(--fh-line); }
.fh-chip.is-on { background: var(--fh-accent-soft); color: var(--fh-accent); border-color: transparent; }
.fh-chip-btn { cursor: pointer; border: 1px solid var(--fh-line); background: none; padding: 3px 11px; border-radius: 999px; color: var(--fh-ink2); font-size: 12px; }
.fh-chip-btn:hover { color: var(--fh-ink); }
.fh-chip-btn.is-on { background: var(--fh-accent); color: #fff; border-color: transparent; }
.fh-muted { color: var(--fh-ink3); }
.fh-link { color: var(--dsw-alias-link, var(--fh-accent)); text-decoration: none; }
.fh-link:hover { text-decoration: underline; }

/* ---- 首页 Dashboard ---- */
.fh-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; grid-auto-flow: dense; }
@media (max-width: 1480px) { .fh-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 1080px) { .fh-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .fh-grid { grid-template-columns: 1fr; } .fh-side { width: 56px; } .fh-side-item span.fh-side-label { display: none; } }
.fh-card { grid-column: span 1; position: relative; border: 1px solid var(--fh-line); border-radius: var(--fh-r-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-height: 180px; overflow: hidden; background: var(--fh-panel); }
.fh-card::before { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, color-mix(in srgb, var(--fh-panel) 30%, transparent), color-mix(in srgb, var(--fh-panel) 76%, transparent) 62%); pointer-events: none; }
.fh-card > * { position: relative; }
/* 氛围图层：小说/音乐/RSS 卡片叠素材图 + 深色渐变遮罩（文字可读），关闭氛围背景时不渲染。
   z-index:-1 + 卡片 isolation 隔离 → 图在卡片底色之上、内容之下。 */
.fh-card { isolation: isolate; }
.fh-card-type-novel::after, .fh-card-type-music::after, .fh-card-type-rss::after {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .5;
  background-size: cover; background-position: center; }
.fh-card-type-novel::after { background-image: linear-gradient(160deg, rgba(8,14,16,.78), rgba(8,12,14,.55)), var(--fh-bg-novel, url('/funhub/api/asset/novel-bg.webp')); }
.fh-card-type-music::after { background-image: linear-gradient(185deg, rgba(10,8,20,.42), rgba(10,8,16,.82)), var(--fh-bg-music, url('/funhub/api/asset/music-bg.webp')); background-position: center 22%; }
.fh-card-type-rss::after { background-image: linear-gradient(200deg, rgba(7,8,16,.72), rgba(7,8,16,.5)), var(--fh-bg-rss, url('/funhub/api/asset/rss-bg.webp')); }
.fh-no-atmo .fh-card-type-novel::after, .fh-no-atmo .fh-card-type-music::after, .fh-no-atmo .fh-card-type-rss::after { display: none; }
/* 频道主题底：专属色相氛围光 + 图式纹理（纯 CSS，无外链） */
.fh-card-type-novel { background:
  radial-gradient(80% 90% at 85% 10%, color-mix(in srgb, #f5a623 14%, transparent), transparent 70%),
  repeating-linear-gradient(115deg, transparent 0 14px, color-mix(in srgb, #f5a623 3.5%, transparent) 14px 15px), var(--fh-panel); }
.fh-card-type-comic { background:
  radial-gradient(75% 85% at 12% 90%, color-mix(in srgb, #a06bff 15%, transparent), transparent 70%),
  radial-gradient(color-mix(in srgb, #a06bff 7%, transparent) 12%, transparent 13%) 0 0 / 14px 14px, var(--fh-panel); }
.fh-card-type-gallery { background:
  radial-gradient(85% 80% at 88% 88%, color-mix(in srgb, #2fbf8f 13%, transparent), transparent 72%),
  linear-gradient(135deg, transparent 46.5%, color-mix(in srgb, #2fbf8f 7%, transparent) 46.5% 47.5%, transparent 47.5% 63%, color-mix(in srgb, #2fbf8f 7%, transparent) 63% 64%, transparent 64%), var(--fh-panel); }
.fh-card-type-music { background:
  radial-gradient(90% 90% at 80% 15%, color-mix(in srgb, #ff6bb0 13%, transparent), transparent 70%),
  radial-gradient(70% 70% at 15% 85%, color-mix(in srgb, var(--fh-accent) 12%, transparent), transparent 72%), var(--fh-panel); }
.fh-card-type-games { background:
  radial-gradient(80% 85% at 15% 12%, color-mix(in srgb, #38e07b 12%, transparent), transparent 70%),
  conic-gradient(from 45deg at 82% 82%, transparent 0 25%, color-mix(in srgb, #38e07b 8%, transparent) 25% 27.5%, transparent 27.5% 50%, color-mix(in srgb, #38e07b 8%, transparent) 50% 52.5%, transparent 52.5%), var(--fh-panel); }
.fh-card-type-rss { background:
  radial-gradient(85% 85% at 85% 85%, color-mix(in srgb, #4aa8ff 13%, transparent), transparent 70%),
  repeating-radial-gradient(circle at 88% 88%, transparent 0 16px, color-mix(in srgb, #4aa8ff 5%, transparent) 16px 18px), var(--fh-panel); }
.fh-card.size-2x1 { grid-column: span 2; }
.fh-card.size-1x2 { grid-row: span 2; }
.fh-card.size-2x2 { grid-column: span 2; grid-row: span 2; }
@media (max-width: 1080px) { .fh-card.size-2x1, .fh-card.size-2x2 { grid-column: span 2; } }
@media (max-width: 700px) { .fh-card.size-2x1, .fh-card.size-2x2 { grid-column: span 1; } }
.fh-card-head { display: flex; align-items: center; gap: 8px; }
.fh-card-title { font-weight: 600; font-size: 13.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; color: var(--fh-ink); background: none; border: none; padding: 0; }
.fh-card-title:hover { color: var(--fh-accent); }
.fh-card-body { flex: 1; display: flex; gap: 10px; overflow: hidden; min-height: 0; }
.fh-card-row { display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.fh-mini-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--fh-r-md); cursor: pointer; border: none; background: none; color: var(--fh-ink); text-align: left; font-size: 12.5px; min-width: 0; }
.fh-mini-item:hover { background: var(--fh-panel-2); }
.fh-mini-item .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-mini-item .s { color: var(--fh-ink3); font-size: 11px; flex: none; }
.fh-mini-cover { flex: none; width: 34px; height: 46px; border-radius: 6px; object-fit: cover; background: var(--fh-panel-2); }
.fh-mini-cover.square { height: 34px; }
.fh-mini-art { flex: none; width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 17px; background: var(--fh-panel-2); }

/* ---- 列表卡片（搜索结果等） ---- */
.fh-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 14px; }
.fh-tile { display: flex; flex-direction: column; gap: 7px; cursor: pointer; border: none; background: none; padding: 0; text-align: left; color: var(--fh-ink); }
.fh-tile:hover .fh-tile-cover { border-color: var(--fh-accent); }
.fh-tile-cover { width: 100%; aspect-ratio: 3/4; border-radius: var(--fh-r-md); object-fit: cover; background: var(--fh-panel-2); border: 1px solid var(--fh-line); }
.fh-tile-title { font-size: 12.5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fh-tile-sub { font-size: 11px; color: var(--fh-ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-rowlist { display: flex; flex-direction: column; }
.fh-row { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: var(--fh-r-md); border: none; background: none; color: var(--fh-ink); text-align: left; cursor: pointer; font-size: 13px; }
.fh-row:hover { background: var(--fh-panel-2); }
.fh-row .num { width: 22px; color: var(--fh-ink3); font-size: 11.5px; text-align: right; flex: none; }
.fh-row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-row .s { color: var(--fh-ink3); font-size: 11.5px; flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-row.is-playing .t { color: var(--fh-accent); }
.fh-song-index { display: inline-flex; align-items: center; justify-content: center; }

/* ---- 阅读器 ---- */
.fh-reader { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; background: var(--fh-bg); }
.fh-reader-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--fh-line); background: var(--fh-panel); }
.fh-reader-title { font-weight: 550; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-reader-body { flex: 1; overflow-y: auto; display: flex; justify-content: center; position: relative; }
.fh-reader-page { width: 100%; max-width: 780px; padding: 36px 28px 90px; }
.fh-reader-para { margin: 0 0 1.15em; text-indent: 2em; line-height: var(--fh-reader-lh, 1.9); font-size: var(--fh-reader-fs, 18px); color: var(--fh-reader-ink, var(--fh-ink)); }
.fh-reader-theme-paper { --fh-reader-ink: #3b3225; background: #f5efdd; }
.fh-reader-theme-paper .fh-reader-body { background: #f5efdd; }
.fh-reader-theme-green { --fh-reader-ink: #2c3a2e; }
.fh-reader-theme-green .fh-reader-body { background: #cfe0cf; }
.fh-reader-theme-black { --fh-reader-ink: #b8bcc4; background: #000; }
.fh-reader-theme-black .fh-reader-body { background: #000; }
.fh-reader-theme-black .fh-reader-bar, .fh-reader-theme-black .fh-reader-foot, .fh-reader-theme-black .fh-reader-sheet { background: #0c0c0e; }
/* 左右翻页（CSS 多列 + 平移） */
.fh-reader.is-page .fh-reader-body { overflow: hidden; }
.fh-reader-cols { column-fill: auto; overflow: hidden; transition: transform .18s ease; will-change: transform; }
.fh-reader-cols .fh-reader-para { margin: 0 24px 1.15em; }
.fh-reader-tapzone { position: absolute; top: 0; bottom: 0; z-index: 5; }
.fh-reader-tapzone.left { left: 0; width: 30%; cursor: pointer; }
.fh-reader-tapzone.right { right: 0; width: 30%; cursor: pointer; }
.fh-reader-tapzone.center { left: 30%; right: 30%; cursor: pointer; }
/* 底部设置面板 */
.fh-reader-sheet { position: absolute; left: 0; right: 0; bottom: 52px; background: var(--fh-panel); border-top: 1px solid var(--fh-line); border-radius: 14px 14px 0 0; padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 12px; z-index: 30; box-shadow: 0 -10px 30px rgba(0,0,0,.35); }
.fh-reader-sheet-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--fh-ink2); flex-wrap: wrap; }
.fh-theme-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--fh-line); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--fh-ink2); padding: 0; }
.fh-theme-dot.is-on { border-color: var(--fh-accent); color: var(--fh-accent); }
.fh-reader-chapters { position: absolute; top: 46px; right: 16px; width: 320px; max-width: calc(100% - 32px); max-height: 70%; z-index: 20; background: var(--fh-panel); border: 1px solid var(--fh-line); border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,.35); overflow: hidden; }
.fh-reader-foot { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--fh-line); background: color-mix(in srgb, var(--fh-panel) 92%, transparent); backdrop-filter: blur(8px); }
.fh-reader-progress { flex: 1; height: 4px; border-radius: 999px; background: var(--fh-line); overflow: hidden; cursor: pointer; }
.fh-reader-progress i { display: block; height: 100%; background: var(--fh-accent-grad); }
.fh-chapter-list { display: flex; flex-direction: column; max-height: 60vh; overflow-y: auto; }
/* 章末导航（正文流内）：读完手动去下一章 */
.fh-reader-chapnav { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 2.2em 0 1.2em; padding: 14px 12px; border-top: 1px dashed var(--fh-line); }
.fh-reader-cols .fh-reader-chapnav { margin: 2.2em 24px 1.2em; }
.fh-reader-theme-black .fh-reader-chapnav { border-top-color: #26282d; }

/* ---- 漫画 ---- */
.fh-comic-reader { position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; background: #101113; }
.fh-comic-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; color: #ddd; background: rgba(20,21,24,.92); border-bottom: 1px solid #26282d; }
.fh-comic-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; align-items: center; }
.fh-comic-page { max-width: 100%; margin: 0 auto; display: block; }
.fh-comic-single { display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
.fh-comic-single img { max-height: 100%; max-width: 100%; object-fit: contain; }
.fh-comic-nav { position: absolute; top: 0; bottom: 0; width: 30%; cursor: pointer; display: flex; align-items: center; color: transparent; }
.fh-comic-nav:hover { color: rgba(255,255,255,.4); }
.fh-comic-nav.left { left: 0; justify-content: flex-start; padding-left: 8px; }
.fh-comic-nav.right { right: 0; justify-content: flex-end; padding-right: 8px; }
.fh-comic-group { padding: 4px 12px; color: var(--fh-ink3); font-size: 11.5px; }

/* ---- 图片广场 ---- */
.fh-falls { columns: 4 220px; column-gap: 12px; }
.fh-fall-item { position: relative; break-inside: avoid; margin-bottom: 12px; border-radius: var(--fh-r-md); overflow: hidden; cursor: zoom-in; border: 1px solid var(--fh-line); background: var(--fh-panel-2); width: 100%; display: block; padding: 0; }
.fh-fall-item img { width: 100%; display: block; }
.fh-fall-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 20px 10px 8px; background: linear-gradient(transparent, rgba(0,0,0,.65)); color: #fff; font-size: 11px; opacity: 0; transition: opacity .15s; }
.fh-fall-item:hover .fh-fall-cap { opacity: 1; }

/* ---- 滚动条（fh-scrollbar-marker）：细圆角，hover 才明显，替代原生粗滚动条 ---- */
.fh-root ::-webkit-scrollbar, .fh-player-root ::-webkit-scrollbar, .fh-fs ::-webkit-scrollbar { width: 9px; height: 9px; }
.fh-root ::-webkit-scrollbar-track, .fh-player-root ::-webkit-scrollbar-track, .fh-fs ::-webkit-scrollbar-track { background: transparent; }
.fh-root ::-webkit-scrollbar-thumb, .fh-player-root ::-webkit-scrollbar-thumb, .fh-fs ::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--fh-ink3) 38%, transparent);
  border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
.fh-root ::-webkit-scrollbar-thumb:hover, .fh-player-root ::-webkit-scrollbar-thumb:hover, .fh-fs ::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--fh-ink3) 68%, transparent); background-clip: padding-box; }
.fh-root ::-webkit-scrollbar-corner, .fh-player-root ::-webkit-scrollbar-corner { background: transparent; }
.fh-root *, .fh-player-root *, .fh-fs, .fh-fs * { scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--fh-ink3) 45%, transparent) transparent; }

/* ---- 懒加载图片：加载前微光骨架，完成后淡入；失败显示占位图标 ---- */
.fh-lazy-img { position: relative; overflow: hidden; background: var(--fh-panel-2); min-height: 60px; }
.fh-lazy-img > img { display: block; width: 100%; height: 100%; object-fit: cover; transition: opacity .4s ease; }
.fh-lazy-img.is-ok { min-height: 0; }
.fh-lazy-img .fh-lazy-ph { position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(100deg, var(--fh-panel-2) 30%,
    color-mix(in srgb, var(--fh-panel-2) 70%, var(--fh-ink3) 16%) 50%,
    var(--fh-panel-2) 70%);
  background-size: 220% 100%; animation: fh-shimmer 1.5s ease-in-out infinite; }
@keyframes fh-shimmer { from { background-position: 170% 0; } to { background-position: -70% 0; } }
.fh-lazy-img.is-error > img { display: none; }
.fh-lazy-img.is-error::after { content: '🖼'; position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; font-size: 22px; opacity: .35; }
/* 瀑布流场景：加载前给足占位高度，减少列高度跳动 */
.fh-fall-item .fh-lazy-img { min-height: 170px; }
.fh-fall-item .fh-lazy-img.is-ok { min-height: 0; }
.fh-lightbox { position: fixed; inset: 0; z-index: 500; background: rgba(8,9,10,.94); display: flex; flex-direction: column; }
.fh-lightbox-main { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 0; position: relative; }
.fh-lightbox-main img { max-width: calc(100% - 120px); max-height: 100%; object-fit: contain; transition: opacity .3s ease; }
.fh-lightbox-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--fh-ink3); }
.fh-lightbox-bar { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: #ccc; font-size: 12.5px; background: rgba(16,17,19,.9); }

/* ---- RSS ---- */
/* 文章正文：显式颜色（正文 HTML 可能继承到宿主深色文字，导致深底上看不清） */
.fh-article { max-width: 780px; margin: 0 auto; line-height: 1.85; font-size: 14px; color: var(--fh-ink); }
.fh-article *:not(a):not(img) { color: inherit; }
.fh-article font { color: inherit; background: none; }
.fh-article img { max-width: 100%; border-radius: 8px; }
.fh-article iframe { display: block; width: 100%; max-width: 720px; aspect-ratio: 16 / 9; border: 0; border-radius: 8px; margin: 10px 0; background: #000; }
.fh-article a { color: var(--fh-accent); }
.fh-article pre { overflow-x: auto; background: var(--fh-panel-2); padding: 12px; border-radius: 8px; }
.fh-article blockquote { border-left: 3px solid var(--fh-line); margin-left: 0; padding-left: 14px; color: var(--fh-ink2); }
/* ---- RSS 双栏：左订阅源固定可见，右文章独立滚动 ---- */
.fh-rss-split { display: flex; gap: 16px; height: calc(100vh - 208px); min-height: 320px; }
body.fh-has-mini .fh-rss-split { height: calc(100vh - 266px); }
.fh-rss-side { width: 200px; flex: none; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; overscroll-behavior: contain; }
.fh-rss-list { flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain; }
/* 小说/漫画发现区：同 RSS 左列表布局，但嵌在页面中段（上方还有历史/书架区块），高度自适应 */
.fh-explore-split { display: flex; gap: 16px; height: min(660px, calc(100vh - 350px)); min-height: 340px; }
body.fh-has-mini .fh-explore-split { height: min(660px, calc(100vh - 408px)); }
@media (max-width: 700px) {
  .fh-explore-split { display: flex; flex-direction: column; height: auto; }
}
@media (max-width: 700px) {
  .fh-rss-split { display: flex; flex-direction: column; height: auto; }
  .fh-rss-side { width: 100%; max-height: 180px; }
  .fh-rss-list { max-height: none; }
}

/* ---- AI 助手页 ---- */
.fh-ai-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: var(--fh-r-md);
  border: 1px solid var(--fh-line); background: var(--fh-panel-2); }
.fh-ai-row .lbl { flex: none; width: 118px; font-size: 12.5px; font-weight: 600; }
.fh-ai-row .txt { flex: 1; min-width: 0; font-size: 12px; color: var(--fh-ink2);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all; }

.fh-article-head { max-width: 780px; margin: 0 auto 6px; }
.fh-article-head h1 { font-size: 20px; font-weight: 700; line-height: 1.45; margin: 0 0 10px; color: var(--fh-ink); }
.fh-article-head .meta { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: 12px; }
/* portal 到 body 的浮层显式继承 FunHub 墨色（宿主 body 可能是深色文字） */
.fh-modal, .fh-toast, .fh-lightbox { color: var(--fh-ink); }
.fh-feed-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--fh-r-md); cursor: pointer; }
.fh-feed-item:hover { background: var(--fh-panel-2); }
.fh-feed-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--fh-accent); margin-top: 7px; }
.fh-feed-dot.is-read { background: var(--fh-line); }

/* ---- 设置 ---- */
.fh-section { background: var(--fh-panel); border: 1px solid var(--fh-line); border-radius: var(--fh-r-lg); padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
.fh-section-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.fh-field { display: flex; align-items: center; gap: 12px; font-size: 13px; }
.fh-field > label { width: 130px; color: var(--fh-ink2); flex: none; }
.fh-src-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: var(--fh-r-md); border: 1px solid var(--fh-line); font-size: 12.5px; }

/* ---- 首页卡片分栏小标题（小说：书架 / 最近阅读） ---- */
/* ---- 歌单广场封面墙 ---- */
.fh-pl-wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(122px, 1fr)); gap: 14px 12px; }
.fh-pl-card { position: relative; border: none; padding: 0; background: none; cursor: pointer;
  display: flex; flex-direction: column; gap: 6px; text-align: left; color: var(--fh-ink); }
.fh-pl-card .fh-lazy-img { border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.28); transition: transform .16s ease, box-shadow .16s ease; }
.fh-pl-card:hover .fh-lazy-img { transform: translateY(-3px) scale(1.02); box-shadow: 0 10px 28px rgba(0,0,0,.38); }
.fh-pl-card .name { font-size: 12.5px; font-weight: 600; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.fh-pl-card .sub { font-size: 11px; color: var(--fh-ink3); }
.fh-pl-badge { position: absolute; top: 8px; left: 8px; z-index: 2; font-size: 11px;
  padding: 3px 8px; border-radius: 999px; color: #fff; pointer-events: none;
  background: linear-gradient(135deg, var(--fh-accent), color-mix(in srgb, var(--fh-accent) 55%, #b44bff)); }

.fh-home-col-title { border: none; background: none; padding: 0 2px; cursor: pointer; text-align: left;
  font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--fh-ink3); }
.fh-home-col-title:hover { color: var(--fh-accent); }

/* ---- 首页布局编辑器：与首页 4 列 dense 网格同构的拖拽画布 ---- */
.fh-layout-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-flow: dense; gap: 10px; }
.fh-layout-grid .size-2x1 { grid-column: span 2; }
.fh-layout-grid .size-1x2 { grid-row: span 2; }
.fh-layout-grid .size-2x2 { grid-column: span 2; grid-row: span 2; }
.fh-layout-tile { display: flex; flex-direction: column; justify-content: space-between; gap: 8px;
  min-height: 96px; padding: 12px; border-radius: var(--fh-r-md);
  border: 1.5px dashed color-mix(in srgb, var(--fh-line) 80%, var(--fh-ink3));
  background: color-mix(in srgb, var(--fh-panel-2) 55%, transparent);
  color: var(--fh-ink2); cursor: grab; user-select: none;
  transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease, opacity .15s; }
.fh-layout-tile:hover { border-color: color-mix(in srgb, var(--fh-accent) 60%, transparent); color: var(--fh-ink); }
.fh-layout-tile.is-dragging { opacity: .4; cursor: grabbing; }
.fh-layout-tile.is-over { border-color: var(--fh-accent); border-style: solid;
  box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--fh-accent) 30%, transparent); transform: scale(1.02); }
.fh-layout-tile .tile-head { display: flex; align-items: center; gap: 8px; }
.fh-layout-tile .lbl { font-size: 13px; font-weight: 620; }
.fh-layout-tile .acts { display: flex; gap: 6px; flex-wrap: wrap; }
.fh-layout-tile .acts button { font-size: 11px; padding: 3px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--fh-line); background: color-mix(in srgb, var(--fh-panel) 72%, transparent); color: var(--fh-ink2); }
.fh-layout-tile .acts button:hover { color: var(--fh-accent); border-color: var(--fh-accent); }
.fh-src-row .name { font-weight: 550; }
.fh-src-row .meta { color: var(--fh-ink3); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- 游戏 ---- */
.fh-game-stage { position: absolute; inset: 0; z-index: 60; background: var(--fh-bg); display: flex; flex-direction: column; }
.fh-game-bar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid var(--fh-line); background: var(--fh-panel); }
.fh-game-body { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; }

/* ---- 游戏街机：横幅 + 可爱风卡片 ---- */
.fh-arcade { position: relative; overflow: hidden; border-radius: 18px; padding: 18px 22px;
  background: linear-gradient(120deg, #ffd6e8 0%, #d6f0ff 45%, #d9f7e3 100%);
  border: 1px solid #ffffff88; box-shadow: 0 10px 30px -18px #f8a5c266; }
html.fh-light .fh-arcade { background: linear-gradient(120deg, #ffe3f0 0%, #e3f4ff 45%, #e5fbef 100%); }
.fh-arcade .ttl { font-size: 19px; font-weight: 800; letter-spacing: .5px; color: #7c4a6e; }
.fh-arcade .sub { font-size: 12px; color: #8d6f88; margin-top: 6px; }
.fh-arcade .deco { position: absolute; opacity: .8; animation: fh-float 5s ease-in-out infinite; }
.fh-arcade .d1 { right: 26px; top: 10px; font-size: 22px; }
.fh-arcade .d2 { right: 74px; bottom: 8px; font-size: 16px; animation-delay: -1.6s; }
.fh-arcade .d3 { right: 150px; top: 22px; font-size: 15px; animation-delay: -3.2s; }
@keyframes fh-float { 0%,100% { transform: translateY(0) rotate(-6deg) } 50% { transform: translateY(-7px) rotate(8deg) } }
.fh-arcade-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(172px, 1fr)); }
.fh-game-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center;
  padding: 20px 14px 14px; border-radius: 18px; cursor: pointer; border: 1px solid #ffffff55;
  background: linear-gradient(165deg, var(--gc1, #ffd6a5), var(--gc2, #ffadad));
  box-shadow: 0 8px 22px -14px #00000055; transition: transform .18s ease, box-shadow .18s ease; color: #5b4a52; }
.fh-game-card:hover { transform: translateY(-4px) rotate(-.6deg); box-shadow: 0 16px 30px -14px #00000066; }
.fh-game-card .blob { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: #ffffffb8; box-shadow: inset 0 -4px 10px #ffffff88, 0 6px 14px -8px #00000033; }
.fh-game-card .emoji { font-size: 30px; animation: fh-bob 3.4s ease-in-out infinite; }
@keyframes fh-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
.fh-game-card .name { font-weight: 750; font-size: 14px; color: #553f4d; }
.fh-game-card .desc { font-size: 11px; line-height: 1.5; color: #7d6373; }
.fh-game-card .pills { display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; }
.fh-game-card .pill { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; background: #ffffff9e; color: #6b5262; }
.fh-game-card .play { margin-top: 4px; font-size: 12px; font-weight: 700; color: #553f4d; }
.fh-game-card:hover .play { text-decoration: underline; }
.fh-game-fav { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; border: none; cursor: pointer;
  background: #ffffffa8; color: #b592a4; display: flex; align-items: center; justify-content: center; }
.fh-game-fav:hover { background: #ffffff; }
.fh-game-fav.is-on { color: #ff5f8f; }

/* ---- 翻翻乐 ---- */
.fh-mem-grid { display: grid; grid-template-columns: repeat(4, 66px); gap: 10px; }
.fh-mem-card { position: relative; width: 66px; height: 66px; border: none; background: none; padding: 0; cursor: pointer;
  perspective: 420px; }
.fh-mem-face, .fh-mem-back { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 14px; backface-visibility: hidden; transition: transform .3s ease; box-shadow: 0 6px 14px -10px #00000066; }
.fh-mem-back { background: linear-gradient(150deg, #ffd6f5, #c1f0dc); font-size: 24px; color: #9b77a0; }
.fh-mem-face { background: #fffdf7; transform: rotateY(180deg); border: 1px solid #f2e2c9; display: flex; align-items: center; justify-content: center; font-size: 30px; }
.fh-mem-card.is-up .fh-mem-face { transform: rotateY(0deg); }
.fh-mem-card.is-up .fh-mem-back { transform: rotateY(180deg); }
.fh-mem-card.is-matched .fh-mem-face { background: #e7fbef; border-color: #9fe6bd; animation: fh-mem-pop .35s ease; }
@keyframes fh-mem-pop { 0% { transform: rotateY(0) scale(1) } 45% { transform: rotateY(0) scale(1.14) } 100% { transform: rotateY(0) scale(1) } }

/* ---- 推箱子 ---- */
.fh-soko-board { display: grid; gap: 2px; padding: 10px; border-radius: 14px;
  background: linear-gradient(150deg, #eef7e6, #e2efff); border: 1px solid #cfe0cc; }
.fh-soko-cell { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
.fh-soko-floor { width: 100%; height: 100%; border-radius: 8px; background: #ffffffb8;
  display: flex; align-items: center; justify-content: center; font-size: 17px; }
.fh-soko-floor.alt { background: #f4f9ec; }
.fh-soko-wall { width: 100%; height: 100%; border-radius: 8px;
  background: linear-gradient(160deg, #b98a5f, #96693f); box-shadow: inset 0 -3px 5px #7a5330aa; }
.fh-soko-sprite { display: block; border-radius: 9px; }
.fh-soko-sprite.goal { opacity: .9; }
.fh-soko-sprite.done { animation: fh-mem-pop .4s ease; }
.fh-soko-player-wrap { position: absolute; inset: 3px; border-radius: 9px; overflow: hidden; z-index: 2; }
.fh-soko-player-img { border-radius: 9px; }
.fh-soko-box { line-height: 1; filter: drop-shadow(0 2px 2px #0003); }
.fh-soko-box.done { animation: fh-mem-pop .4s ease; }
.fh-soko-goal { line-height: 1; opacity: .85; animation: fh-float 2.6s ease-in-out infinite; }
.fh-soko-player { line-height: 1; filter: drop-shadow(0 2px 3px #0004); }

/* ---- 影视播放器 ---- */
/* ---- 页内播放器（详情页顶部） ---- */
.fh-inline-player { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; border: 1px solid var(--fh-line); background: #000; }
.fh-inline-player:fullscreen { border-radius: 0; }
.fh-inline-player-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--fh-panel); border-bottom: 1px solid var(--fh-line); font-size: 12.5px; }
.fh-inline-player-bar .t { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-inline-player-stage { position: relative; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; background: #000; }
.fh-inline-player-stage video { width: 100%; height: 100%; object-fit: contain; }
.fh-inline-player:fullscreen .fh-inline-player-stage { aspect-ratio: auto; height: 100vh; }
.fh-inline-player:fullscreen .fh-inline-player-stage video { object-fit: contain; }
.fh-video-fatal { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 18px; text-align: center; font-size: 13px; color: var(--fh-ink); background: color-mix(in srgb, var(--fh-panel) 88%, transparent); }

.fh-video-overlay { position: fixed; inset: 0; z-index: 120; background: #000c; backdrop-filter: blur(6px);
  display: flex; flex-direction: column; }
.fh-video-bar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; color: #fff; }
.fh-video-title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
.fh-video-body { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; padding: 0 16px 24px; }

/* ---- 五子棋：棋子落在交叉点 ---- */
.fh-gomoku-board { position: relative; border-radius: 14px; border: 1px solid #d8c9a3;
  background: linear-gradient(150deg, #f8eed6, #f0e0bb);
  box-shadow: 0 10px 24px -14px #b09a6a99; --gs: 22px; }
.fh-gomoku-lines { position: absolute; pointer-events: none;
  background:
    repeating-linear-gradient(to right, transparent 0, transparent calc(var(--gs) - 1px), #c7ab72 calc(var(--gs) - 1px), #c7ab72 var(--gs)),
    repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--gs) - 1px), #c7ab72 calc(var(--gs) - 1px), #c7ab72 var(--gs)); }
.fh-gomoku-star { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #a98d54;
  transform: translate(-50%, -50%); pointer-events: none; }
.fh-gomoku-hit { position: absolute; border: none; background: transparent; padding: 0; cursor: pointer; }
.fh-gomoku-hit:hover::after { content: ''; position: absolute; left: 50%; top: 50%; width: 19px; height: 19px;
  border-radius: 50%; transform: translate(-50%, -50%); opacity: .45; }
.fh-gomoku-hit[data-my='1']:hover::after { background: radial-gradient(circle at 34% 30%, #6b6b70, #17171c 70%); }
.fh-gomoku-hit[data-my='2']:hover::after { background: radial-gradient(circle at 34% 30%, #ffffff, #d9d9de 75%); }
.fh-stone { position: absolute; width: 20px; height: 20px; border-radius: 50%;
  transform: translate(-50%, -50%); box-shadow: 0 2px 4px -1px #00000066; pointer-events: none; }
.fh-stone.b { background: radial-gradient(circle at 34% 30%, #6b6b70, #17171c 70%); }
.fh-stone.w { background: radial-gradient(circle at 34% 30%, #ffffff, #d9d9de 75%); border: 1px solid #cfcfd6; }
.fh-stone.is-win { animation: fh-stone-win 1s ease infinite; box-shadow: 0 0 10px 3px #ffd76e; }
@keyframes fh-stone-win { 0%,100% { transform: translate(-50%,-50%) scale(1) } 50% { transform: translate(-50%,-50%) scale(1.18) } }
.fh-gomoku-forbid { position: absolute; transform: translate(-50%, -50%); color: #e5484d;
  font-size: 15px; font-weight: 800; line-height: 1; text-shadow: 0 0 3px #fff; pointer-events: none; }
.fh-gomoku-last { position: absolute; width: 6px; height: 6px; border-radius: 50%;
  transform: translate(-50%, -50%); background: #ff5f8f; box-shadow: 0 0 5px #ff5f8f; pointer-events: none; }

/* ---- 贪吃蛇 ---- */
.fh-snake-board { display: grid; grid-template-columns: repeat(15, 22px); grid-auto-rows: 22px; gap: 2px;
  padding: 10px; border-radius: 16px; background: linear-gradient(150deg, #e8f8ee, #d5efff); border: 1px solid #cde7d8; }
.fh-snake-cell { border-radius: 6px; background: #ffffff70; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.fh-snake-cell.is-body { background: #7bd88f; box-shadow: inset 0 -2px 4px #58b96e66; }
.fh-snake-cell.is-tail { background: #a5e6b3; }
.fh-snake-cell.is-head { background: #3fae5c; box-shadow: inset 0 2px 5px #2f8a4699; }
.fh-snake-cell.is-food { background: transparent; border-radius: 5px; overflow: hidden; }
.fh-snake-cell.is-head { border-radius: 6px; overflow: hidden; }
.fh-snake-cell.is-body { border-radius: 6px; overflow: hidden; }
.fh-snake-cell.is-tail { border-radius: 6px; overflow: hidden; opacity: .85; }
.fh-snake-sprite { display: block; }
.fh-snake-dpad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.fh-snake-dpad button { width: 40px; height: 34px; border-radius: 10px; border: 1px solid var(--fh-line);
  background: var(--fh-panel-2); cursor: pointer; font-size: 13px; }
.fh-snake-dpad button:active { transform: scale(.94); background: var(--fh-accent-soft); }
.fh-snake-dpad > div { display: flex; gap: 4px; }

.fh-game-tiles { display: grid; gap: 8px; }
.fh-game-tile { display: flex; align-items: center; justify-content: center; border-radius: 12px; font-weight: 750; background: var(--fh-panel-2); color: var(--fh-ink); user-select: none; }
.fh-game-tile[data-v='2'] { background: #3d5afe33; } .fh-game-tile[data-v='4'] { background: #f8bbd033; }
.fh-game-tile[data-v='8'] { background: #ff8a6566; color: #fff; } .fh-game-tile[data-v='16'] { background: #ff704366; color: #fff; }
.fh-game-tile[data-v='32'] { background: #f4511e88; color: #fff; } .fh-game-tile[data-v='64'] { background: #e5393599; color: #fff; }
.fh-game-tile[data-v='128'] { background: #fdd83566; color: #fff; } .fh-game-tile[data-v='256'] { background: #fbc02d99; color: #fff; }
.fh-game-tile[data-v='512'] { background: #ffb300bb; color: #fff; } .fh-game-tile[data-v='1024'] { background: #ffa000dd; color: #fff; }
.fh-game-tile[data-v='2048'] { background: #f57f17; color: #fff; box-shadow: 0 0 18px #f57f1766; }
.fh-cell-btn { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--fh-line); background: var(--fh-panel-2); color: var(--fh-ink); cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; font-weight: 600; }
.fh-cell-btn:hover:not(:disabled) { border-color: var(--fh-accent); }
.fh-cell-btn.is-mine-open { background: var(--fh-danger); border-color: var(--fh-danger); }
.fh-cell-btn.is-open { background: transparent; border-color: transparent; cursor: default; color: var(--fh-ink3); }
.fh-cell-btn.is-flag { background: var(--fh-accent-soft); }
/* ---- 2048 方块模型：绝对定位 + transform 过渡滑动，合并弹跳 / 新块出现 ---- */
.fh-2048-board { position: relative; border-radius: 12px; background: var(--fh-panel);
  border: 1px solid var(--fh-line); touch-action: none; user-select: none; }
.fh-2048-cell { position: absolute; width: 72px; height: 72px; border-radius: 8px; background: var(--fh-panel-2); }
.fh-2048-tile { position: absolute; width: 72px; height: 72px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; color: var(--fh-ink); will-change: transform;
  transition: transform .13s ease-in-out; }
.fh-2048-tile[data-v] { background: var(--fh-panel-2); }
.fh-2048-tile[data-v="2"] { background: #efe9dc; color: #6b6257; }
.fh-2048-tile[data-v="4"] { background: #ece3c8; color: #6b6257; }
.fh-2048-tile[data-v="8"] { background: #f4b26a; color: #fff; }
.fh-2048-tile[data-v="16"] { background: #f59255; color: #fff; }
.fh-2048-tile[data-v="32"] { background: #f5744d; color: #fff; }
.fh-2048-tile[data-v="64"] { background: #ed5c39; color: #fff; }
.fh-2048-tile[data-v="128"] { background: #efcf5e; color: #fff; box-shadow: 0 0 14px color-mix(in srgb, #efcf5e 55%, transparent); }
.fh-2048-tile[data-v="256"] { background: #edc84c; color: #fff; box-shadow: 0 0 16px color-mix(in srgb, #edc84c 60%, transparent); }
.fh-2048-tile[data-v="512"] { background: #e8bf38; color: #fff; box-shadow: 0 0 20px color-mix(in srgb, #e8bf38 65%, transparent); }
.fh-2048-tile[data-v="1024"] { background: #e3b322; color: #fff; box-shadow: 0 0 24px color-mix(in srgb, #e3b322 70%, transparent); }
.fh-2048-tile[data-v="2048"] { background: linear-gradient(135deg, #e8bf38, #f59255); color: #fff; box-shadow: 0 0 30px color-mix(in srgb, #f5a623 80%, transparent); }
.fh-2048-tile.is-merged { animation: fh-2048-pop .18s ease .1s; }
.fh-2048-tile.is-new { animation: fh-2048-in .16s ease backwards; }
@keyframes fh-2048-pop { 0% { scale: 1; } 45% { scale: 1.18; } 100% { scale: 1; } }
@keyframes fh-2048-in { from { scale: 0; opacity: 0; } to { scale: 1; opacity: 1; } }

.fh-sudoku-cell { width: 100%; aspect-ratio: 1; border: 1px solid var(--fh-line); border-radius: 4px; background: var(--fh-panel-2); color: var(--fh-ink); display: flex; align-items: center; justify-content: center; font-size: 15px; cursor: pointer; padding: 0; }
.fh-sudoku-cell.is-fixed { color: var(--fh-ink2); font-weight: 650; }
.fh-sudoku-cell.is-selected { border-color: var(--fh-accent); background: var(--fh-accent-soft); }
.fh-sudoku-cell.is-same { box-shadow: inset 0 0 0 1px var(--fh-accent); }
.fh-sudoku-cell.is-error { color: var(--fh-danger); }
.fh-sudoku-grid { display: grid; grid-template-columns: repeat(9, 44px); gap: 2px; padding: 8px; background: var(--fh-panel); border-radius: 10px; border: 1px solid var(--fh-line); position: relative; }
/* 数独 3×3 宫边框：左缘（列 4/7）与下缘（行 3/6）加粗，配合外框形成九宫格 */
.fh-sudoku-cell:nth-child(9n+4), .fh-sudoku-cell:nth-child(9n+7) { border-left: 2px solid color-mix(in srgb, var(--fh-ink3) 55%, transparent); border-radius: 4px 0 0 4px; }
.fh-sudoku-cell:nth-child(n+19):nth-child(-n+27), .fh-sudoku-cell:nth-child(n+46):nth-child(-n+54) { border-bottom: 2px solid color-mix(in srgb, var(--fh-ink3) 55%, transparent); border-radius: 0 0 4px 4px; }
.fh-sudoku-cell:nth-child(9n+4):nth-child(n+19):nth-child(-n+27), .fh-sudoku-cell:nth-child(9n+4):nth-child(n+46):nth-child(-n+54), .fh-sudoku-cell:nth-child(9n+7):nth-child(n+19):nth-child(-n+27), .fh-sudoku-cell:nth-child(9n+7):nth-child(n+46):nth-child(-n+54) { border-radius: 0 0 0 4px; }

.fh-tetris-wrap { display: flex; gap: 14px; align-items: flex-start; }
.fh-tetris-board { display: grid; border: 1px solid var(--fh-line); border-radius: 8px; background: var(--fh-panel); overflow: hidden; }
.fh-tetris-cell { width: 22px; height: 22px; }
.fh-tetris-side { display: flex; flex-direction: column; gap: 10px; font-size: 12.5px; color: var(--fh-ink2); min-width: 110px; }
.fh-tetris-next { display: grid; gap: 2px; }

/* ---- Mini 播放器激活时，面板内底部工具条整体让位（播放器是 body 层 fixed，会盖住面板底栏） ---- */
body.fh-has-mini .fh-reader-foot { bottom: var(--fh-mini-h); }
body.fh-has-mini .fh-reader-sheet { bottom: calc(var(--fh-mini-h) + 52px); }
body.fh-has-mini .fh-reader-chapters { max-height: calc(70% - var(--fh-mini-h)); }
body.fh-has-mini .fh-reader-body { padding-bottom: calc(var(--fh-mini-h) + 8px); } /* 阅读正文滚到最后不被 mini 条盖住（含章末导航） */
body.fh-has-mini .fh-comic-body { padding-bottom: var(--fh-mini-h); }
body.fh-has-mini .fh-game-body { padding-bottom: var(--fh-mini-h); }
body.fh-has-mini .fh-lightbox-bar { margin-bottom: var(--fh-mini-h); }
/* 影视全屏播放时隐藏音乐 mini 条与悬浮球：视频有自己的声音，两者叠加互相遮挡 */
body.fh-video-open .fh-player-mini, body.fh-video-open .fh-player-icon { display: none; }

/* ---- 全局播放器 ---- */
.fh-player-root { position: fixed; z-index: 260; font-size: 13px; color: var(--fh-ink); }
/* 迷你条上方的播放列表面板 */
.fh-queue-pop { position: fixed; right: 14px; bottom: 70px; z-index: 272; width: min(360px, 92vw);
  max-height: 48vh; display: flex; flex-direction: column; overflow: hidden;
  background: color-mix(in srgb, var(--fh-panel) 96%, transparent); backdrop-filter: blur(16px);
  border: 1px solid var(--fh-line); border-radius: var(--fh-r-lg); box-shadow: 0 14px 44px rgba(0,0,0,.35);
  animation: fh-rise .18s ease both; }
.fh-queue-pop .head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 8px 14px;
  font-size: 12.5px; font-weight: 600; }
.fh-queue-pop .list { flex: 1; overflow-y: auto; padding: 0 8px 10px; }

.fh-player-mini { position: fixed; left: 0; right: 0; bottom: 0; z-index: 260; display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: color-mix(in srgb, var(--fh-panel) 94%, transparent); border-top: 1px solid var(--fh-line); backdrop-filter: blur(14px); }
.fh-player-mini img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; background: var(--fh-panel-2); flex: none; }
.fh-player-cover-fallback { width: 42px; height: 42px; border-radius: 8px; background: var(--fh-panel-2); display: flex; align-items: center; justify-content: center; color: var(--fh-ink3); flex: none; }
.fh-player-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.fh-player-title { font-weight: 550; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fh-player-sub { color: var(--fh-ink3); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fh-player-bar { height: 3px; border-radius: 999px; background: var(--fh-line); overflow: hidden; cursor: pointer; flex: 1; min-width: 60px; margin: 0 4px; }
.fh-player-bar i { display: block; height: 100%; background: var(--fh-accent-grad); }
.fh-player-icon { position: fixed; z-index: 261; width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--fh-line); background: var(--fh-panel); color: var(--fh-ink); display: flex; align-items: center; justify-content: center; cursor: grab; box-shadow: 0 8px 26px rgba(0,0,0,.4); overflow: hidden; }
.fh-player-icon:active { cursor: grabbing; }
.fh-player-icon img { width: 100%; height: 100%; object-fit: cover; }
.fh-player-panel { position: fixed; left: 50%; transform: translateX(-50%); bottom: 0; z-index: 262; width: min(760px, calc(100vw - 32px)); max-height: min(66vh, 560px); background: var(--fh-panel); border: 1px solid var(--fh-line); border-bottom: none; border-radius: var(--fh-r-lg) var(--fh-r-lg) 0 0; box-shadow: 0 -14px 50px rgba(0,0,0,.4); display: flex; flex-direction: column; animation: fh-panel-up .22s ease both; overflow: hidden; }
@keyframes fh-panel-up { from { transform: translateX(-50%) translateY(24px); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }

/* ---- 沉浸式全屏播放器：左栏 36% 封面+控制 / 右栏 64% 宽歌词 ---- */
.fh-fs { position: fixed; inset: 0; z-index: 450; display: flex; align-items: stretch;
  animation: fh-rise .25s ease both; background: #0b0c10; overflow: hidden; }
.fh-fs-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  filter: blur(72px) saturate(1.5) brightness(.62); transform: scale(1.25); }
.fh-fs-veil { position: absolute; inset: 0; background:
  linear-gradient(100deg, rgba(8, 9, 14, .88) 0%, rgba(8, 9, 14, .55) 42%, rgba(8, 9, 14, .72) 100%); }
.fh-fs-left { position: relative; flex: 0 0 36%; min-width: 300px; max-width: 460px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  padding: 48px 40px; }
.fh-fs-cover { width: min(300px, 34vh); height: min(300px, 34vh); border-radius: 18px; object-fit: cover;
  box-shadow: 0 26px 90px rgba(0,0,0,.6); }
.fh-fs-cover.ph { display: flex; align-items: center; justify-content: center;
  background: var(--fh-panel-2); color: var(--fh-ink3); }
.fh-fs-title { font-size: 22px; font-weight: 700; text-align: center; color: #f2f4fa;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-fs-sub { font-size: 13px; color: rgba(222, 228, 242, .68); max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fh-fs-progress { width: 100%; max-width: 340px; display: flex; align-items: center; gap: 10px;
  color: rgba(222, 228, 242, .6); font-size: 11.5px; font-variant-numeric: tabular-nums; }
.fh-fs-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  max-width: 340px; color: rgba(222, 228, 242, .6); }
.fh-fs-collapse { position: absolute; top: 16px; right: 16px; z-index: 3;
  background: rgba(12, 14, 20, .5); backdrop-filter: blur(8px); }
.fh-fs-right { position: relative; flex: 1; min-width: 0; display: flex; }

/* 宽歌词：最大 880px，当前行高亮放大、其余降亮度；点击跳转；手动滚动暂停跟随 */
.fh-lyrics-wide { position: relative; flex: 1; overflow-y: auto; padding: 12vh 8px 14vh;
  width: 100%; max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px;
  mask-image: linear-gradient(transparent 0, #000 9%, #000 88%, transparent 100%);
  -webkit-mask-image: linear-gradient(transparent 0, #000 9%, #000 88%, transparent 100%);
  scrollbar-width: thin; }
.fh-lyr-line { border: none; background: none; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 4px; padding: 2px 6px; border-radius: 8px;
  color: rgba(226, 231, 244, .42); font-size: calc(var(--fh-lyr-fs, 24px) * .66);
  transition: color .25s, transform .25s; line-height: 1.5; word-break: break-word; }
.fh-lyr-line:hover { color: rgba(226, 231, 244, .72); }
.fh-lyr-line.is-active { color: #ffffff; transform: translateX(4px); }
.fh-lyr-line.is-active .txt { font-size: var(--fh-lyr-fs, 24px); font-weight: 680; }
.fh-lyr-line .trans { font-size: calc(var(--fh-lyr-fs, 24px) * .52); opacity: .78; }
.fh-lyr-size { position: sticky; top: 0; align-self: flex-end; z-index: 2; display: flex; gap: 6px; }
.fh-lyr-size button { font-size: 11px; padding: 4px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.16); background: rgba(12,14,20,.45); color: rgba(226,231,244,.75);
  backdrop-filter: blur(6px); }
.fh-lyr-size button:hover { color: #fff; border-color: rgba(255,255,255,.4); }
.fh-lyr-hint, .fh-lyr-empty { flex: 1; display: flex; flex-direction: column; gap: 10px;
  align-items: center; justify-content: center; color: rgba(226, 231, 244, .55); }
.fh-lyr-empty .big { font-size: 24px; font-weight: 650; color: rgba(240, 243, 250, .85); }
.fh-lyr-empty .sub { font-size: 13px; }

/* 队列侧抽屉：右侧滑入，半透明毛玻璃，不遮挡播放主体 */
.fh-fs-queue { position: absolute; top: 0; right: 0; bottom: 0; z-index: 4; width: min(360px, 88vw);
  background: rgba(13, 15, 22, .82); backdrop-filter: blur(18px); border-left: 1px solid rgba(255,255,255,.09);
  transform: translateX(100%); transition: transform .25s ease; display: flex; flex-direction: column; }
.fh-fs-queue.is-open { transform: none; }
.fh-fs-queue .head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 8px 16px;
  color: rgba(236, 240, 250, .85); font-size: 13px; font-weight: 600; }
.fh-fs-queue .list { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
.fh-fs-queue .fh-row { color: rgba(226, 231, 244, .72); border-color: rgba(255,255,255,.06); }
.fh-fs-queue .fh-row:hover { background: rgba(255,255,255,.06); }
.fh-fs-queue .fh-row.is-playing { color: var(--fh-accent); }

/* 窄屏：左右分栏退化为上下结构 */
@media (max-width: 860px) {
  .fh-fs { flex-direction: column; overflow-y: auto; }
  .fh-fs-left { flex: none; max-width: none; min-width: 0; padding: 56px 24px 8px; }
  .fh-fs-right { flex: none; min-height: 46vh; }
  .fh-lyrics-wide { padding: 4vh 6px 8vh; }
}
.fh-player-ctrl { display: flex; align-items: center; gap: 10px; }
.fh-player-ctrl .main { width: 44px; height: 44px; border-radius: 50%; background: var(--fh-accent-grad); border: none; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 14px color-mix(in srgb, var(--fh-accent) 45%, transparent); }
.fh-player-ctrl .side { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--fh-line); background: none; color: var(--fh-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
`
