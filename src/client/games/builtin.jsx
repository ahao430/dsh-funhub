// 内置小游戏：2048 / 扫雷 / 数独 / 俄罗斯方块。
// 自研游戏直接以组件运行（客户端无宿主权限，天然隔离）；成绩与存档经受控 API 落盘。
import { useCallback, useEffect, useMemo, useRef, useState, createElement as h } from 'react'
import { Icon, Btn, Select } from '../ui.jsx'
import { sfx } from './sfx.js'

/* ============================== 2048 ============================== */

const N2048 = 4

function board2048Slide(board, dir) {
  const next = board.map((r) => [...r])
  let moved = false
  let gained = 0
  const line = (i) => (dir === 'left' || dir === 'right') ? next[i] : next.map((r) => r[i])
  const setLine = (i, values) => {
    if (dir === 'left' || dir === 'right') next[i] = values
    else values.forEach((v, k) => { next[k][i] = v })
  }
  for (let i = 0; i < N2048; i++) {
    let cells = line(i).filter(Boolean)
    if (dir === 'right' || dir === 'down') cells.reverse()
    const merged = []
    for (let j = 0; j < cells.length; j++) {
      if (j + 1 < cells.length && cells[j] === cells[j + 1]) {
        merged.push(cells[j] * 2)
        gained += cells[j] * 2
        j++
      } else merged.push(cells[j])
    }
    while (merged.length < N2048) merged.push(0)
    if (dir === 'right' || dir === 'down') merged.reverse()
    const old = line(i)
    if (old.some((v, k) => v !== merged[k])) moved = true
    setLine(i, merged)
  }
  return { board: next, moved, gained }
}

function spawn2048(board) {
  const empty = []
  board.forEach((row, y) => row.forEach((v, x) => { if (!v) empty.push([x, y]) }))
  if (!empty.length) return board
  const [x, y] = empty[Math.floor(Math.random() * empty.length)]
  const next = board.map((r) => [...r])
  next[y][x] = Math.random() < 0.9 ? 2 : 4
  return next
}

function canMove2048(board) {
  return board.some((row, y) => row.some((v, x) => !v
    || (x + 1 < N2048 && v === row[x + 1])
    || (y + 1 < N2048 && v === board[y + 1][x])))
}

