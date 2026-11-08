// 影视：Emby 媒体服务器（服务器由用户在设置里添加，不内置）。
// 播放经 /video/stream 代理（支持 Range）；Emby 直连流地址 Static=true，
// 浏览器能播的编解码直接播，播不了的在 UI 上提示换版本/转码。
import { safeFetchJson, safeFetchBuffer, FetchError } from './fetcher.js'

/* ================= Emby ================= */

const embyHeaders = (key) => ({ 'X-Emby-Token': String(key || ''), accept: 'application/json' })

export async function embyValidate(url, key) {
  const info = await safeFetchJson(`${url.replace(/\/$/, '')}/emby/System/Info`, { timeout: 12_000, headers: embyHeaders(key) })
  return { serverName: String(info.ServerName || 'Emby'), version: String(info.Version || '') }
}

/** 用户名密码换 token（免手动填 API Key）。 */
export async function embyAuthByName(url, username, password) {
  const res = await safeFetchJson(`${url.replace(/\/$/, '')}/emby/Users/AuthenticateByName`, {
    timeout: 15_000, requestMethod: 'POST',
    headers: { ...embyHeaders(''), 'content-type': 'application/json', 'X-Emby-Authorization': 'MediaBrowser Client="FunHub", Device="DSH", DeviceId="funhub-dsh", Version="1.0"' },
    requestBody: JSON.stringify({ Username: username, Pw: password }),
  })
  if (!res.AccessToken || !res.User?.Id) throw new FetchError('Emby 登录失败：账号或密码错误', 401)
  return { apiKey: String(res.AccessToken), userId: String(res.User.Id), name: String(res.User.Name || username) }
}

export async function embyViews(server) {
  const base = server.url.replace(/\/$/, '')
  const res = await safeFetchJson(`${base}/emby/Users/${server.userId}/Views`, { timeout: 15_000, headers: embyHeaders(server.apiKey) })
  return (res.Items || [])
    .filter((v) => !v.CollectionType || ['movies', 'tvshows', 'mixed', 'homevideos'].includes(v.CollectionType))
    .map((v) => ({ id: String(v.Id), name: String(v.Name), type: String(v.CollectionType || '') }))
}

/** 库内容墙：电影 + 剧集（Series 级，不平铺单集；单集在剧集详情里列）。 */
export async function embyItems(server, parentId, start = 0, limit = 48) {
  const base = server.url.replace(/\/$/, '')
  const qs = `?api_key=${encodeURIComponent(server.apiKey)}&ParentId=${encodeURIComponent(parentId)}&StartIndex=${start}&Limit=${limit}&Fields=Overview,ProductionYear,RunTimeTicks,RecursiveItemCount&Recursive=true&SortBy=SortName&IncludeItemTypes=Movie,Series`
  const res = await safeFetchJson(`${base}/emby/Users/${server.userId}/Items${qs}`, { timeout: 15_000, headers: embyHeaders(server.apiKey) })
  return {
    total: Number(res.TotalRecordCount || 0),
    items: (res.Items || []).map((it) => ({
      id: String(it.Id),
      name: String(it.Name),
      year: it.ProductionYear ? String(it.ProductionYear) : '',
      overview: String(it.Overview || '').slice(0, 300),
      runtime: it.RunTimeTicks ? `${Math.round(it.RunTimeTicks / 600_000_000)} 分钟` : '',
      type: it.Type === 'Series' ? 'series' : 'movie',
      episodes: Number(it.RecursiveItemCount || 0), // 剧集总集数（ChildCount 是季数）
    })),
  }
}

