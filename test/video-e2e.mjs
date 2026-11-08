// 影视路由 E2E（临时 DSH_HOME + stub fetch）：仅 Emby（TVBox 已移除）。
// Emby 登录/媒体库/详情（key 不出宿主）→ stream 代理（Range 直通）→ 连通性检测（失败保留）。
import './lib/failfast.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'funhub-video-'))
process.env.DSH_HOME = home

/* ---- 上游 stub ---- */
const EMBY_VIEWS = { Items: [{ Id: 'lib1', Name: '电影', CollectionType: 'movies' }, { Id: 'lib2', Name: '播放列表', CollectionType: 'playlist' }] }
const EMBY_ITEMS = { TotalRecordCount: 2, Items: [
  { Id: 'it1', Name: '海洋', ProductionYear: 2003, Type: 'Movie', Overview: '纪录片', RunTimeTicks: 6_000_000_000 * 10, RecursiveItemCount: 0 },
  { Id: 'ser1', Name: '测试剧', ProductionYear: 2024, Type: 'Series', Overview: '剧集', RecursiveItemCount: 20 },
] }
const EMBY_EPISODES = { TotalRecordCount: 2, Items: [
  { Id: 'ep1', Name: '第一集', Type: 'Episode', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 6_000_000_000 * 4 },
  { Id: 'ep2', Name: '第二集', Type: 'Episode', ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 6_000_000_000 * 4 },
] }
const EMBY_EPISODE_DETAIL = { Id: 'ep1', SeriesName: '测试剧', Name: '第一集', Type: 'Episode', Overview: '剧情', ProductionYear: 2024, MediaSources: [{ Id: 'mse1', Name: '1080p', Container: 'mkv', MediaStreams: [{ Type: 'Video', Codec: 'hevc' }, { Type: 'Audio', Codec: 'aac' }, { Type: 'Subtitle', Index: 2, Codec: 'srt', Language: 'chn', DisplayTitle: 'chn (SRT)', IsExternal: true }, { Type: 'Subtitle', Index: 3, Codec: 'ssa', Language: 'eng', DisplayTitle: 'eng (SSA)', IsExternal: true }] }] }
const EMBY_ITEM1_DETAIL = { Id: 'it1', Name: '海洋', Type: 'Movie', Overview: '纪录片', ProductionYear: 2003, MediaSources: [{ Id: 'ms1', Name: '4K', Container: 'mp4', MediaSources: undefined, MediaStreams: [{ Type: 'Video', Codec: 'h264' }, { Type: 'Audio', Codec: 'aac' }] }] }
const VTT_TEXT = 'WEBVTT\n\n00:01.000 --> 00:03.000\n测试字幕行\n'
const REMOTE_SUBS = [{ Id: 'sub-1', ProviderName: 'OpenSubtitles', Name: '测试剧 S01E01 简体&英文', Format: 'srt', Languages: ['chi'], Downloads: 128 }]
const HLS_MASTER = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4953600\nmain.m3u8?PlaySessionId=s1\n'
const HLS_SUB = '#EXTM3U\n#EXTINF:6,\nhls1/main/0.ts?PlaySessionId=s1\n'

