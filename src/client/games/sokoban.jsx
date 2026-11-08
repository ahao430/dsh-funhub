// 推箱子：经典规则（箱子只能推不能拉），支持撤销/选关/进度保存。
// 关卡为原创手工设计（难度递增），test/sokoban-test.mjs 用 BFS 验证全部可解。
import { useCallback, useEffect, useRef, useState, createElement as h } from 'react'
import { Btn, Sprite } from '../ui.jsx'
import { actions } from '../store.js'
import { LEVELS, parseLevel, sokobanMove, sokobanCleared } from './sokoban-engine.js'
import { sfx } from './sfx.js'

/* ---------- 组件 ---------- */
export function GameSokoban({ record, onSaveScore, onSaveState }) {
  const saved = record?.savedState
  const startLevel = Number.isInteger(saved?.level) && saved.level >= 0 && saved.level < LEVELS.length ? saved.level : 0
  const [level, setLevel] = useState(startLevel)
  const [state, setState] = useState(() => parseLevel(LEVELS[startLevel]))
  const [moves, setMoves] = useState(0)
  const [pushes, setPushes] = useState(0)
  const [cleared, setCleared] = useState(saved?.cleared || 0) // 已通关的最高关数（0 基，含）
  const historyRef = useRef([]) // { player, boxFrom, boxTo }
  const [won, setWon] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const loadLevel = useCallback((n) => {
    const idx = Math.max(0, Math.min(LEVELS.length - 1, n))
    historyRef.current = []
    setLevel(idx)
    setState(parseLevel(LEVELS[idx]))
    setMoves(0)
    setPushes(0)
    setWon(false)
  }, [])

  useEffect(() => { loadLevel(startLevel) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 进度保存（关卡/通关数/步数；棋局不逐格存，重开即本关重来）
  useEffect(() => {
    if (!won) onSaveState({ level, cleared, moves })
  }, [level, cleared, moves, won]) // eslint-disable-line react-hooks/exhaustive-deps

  // 走子（副作用在 setState 外做，更新器保持纯净）
  const move = useCallback((dx, dy) => {
    if (won) return
    const prev = stateRef.current
    const r = sokobanMove(prev, dx, dy)
    if (!r.moved) return
    const boxFrom = r.pushed ? prev.player + dx + dy * prev.w : -1
    const boxTo = r.pushed ? r.state.player + dx + dy * prev.w : -1
    historyRef.current.push({ player: prev.player, boxFrom, boxTo })
    stateRef.current = r.state
    setState(r.state)
    const nMoves = moves + 1
    setMoves(nMoves)
    if (r.pushed) {
      setPushes((p) => p + 1)
      // 箱子被推上目标格 → 入坑音；普通推动 → 摩擦音
      sfx.play(prev.goals.has(boxTo) ? 'goal' : 'push')
    } else {
      sfx.play('move')
    }
    if (sokobanCleared(r.state)) {
      sfx.play('win')
      setWon(true)
      setCleared((c) => Math.max(c, level))
      onSaveScore((level + 1) * 100 + Math.max(0, 150 - nMoves))
    }
  }, [won, level, moves, onSaveScore])

  const undo = useCallback(() => {
    const last = historyRef.current.pop()
    if (!last || won) return
    const prev = stateRef.current
    const boxes = new Set(prev.boxes)
    if (last.boxTo >= 0) { boxes.delete(last.boxTo); boxes.add(last.boxFrom) }
    const next = { ...prev, boxes, player: last.player }
    stateRef.current = next
    setState(next)
    setMoves((m) => Math.max(0, m - 1))
    sfx.play('flip')
  }, [won])

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }
      const d = map[e.key]
      if (d) { e.preventDefault(); move(d[0], d[1]) }
      else if (e.key === 'z') undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, undo])

  const cellView = (i) => {
    const isWall = state.walls.has(i)
    const isGoal = state.goals.has(i)
    const isBox = state.boxes.has(i)
    const isPlayer = state.player === i
    if (isWall) return h(Sprite, { name: 'soko-wall', className: 'fh-soko-sprite wall', fallback: h('span', { className: 'fh-soko-wall' }) })
    let inner = null
    if (isBox) inner = h(Sprite, {
      name: isGoal ? 'soko-box-done' : 'soko-box',
      className: `fh-soko-sprite${isGoal ? ' done' : ''}`,
      fallback: h('span', { className: `fh-soko-box${isGoal ? ' done' : ''}` }, isGoal ? '🎁' : '📦'),
    })
    else if (isGoal) inner = h(Sprite, { name: 'soko-goal', className: 'fh-soko-sprite goal', fallback: h('span', { className: 'fh-soko-goal' }, '✨') })
    return h('span', { className: `fh-soko-floor${(Math.floor(i / state.w) + i) % 2 ? ' alt' : ''}` }, inner,
      isPlayer ? h('span', { className: 'fh-soko-player-wrap' },
        h(Sprite, { name: 'soko-player', className: 'fh-soko-player-img', fallback: h('span', { className: 'fh-soko-player' }, '🐰') })) : null)
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)', flexWrap: 'wrap', justifyContent: 'center' } },
      h('span', { style: { fontWeight: 600 } }, `第 ${level + 1} / ${LEVELS.length} 关${won ? ' 🎉 通关！' : ''}`),
      h('span', { className: 'fh-chip' }, `👣 ${moves}`),
      h('span', { className: 'fh-chip' }, `🤜 ${pushes}`),
      h('span', { className: 'fh-chip' }, `🏆 ${record?.bestScore || 0}`),
      h(Btn, { size: 'sm', onClick: () => loadLevel(level - 1), disabled: level <= 0 }, '‹ 上关'),
      h(Btn, { size: 'sm', onClick: () => loadLevel(level + 1), disabled: level >= LEVELS.length - 1 || level >= cleared + 1 && !won }, '下关 ›'),
      h(Btn, { size: 'sm', onClick: undo, disabled: !historyRef.current.length || won }, '↩️ 撤销'),
      h(Btn, { size: 'sm', onClick: () => loadLevel(level) }, '🔄 重开'),
      won && level < LEVELS.length - 1 ? h(Btn, { kind: 'primary', size: 'sm', onClick: () => loadLevel(level + 1) }, '下一关 ›') : null),
    h('div', { className: 'fh-soko-board', style: { gridTemplateColumns: `repeat(${state.w}, 36px)` } },
      Array.from({ length: state.w * state.h }, (_, i) => h('span', { key: i, className: 'fh-soko-cell' }, cellView(i)))),
    h('div', { className: 'fh-muted', style: { fontSize: 11.5, textAlign: 'center', lineHeight: 1.7 } },
      '方向键 / WASD 推箱子，Z 撤销一步 🐰 → 把所有 📦 推到 ✨ 上变成 🎁'),
    h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 } },
      LEVELS.map((_, i) => h('button', {
        key: i, className: `fh-chip-btn${i === level ? ' is-on' : ''}`,
        style: i > cleared ? { opacity: 0.4 } : null,
        onClick: () => (i <= cleared ? loadLevel(i) : actions.toast('先通过前面的关卡解锁 🔒')),
        title: i > cleared ? '先通过前面的关卡解锁' : `第 ${i + 1} 关`,
      }, `${i <= cleared ? '✅' : '🔒'}${i + 1}`)))
  )
}

