// 公共字幕站检索：OpenSubtitles 官方 API（全球最大字幕库，免费注册 Key；用户在 设置 → 影视源 里填入，不内置）。
// 下载：file_id 换直链 → 拉文件 → srt/ass 宿主转 vtt 直接挂播放器；zip/rar 压缩包原样给浏览器手动解压。
// 说明：zimuku 等中文站已上反爬 JS 挑战（实测纯后端抓不到内容），故走官方 API 路线。
import { safeFetchJson, safeFetchBytes, FetchError } from './fetcher.js'

const API = 'https://api.opensubtitles.com/api/v1'

const osHeaders = (key) => ({
  'Api-Key': String(key || ''),
  'User-Agent': 'FunHub v1.0',
  accept: 'application/json',
})

/** 搜索字幕。kw=标题（剧集传剧名+季/集号）；lang 用 zh-cn / en 等 ISO 码。 */
export async function webSearchSubtitles(kw, { apiKey, lang = 'zh-cn', season, episode } = {}) {
  if (!apiKey) throw new FetchError('未配置 OpenSubtitles API Key（设置 → 影视源 里填入，opensubtitles.com 免费注册）', 400)
  if (!kw) throw new FetchError('缺少搜索关键词', 400)
  const qs = [
    `query=${encodeURIComponent(kw)}`,
    `languages=${encodeURIComponent(lang || 'zh-cn')}`,
  ]
  if (season) qs.push(`season_number=${Number(season)}`)
  if (episode) qs.push(`episode_number=${Number(episode)}`)
  const res = await safeFetchJson(`${API}/subtitles?${qs.join('&')}`, { timeout: 15_000, headers: osHeaders(apiKey) })
  return (res?.data || []).slice(0, 12).map((e) => {
    const a = e.attributes || {}
    return {
      fileId: String(a.files?.[0]?.file_id ?? ''),
      fileName: String(a.files?.[0]?.file_name || a.release || a.title || '字幕'),
      title: String(a.feature_details?.title || a.foreign_title || a.title || kw),
      release: String(a.release || '').slice(0, 60),
      language: String(a.language || a.foreign_language || lang),
      downloads: Number(a.download_count || 0),
      rating: Number(a.ratings || 0),
      season: Number(a.feature_details?.season_number || 0) || null,
      episode: Number(a.feature_details?.episode_number || 0) || null,
      full: (a.files || []).length > 1,
    }
  }).filter((s) => s.fileId)
}

/** 下载并尽量转 vtt。返回 { kind:'vtt', vtt, filename } 或 { kind:'archive', base64, filename }。 */
export async function webDownloadSubtitle(apiKey, fileId) {
  if (!apiKey) throw new FetchError('未配置 OpenSubtitles API Key', 400)
  if (!fileId) throw new FetchError('缺少字幕文件 id', 400)
  const dl = await safeFetchJson(`${API}/download`, {
    timeout: 30_000, requestMethod: 'POST',
    headers: { ...osHeaders(apiKey), 'content-type': 'application/json' },
    requestBody: JSON.stringify({ file_id: String(fileId) }),
  })
  const link = String(dl?.link || '')
  if (!link) throw new FetchError('字幕下载直链获取失败', 502)
  const filename = String(dl?.file_name || 'subtitle')
  const { buffer } = await safeFetchBytes(link, { timeout: 60_000, maxSize: 30_000_000 })
  // zip(PK 魔数)/rar/7z 压缩包 → 原样给浏览器手动解压；其余按文本字幕转 vtt
  const isArchive = /\.zip$|\.rar$|\.7z$/i.test(filename)
    || (buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  if (isArchive) {
    return { kind: 'archive', filename, base64: buffer.toString('base64') }
  }
  const text = buffer.toString('utf8')
  const vtt = /\.ass$|\.ssa$/i.test(filename) ? assToVtt(text) : srtToVtt(text)
  return { kind: 'vtt', vtt, filename }
}

/* ---------------- 字幕格式转换 ---------------- */

/** SRT → WebVTT。 */
export function srtToVtt(srt) {
  const body = String(srt || '').replace(/^\uFEFF/, '').replace(/\r+/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{1,3})/g, '$1.$2')
  return `WEBVTT\n\n${body}`
}

/** ASS/SSA → WebVTT（极简：取 [Events] Dialogue 行，剥 {} 覆写块与样式标记）。 */
export function assToVtt(ass) {
  const cues = []
  const toSec = (t) => {
    const m = /^(\d+):(\d{1,2}):(\d{2})[.,](\d{1,2})$/.exec(String(t).trim())
    if (!m) return NaN
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`${m[4]}`.padEnd(3, '0')) / 1000
  }
  let inEvents = false
  for (const line of String(ass || '').split('\n')) {
    const t = line.trim()
    if (/^\[Events\]/i.test(t)) { inEvents = true; continue }
    if (/^\[/.test(t)) { inEvents = false; continue }
    if (!inEvents || !/^Dialogue:/i.test(t)) continue
    const cols = t.slice(9).split(',')
    if (cols.length < 10) continue
    const start = toSec(cols[1]); const end = toSec(cols[2])
    const text = cols.slice(9).join(',')
      .replace(/\{[^}]*\}/g, '')      // {\pos(...)} 等覆写块
      .replace(/\\N|\\n/g, '\n')      // ASS 换行
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!text || Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
    cues.push(`${fmt(start)} --> ${fmt(end)}\n${text}\n`)
  }
  return `WEBVTT\n\n${cues.join('\n')}`
}

function fmt(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.round((sec - Math.floor(sec)) * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`
}