export function Game2048({ record, onSaveScore, onSaveState }) {
  // 方块对象模型：每个 tile 有稳定 id，滑动只改坐标/值 → CSS transition 平滑滑动；
  // 合并保留 id 并加弹跳类，新块 spawn 有出现动画。
  const [tiles, setTiles] = useState(() => g2048Spawn(g2048Spawn([], N2048), N2048))
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const restored = useRef(false)
  const mergedIds = useRef(new Set()) // 本步合并的 id，渲染时加 pop 类
  const newIds = useRef(new Set())    // 本步新生的 id，渲染时加 spawn 类
  const tilesRef = useRef(tiles)      // 盘面镜像：move 同帧连按也基于最新局面
  tilesRef.current = tiles

  // 恢复存档
  useEffect(() => {
    if (restored.current) return
    const saved = record?.savedState
    if (saved?.tiles?.length) {
      restored.current = true
      setTiles(saved.tiles)
      setScore(saved.score || 0)
    } else if (saved?.board) { // 旧版格子存档迁移
      restored.current = true
      const list = []
      saved.board.flat().forEach((v) => { if (v) list.push({ id: tileSeq++, r: 0, c: 0, v }) })
      // 旧存档没有坐标，按顺序铺回去
      let i = 0
      for (let r = 0; r < N2048; r++) for (let c = 0; c < N2048; c++) {
        const t = list[i]
        if (t && saved.board[r][c]) { t.r = r; t.c = c; i++ }
      }
      setTiles(list.filter((t) => t.v))
      setScore(saved.score || 0)
    }
  }, [record])

  // 存档（防抖）
  useEffect(() => {
    if (!over) onSaveState({ tiles, score })
  }, [tiles, score, over])

  const move = useCallback((dir) => {
    // 盘面走 ref 镜像：同帧连续按键也基于最新局面计算，副作用不进 setState 更新器
    const prev = tilesRef.current
    const { tiles: next, gained, moved, merged, spawned } = g2048Slide(prev, dir, N2048)
    if (!moved) return
    mergedIds.current = merged
    newIds.current = spawned
    tilesRef.current = next
    setTiles(next)
    if (gained) setScore((s) => s + gained)
    sfx.play(gained ? 'merge' : 'move')
    if (!g2048CanMove(next, N2048)) { setOver(true); sfx.play('over') }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
      if (map[e.key]) {
        e.preventDefault()
        move(map[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  useEffect(() => { if (over) onSaveScore(score) }, [over])

  const restart = () => {
    mergedIds.current = new Set()
    newIds.current = new Set()
    const fresh = g2048Spawn(g2048Spawn([], N2048), N2048)
    tilesRef.current = fresh
    setTiles(fresh)
    setScore(0)
    setOver(false)
  }

  const unit = 76 // 72px 块 + 4px 缝
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)' } },
      h('span', null, `分数 ${score}`), h('span', null, `最高 ${record?.bestScore || 0}`),
      h(Btn, { size: 'sm', onClick: restart }, '重开')),
    h('div', {
      className: 'fh-2048-board', style: { width: N2048 * unit + 8, height: N2048 * unit + 8, touchAction: 'none' },
      onPointerDown: (e) => { e.currentTarget._x = e.clientX; e.currentTarget._y = e.clientY },
      onPointerUp: (e) => {
        const dx = e.clientX - (e.currentTarget._x ?? e.clientX)
        const dy = e.clientY - (e.currentTarget._y ?? e.clientY)
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
      } },
      // 底格
      Array.from({ length: N2048 * N2048 }, (_, i) => h('div', {
        key: `bg${i}`, className: 'fh-2048-cell',
        style: { left: 8 + (i % N2048) * unit, top: 8 + Math.floor(i / N2048) * unit },
      })),
      // 方块（id 稳定 → transform 过渡生效）
      tiles.map((t) => h('div', {
        key: t.id,
        className: `fh-2048-tile${mergedIds.current.has(t.id) ? ' is-merged' : ''}${newIds.current.has(t.id) ? ' is-new' : ''}`,
        'data-v': t.v,
        style: { transform: `translate(${8 + t.c * unit}px, ${8 + t.r * unit}px)`, fontSize: t.v >= 1024 ? 16 : t.v >= 128 ? 20 : 23 },
      }, t.v)),
    ),
    over ? h('div', { className: 'fh-empty', style: { padding: 10 } }, `游戏结束 · 本局 ${score} 分`) : null,
    h('div', { className: 'fh-muted', style: { fontSize: 11.5 } }, '方向键 / 滑动 合并数字到 2048'),
  )
}

/* ---- 2048 方块引擎 ---- */
let tileSeq = 1

function g2048EmptyCells(tiles, n) {
  const taken = new Set(tiles.map((t) => t.r * n + t.c))
  const out = []
  for (let i = 0; i < n * n; i++) if (!taken.has(i)) out.push(i)
  return out
}

function g2048Spawn(tiles, n) {
  const empty = g2048EmptyCells(tiles, n)
  if (!empty.length) return tiles
  const idx = empty[Math.floor(Math.random() * empty.length)]
  const list = [...tiles, { id: tileSeq++, r: Math.floor(idx / n), c: idx % n, v: Math.random() < 0.9 ? 2 : 4 }]
  return list
}

function g2048Slide(tiles, dir, n) {
  const merged = new Set()
  const spawned = new Set()
  const byCell = new Map(tiles.map((t) => [t.r * n + t.c, t]))
  const movedTiles = []
  let gained = 0
  let moved = false

  const lineCoords = (k) => {
    const arr = []
    for (let i = 0; i < n; i++) {
      if (dir === 'left') arr.push([k, i])
      else if (dir === 'right') arr.push([k, n - 1 - i])
      else if (dir === 'up') arr.push([i, k])
      else arr.push([n - 1 - i, k])
    }
    return arr
  }

  for (let k = 0; k < n; k++) {
    const coords = lineCoords(k)
    const lineTiles = coords.map(([r, c]) => byCell.get(r * n + c)).filter(Boolean)
    let slot = 0
    for (let i = 0; i < lineTiles.length; i++) {
      const t = lineTiles[i]
      const [nr, nc] = coords[slot]
      if (i + 1 < lineTiles.length && lineTiles[i + 1].v === t.v) {
        // 合并：保留当前 id（位置滑到目标 + 值翻倍），吞掉下一块
        const nxt = lineTiles[i + 1]
        movedTiles.push({ ...t, r: nr, c: nc, v: t.v * 2 })
        merged.add(t.id)
        void nxt
        gained += t.v * 2
        i += 1
        moved = true // 原位合并也算有效步（否则 down 方向合并但不位移会被误判为不动）
      } else {
        movedTiles.push({ ...t, r: nr, c: nc })
      }
      if (nr !== t.r || nc !== t.c) moved = true
      slot += 1
    }
  }
  if (!moved) return { tiles, gained: 0, moved: false, merged, spawned }

  const withSpawn = g2048Spawn(movedTiles, n)
  const newest = withSpawn[withSpawn.length - 1]
  if (newest && !movedTiles.includes(newest)) spawned.add(newest.id)
  return { tiles: withSpawn, gained, moved: true, merged, spawned }
}

function g2048CanMove(tiles, n) {
  if (tiles.length < n * n) return true
  const byCell = new Map(tiles.map((t) => [t.r * n + t.c, t.v]))
  for (const t of tiles) {
    if (byCell.get((t.r + 1) * n + t.c) === t.v || byCell.get((t.r - 1) * n + t.c) === t.v) return true
    if (byCell.get(t.r * n + t.c + 1) === t.v || byCell.get(t.r * n + t.c - 1) === t.v) return true
  }
  return false
}

/* ============================== 扫雷 ============================== */

const MS_LEVELS = { easy: { w: 9, h: 9, mines: 10 }, normal: { w: 12, h: 12, mines: 22 }, hard: { w: 16, h: 14, mines: 44 } }

function msBuild(w, h, mines, safeIdx) {
  const cells = Array.from({ length: w * h }, (_, i) => ({ mine: false, open: false, flag: false, n: 0 }))
  const forbidden = new Set([safeIdx, ...msNeighbors(safeIdx, w, h)])
  let placed = 0
  while (placed < Math.min(mines, w * h - forbidden.size)) {
    const i = Math.floor(Math.random() * w * h)
    if (cells[i].mine || forbidden.has(i)) continue
    cells[i].mine = true
    placed++
  }
  cells.forEach((c, i) => { c.n = msNeighbors(i, w, h).filter((k) => cells[k].mine).length })
  return cells
}

function msNeighbors(i, w, h) {
  const x = i % w, y = Math.floor(i / w)
  const out = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue
    const nx = x + dx, ny = y + dy
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx)
  }
  return out
}

