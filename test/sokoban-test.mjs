// 推箱子测试：
// 1) 关卡合法性（箱子数=目标数、有玩家）；
// 2) 走子语义（撞墙/推箱/连推/推不动）；
// 3) 可解性：推箱专用 BFS（玩家可达域归一 + 一次推动为一步），状态数远小于全移动搜索。
import assert from 'node:assert/strict'
import { LEVELS, parseLevel, sokobanMove, sokobanCleared } from '../src/client/games/sokoban-engine.js'

/* ---------- 玩家可达域（不推箱的纯移动泛洪） ---------- */
function reach(state) {
  const { w, h } = state
  const seen = new Set([state.player])
  const stack = [state.player]
  while (stack.length) {
    const cur = stack.pop()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = cur + dx + dy * w
      const x = n % w, y = Math.floor(n / w)
      if (x < 0 || x >= w || y < 0 || y >= h) continue
      if (state.walls.has(n) || state.boxes.has(n) || seen.has(n)) continue
      seen.add(n)
      stack.push(n)
    }
  }
  return seen
}

/** 按推动次数的 BFS：返回最优推动数，不可解 -1，状态超限 -2。 */
function solvePushes(state, limit = 200_000) {
  const key = (s) => [...s.boxes].sort((a, b) => a - b).join(',') + '|' + reachRegion(s)
  function reachRegion(s) {
    // 玩家区域用可达域中的最小格子号归一（同域不同站位视为同一状态）
    const r = reach(s)
    return Math.min(...r)
  }
  const seen = new Set([key(state)])
  let frontier = [{ s: state, d: 0 }]
  while (frontier.length) {
    const next = []
    for (const { s, d } of frontier) {
      if (sokobanCleared(s)) return d
      const r = reach(s)
      for (const b of s.boxes) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const behind = b - dx - dy * s.w
          if (!r.has(behind)) continue // 玩家到不了推箱位
          const beyond = b + dx + dy * s.w
          if (s.walls.has(beyond) || s.boxes.has(beyond)) continue
          const pushed = sokobanMove({ ...s, player: behind }, dx, dy)
          if (!pushed.moved) continue
          const k = key(pushed.state)
          if (seen.has(k)) continue
          seen.add(k)
          if (seen.size > limit) return -2
          next.push({ s: pushed.state, d: d + 1 })
        }
      }
    }
    frontier = next
  }
  return -1
}

/* ---------- 关卡合法性 ---------- */
for (const [i, rows] of LEVELS.entries()) {
  const st = parseLevel(rows)
  assert.ok(st.player >= 0, `关卡${i + 1} 缺少玩家`)
  assert.equal(st.boxes.size, st.goals.size, `关卡${i + 1} 箱子数与目标数应相等`)
  assert.ok(st.boxes.size >= 1, `关卡${i + 1} 至少一个箱子`)
}

/* ---------- 走子语义 ---------- */
{
  const st = parseLevel(['#####', '#@$.#', '#####'])
  assert.equal(sokobanMove(st, 0, -1).moved, false, '上方是墙不可走')
  const right = sokobanMove(st, 1, 0)
  assert.equal(right.moved, true)
  assert.equal(right.pushed, true)
  assert.ok(sokobanCleared(right.state), '一步推箱入目标即通关')
  const wall = parseLevel(['######', '#@$##', '######'])
  assert.equal(sokobanMove(wall, 1, 0).moved, false, '箱后是墙不可推')
  const two = parseLevel(['#######', '#@$ . #', '#######'])
  const r2 = sokobanMove(two, 1, 0)
  assert.ok(r2.moved && r2.pushed)
  assert.equal([...r2.state.boxes][0], r2.state.player + 1, '箱被推到下一格')
  assert.equal(sokobanCleared(parseLevel(['#####', '#@*.#', '#####'])), true, '箱已在目标上即通关态')
}

/* ---------- 全关卡可解性（按推动数）+ 难度单调不减 ---------- */
let solved = 0
let prev = 0
for (const [i, rows] of LEVELS.entries()) {
  const best = solvePushes(parseLevel(rows))
  assert.notEqual(best, -1, `关卡${i + 1} 不可解！`)
  assert.notEqual(best, -2, `关卡${i + 1} 状态空间超限`)
  assert.ok(best >= 2, `关卡${i + 1} 太简单（${best} 推）`)
  assert.ok(best >= prev - 1, `关卡${i + 1}（${best} 推）比上一关（${prev} 推）骤降`)
  assert.ok(best <= 26, `关卡${i + 1} 最优 ${best} 次推动过多`)
  console.log(`  关卡${i + 1}：最优 ${best} 推`)
  prev = best
  solved += 1
}
assert.ok(solved >= 30, `关卡数量应 ≥ 30，实际 ${solved}`)
assert.ok(LEVELS[0] && solvePushes(parseLevel(LEVELS[0])) >= 3, '第一关也不该是一推即过的教学关')

console.log('推箱子测试全部通过')
