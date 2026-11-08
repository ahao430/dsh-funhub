// 历史 op 语义验证：novel_history / comic_history 去重置顶、上限裁剪、字段规范化。
import assert from 'node:assert/strict'
import { OPS } from '../src/host/ops.js'

const base = () => ({
  novelHistory: [],
  comicHistory: [],
})

/* 小说历史：同 bookId 去重置顶，字段兜底 */
{
  const s = base()
  OPS.novel_history(s, { bookId: 'b1', sourceId: 'legado:x', title: '书一', author: '作者', cover: 'c', chapterIndex: 3, chapterTitle: '第四章' })
  OPS.novel_history(s, { bookId: 'b2', sourceId: 'legado:x', title: '书二', chapterIndex: 0, chapterTitle: '第一章' })
  OPS.novel_history(s, { bookId: 'b1', sourceId: 'legado:x', title: '书一', chapterIndex: 5, chapterTitle: '第六章' })
  assert.equal(s.novelHistory.length, 2, '同书去重')
  assert.equal(s.novelHistory[0].bookId, 'b1', '重读置顶')
  assert.equal(s.novelHistory[0].chapterIndex, 5)
  assert.equal(s.novelHistory[1].bookId, 'b2')
  assert.equal(s.novelHistory[1].sourceId, 'legado:x')
  // 字段兜底（unshift 置顶 → b3 在最前）
  OPS.novel_history(s, { bookId: 'b3' })
  assert.equal(s.novelHistory[0].sourceId, 'gutenberg')
  assert.equal(s.novelHistory[0].title, '未知书目')
  assert.equal(typeof s.novelHistory[0].updatedAt, 'number')
}

/* 漫画历史：comicId@sourceKey 去重置顶 */
{
  const s = base()
  OPS.comic_history(s, { sourceKey: 'ikanman', comicId: 'c1', title: '漫一', cover: 'x', chapterId: 'ep1', chapterTitle: '第1话' })
  OPS.comic_history(s, { sourceKey: 'ikanman', comicId: 'c2', title: '漫二', chapterId: 'ep9', chapterTitle: '第9话' })
  OPS.comic_history(s, { sourceKey: 'ikanman', comicId: 'c1', title: '漫一', cover: 'x', chapterId: 'ep5', chapterTitle: '第5话' })
  assert.equal(s.comicHistory.length, 2, '同漫画去重')
  assert.equal(s.comicHistory[0].comicId, 'c1', '重读置顶')
  assert.equal(s.comicHistory[0].chapterId, 'ep5')
  assert.equal(s.comicHistory[1].comicId, 'c2')
  assert.equal(s.comicHistory[1].sourceKey, 'ikanman')
  // 不同源同 id 不合并
  OPS.comic_history(s, { sourceKey: 'goda', comicId: 'c1', title: '漫一(GoDa)', chapterId: 'e1', chapterTitle: '话' })
  assert.equal(s.comicHistory.length, 3, '跨源不合并')
}

/* 上限裁剪：超过 200 条裁掉最旧的 */
{
  const s = base()
  for (let i = 0; i < 205; i++) OPS.novel_history(s, { bookId: `b${i}`, title: `t${i}` })
  assert.equal(s.novelHistory.length, 200)
  assert.equal(s.novelHistory[0].bookId, 'b204', '最新在最前')
  assert.equal(s.novelHistory[199].bookId, 'b5', '最旧被裁')
  const s2 = base()
  for (let i = 0; i < 205; i++) OPS.comic_history(s2, { sourceKey: 'k', comicId: `c${i}` })
  assert.equal(s2.comicHistory.length, 200)
}

/* 客户端真实载荷形状（comic.jsx / novel.jsx 现网调用）可被接受 */
{
  const s = base()
  OPS.comic_history(s, { sourceKey: 'ikanman', comicId: '12345', title: '爱看漫示例', cover: '', chapterId: 'ch-9', chapterTitle: '第09话' })
  OPS.novel_history(s, { bookId: 'gutenberg:1342', sourceId: 'gutenberg', title: '傲慢与偏见', author: 'Austen', cover: '', chapterIndex: 12, chapterTitle: 'Chapter 13' })
  const c = s.comicHistory[0]
  assert.equal(`${c.comicId}@${c.sourceKey}`, '12345@ikanman')
  const n = s.novelHistory[0]
  assert.equal(n.chapterTitle, 'Chapter 13')
}

console.log('历史 op 语义验证全部通过')