export function GameMinesweeper({ record, onSaveScore }) {
  const [level, setLevel] = useState('easy')
  const [cells, setCells] = useState(null)
  const [state, setState] = useState('ready') // ready | playing | won | lost
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  // 注意：不能用 `const { w, h } = …` —— h 会遮蔽模块级的 createElement 别名 h
  const { w, h: boardH, mines } = MS_LEVELS[level]

  useEffect(() => { setCells(null); setState('ready'); setElapsed(0) }, [level])

  useEffect(() => {
    if (state !== 'playing') return
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
    return () => clearInterval(timer)
  }, [state, startedAt])

  const finish = useCallback((won, secs) => {
    setState(won ? 'won' : 'lost')
    sfx.play(won ? 'win' : 'over')
    if (won) onSaveScore(Math.max(1, 1000 - secs * 5))
  }, [onSaveScore])

  const open = (idx) => {
    let board = cells
    if (state === 'ready') {
      board = msBuild(w, boardH, mines, idx)
      setCells(board)
      setState('playing')
      setStartedAt(Date.now())
    }
    if (!board) return
    const next = board.map((c) => ({ ...c }))
    if (next[idx].flag || next[idx].open) return
    if (next[idx].mine) {
      next.forEach((c) => { if (c.mine) c.open = true })
      next[idx].boom = true
      setCells(next)
      sfx.play('boom')
      finish(false, 0)
      return
    }
    const stack = [idx]
    while (stack.length) {
      const i = stack.pop()
      if (next[i].open || next[i].flag) continue
      next[i].open = true
      if (next[i].n === 0) msNeighbors(i, w, boardH).forEach((k) => { if (!next[k].open) stack.push(k) })
    }
    setCells(next)
    sfx.play('flip')
    if (next.every((c) => c.open || c.mine)) finish(true, Math.floor((Date.now() - startedAt) / 1000))
  }

  const flag = (idx, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!cells || state === 'won' || state === 'lost') return
    if (cells[idx].open) return
    const next = cells.map((c) => ({ ...c }))
    next[idx].flag = !next[idx].flag
    setCells(next)
    sfx.play('flag')
  }

  const flags = cells?.filter((c) => c.flag).length || 0

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)' } },
      h(Select, { value: level, onChange: setLevel, options: [
        { value: 'easy', label: '初级 9×9' }, { value: 'normal', label: '中级 12×12' }, { value: 'hard', label: '高级 16×14' },
      ] }),
      h('span', null, `🚩 ${flags}/${mines}`), h('span', null, `⏱ ${elapsed}s`),
      h(Btn, { size: 'sm', onClick: () => { setCells(null); setState('ready'); setElapsed(0) } }, '重开')),
    h('div', { className: 'fh-game-tiles', style: { gridTemplateColumns: `repeat(${w}, 30px)`, background: 'var(--fh-panel)', padding: 10, borderRadius: 12, border: '1px solid var(--fh-line)' } },
      Array.from({ length: w * boardH }, (_, i) => {
        const c = cells?.[i]
        return h('button', {
          key: i, className: `fh-cell-btn${c?.open ? (c.mine ? ' is-mine-open' : ' is-open') : ''}${c?.flag ? ' is-flag' : ''}`,
          onClick: () => open(i), onContextMenu: (e) => flag(i, e), disabled: state === 'won' || state === 'lost',
          style: c?.open && c.n ? { color: ['', '#4d7fd6', '#3f9b63', '#d66', '#8e5bd6', '#d0923f', '#3fa0a0', '#ccc', '#999'][c.n] || '#999' } : null,
        }, c?.flag && !c.open ? '🚩' : (c?.open ? (c.mine ? '💣' : (c.n || '')) : ''))
      })),
    state === 'won' ? h('div', { className: 'fh-empty', style: { padding: 8 } }, `🎉 通关！用时 ${elapsed}s`) : null,
    state === 'lost' ? h('div', { className: 'fh-empty', style: { padding: 8 } }, '💥 踩雷了') : null,
    h('div', { className: 'fh-muted', style: { fontSize: 11.5 } }, '左键翻开，右键插旗'),
  )
}

