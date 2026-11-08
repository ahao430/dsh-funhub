// Legado JS 规则子集：@js: / <js>…</js> / {{}} 内 JS / java 助手 / put-get 跨调用 / 兼容判定 / 子进程网络管线。
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { parse } from 'node-html-parser'
import { evalRule, evalTemplate, sourceCompatibility, ruleUsesJs } from '../src/host/legado.js'
import { extractJsCode, runRuleJs } from '../src/host/legado-js.js'

/* extractJsCode：@js: 前缀 与 <js>…</js> 包裹 */
{
  assert.equal(extractJsCode('@js:result.trim()'), 'result.trim()')
  assert.equal(extractJsCode('<js>var a=1; a</js>'), 'var a=1; a')
  assert.ok(ruleUsesJs('class.x@text||@js:result'), '|| 回退段中的 @js: 仍被识别')
}

/* evalRule：JS 段作为回退/主规则执行，result 绑定页面原文 */
{
  const ctx = { root: parse('<div id="t">hello</div>'), raw: '<div id="t">hello</div>', baseUrl: 'https://x.com/' }
  const v = evalRule('id.t@text||@js:"js-" + result.length', ctx)
  assert.equal(v, 'hello', '声明式段命中则不轮到 JS')
  const v2 = evalRule('id.nope@text||@js:"js-" + result.length', ctx)
  assert.equal(v2, 'js-23', '声明式段落空 → JS 回退段生效')
  const v3 = evalRule('@js:JSON.parse(result).data[0].title', { raw: '{"data":[{"title":"书名"}]}', json: { data: [{ title: '书名' }] } })
  assert.equal(v3, '书名')
}

/* {{}} 模板：java 助手 + JS 表达式 */
{
  const out = evalTemplate('{{java.base64Encode(key)}}', { key: 'abc' })
  assert.equal(out, Buffer.from('abc').toString('base64'))
  const out2 = evalTemplate('{{java.md5Encode16(key)}}', { key: 'test' })
  assert.equal(out2, crypto16('test'))
  const out3 = evalTemplate('{{java.urlEncode(key)}}', { key: '斗破苍穹' })
  assert.equal(out3, encodeURIComponent('斗破苍穹'))
  const out4 = evalTemplate('https://a.com/s?q={{key}}&p={{page}}', { key: 'x', page: 3 })
  assert.equal(out4, 'https://a.com/s?q=x&p=3', '普通模板不受影响')
}

/* put/get 跨调用传值（同源 kv） */
{
  const kv = new Map()
  const r1 = runRuleJs('java.put("token", "t-" + key)', { key: 'A', kv })
  assert.equal(r1, 't-A')
  const r2 = runRuleJs('java.get("token")', { kv })
  assert.equal(r2, 't-A', '下一次调用取到上一次 put 的值')
}

/* 沙箱安全：无宿主对象；执行超时受控 */
{
  assert.throws(() => runRuleJs('process.exit(1)'), /JS 规则执行失败|process/, '无 process')
  assert.throws(() => runRuleJs('while(true){}'), /timeout|执行超时|timed out/i, '死循环被超时打断')
  const v = runRuleJs('return 40 + 2')
  assert.equal(v, '42', '顶层 return 以函数包裹执行')
}

/* 子进程网络管线：fetcher 仍拦截内网/坏地址（无外网依赖） */
{
  assert.throws(() => runRuleJs('java.ajax("http://127.0.0.1:9/x")'), /JS 网络请求失败|SSRF|内网|失败/, '内网地址被 fetcher 拒绝')
}

/* 兼容判定：JS 不再判死，登录仍不兼容 */
{
  const jsSource = { searchUrl: '<js>key</js>', ruleSearch: { name: '@js:x' }, ruleContent: { content: '@js:r' } }
  const c1 = sourceCompatibility(jsSource)
  assert.equal(c1.compatible, true, '纯 JS 源视为兼容（真实可用性由探测决定）')
  assert.deepEqual(c1.issues, [])
  const c2 = sourceCompatibility({ searchUrl: 'https://a.com?q={{key}}', loginUrl: 'https://a.com/login' })
  assert.equal(c2.compatible, false)
  assert.ok(c2.issues[0].includes('登录'))
}

/* 内容规则走 HTML 链 + JS 混合的常见形态：JS 段用 result 处理整页 */
{
  const html = '<div class="content">第一段</div><div class="content">第二段</div>'
  const v = evalRule('<js>result.split("第二段").length + "段"</js>', { root: parse(html), raw: html })
  assert.equal(v, '2段')
}

function crypto16(s) {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex').slice(8, 24)
}

console.log('legado-js-test: all assertions passed')
