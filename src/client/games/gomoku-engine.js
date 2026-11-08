// 五子棋（连珠规则）纯逻辑引擎：无依赖，可独立单测。
// 规则要点（连珠/Renju，只约束黑棋）：
//   · 黑棋成恰好五连获胜；六连及以上（长连）为禁手；
//   · 三三禁手：一手同时形成两个活三；
//   · 四四禁手：一手同时形成两个四（同一直线上两个独立四同样算）；
//   · 白棋无禁手，五连及以上获胜。
// 说明：活三/四的判定采用通行的一阶近似（不复判「形成的四是否又成禁手」），
//       对休闲对局足够严格；活四 .XXXX. 只算一个四（两端成五点属于同一四）。

export const SIZE = 15
export const EMPTY = 0, BLACK = 1, WHITE = 2
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]]

export const makeBoard = () => Array(SIZE * SIZE).fill(EMPTY)
export const idx = (x, y) => y * SIZE + x
export const inb = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE

/** 以 (x,y) 为中心、方向 (dx,dy) 取 9 格窗口字符串：
 *  '1'=己方（中心视为己方）、'2'=对方、'0'=空、'3'=边界。中心恒在下标 4。 */
function lineStr(board, x, y, dx, dy, color) {
  let s = ''
  for (let k = -4; k <= 4; k++) {
    if (k === 0) { s += '1'; continue } // 中心 = 候选落子点，视为己方
    const nx = x + dx * k, ny = y + dy * k
    if (!inb(nx, ny)) s += '3'
    else {
      const v = board[idx(nx, ny)]
      s += v === EMPTY ? '0' : (v === color ? '1' : '2')
    }
  }
  return s
}

/** s[i]='0' 填成 '1' 后，是否存在「恰好五连」（不与更多己方连成长连）且五连同时覆盖 i 与中心 4 */
function fillMakesExactFive(s, i) {
  const t = s.slice(0, i) + '1' + s.slice(i + 1)
  for (let j = 0; j + 5 <= t.length; j++) {
    if (t.slice(j, j + 5) === '11111'
      && t[j - 1] !== '1' && t[j + 5] !== '1'           // 恰好五，不是长连一段
      && j <= i && i <= j + 4 && j <= 4 && 4 <= j + 4) { // 五连同时含填点与中心
      return true
    }
  }
  return false
}

/** 一条线上「成五点」个数（每个成五点 = 该线可通过落一子成五的位置） */
function fivePoints(s) {
  const pts = []
  for (let i = 0; i < s.length; i++) if (s[i] === '0' && fillMakesExactFive(s, i)) pts.push(i)
  return pts
}

/** 活三（可发展为活四的三）个数：
 *  · 连活三 = 恰好 3 连（含中心 4）且两侧均为空；
 *  · 跳活三 = 010110 / 011010 形态（窗口含中心）。
 *  按极大连续段计数，天然去重。 */
function liveThreeCount(s) {
  let n = 0
  let k = 0
  while (k < s.length) {
    if (s[k] === '1') {
      let j = k
      while (j < s.length && s[j] === '1') j++
      const len = j - k
      if (len === 3 && k <= 4 && 4 < j && s[k - 1] === '0' && s[j] === '0') n += 1
      k = j
    } else k++
  }
  const gap = /(010110|011010)/g
  let m
  while ((m = gap.exec(s))) {
    if (m.index <= 4 && 4 <= m.index + 5) n += 1
    gap.lastIndex = m.index + 1
  }
  return n
}

/** 黑棋在空点 (x,y) 落子是否禁手：返回 null（合法）或 '长连' | '四四' | '三三' */
export function forbiddenAt(board, x, y) {
  let fours = 0
  let threes = 0
  for (const [dx, dy] of DIRS) {
    // 长连：直接数连续黑子（含候选点），9 格窗口装不下「5 预存 + 候选」的跨度
    let run = 1
    for (const sign of [1, -1]) {
      let nx = x + dx * sign, ny = y + dy * sign
      while (inb(nx, ny) && board[idx(nx, ny)] === BLACK) { run++; nx += dx * sign; ny += dy * sign }
    }
    if (run >= 6) return '长连'
    const s = lineStr(board, x, y, dx, dy, BLACK)
    const pts = fivePoints(s)
    if (pts.length >= 3) fours += 2                    // ≥3 个成五点必为双四
    else if (pts.length === 2) {
      // 两个成五点：若它们是同一个活四的两端（相距 5、中间恰 4 个连子）→ 只算一个四；否则同线双四
      const sameFour = pts[1] - pts[0] === 5 && /^1+$/.test(s.slice(pts[0] + 1, pts[1]))
      fours += sameFour ? 1 : 2
    } else if (pts.length === 1) fours += 1
    threes += liveThreeCount(s)
  }
  if (fours >= 2) return '四四'
  if (threes >= 2) return '三三'
  return null
}

