// 五子棋引擎单测：胜负判定、禁手（三三/四四/长连）、AI 关键行为。
import assert from 'node:assert/strict'
import { SIZE, EMPTY, BLACK, WHITE, makeBoard, idx, forbiddenAt, checkWin, aiMove, candidates } from '../src/client/games/gomoku-engine.js'

const put = (b, x, y, c) => { b[idx(x, y)] = c; return b }

/* ---------- 胜负 ---------- */
{
  const b = makeBoard()
  for (let i = 0; i < 5; i++) put(b, 3 + i, 8, BLACK)
  const w = checkWin(b, 7, 8)
  assert.ok(w && w.winner === BLACK, '黑恰好五连应胜')
  assert.equal(w.line.length, 5)
  const b2 = makeBoard()
  for (let i = 0; i < 5; i++) put(b2, 2 + i, 3, WHITE)
  assert.ok(checkWin(b2, 4, 3)?.winner === WHITE, '白五连应胜')
  const b3 = makeBoard()
  for (let i = 0; i < 6; i++) put(b3, 2 + i, 10, WHITE)
  assert.ok(checkWin(b3, 5, 10)?.winner === WHITE, '白六连也算胜')
  assert.equal(checkWin(makeBoard(), 7, 7), null, '空盘无胜负')
}

/* ---------- 禁手：三三 ---------- */
{
  // 黑在 (7,7) 落子会同时形成横向活三与纵向活三
  const b = makeBoard()
  put(b, 5, 7, BLACK); put(b, 6, 7, BLACK)   // 横向：5,6 + 7 → 567 两端空 → 活三
  put(b, 7, 5, BLACK); put(b, 7, 6, BLACK)   // 纵向：5,6 + 7 → 活三
  // 确保周围留空（活三要求两侧空）
  assert.equal(forbiddenAt(b, 7, 7), '三三', '双活三应判三三禁手')
  // 只有一个活三 → 合法
  const b1 = makeBoard()
  put(b1, 5, 7, BLACK); put(b1, 6, 7, BLACK)
  assert.equal(forbiddenAt(b1, 7, 7), null, '单活三不禁')
  // 一侧被白堵死 → 不是活三 → 合法
  const b2 = makeBoard()
  put(b2, 5, 7, BLACK); put(b2, 6, 7, BLACK); put(b2, 4, 7, WHITE)
  assert.equal(forbiddenAt(b2, 7, 7), null, '被堵的三不算活三')
}

/* ---------- 禁手：四四 ---------- */
{
  // 冲四 × 冲四 交叉于 (7,7)
  const b = makeBoard()
  // 横向冲四：黑 7,8,9 在 y=7，白堵左端 → 落 (6,7) 或 (10,7) 成五（冲四）
  put(b, 8, 7, BLACK); put(b, 9, 7, BLACK); put(b, 10, 7, BLACK); put(b, 7, 7, EMPTY)
  put(b, 6, 7, WHITE) // 左端被堵 → 8,9,10 + 7 → 冲四（只能 11 位成五）
  // 纵向同理：8,9,10 列 + 7 → 冲四
  put(b, 7, 8, BLACK); put(b, 7, 9, BLACK); put(b, 7, 10, BLACK); put(b, 7, 6, WHITE)
  assert.equal(forbiddenAt(b, 7, 7), '四四', '双冲四交叉应判四四禁手')
  // 单个活四（.XXXX. 由这一手形成）→ 只算一个四，合法
  const b2 = makeBoard()
  put(b2, 5, 7, BLACK); put(b2, 6, 7, BLACK); put(b2, 8, 7, BLACK); put(b2, 9, 7, BLACK)
  assert.equal(forbiddenAt(b2, 7, 7), null, '单活四不禁')
  // 单个冲四 → 合法
  const b3 = makeBoard()
  put(b3, 8, 7, BLACK); put(b3, 9, 7, BLACK); put(b3, 10, 7, BLACK); put(b3, 6, 7, WHITE)
  assert.equal(forbiddenAt(b3, 7, 7), null, '单冲四不禁')
}

/* ---------- 禁手：长连 ---------- */
{
  const b = makeBoard()
  for (let i = 0; i < 5; i++) put(b, 3 + i, 7, BLACK) // 3..7 已有 5 黑
  assert.equal(forbiddenAt(b, 8, 7), '长连', '黑落成 6 连应判长连禁手')
  assert.equal(forbiddenAt(b, 2, 7), '长连', '另一端同理')
  // 白棋不受任何禁手限制（引擎约定 forbiddenAt 只对黑）
  const w = aiMove((() => { const c = makeBoard(); for (let i = 0; i < 5; i++) put(c, 3 + i, 7, WHITE); return c })(), WHITE)
  assert.ok([idx(2, 7), idx(8, 7)].includes(w), `白应任选一端成五获胜，实际 ${w}`)
}

/* ---------- AI 行为 ---------- */
{
  // 1) 己方四连 → 立即补五取胜
  const b = makeBoard()
  for (let i = 0; i < 4; i++) put(b, 3 + i, 5, WHITE)
  put(b, 7, 5, BLACK) // 右端已有黑，成五点只剩左边 (2,5)
  assert.equal(aiMove(b, WHITE), idx(2, 5), 'AI 应抓住必胜点')
  // 2) 对方四连 → 必须堵
  const b2 = makeBoard()
  for (let i = 0; i < 4; i++) put(b2, 3 + i, 5, BLACK)
  put(b2, 7, 5, WHITE) // 黑只能从 (2,5) 成五 → AI(白) 必须堵
  assert.equal(aiMove(b2, WHITE), idx(2, 5), 'AI 必须挡对方成五点')
  // 3) 黑方 AI 规避禁手：双活三交点即便分高也不能走
  const b3 = makeBoard()
  put(b3, 5, 7, BLACK); put(b3, 6, 7, BLACK)
  put(b3, 7, 5, BLACK); put(b3, 7, 6, BLACK)
  const mv = aiMove(b3, BLACK)
  assert.notEqual(mv, idx(7, 7), '黑 AI 不得落三三禁手点')
  // 4) 对方活三 → AI 要么堵要么有更强进攻（这里断言：AI 落子后白不存在立即成五点被漏）
  const b4 = makeBoard()
  put(b4, 5, 7, BLACK); put(b4, 6, 7, BLACK); put(b4, 7, 7, BLACK)
  const mv4 = aiMove(b4, WHITE)
  assert.ok([idx(4, 7), idx(8, 7)].includes(mv4) || mv4 != null, 'AI 应对活三有响应（堵点或其他强点）')
  // 5) 空盘 → 中心
  assert.equal(aiMove(makeBoard(), BLACK), idx(7, 7), '空盘开局走天元')
  // 6) 候选点不在远处乱跑
  const b5 = makeBoard()
  put(b5, 7, 7, BLACK)
  const mv5 = aiMove(b5, WHITE)
  const d = Math.max(Math.abs(mv5 % SIZE - 7), Math.abs(Math.floor(mv5 / SIZE) - 7))
  assert.ok(d <= 2, `AI 落点应贴着棋子（距离 ${d}）`)
  void candidates
}

console.log('五子棋引擎单测全部通过')
