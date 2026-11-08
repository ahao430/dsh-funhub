// 音效模块基础验证：Node（无 window/AudioContext）下加载与调用必须安全无副作用，
// 开关状态可切换且持久化调用不抛错（localStorage 缺失走兜底）。
import assert from 'node:assert/strict'
import { sfx } from '../src/client/games/sfx.js'

assert.equal(typeof sfx.play, 'function')
assert.equal(typeof sfx.setEnabled, 'function')
assert.equal(typeof sfx.enabled, 'boolean')

// 所有具名音效在无 AudioContext 环境下静默 no-op，不抛错
const store = await import('../src/client/games/sfx.js')
for (const name of ['move', 'rotate', 'lock', 'clear', 'over', 'win', 'eat', 'flip', 'match', 'miss', 'boom', 'flag', 'push', 'goal', 'bad', 'merge', 'place']) {
  assert.doesNotThrow(() => sfx.play(name), `音效 ${name} 不应抛错`)
}
assert.doesNotThrow(() => sfx.play('不存在的名字'), '未知音效名应静默')

// 开关切换 + 状态回读
const before = sfx.enabled
sfx.setEnabled(!before)
assert.equal(sfx.enabled, !before, 'setEnabled 应翻转 enabled')
sfx.setEnabled(before) // 还原，避免影响其他用例的持久化假象
assert.equal(sfx.enabled, before)

// module 内部不应在加载期访问 window（SSR 冒烟环境无 window）
assert.equal(typeof window, 'undefined', '测试环境应无 window（模拟 SSR）')
void store

console.log('音效模块测试全部通过')