/** 落子后胜负：返回 { winner: BLACK|WHITE, line: [idx...] } 或 null。
 *  黑必须恰好五连；白五连及以上皆胜。 */
export function checkWin(board, x, y) {
  const c = board[idx(x, y)]
  if (!c) return null
  for (const [dx, dy] of DIRS) {
    const cells = [idx(x, y)]
    for (const sign of [1, -1]) {
      let nx = x + dx * sign, ny = y + dy * sign
      while (inb(nx, ny) && board[idx(nx, ny)] === c) { cells.push(idx(nx, ny)); nx += dx * sign; ny += dy * sign }
    }
    if (cells.length >= 5) {
      if (c === BLACK && cells.length > 5) continue // 黑长连不算胜（正常不可能出现：已被禁手挡住）
      return { winner: c, line: cells }
    }
  }
  return null
}

/** 候选点：已有棋子曼哈顿/切比雪夫距离 2 内的空点；空棋盘返回中心 */
export function candidates(board) {
  const has = board.some((v) => v !== EMPTY)
  if (!has) return [idx(7, 7)]
  const out = []
  const seen = new Set()
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (board[idx(x, y)] === EMPTY) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy
      if (!inb(nx, ny)) continue
      const i = idx(nx, ny)
      if (board[i] === EMPTY && !seen.has(i)) { seen.add(i); out.push(i) }
    }
  }
  return out
}

/* ---------- 棋型评分 ---------- */
const SCORES = {
  five: 10_000_000, openFour: 500_000, four: 30_000, openThree: 25_000,
  brokenThree: 2_500, openTwo: 1_600, brokenTwo: 150,
}

function includesCenter(j, len) { return j <= 4 && 4 <= j + len - 1 }

/** 单线评分：棋型必须包含中心（候选点） */
function lineScore(s) {
  let v = 0
  if (/11111/.test(s)) return SCORES.five
  let m = /011110/.exec(s)
  if (m && includesCenter(m.index, 6)) v += SCORES.openFour
  if (fivePoints(s).length) v += SCORES.four
  for (const [re, sc] of [[/(?:011100|001110|010110|011010)/g, SCORES.openThree], [/(?:11100|00111|10011|11001|10101|2011102)/g, SCORES.brokenThree]]) {
    let mm
    while ((mm = re.exec(s))) {
      if (includesCenter(mm.index, mm[0].length)) v += sc
      re.lastIndex = mm.index + 1
    }
  }
  for (const [re, sc] of [[/(?:001100|011000|000110|010100|001010)/g, SCORES.openTwo], [/(?:211000|000112|210100|001012|10001)/g, SCORES.brokenTwo]]) {
    let mm
    while ((mm = re.exec(s))) {
      if (includesCenter(mm.index, mm[0].length)) v += sc
      re.lastIndex = mm.index + 1
    }
  }
  return v
}

/** 点位综合分：己方棋型分 + 对方棋型分（防守略降权） */
function pointScore(board, x, y, color) {
  let own = 0, opp = 0
  for (const [dx, dy] of DIRS) {
    own += lineScore(lineStr(board, x, y, dx, dy, color))
    opp += lineScore(lineStr(board, x, y, dx, dy, color === BLACK ? WHITE : BLACK))
  }
  return own + opp * 0.85
}

/** AI 走子：贪心 + 威胁优先（成五 > 挡五 > 己方活四 > 双重威胁 > 综合分 + 一层前瞻）。
 *  黑方 AI 自动规避禁手点。trace 可传数组，回填每步命中的决策层（调试用）。 */