/** 剧集的单集列表（按 季→集 排序）。 */
export async function embyEpisodes(server, seriesId, start = 0, limit = 200) {
  const base = server.url.replace(/\/$/, '')
  const qs = `?api_key=${encodeURIComponent(server.apiKey)}&ParentId=${encodeURIComponent(seriesId)}&StartIndex=${start}&Limit=${limit}&Fields=Overview,ProductionYear,RunTimeTicks,IndexNumber,ParentIndexNumber,MediaSources&Recursive=true&SortBy=ParentIndexNumber,IndexNumber,SortName&IncludeItemTypes=Episode`
  const res = await safeFetchJson(`${base}/emby/Users/${server.userId}/Items${qs}`, { timeout: 15_000, headers: embyHeaders(server.apiKey) })
  return {
    total: Number(res.TotalRecordCount || 0),
    items: (res.Items || []).map((it) => ({
      id: String(it.Id),
      name: String(it.Name || `第 ${it.IndexNumber || '?'} 集`),
      season: Number(it.ParentIndexNumber || 1),
      episode: Number(it.IndexNumber || 0),
      overview: String(it.Overview || '').slice(0, 200),
      runtime: it.RunTimeTicks ? `${Math.round(it.RunTimeTicks / 600_000_000)} 分钟` : '',
      year: it.ProductionYear ? String(it.ProductionYear) : '',
      type: 'episode',
    })),
  }
}

export async function embyDetail(server, id) {
  const base = server.url.replace(/\/$/, '')
  const res = await safeFetchJson(`${base}/emby/Users/${server.userId}/Items/${id}`, {
    timeout: 15_000,
    headers: embyHeaders(server.apiKey),
  })
  const sources = (res.MediaSources || []).map((ms) => {
    const streams = ms.MediaStreams || []
    const videoCodec = String(streams.find((st) => st.Type === 'Video')?.Codec || '').toLowerCase()
    const container = String(ms.Container || '').toLowerCase()
    // 浏览器 <video> 播放面：mp4 + h264/vp9 最稳；mkv/hevc 基本播不了 → 需要 Emby 转码 HLS
    const directPlay = (container === 'mp4' || container === 'm4v' || container === 'webm')
      && !['hevc', 'h265', 'av1'].includes(videoCodec)
    // 字幕流：Emby 可把 ssa/srt/mov_text 统一转 webvtt 输出（Stream.vtt），前端挂 <track> 播
    const subtitles = streams
      .filter((st) => st.Type === 'Subtitle')
      .map((st) => ({
        index: Number(st.Index),
        lang: String(st.Language || st.LanguageTag || ''),
        label: String(st.DisplayTitle || st.Title || st.Language || `字幕 ${st.Index}`),
        codec: String(st.Codec || ''),
        isExternal: st.IsExternal !== false,
      }))
    return {
      id: String(ms.Id),
      name: String(ms.Name || '默认版本'),
      container,
      videoCodec,
      directPlay,
      subtitles,
    }
  })
  return {
    id: String(res.Id),
    name: String(res.SeriesName ? `${res.SeriesName} · ${res.Name}` : res.Name),
    overview: String(res.Overview || '').slice(0, 600),
    year: res.ProductionYear ? String(res.ProductionYear) : '',
    type: res.Type === 'Series' ? 'series' : res.Type === 'Episode' ? 'episode' : 'movie',
    sources,
  }
}

/** Emby 直连流地址（Static=true 走原始文件，浏览器能播的编解码直接播）。 */
export function embyStreamUrl(server, itemId, msId) {
  const base = server.url.replace(/\/$/, '')
  return `${base}/emby/Videos/${itemId}/stream?Static=true&MediaSourceId=${encodeURIComponent(msId)}&api_key=${encodeURIComponent(server.apiKey)}`
}

/** Emby HLS 转码地址：强制 h264/aac（浏览器通吃），mkv/hevc 等浏览器放不了的用它播。
 *  必须自带 PlaySessionId：否则该 Emby 版本生成的分片带空会话 ID，取分片会 400（Parameter 'key'）。 */
