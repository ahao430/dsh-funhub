// URL 端口策略回归：自建服务常见端口放行（Emby 8096 等），敏感服务端口拒绝。
import assert from 'node:assert/strict'
import { assertSafeUrl } from '../src/host/fetcher.js'

// 自建媒体服务端口放行（用户报障：Emby 默认 8096 被旧白名单拒）
for (const u of ['http://route.ahao430.site:8096', 'https://emby.example.com:8920', 'http://plex.example.com:32400', 'http://navidrome.example.com:4533']) {
  assert.doesNotThrow(() => assertSafeUrl(u), `${u} 应放行`)
}
// 协议与默认端口不受影响
assert.doesNotThrow(() => assertSafeUrl('https://x.example.com/a'))
assert.doesNotThrow(() => assertSafeUrl('http://x.example.com:8080/app'))
// 敏感端口拒绝
for (const u of ['http://x.example.com:3306', 'http://x.example.com:6379', 'http://x.example.com:27017', 'http://x.example.com:2375']) {
  assert.throws(() => assertSafeUrl(u), (e) => e.message === '不允许的端口', `${u} 应拒绝`)
}
// 其余既有约束
assert.throws(() => assertSafeUrl('ftp://x.example.com/'), /仅支持 http\/https/)
assert.throws(() => assertSafeUrl('http://user:pw@x.example.com/'), /不允许携带凭据/)
assert.throws(() => assertSafeUrl('not a url'), /无效的 URL/)

console.log('URL 端口策略测试全部通过')