/* ============================== 数独 ============================== */

function sudokuMake(difficulty) {
  // 生成完整解：随机回溯
  const grid = Array.from({ length: 81 }, () => 0)
  const ok = (i, v) => {
    const x = i % 9, y = Math.floor(i / 9)
    for (let k = 0; k < 9; k++) {
      if (grid[y * 9 + k] === v || grid[k * 9 + x] === v) return false
      const bx = Math.floor(x / 3) * 3 + (k % 3), by = Math.floor(y / 3) * 3 + Math.floor(k / 3)
      if (grid[by * 9 + bx] === v) return false
    }
    return true
  }
  const fill = (i) => {
    if (i === 81) return true
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)
    for (const v of values) {
      if (ok(i, v)) {
        grid[i] = v
        if (fill(i + 1)) return true
        grid[i] = 0
      }
    }
    return false
  }
  fill(0)
  const puzzle = [...grid]
  const blanks = difficulty === 'easy' ? 36 : difficulty === 'normal' ? 46 : 54
  const order = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5)
  for (let k = 0; k < blanks; k++) puzzle[order[k]] = 0
  return { puzzle, solution: grid }
}

export function GameSudoku({ record, onSaveScore }) {
  const [difficulty, setDifficulty] = useState('easy')
  const [game, setGame] = useState(() => sudokuMake('easy'))
  const [cells, setCells] = useState(() => [...game.puzzle])
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState({})
  const [done, setDone] = useState(false)

  const restart = useCallback((level) => {
    const g = sudokuMake(level)
    setGame(g)
    setCells([...g.puzzle])
    setNotes({})
    setSelected(null)
    setDone(false)
  }, [])

  useEffect(() => { restart(difficulty) }, [difficulty])

  const put = (v) => {
    if (selected == null || game.puzzle[selected]) return
    const next = [...cells]
    next[selected] = v
    setCells(next)
    setNotes((n) => ({ ...n, [selected]: null }))
    if (v && v !== game.solution[selected]) { sfx.play('bad'); return }
    sfx.play(v ? 'place' : 'flip')
    if (next.every((c, i) => c === game.solution[i])) {
      setDone(true)
      sfx.play('win')
      const blanks = game.puzzle.filter((c) => !c).length
      onSaveScore(blanks * 10)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (/^[1-9]$/.test(e.key)) put(Number(e.key))
      else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && selected != null && !game.puzzle[selected]) put(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selVal = selected != null ? cells[selected] : 0
  const sameVal = (i) => selVal && cells[i] === selVal

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)' } },
      h(Select, { value: difficulty, onChange: setDifficulty, options: [
        { value: 'easy', label: '简单' }, { value: 'normal', label: '中等' }, { value: 'hard', label: '困难' },
      ] }),
      h(Btn, { size: 'sm', onClick: () => restart(difficulty) }, '换一局'),
      h(Btn, { size: 'sm', onClick: () => setCells([...game.solution]) }, '看答案')),
    h('div', { className: 'fh-sudoku-grid' },
      cells.map((v, i) => h('button', {
        key: i,
        className: `fh-sudoku-cell${game.puzzle[i] ? ' is-fixed' : ''}${i === selected ? ' is-selected' : ''}${sameVal(i) ? ' is-same' : ''}${v && v !== game.solution[i] ? ' is-error' : ''}`,
        onClick: () => setSelected(i),
      }, v || (notes[i] ? h('span', { style: { fontSize: 8, lineHeight: 1.1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', color: 'var(--fh-ink3)' } },
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('span', { key: n }, notes[i]?.includes(n) ? n : ''))) : ''))),
    ),
    h('div', { style: { display: 'flex', gap: 6 } },
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('button', { key: n, className: 'fh-cell-btn', style: { width: 34 }, onClick: () => put(n) }, n)),
      h('button', { className: 'fh-cell-btn', style: { width: 34 }, onClick: () => put(0), title: '清除' }, '×')),
    done ? h('div', { className: 'fh-empty', style: { padding: 8 } }, '🎉 完成！') : null,
    h('div', { className: 'fh-muted', style: { fontSize: 11.5 } }, '点击格子后按数字键填入'),
  )
}