export function aiMove(board, aiColor, trace) {
  const T = (tag, i) => { if (trace) trace.push(tag); return i }
  const opp = aiColor === BLACK ? WHITE : BLACK
  const cands = candidates(board)
  const legal = cands.filter((i) => aiColor !== BLACK || !forbiddenAt(board, i % SIZE, Math.floor(i / SIZE)))
  const pool = legal.length ? legal : cands
  const centerDist = (i) => Math.abs(i % SIZE - 7) + Math.abs(Math.floor(i / SIZE) - 7)

  const evalAt = (i, color) => {
    const x = i % SIZE, y = Math.floor(i / SIZE)
    let own = 0
    for (const [dx, dy] of DIRS) own += lineScore(lineStr(board, x, y, dx, dy, color))
    return own
  }

  // 1) 立即成五
  for (const i of pool) if (evalAt(i, aiColor) >= SCORES.five) return T('five', i)
  // 2) 挡对方立即成五
  const oppFives = pool.filter((i) => evalAt(i, opp) >= SCORES.five)
  if (oppFives.length) {
    return T('block-five', oppFives.sort((a, b) => pointScore(board, b % SIZE, Math.floor(b / SIZE), aiColor) - pointScore(board, a % SIZE, Math.floor(a / SIZE), aiColor))[0])
  }
  // 3) 己方活四（下一手必胜）
  for (const i of pool) {
    const x = i % SIZE, y = Math.floor(i / SIZE)
    for (const [dx, dy] of DIRS) {
      const m = /011110/.exec(lineStr(board, x, y, dx, dy, aiColor))
      if (m && includesCenter(m.index, 6)) return T('open-four', i)
    }
  }
  // 3.5) 双重威胁：一手同时形成「四+活三」「双活三」或「双四」——对手无法兼顾，强制胜势。
  //      黑方的三三/四四禁手点已在 pool 过滤，天然只剩合法组合（四+活三）。
  for (const i of pool) {
    const x = i % SIZE, y = Math.floor(i / SIZE)
    let foursN = 0, threesN = 0
    for (const [dx, dy] of DIRS) {
      const s = lineStr(board, x, y, dx, dy, aiColor)
      const pts = fivePoints(s)
      const sameFour = pts.length === 2 && pts[1] - pts[0] === 5 && /^1+$/.test(s.slice(pts[0] + 1, pts[1]))
      foursN += pts.length ? (pts.length >= 2 && !sameFour ? 2 : 1) : 0
      threesN += liveThreeCount(s)
    }
    if (foursN >= 2 || (foursN >= 1 && threesN >= 1) || threesN >= 2) return T('double-threat', i)
  }
  // 4) 两层极小极大：我走 → 对手最强回应，整盘 5 窗滑动作评估（攻防同看，天然会组攻势+补防守）
  const ranked = pool
    .map((i) => ({ i, s: pointScore(board, i % SIZE, Math.floor(i / SIZE), aiColor) + (24 - centerDist(i)) * 4 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
  let best = ranked[0].i
  let bestVal = -Infinity
  for (const { i } of ranked) {
    const b2 = board.slice()
    b2[i] = aiColor
    // 对手最佳回应（pointScore 挑前 8 个模拟）
    const replies = candidates(b2)
      .map((j) => ({ j, s: pointScore(b2, j % SIZE, Math.floor(j / SIZE), opp) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
    let worst = Infinity
    if (!replies.length) worst = evalBoard(b2, aiColor) - evalBoard(b2, opp)
    for (const { j } of replies) {
      const b3 = b2.slice()
      b3[j] = opp
      const val = evalBoard(b3, aiColor) - evalBoard(b3, opp) * 1.05
      if (val < worst) worst = val
      if (worst <= bestVal) break // 剪枝：不可能更好就别算了
    }
    if (worst > bestVal) { bestVal = worst; best = i }
  }
  return T('search', best)
}

/* ---------- 整盘评估：全部线（行/列/两向对角）5 窗滑动 ----------
 *  窗内无对方子时按己方子数计分：5连≫4子>3子>2子；活型出现在更多窗口里，分自然更高。 */
const W5 = { 5: 10_000_000, 4: 120_000, 3: 9_000, 2: 500, 1: 20 }

const LINES = (() => {
  const lines = []
  for (let y = 0; y < SIZE; y++) lines.push(Array.from({ length: SIZE }, (_, x) => idx(x, y)))
  for (let x = 0; x < SIZE; x++) lines.push(Array.from({ length: SIZE }, (_, y) => idx(x, y)))
  for (let s = -(SIZE - 5); s <= SIZE - 5; s++) { // ↘ 对角（y - x = s）
    const l = []
    for (let y = 0; y < SIZE; y++) { const x = y - s; if (x >= 0 && x < SIZE) l.push(idx(x, y)) }
    if (l.length >= 5) lines.push(l)
  }
  for (let s = 4; s <= 2 * SIZE - 6; s++) { // ↗ 对角（x + y = s）
    const l = []
    for (let y = 0; y < SIZE; y++) { const x = s - y; if (x >= 0 && x < SIZE) l.push(idx(x, y)) }
    if (l.length >= 5) lines.push(l)
  }
  return lines
})()

export function evalBoard(board, color) {
  let total = 0
  for (const line of LINES) total += lineScoreWindows(board, line, color)
  return total
}

function lineScoreWindows(board, line, color) {
  let v = 0
  for (let k = 0; k + 5 <= line.length; k++) {
    let ones = 0, blocked = false
    for (let m = 0; m < 5; m++) {
      const c = board[line[k + m]]
      if (c === color) ones++
      else if (c !== EMPTY) { blocked = true; break }
    }
    if (!blocked && ones >= 1) v += W5[ones] || 0
  }
  return v
}
