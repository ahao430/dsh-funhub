// RSS 正文转义修复验证：单/双/三重转义还原、混合内容不动、纯文本防丢字、出口再消毒。
import assert from 'node:assert/strict'
import { parseFeed, repairEscapedHtml } from '../src/host/rss.js'
import { sanitizeHtml } from '../src/host/sanitize.js'

/* repairEscapedHtml 语义 */
assert.equal(repairEscapedHtml('&lt;p&gt;你好&lt;/p&gt;'), '<p>你好</p>', '单次转义还原')
assert.equal(repairEscapedHtml('&amp;lt;p&amp;gt;你好&amp;lt;/p&amp;gt;'), '<p>你好</p>', '双重转义还原')
assert.equal(repairEscapedHtml('&amp;amp;lt;p&amp;amp;gt;三重&amp;amp;lt;/p&amp;amp;gt;'), '<p>三重</p>', '三重转义还原')
assert.equal(repairEscapedHtml('<p>真实<i>标签</i></p>'), '<p>真实<i>标签</i></p>', '真实标签幂等')
assert.equal(repairEscapedHtml('<p>真实标签 + 内嵌 &lt;b&gt;转义&lt;/b&gt;</p>'), '<p>真实标签 + 内嵌 &lt;b&gt;转义&lt;/b&gt;</p>', '混合内容不动')
assert.equal(repairEscapedHtml('心情 &lt;都不错&gt; 继续'), '心情 &lt;都不错&gt; 继续', '纯文本里的类标签不丢字')
assert.equal(repairEscapedHtml('&#60;p&#62;数字实体&#60;/p&#62;'), '<p>数字实体</p>', '数字实体转义还原')
assert.equal(repairEscapedHtml(''), '', '空串')

/* parseFeed 全链：双重转义正文 + 双重转义 bilibili iframe */
{
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rawHtml = '<p>看这个视频：</p><iframe src="https://player.bilibili.com/player.html?bvid=BV1xx411c7mD" allowfullscreen></iframe><p>完</p>'
  const xml = `<rss><channel><item><title>测试</title><link>https://x</link><content:encoded><![CDATA[${esc(esc(rawHtml))}]]></content:encoded></item></channel></rss>`
  const parsed = parseFeed(xml)
  const content = parsed.articles[0].content
  assert.equal(content, rawHtml, '双重转义经 parseFeed 完整还原')
  const clean = sanitizeHtml(content, { proxyImages: true })
  assert.ok(clean.includes('<p>看这个视频：</p>'), '段落渲染保留')
  assert.ok(clean.includes('player.bilibili.com/player.html'), 'bilibili iframe 白名单放行')
  assert.ok(!clean.includes('allowfullscreen></iframe>'), 'iframe 由白名单通道重建（自闭合）')
}

/* 出口兜底语义（publicState 内联逻辑）：修复出的真实 HTML 必须重新消毒 */
{
  const stored = '&lt;p&gt;文&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src="https://e.example/a.jpg"&gt;'
  const fixed = repairEscapedHtml(stored)
  assert.notEqual(fixed, stored, '应发生修复')
  const served = sanitizeHtml(fixed, { proxyImages: true })
  assert.ok(!served.includes('script'), 'script 被消毒剥离')
  assert.ok(served.includes('/funhub/img?u='), 'img 走代理')
  // 已消毒内容（真实标签）幂等跳过，不再重复处理
  assert.equal(repairEscapedHtml(served), served, '出口幂等')
}

console.log('RSS 转义修复验证全部通过')
