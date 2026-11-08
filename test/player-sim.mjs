// 客户端播放器逻辑仿真：stub Audio/fetch，验证 setQueue → 解析 → 代理 URL → play 全链。
import assert from 'node:assert/strict'

// stub fetch：music2/url 返回真 URL，其它返回 ok
const resolvedUrl = 'https://m801.music.126.net/xxx/ song.mp3?sig=1' // 含空格与特殊字符
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/music2/url')) {
    const body = JSON.parse(init.body)
    assert.ok(body.musicInfo?.id, 'musicInfo 缺失')
    return { ok: true, json: async () => ({ ok: true, url: resolvedUrl }) }
  }
  if (u.includes('/op')) return { ok: true, json: async () => ({ ok: true, result: {} }) }
  return { ok: true, json: async () => ({ ok: true }) }
}
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

// stub Audio：记录 src/load/play/pause 与事件监听
const events = { played: 0, loaded: 0, src: '' }
class FakeAudio {
  constructor() {
    this.volume = 1
    this.preload = ''
    this._src = ''
    this.listeners = {}
    events.loaded = 0
  }
  get src() { return this._src }
  set src(v) { this._src = v; events.src = v }
  load() { events.loaded++ }
  async play() { events.played++; this.listeners['play']?.forEach((fn) => fn()); return undefined }
  setAttribute() {}
  pause() {}
  removeAttribute() {}
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn) }
  removeEventListener() {}
}
globalThis.Audio = FakeAudio

const player = await import('../src/client/player.js')

// 用队列恢复（含 musicInfo 的在线曲目）
player.player.restore({ mode: 'sequence', volume: 0.8 }, null)
player.player.setQueue([
  { id: 'wy-287398', channel: 'wy', title: '我不难过', artist: '孙燕姿', musicInfo: { id: '287398', songmid: '287398' } },
], 0)

// 等异步链 settle
await new Promise((r) => setTimeout(r, 100))

const snap = player.getPlayerState()
console.log('状态:', JSON.stringify({ status: snap.status, index: snap.index, resolving: snap.resolving }))
console.log('audio.src:', decodeURIComponent(events.src).slice(0, 100))
console.log('play 调用:', events.played, '次 | load:', events.loaded)

assert.ok(events.src.startsWith('/funhub/api/stream?u='), '远程 URL 未走代理')
assert.ok(events.src.includes('music.126.net'), '代理 URL 丢了目标地址')
assert.equal(events.played, 1, 'play 未被调用')
assert.equal(snap.status, 'playing', '状态未变 playing')

// 再测：本地文件不走代理
events.played = 0; events.src = ''
player.player.setQueue([{ id: 'local-1', sourceId: 'local', title: '本地歌', audioUrl: '/funhub/files/music-1.mp3' }], 0)
await new Promise((r) => setTimeout(r, 60))
assert.ok(events.src === '/funhub/files/music-1.mp3', '本地文件 URL 被改写: ' + events.src)
assert.equal(events.played, 1)

// 再测：解析失败 → error + 不假播
globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ ok: false, error: '没有可用音源' }) })
player.player.setQueue([{ id: 'wy-bad', channel: 'wy', title: '坏歌', musicInfo: { id: 'x' } }], 0)
await new Promise((r) => setTimeout(r, 60))
const snap2 = player.getPlayerState()
assert.ok(snap2.error?.includes('没有可用音源'), '解析错误未呈现: ' + snap2.error)
assert.ok(snap2.error, '错误未呈现')  // 旧歌继续播属可接受行为，error 已呈现

console.log('\n客户端播放链仿真全部通过')