export function embyHlsUrl(server, itemId, msId) {
  const base = server.url.replace(/\/$/, '')
  const psid = `${Date.now().toString(16)}-${Math.random().toString(36).slice(2, 10)}`
  return `${base}/emby/Videos/${itemId}/master.m3u8?MediaSourceId=${encodeURIComponent(msId)}&api_key=${encodeURIComponent(server.apiKey)}&VideoCodec=h264&AudioCodec=aac&AudioStreamIndex=1&VideoBitrate=6000000&TranscodingMaxAudioChannels=2&PlaySessionId=${psid}&TranscodeReasons=VideoCodecNotSupported`
}

/** Emby 字幕流地址：ssa/srt/mov_text 等统一转 webvtt（api_key 不出宿主，由路由代理）。 */
export function embySubtitleUrl(server, itemId, msId, streamIndex) {
  const base = server.url.replace(/\/$/, '')
  return `${base}/emby/Videos/${itemId}/${msId}/Subtitles/${streamIndex}/Stream.vtt?api_key=${encodeURIComponent(server.apiKey)}`
}

/** 服务端远程字幕搜索（依赖 Emby 服务器 OpenSubtitles 插件；无插件/无结果返回空列表）。 */
export async function embyRemoteSubtitles(server, itemId, language = 'chi') {
  const base = server.url.replace(/\/$/, '')
  const res = await safeFetchJson(`${base}/emby/Items/${itemId}/RemoteSearch/Subtitles/${encodeURIComponent(language)}`, {
    timeout: 20_000, headers: embyHeaders(server.apiKey),
  })
  const list = Array.isArray(res) ? res : []
  return list.map((s) => ({
    id: String(s.Id ?? s.SubtitleId ?? ''),
    providerName: String(s.ProviderName || ''),
    name: String(s.Name || s.Title || '未命名字幕'),
    format: String(s.Format || s.ThreeLetterISOLanguageName || ''),
    language: String(s.Languages?.[0] || s.Language || language),
    author: String(s.Author || ''),
    downloads: Number(s.Downloads || 0),
  })).filter((s) => s.id)
}

/** 服务端下载并挂载远程字幕（POST 后 Emby 把字幕挂到该条目，重新拉详情即可见新字幕流）。 */
export async function embyDownloadSubtitle(server, itemId, sub) {
  const base = server.url.replace(/\/$/, '')
  await safeFetchJson(`${base}/emby/Items/${itemId}/RemoteSearch/Subtitle`, {
    timeout: 60_000, requestMethod: 'POST',
    headers: { ...embyHeaders(server.apiKey), 'content-type': 'application/json' },
    requestBody: JSON.stringify({
      ProviderName: sub.providerName, Id: sub.id,
      Language: sub.language || 'chi',
    }),
  })
  return { ok: true }
}

/* ================= m3u8 代理重写 ================= */

/** 把 m3u8 里的子播放列表/分片地址改写为经由 /funhub/api/video/stream 代理的绝对地址（api_key 不出宿主）。 */
export function rewriteM3u8(text, playlistUrl) {
  const base = new URL(playlistUrl)
  const wrapStream = (u) => `/funhub/api/video/stream?u=${encodeURIComponent(new URL(u, base).href)}`
  const wrapPlaylist = (u) => `/funhub/api/video/m3u8?u=${encodeURIComponent(new URL(u, base).href)}`
  return String(text)
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) {
        // 属性里的 URI="..."（密钥等）改写为流代理
        return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrapStream(u)}"`)
      }
      // 非 # 行是地址：.m3u8 的是子播放列表（master→变体），其余是媒体分片
      return /\.m3u8(\?|$)/i.test(t) ? wrapPlaylist(t) : wrapStream(t)
    })
    .join('\n')
}

/** Emby 海报地址（带 api_key，经宿主图片代理加载）。 */
export function embyPosterUrl(server, itemId) {
  const base = server.url.replace(/\/$/, '')
  return `${base}/emby/Items/${itemId}/Images/Primary?maxWidth=300&api_key=${encodeURIComponent(server.apiKey)}`
}

export { safeFetchBuffer }
