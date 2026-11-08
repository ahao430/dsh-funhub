// 书源批量导入 op 语义验证：批内去重、与已有去重、无效条目跳过、计数正确。
import assert from 'node:assert/strict'
import { OPS } from '../src/host/ops.js'

const mk = (url, name) => ({ bookSourceUrl: url, bookSourceName: name || url, bookSourceGroup: '测试' })

{
  const state = { bookSources: [{ id: 'x', url: 'https://exist.example', raw: mk('https://exist.example') }] }
  const r = OPS.booksource_add_many(state, {
    sources: [
      mk('https://a.example', 'A'),
      mk('https://b.example', 'B'),
      mk('https://a.example', 'A重复'),      // 批内重复 → 跳过
      mk('https://exist.example', '已存在'), // 与库内重复 → 跳过
      null, 'not-an-object', { noUrl: 1 },   // 无效条目 → 跳过
    ],
  })
  assert.equal(r.added, 2)
  assert.equal(r.skipped, 5)
  assert.equal(state.bookSources.length, 3)
  assert.ok(state.bookSources.every((s) => s.raw && s.url), '行结构完整（raw/url）')
  const names = state.bookSources.map((s) => s.name)
  assert.deepEqual(names.slice(1), ['A', 'B'], '重复项未入列')
}

{
  const state = { bookSources: [] }
  const r = OPS.booksource_add_many(state, { sources: [] })
  assert.equal(r.added, 0)
  assert.equal(r.skipped, 0)
}

{
  // 大包冒烟：5000 个源一次调用，数量与耗时 sanity
  const state = { bookSources: [] }
  const big = Array.from({ length: 5000 }, (_, i) => mk(`https://s${i}.example`, `源${i}`))
  const t0 = Date.now()
  const r = OPS.booksource_add_many(state, { sources: big })
  const ms = Date.now() - t0
  assert.equal(r.added, 5000)
  assert.equal(state.bookSources.length, 5000)
  assert.ok(ms < 3000, `5000 源导入过慢：${ms}ms`)
  console.log(`  （5000 源批量导入耗时 ${ms}ms）`)
}

console.log('书源批量导入 op 验证全部通过')
