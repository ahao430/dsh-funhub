// 五子棋（连珠规则）：黑棋三三/四四/长连禁手（棋盘标 ✕，点击提示），
// 白棋无禁手；AI 威胁优先 + 一层前瞻。执黑/执白可选，支持悔棋。
import { useCallback, useEffect, useRef, useState, createElement as h } from 'react'
import { Btn } from '../ui.jsx'
import { actions } from '../store.js'
import {
  SIZE, EMPTY, BLACK, WHITE, makeBoard, idx, forbiddenAt, checkWin, aiMove,
} from './gomoku-engine.js'
import { sfx } from './sfx.js'

export function GameGomoku({ record, onSaveScore }) {
  const [humanSide, setHumanSide] = useState(BLACK) // 玩家执黑（先手）默认
  const [board, setBoard] = useState(makeBoard)
  const [turn, setTurn] = useState(BLACK)
  const [over, setOver] = useState(null) // { winner, line } | { draw: true }
  const [last, setLast] = useState(-1)
  const [thinking, setThinking] = useState(false)
  const historyRef = useRef([])   // 落子序（用于悔棋）
  const savedRef = useRef(false)  // 一局只记一次分

  const aiSide = humanSide === BLACK ? WHITE : BLACK

  const restart = useCallback((side = humanSide) => {
    historyRef.current = []
    savedRef.current = false
    setBoard(makeBoard())
    setTurn(BLACK)
    setOver(null)
    setLast(-1)
    setHumanSide(side)
  }, [humanSide])

  const settle = useCallback((b, x, y) => {
    const w = checkWin(b, x, y)
    if (w) {
      setOver(w)
      sfx.play(w.winner === humanSide ? 'win' : 'over')
      if (!savedRef.current) {
        savedRef.current = true
        onSaveScore(w.winner === humanSide ? 100 : 10)
      }
      return true
    }
    if (b.every((v) => v !== EMPTY)) {
      setOver({ draw: true })
      sfx.play('over')
      if (!savedRef.current) { savedRef.current = true; onSaveScore(50) }
      return true
    }
    return false
  }, [humanSide, onSaveScore])

  const place = useCallback((x, y, color) => {
    setBoard((prev) => {
      const b = prev.slice()
      b[idx(x, y)] = color
      return b
    })
    setLast(idx(x, y))
    historyRef.current.push(idx(x, y))
  }, [])

  const humanPlay = (x, y) => {
    if (over || thinking || turn !== humanSide) return
    if (board[idx(x, y)] !== EMPTY) return
    if (humanSide === BLACK) {
      const foul = forbiddenAt(board, x, y)
      if (foul) { sfx.play('bad'); actions.toast(`黑棋禁手（${foul}）：换个点落子 ♟️`); return }
    }
    place(x, y, humanSide)
    sfx.play('place')
    setTurn(aiSide)
  }

  // AI 走子（带思考延迟）；胜负判定统一由下方 [board, last] effect 在落子后做
  useEffect(() => {
    if (over || turn !== aiSide) return
    setThinking(true)
    const t = setTimeout(() => {
      const mv = aiMove(board, aiSide)
      setThinking(false)
      if (mv == null || mv < 0) { setOver({ draw: true }); return }
      const x = mv % SIZE, y = Math.floor(mv / SIZE)
      place(x, y, aiSide)
      sfx.play('move')
      setTurn(humanSide)
    }, 420)
    return () => { clearTimeout(t); setThinking(false) }
  }, [turn, aiSide, humanSide, over]) // eslint-disable-line react-hooks/exhaustive-deps

  // 落子后的胜负判定（board 更新后跑，human/AI 通用；savedRef 保证一局只记一次分）
  useEffect(() => {
    if (!over && last >= 0) {
      const x = last % SIZE, y = Math.floor(last / SIZE)
      settle(board, x, y)
    }
  }, [board, last]) // eslint-disable-line react-hooks/exhaustive-deps

  const undo = () => {
    if (thinking) return
    const hist = historyRef.current
    if (hist.length < 2) return
    // 弹掉 AI + 玩家两手，回到玩家落子前
    setBoard((prev) => {
      const b = prev.slice()
      b[hist.pop()] = EMPTY
      b[hist.pop()] = EMPTY
      return b
    })
    historyRef.current = hist
    setLast(hist.length ? hist[hist.length - 1] : -1)
    setOver(null)
    savedRef.current = false
    setTurn(humanSide)
  }

  // 黑方行棋时标出禁手点
  const forbidden = new Set()
  if (!over && turn === BLACK) {
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (board[i] === EMPTY && forbiddenAt(board, i % SIZE, Math.floor(i / SIZE))) forbidden.add(i)
    }
  }

  const status = over
    ? (over.draw ? '🤝 平局！棋盘满了'
      : over.winner === humanSide ? '🎉 你赢了！' : `💦 ${over.winner === BLACK ? '黑' : '白'}（AI）获胜`)
    : thinking ? '🤖 AI 思考中…'
      : turn === humanSide
        ? `♟️ 轮到你（${humanSide === BLACK ? '⚫ 黑棋' : '⚪ 白棋'}）`
        : '🤖 AI 落子中…'

  // 棋盘几何：N 条线、间距 S、边距 PAD——棋子永远落在交叉点上
  const S = 22, PAD = 13
  const BOARD = (SIZE - 1) * S + PAD * 2
  const at = (i) => ({ left: PAD + (i % SIZE) * S, top: PAD + Math.floor(i / SIZE) * S })
  const STARS = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)', flexWrap: 'wrap', justifyContent: 'center' } },
      h('span', { style: { fontWeight: 600 } }, status),
      h('span', { className: 'fh-chip' }, `🏆 最高 ${record?.bestScore || 0}`),
      h('button', { className: `fh-chip-btn${humanSide === BLACK ? ' is-on' : ''}`, onClick: () => restart(BLACK) }, '⚫ 执黑先手'),
      h('button', { className: `fh-chip-btn${humanSide === WHITE ? ' is-on' : ''}`, onClick: () => restart(WHITE) }, '⚪ 执白后手'),
      h(Btn, { size: 'sm', onClick: undo, disabled: thinking || historyRef.current.length < 2 }, '↩️ 悔棋'),
      h(Btn, { size: 'sm', onClick: () => restart() }, '🔄 重开')),
    h('div', { className: 'fh-gomoku-board', style: { width: BOARD, height: BOARD } },
      /* 网格线（内部区域，最后一格 +1px 让边缘线完整） */
      h('div', { className: 'fh-gomoku-lines', style: { left: PAD, top: PAD, width: (SIZE - 1) * S + 1, height: (SIZE - 1) * S + 1 } }),
      /* 星位 */
      STARS.map(([sx, sy]) => h('span', { key: `s${sx}-${sy}`, className: 'fh-gomoku-star', style: { left: PAD + sx * S, top: PAD + sy * S } })),
      /* 交叉点热区（S×S 透明按钮，中心对准交叉点）+ 棋子/标记 */
      Array.from({ length: SIZE * SIZE }, (_, i) => {
        const v = board[i]
        const isLast = i === last
        const isWin = over?.line?.includes(i)
        const isFoul = forbidden.has(i)
        const p = at(i)
        const center = { left: S / 2, top: S / 2 } // 相对热区（棋子落在热区中心 = 交叉点）
        return h('button', {
          key: i, className: 'fh-gomoku-hit', 'data-my': humanSide,
          style: { left: p.left - S / 2, top: p.top - S / 2, width: S, height: S },
          onClick: () => humanPlay(i % SIZE, Math.floor(i / SIZE)),
          title: isFoul ? '黑棋禁手点' : null,
        },
          v === BLACK ? h('span', { className: `fh-stone b${isWin ? ' is-win' : ''}`, style: center }) : null,
          v === WHITE ? h('span', { className: `fh-stone w${isWin ? ' is-win' : ''}`, style: center }) : null,
          isFoul && !v ? h('span', { className: 'fh-gomoku-forbid', style: center }, '✕') : null,
          isLast && !over && v ? h('span', { className: 'fh-gomoku-last', style: center }) : null)
      })),
    h('div', { className: 'fh-muted', style: { fontSize: 11.5, textAlign: 'center', lineHeight: 1.7 } },
      '连珠规则：⚫ 黑棋有三三 / 四四 / 长连禁手（✕ 标出），⚪ 白棋无禁手；五连即胜 🏅'),
  )
}