const realFetch = globalThis.fetch
const jsonRes = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
globalThis.fetch = async (input, init = {}) => {
  const u = String(input instanceof URL ? input.href : input)
  if (u.includes('93.184.216.99')) throw new TypeError('fetch failed') // 永远连不上的死服务器
  if (u.includes('/emby/Users/AuthenticateByName')) return jsonRes({ AccessToken: 'tok-1', User: { Id: 'u-1', Name: 'watcher' } })
  if (u.includes('/emby/System/Info')) return jsonRes({ ServerName: 'HomeEmby', Version: '4.8' })
  if (u.includes('/emby/Users/u-1/Views')) return jsonRes(EMBY_VIEWS)
  if (u.includes('/emby/Users/u-1/Items/ep1')) return jsonRes(EMBY_EPISODE_DETAIL) // 详情要先于列表匹配
  if (u.includes('/emby/Users/u-1/Items/it1')) return jsonRes(EMBY_ITEM1_DETAIL)
  if (u.includes('/emby/Users/u-1/Items') && u.includes('IncludeItemTypes=Episode')) return jsonRes(EMBY_EPISODES)
  if (u.includes('/emby/Users/u-1/Items')) return jsonRes(EMBY_ITEMS)
  if (u.includes('/master.m3u8')) return new Response(HLS_MASTER, { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
  if (u.includes('/main.m3u8')) return new Response(HLS_SUB, { status: 200, headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
  if (u.includes('/hls1/main/0.ts')) return new Response(Buffer.from([0x47, 0x01, 0x02, 0x03]), { status: 200, headers: { 'content-type': 'video/mp2t' } })
  if (u.includes('/RemoteSearch/Subtitles/chi')) return jsonRes(REMOTE_SUBS) // 必须在 /Subtitles/ 兜底之前
  if (u.includes('/RemoteSearch/Subtitle')) return jsonRes({ ok: true })
  if (u.includes('/Subtitles/2/Stream.vtt')) return new Response(VTT_TEXT, { status: 200, headers: { 'content-type': 'text/vtt' } })
  /* OpenSubtitles 公共字幕站（stub） */
  if (u.includes('api.opensubtitles.com/api/v1/subtitles?')) {
    return jsonRes({ data: [
      { attributes: { feature_details: { title: '测试剧', season_number: 1, episode_number: 1 }, release: 'Test.S01E01.CHS', language: 'zh-cn', download_count: 88, ratings: 4.2, files: [{ file_id: 9001, file_name: 'Test.S01E01.CHS.srt' }] } },
      { attributes: { feature_details: { title: '测试剧', season_number: 1, episode_number: 1 }, release: 'Test.PACK', language: 'zh-cn', download_count: 12, files: [{ file_id: 9002, file_name: 'Test.PACK.zip' }] } },
    ] })
  }
  if (u.includes('api.opensubtitles.com/api/v1/download')) {
    if (String(init?.body || '').includes('9002')) {
      return jsonRes({ link: 'https://93.184.215.37/pack.zip', file_name: 'Test.PACK.zip' })
    }
    return jsonRes({ link: 'https://93.184.215.37/chs.srt', file_name: 'Test.S01E01.CHS.srt' })
  }
  if (u.includes('93.184.215.37/chs.srt')) return new Response('1\n00:00:01,000 --> 00:00:03,000\n你好世界\n', { status: 200, headers: { 'content-type': 'text/plain' } })
  if (u.includes('93.184.215.37/pack.zip')) return new Response(Buffer.from([0x50, 0x4b, 0x03, 0x04]), { status: 200, headers: { 'content-type': 'application/zip' } })
  /* SubtitleCat（免 Key 提供方）stub */
  if (u.includes('subtitlecat.com/index.php?search=')) {
    return new Response('<table><tr><td>xx</td></tr><tr><td><a href="subs/1/Test.Movie.html">Test.Movie 2024</a> (translated from Japanese)</td><td></td><td></td><td></td><td></td></tr><tr><td><a href="subs/2/另一部.html">另一部剧</a></td><td></td><td></td><td></td><td></td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } })
  }
  if (u.includes('subtitlecat.com/subs/1/Test.Movie-zh-CN.srt')) {
    return new Response('1\n00:00:01,000 --> 00:00:03,000\n字幕站中文台词\n', { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  if (u.includes('subtitlecat.com/subs/1/Test.Movie.html')) {
    return new Response('<html><body><a href="/subs/1/Test.Movie-zh-CN.srt">中文</a><a href="/subs/1/Test.Movie-en.srt">English</a><a href="/subs/1/Test.Movie-ja.srt">日本語</a></body></html>', { status: 200, headers: { 'content-type': 'text/html' } })
  }
  if (u.includes('/Subtitles/')) return new Response('WEBVTT\n\n00:00.000 --> 00:01.000\neng\n', { status: 200, headers: { 'content-type': 'text/vtt' } })
  // 通用字节流（海报/视频段）
  return new Response(Buffer.from('DATA'), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
}

const { apply } = await import('../src/host/index.js')
const registered = []
apply({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  webServer: { register(route) { registered.push(route) } },
  get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
})
const route = registered.find((r) => r.kind === 'prefix' && r.path === '/funhub')

const makeRes = () => {
  const res = { statusCode: 0, chunks: [], headers: {}, setHeader(k, v) { this.headers[k] = v }, write(c) { this.chunks.push(c) }, end(b) { if (b != null) this.chunks.push(b) } }
  res.json = () => JSON.parse(Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString() || '{}')
  res.text = () => Buffer.concat(res.chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c)))).toString()
  return res
}
const call = async (path, method = 'GET', payload = null, headers = {}) => {
  const body = payload == null ? null : Buffer.from(JSON.stringify(payload))
  const r = makeRes()
  await route.handler({ url: `/funhub/api/${path}`, method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, async *[Symbol.asyncIterator]() { if (body) yield body } }, r)
  return r
}

try {
  /* 1) Emby：账密登录 → 入库 → 媒体库 → 详情（apiKey 不出宿主） */
  const auth = await call('video/emby/auth', 'POST', { url: 'https://93.184.215.37', username: 'watcher', password: 'pw' })
  assert.equal(auth.statusCode, 200)
  const server = auth.json().server
  assert.equal(server.apiKey, 'tok-1')
  assert.equal(server.userId, 'u-1')
  const addOp = await call('op', 'POST', { op: 'video_emby_add', server })
  assert.equal(addOp.statusCode, 200)

  let st = (await call('state')).json().state.settings.video
  assert.equal(st.emby.length, 1)
  assert.equal(st.tvbox, undefined, 'TVBox 已移除，不应再有 tvbox 字段')
  const pubState = (await call('state')).json().state
  assert.equal(pubState.settings.video.emby[0].apiKey, undefined, 'publicState 必须剥 apiKey')

  const views = await call('video/emby/views?server=' + st.emby[0].id)
  const vlist = views.json().views
  assert.equal(vlist.length, 1, 'playlist 类型媒体库被过滤')
  assert.equal(vlist[0].name, '电影')

  const items = await call(`video/emby/items?server=${st.emby[0].id}&parent=lib1`)
  const list = items.json().items
  assert.equal(list.length, 2)
  assert.equal(list[0].type, 'movie')
  assert.equal(list[1].type, 'series')
  assert.equal(list[1].episodes, 20, '剧集显示总集数（RecursiveItemCount）')
  assert.ok(list[0].poster.startsWith('/funhub/img?u='), '海报代理化')

  const edet = await call(`video/emby/detail?server=${st.emby[0].id}&id=it1`)
  const ed = edet.json().detail
  assert.equal(ed.sources.length, 1)
  assert.equal(ed.sources[0].directPlay, true, 'mp4/h264 可直连')
  assert.ok(ed.sources[0].url.startsWith('/funhub/api/video/stream?u='), '直连地址代理化')
  assert.ok(ed.sources[0].url.includes(encodeURIComponent('api_key=tok-1')), 'api_key 在宿主侧拼接')
  assert.ok(ed.sources[0].hlsUrl.startsWith('/funhub/api/video/m3u8?u='), '转码地址代理化')

  /* 剧集：单集列表 + mkv/hevc 单集走转码 */
  const eps = await call(`video/emby/episodes?server=${st.emby[0].id}&series=ser1`)
  const epList = eps.json().items
  assert.equal(epList.length, 2)
  assert.equal(epList[0].season, 1)
  assert.equal(epList[0].episode, 1)
  const epDet = await call(`video/emby/detail?server=${st.emby[0].id}&id=ep1`)
  const epd = epDet.json().detail
  assert.equal(epd.sources[0].directPlay, false, 'mkv/hevc 不可直连')
  assert.ok(epd.sources[0].hlsUrl.includes(encodeURIComponent('PlaySessionId=')), 'HLS 带会话 ID（缺它分片 400）')

  /* 字幕：detail 提取字幕流 → vtt 代理 → 远程搜索 → 下载挂载 */
  const subs = epd.sources[0].subtitles
  assert.equal(subs.length, 2, '字幕流被提取')
  assert.equal(subs[0].index, 2)
  assert.equal(subs[0].lang, 'chn')
  assert.ok(subs[0].url.startsWith('/funhub/api/video/subtitle?'), '字幕地址经代理（api_key 不出宿主）')
  const vttRes = await call(`video/subtitle?server=${st.emby[0].id}&item=ep1&source=mse1&index=2`)
  assert.equal(vttRes.statusCode, 200)
  assert.ok(vttRes.headers['content-type'].includes('text/vtt'), 'vtt content-type')
  assert.ok(vttRes.text().startsWith('WEBVTT'), '字幕内容是 WEBVTT')
  assert.ok(!vttRes.text().includes('tok-1'), 'api_key 不泄漏')
  const search = await call(`video/subtitles/search?server=${st.emby[0].id}&item=ep1&lang=chi`)
  assert.equal(search.json().list.length, 1, '远程字幕搜索返回 1 条')
  assert.equal(search.json().list[0].providerName, 'OpenSubtitles')
  const dl = await call('video/subtitles/download', 'POST', { server: st.emby[0].id, item: 'ep1', providerName: 'OpenSubtitles', subId: 'sub-1', language: 'chi' })
  assert.equal(dl.json().ok, true, '远程字幕下载挂载')

  /* 公共字幕站（OpenSubtitles）：存 Key → 搜索映射 → srt 下载转 vtt → 压缩包 base64 */
  await call('op', 'POST', { op: 'settings_save', settings: { video: { subtitleProviders: { opensubtitlesKey: 'osk-test' } } } })
  const osSearch = await call('video/subtitles/web-search?kw=测试剧&lang=zh-cn&season=1&episode=1')
  const osList = osSearch.json().list
  assert.equal(osList.length, 4, '合并搜索：OS 2 + SC 2')
  assert.equal(osList[0].fileId, '9001')
  assert.equal(osList[0].fileName, 'Test.S01E01.CHS.srt')
  assert.equal(osList[0].season, 1)
  const osDl = await call('video/subtitles/web-download', 'POST', { fileId: '9001' })
  assert.equal(osDl.json().kind, 'vtt')
  assert.ok(osDl.json().vtt.includes('WEBVTT') && osDl.json().vtt.includes('你好世界'), 'srt 宿主转 vtt')
  const osDl2 = await call('video/subtitles/web-download', 'POST', { fileId: '9002' })
  assert.equal(osDl2.json().kind, 'archive')
  assert.ok(osDl2.json().base64.length > 0, '压缩包 base64 落盘')

  /* SubtitleCat 免 Key 流程：合并搜索 → 详情变体（中文排前）→ srt 下载转 vtt */
  const merged = await call('video/subtitles/web-search?kw=测试&lang=zh-cn')
  const mergedList = merged.json().list
  assert.ok(mergedList.length >= 3, `合并搜索 ≥3（OS 2 + SC 1），实际 ${mergedList.length}`)
  const scItem = mergedList.find((s) => s.provider === 'subtitlecat')
  assert.ok(scItem, 'SubtitleCat 条目在合并列表中')
  assert.ok(scItem.detailUrl.includes('subtitlecat.com'), '详情页地址')
  const vars = await call('video/subtitles/web-detail', 'POST', { detailUrl: scItem.detailUrl })
  const scVariants = vars.json().list
  assert.equal(scVariants.length, 3, "3 个语言变体")
  assert.equal(scVariants[0].lang, "zh-CN", "中文变体排最前")
  const scDl = await call('video/subtitles/web-download', 'POST', { provider: 'subtitlecat', url: scVariants[0].url })
  assert.equal(scDl.json().kind, 'vtt')
  assert.ok(scDl.json().vtt.includes('字幕站中文台词'), 'srt 已转 vtt')
  // 非法地址拒绝
  const bad = await call('video/subtitles/web-detail', 'POST', { detailUrl: 'https://93.184.215.37/x' })
  assert.notEqual(bad.statusCode, 200, '非 subtitlecat.com 域名被拒')

  /* HLS 代理链：master 重写 → 子列表重写 → 分片 stream 直通（MPEG-TS 魔数） */
  const hlsMasterUrl = epd.sources[0].hlsUrl.replace('/funhub/api/video/m3u8?u=', '')
  const m = await call('video/m3u8?u=' + hlsMasterUrl)
  const mText = m.text()
  assert.ok(mText.includes('/funhub/api/video/m3u8?u='), 'master 的子列表行被代理化')
  const subLine = mText.split('\n').find((l) => l && !l.startsWith('#'))
  const subU = decodeURIComponent(new URL(subLine, 'http://x').searchParams.get('u'))
  const sub = await call('video/m3u8?u=' + encodeURIComponent(subU))
  const subText = sub.text()
  const segLine = subText.split('\n').find((l) => l && !l.startsWith('#'))
  assert.ok(segLine.startsWith('/funhub/api/video/stream?u='), '分片行被代理化')
  const seg = await call('video/stream?u=' + decodeURIComponent(new URL(segLine, 'http://x').searchParams.get('u')))
  assert.equal(seg.statusCode, 200)
  assert.equal(seg.text().charCodeAt(0), 0x47, '分片是 MPEG-TS（0x47 起头）')

  /* 2) stream 直通（含 Range 转发）——Emby 直连播放走这里 */
  const s1 = await call('video/stream?u=' + encodeURIComponent('https://93.184.215.35/seg001.ts'), 'GET', null, { range: 'bytes=0-3' })
  assert.equal(s1.statusCode, 200)
  assert.equal(s1.text(), 'DATA')

  /* 3) TVBox 路由已移除：tvbox/import 与 site/* 应 404/未知 */
  const gone = await call('video/tvbox/import', 'POST', { text: '{}' })
  assert.notEqual(gone.statusCode, 200, 'tvbox/import 应已下线')
  const goneSite = await call('video/site/classes?key=x')
  assert.notEqual(goneSite.statusCode, 200, 'video/site/* 应已下线')

  /* 4) 连通性检测：在线 Emby 可用 + 离线 Emby 记失败（一律保留不删除） */
  await call('op', 'POST', { op: 'video_emby_add', server: { url: 'https://93.184.216.99', apiKey: 'k', userId: 'u', name: '离线Emby' } })
  st = (await call('state')).json().state.settings.video
  assert.equal(st.emby.length, 2)

  const start = await call('video/clean-dead', 'POST')
  assert.equal(start.statusCode, 200)
  assert.equal(start.json().total, 2, '只含 Emby')
  let progress
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 50))
    progress = (await call('video/clean-progress')).json().progress
    if (!progress.running) break
  }
  assert.equal(progress.running, false, '检测应在轮询窗口内结束')
  assert.equal(progress.ok, 1, '在线 Emby 可用')
  assert.equal(progress.failed, 1, '离线 Emby 记失败')
  assert.ok(progress.failedNames.includes('离线Emby'), '失败 Emby 记名')
  st = (await call('state')).json().state.settings.video
  assert.equal(st.emby.length, 2, 'Emby 一律保留')

  console.log('影视路由 E2E 全部通过')
} finally {
  globalThis.fetch = realFetch
  rmSync(home, { recursive: true, force: true })
}
