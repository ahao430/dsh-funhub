// 内置音乐搜索通道：为洛雪音源脚本提供标准 musicInfo。
// 洛雪自定义源协议本身不含搜索（搜索由宿主实现），这里实现网易/酷我公开搜索接口。
import { safeFetchJson, safeFetchText, FetchError } from './fetcher.js'

const COMMON_HEADERS = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  referer: 'https://music.163.com/',
}

/** 网易云搜索（公开 web API，无需登录）。 */
export async function searchNetease(key, page = 1) {
  const limit = 30
  const offset = (page - 1) * limit
  const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(key)}&type=1&offset=${offset}&total=true&limit=${limit}`
  const data = await safeFetchJson(url, { headers: COMMON_HEADERS, timeout: 15_000 })
  const songs = data?.result?.songs
  if (!Array.isArray(songs)) throw new FetchError(data?.msg || '网易云搜索失败')
  return songs.map((song) => ({
    id: `wy-${song.id}`,
    channel: 'wy',
    name: song.name || '',
    singer: (song.artists || []).map((a) => a.name).join('/'),
    albumName: song.album?.name || '',
    interval: song.duration ? Math.round(song.duration / 1000) : undefined,
    cover: song.album?.picUrl || '',
    musicInfo: {
      id: String(song.id),
      songmid: String(song.id),
      hash: String(song.id),
      name: song.name || '',
      singer: (song.artists || []).map((a) => a.name).join('/'),
      albumName: song.album?.name || '',
      interval: song.duration ? Math.round(song.duration / 1000) : 0,
      albumId: song.album?.id ? String(song.album.id) : '',
    },
  }))
}

/** 酷我搜索（移动端 r.s 接口，无需凭据）。 */
export async function searchKuwo(key, page = 1) {
  const rn = 30
  const url = `https://search.kuwo.cn/r.s?all=${encodeURIComponent(key)}&ft=music&client=kt&cluster=0&rn=${rn}&pn=${Math.max(1, page)}&encoding=utf8&rformat=json&ver=mbox&vipver=1`
  const text = await safeFetchText(url, { timeout: 15_000, headers: { referer: 'https://www.kuwo.cn/' } })
  // 响应是 JSONP 壳包裹的 JSON：showRC({...}) 或直接 JSON
  const cleaned = text.trim().replace(/^[\w$.]+\(([\s\S]*)\);?$/, '$1')
  let data
  try {
    data = JSON.parse(cleaned)
  } catch {
    throw new FetchError('酷我搜索返回格式异常')
  }
  const list = data?.musiclist || data?.absrecord || []
  if (!Array.isArray(list) || !list.length) throw new FetchError('酷我搜索无结果')
  return list.slice(0, 30).map((item) => {
    const id = item.MUSICID || item.musicrid?.replace('MUSIC_', '') || item.music_id
    const durationSec = item.DURATION ? Math.round(Number(item.DURATION) / 1000) : (item.duration ? Math.round(Number(item.duration)) : 0)
    return {
      id: `kw-${id}`,
      channel: 'kw',
      name: item.NAME || item.name || '',
      singer: item.ARTIST || item.artist || '',
      albumName: item.ALBUM || item.album || '',
      interval: durationSec || undefined,
      cover: item.web_albumpic_short ? `https://img1.kuwo.cn/star/albumcover/${item.web_albumpic_short}` : (item.pic || ''),
      musicInfo: {
        id: String(id),
        songmid: String(id),
        hash: String(id),
        name: item.NAME || item.name || '',
        singer: item.ARTIST || item.artist || '',
        albumName: item.ALBUM || item.album || '',
        interval: durationSec,
        albumId: item.ALBUMID ? String(item.ALBUMID) : '',
      },
    }
  })
}

export const SEARCH_CHANNELS = {
  wy: { name: '网易云', search: searchNetease },
  kw: { name: '酷我', search: searchKuwo },
}