/* ============================== 俄罗斯方块 ============================== */

const TETROMINOES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
}
const T_COLORS = { I: '#4fc3f7', O: '#ffd54f', T: '#ba68c8', S: '#81c784', Z: '#e57373', J: '#7986cb', L: '#ffb74d' }
const TW = 10, TH = 18

function tRotate(shape) {
  const h2 = shape.length, w2 = shape[0].length
  return Array.from({ length: w2 }, (_, y) => Array.from({ length: h2 }, (_, x) => shape[h2 - 1 - x][y]))
}

export function GameTetris({ record, onSaveScore, running, onPauseToggle, paused }) {
  const [board, setBoard] = useState(() => Array.from({ length: TH }, () => Array(TW).fill(null)))
  const [piece, setPiece] = useState(null)
  const [next, setNext] = useState(() => randomTetromino())
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [over, setOver] = useState(false)
  // 难度档位：起始下落间隔（ms），随行数加速；选择持久化
  const [diff, setDiff] = useState(() => {
    try { return localStorage.getItem('funhub.tetris.diff') || 'normal' } catch { return 'normal' }
  })
  const TETRIS_DIFFS = { slow: 760, normal: 560, fast: 380, insane: 240 }
  const level = Math.floor(lines / 10) + 1
  const speed = useMemo(() => Math.max(90, (TETRIS_DIFFS[diff] || 560) - lines * 22), [diff, lines])
  const boardRef = useRef(board)
  const pieceRef = useRef(piece)
  boardRef.current = board
  pieceRef.current = piece

  const collide = useCallback((b, p) => {
    if (!p) return false
    return p.shape.some((row, dy) => row.some((v, dx) => {
      if (!v) return false
      const x = p.x + dx, y = p.y + dy
      return x < 0 || x >= TW || y >= TH || (y >= 0 && b[y][x])
    }))
  }, [])

  const spawn = useCallback(() => {
    const p = { ...next, x: Math.floor((TW - next.shape[0].length) / 2), y: 0 }
    setNext(randomTetromino())
    if (collide(boardRef.current, p)) {
      setOver(true)
      sfx.play('over')
      return
    }
    setPiece(p)
  }, [next, collide])

  const lock = useCallback(() => {
    const p = pieceRef.current
    if (!p) return
    const b = boardRef.current.map((r) => [...r])
    p.shape.forEach((row, dy) => row.forEach((v, dx) => {
      if (v && p.y + dy >= 0) b[p.y + dy][p.x + dx] = T_COLORS[p.key]
    }))
    const kept = b.filter((r) => r.some((c) => !c))
    const cleared = TH - kept.length
    while (kept.length < TH) kept.unshift(Array(TW).fill(null))
    if (cleared) {
      setLines((l) => l + cleared)
      setScore((s) => s + [0, 100, 300, 500, 800][cleared])
      sfx.play(cleared >= 4 ? 'win' : 'clear')
    } else {
      sfx.play('lock')
    }
    setBoard(kept)
    spawn()
  }, [spawn])

  const step = useCallback(() => {
    const p = pieceRef.current
    if (!p) { spawn(); return }
    const moved = { ...p, y: p.y + 1 }
    if (collide(boardRef.current, moved)) lock()
    else setPiece(moved)
  }, [collide, lock, spawn])

  /* ---- 操作原语（供 DAS 循环与按键共用）---- */
  const tryMove = useCallback((dx) => {
    const p = pieceRef.current
    if (!p) return
    const moved = { ...p, x: p.x + dx }
    if (!collide(boardRef.current, moved)) { setPiece(moved); sfx.play('move') }
  }, [collide])

  const rotate = useCallback(() => {
    const p = pieceRef.current
    if (!p) return
    const rotated = { ...p, shape: tRotate(p.shape) }
    if (!collide(boardRef.current, rotated)) { setPiece(rotated); sfx.play('rotate') }
  }, [collide])

  const hardDrop = useCallback(() => {
    const p = pieceRef.current
    if (!p) return
    let cur = p
    while (!collide(boardRef.current, { ...cur, y: cur.y + 1 })) cur = { ...cur, y: cur.y + 1 }
    setPiece(cur)
    setTimeout(lock, 0)
  }, [collide, lock])

  useEffect(() => {
    if (over || paused || !running) return
    const timer = setInterval(step, speed)
    return () => clearInterval(timer)
  }, [step, speed, over, paused, running])

  useEffect(() => { if (over) onSaveScore(score) }, [over])

  /* ---- 输入：自实现 DAS（Delayed Auto Shift）----
     浏览器原生按键重复只对最后按下的那个键生效：长按要等系统重复延迟，
     两键同时按住时先按的键会停。这里自己跟踪按住的键 + 定时循环，
     按下立即动一格，按住 DAS 后以 ARR 频率连发，多键互不干扰。 */
  useEffect(() => {
    if (over) return
    const DAS = 150   // 按住到开始连发的延迟 ms
    const ARR = 38    // 连发间隔 ms（左右）
    const SOFT = 45   // 软降连发间隔 ms
    const held = new Map() // key -> 下次触发时间
    const ACT = {
      ArrowLeft: { das: DAS, arr: ARR, act: () => tryMove(-1) },
      ArrowRight: { das: DAS, arr: ARR, act: () => tryMove(1) },
      ArrowDown: { das: SOFT, arr: SOFT, act: () => step() },
    }
    const onDown = (e) => {
      if (paused || !running) return
      if (e.key === 'ArrowUp') { e.preventDefault(); if (!e.repeat) rotate(); return }
      if (e.key === ' ') { e.preventDefault(); if (!e.repeat) hardDrop(); return }
      const a = ACT[e.key]
      if (!a) return
      e.preventDefault()
      if (held.has(e.key)) return // 已按住（含 e.repeat 事件）——连发由循环负责
      held.set(e.key, performance.now() + a.das)
      a.act() // 按下立即动一格
    }
    const onUp = (e) => { held.delete(e.key) }
    const onBlur = () => held.clear()
    const timer = setInterval(() => {
      if (paused || over || !running) return
      const now = performance.now()
      for (const [key, nextAt] of held) {
        if (now >= nextAt) {
          ACT[key].act()
          held.set(key, now + ACT[key].arr)
        }
      }
    }, 16)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      clearInterval(timer)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [over, paused, running, tryMove, rotate, hardDrop, step])

  const view = board.map((r) => [...r])
  if (piece) piece.shape.forEach((row, dy) => row.forEach((v, dx) => {
    const y = piece.y + dy, x = piece.x + dx
    if (v && y >= 0 && y < TH && x >= 0 && x < TW) view[y][x] = T_COLORS[piece.key]
  }))

  const restart = () => {
    setBoard(Array.from({ length: TH }, () => Array(TW).fill(null)))
    setPiece(null)
    setNext(randomTetromino())
    setScore(0); setLines(0); setOver(false)
  }

  const changeDiff = (d) => {
    setDiff(d)
    try { localStorage.setItem('funhub.tetris.diff', d) } catch { /* ignore */ }
    restart()
  }

  return h('div', { className: 'fh-tetris-wrap' },
    h('div', { className: 'fh-tetris-board', style: { gridTemplateColumns: `repeat(${TW}, 22px)` } },
      view.flat().map((c, i) => h('div', { key: i, className: 'fh-tetris-cell', style: c ? { background: c, borderRadius: 3 } : null }))),
    h('div', { className: 'fh-tetris-side' },
      h('div', null, '下一个'),
      h('div', { className: 'fh-tetris-next', style: { gridTemplateColumns: `repeat(${next.shape[0].length}, 16px)` } },
        next.shape.flat().map((v, i) => h('div', { key: i, className: 'fh-tetris-cell', style: { width: 16, height: 16, background: v ? T_COLORS[next.key] : 'transparent', borderRadius: 3 } }))),
      h('div', null, `分数 ${score}`),
      h('div', null, `行数 ${lines} · 等级 ${level}`),
      h('div', null, `速度 ${(1000 / speed).toFixed(1)} 步/秒`),
      h('div', null, `最高 ${record?.bestScore || 0}`),
      h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        [['slow', '慢'], ['normal', '普通'], ['fast', '快'], ['insane', '疯狂']].map(([k, label]) => h('button', {
          key: k, className: `fh-chip-btn${diff === k ? ' is-on' : ''}`, onClick: () => changeDiff(k), title: '切换难度并重开',
        }, label))),
      h('div', { style: { display: 'flex', gap: 6, flexDirection: 'column' } },
        h(Btn, { size: 'sm', onClick: onPauseToggle }, paused ? '继续' : '暂停'),
        h(Btn, { size: 'sm', onClick: restart }, '重开')),
      over ? h('div', { style: { color: 'var(--fh-danger)' } }, '游戏结束') : null,
      h('div', { className: 'fh-muted', style: { fontSize: 11 } }, '←→移动 ↑旋转 ↓加速 空格直落'),
    ),
  )
}

function randomTetromino() {
  const keys = Object.keys(TETROMINOES)
  const key = keys[Math.floor(Math.random() * keys.length)]
  return { key, shape: TETROMINOES[key].map((r) => [...r]) }
}
