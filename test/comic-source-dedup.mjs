// 漫画源去重：同 key 导入幂等（不再堆几百条）+ 存量重复迁移清洗。
// 背景：历史版本 comicsource_add 不去重，同一清单重复导入 17 次 → 33 个源堆成 578 行。
import assert from 'node:assert/strict'
import { OPS } from '../src/host/ops.js'
import { migrate, newId } from '../src/host/store.js'

// ---- 1. 首次导入：新增 ----
{
  const state = { comicSources: [] }
  const r = OPS.comicsource_add(state, { script: '// v1', info: { key: 'picacg', name: '拷贝漫画', version: '1.0' }, error: null })
  assert.equal(r.added, true)
  assert.equal(r.updated, false)
  assert.equal(state.comicSources.length, 1)
}

// ---- 2. 同 key 再导入：原地更新，不新增；保留启用状态与账号数据 ----
{
  const state = {
    comicSources: [{
      id: 'row1', script: '// old', name: '旧名', key: 'picacg', version: '1.0',
      enabled: false, data: { token: 'abc' }, settings: {}, error: null, addedAt: 1,
    }],
  }
  const r = OPS.comicsource_add(state, { script: '// new', info: { key: 'picacg', name: '新名', version: '2.0' }, error: '接口缺失' })
  assert.equal(r.added, false)
  assert.equal(r.updated, true)
  assert.equal(state.comicSources.length, 1, '同 key 再导入不得新增行')
  const row = state.comicSources[0]
  assert.equal(row.id, 'row1', '保留原 id（运行时数据槽位不变）')
  assert.equal(row.script, '// new')
  assert.equal(row.name, '新名')
  assert.equal(row.version, '2.0')
  assert.equal(row.enabled, false, '用户手动停用过的源不被重导悄悄开启')
  assert.deepEqual(row.data, { token: 'abc' }, '账号/数据保留')
  assert.equal(row.error, '接口缺失', '新脚本的探测结果覆盖旧值')
}

// ---- 3. 无 key 的失败脚本不参与去重（便于逐条删除） ----
{
  const state = { comicSources: [] }
  OPS.comicsource_add(state, { script: '// bad1', info: {}, error: '不是有效的 venera 漫画源' })
  OPS.comicsource_add(state, { script: '// bad2', info: {}, error: '不是有效的 venera 漫画源' })
  assert.equal(state.comicSources.length, 2, '无 key 行不去重')
}

// ---- 4. migrate：存量重复清洗，同 key 保留最新（addedAt 最大） ----
{
  const rows = []
  for (let i = 0; i < 5; i++) {
    rows.push({ id: newId(), script: `// v${i}`, name: 'N', key: 'kmh', version: '', enabled: true, data: { n: i }, settings: {}, error: null, addedAt: 1000 + i })
  }
  rows.push({ id: newId(), script: '// bad', name: 'B', key: '', version: '', enabled: false, data: {}, settings: {}, error: 'x', addedAt: 999 })
  const next = migrate({ comicSources: rows })
  assert.equal(next.comicSources.length, 2, '5 条同 key + 1 条无 key → 2 条')
  const kept = next.comicSources.find((s) => s.key === 'kmh')
  assert.equal(kept.script, '// v4', '保留最新一份脚本')
  assert.deepEqual(kept.data, { n: 4 })
  assert.ok(next.comicSources.some((s) => s.key === ''), '无 key 行保留')
}

// ---- 5. migrate 幂等：清洗过的状态再过一遍不变 ----
{
  const once = migrate({ comicSources: [
    { id: 'a', key: 'k', addedAt: 1 }, { id: 'b', key: 'k', addedAt: 2 },
  ].map((s) => ({ script: '', name: '', version: '', enabled: true, data: {}, settings: {}, error: null, ...s })) })
  const twice = migrate({ comicSources: once.comicSources })
  assert.equal(twice.comicSources.length, 1)
  assert.equal(twice.comicSources[0].id, 'b')
}

console.log('comic-source-dedup: all assertions passed')
process.exit(0)
