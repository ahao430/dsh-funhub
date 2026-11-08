// 可爱风新游戏：翻翻乐（记忆配对）+ 贪吃蛇。
// 约定与 builtin.jsx 一致：{ record, onSaveScore, onSaveState, running, paused }，结束时 onSaveScore。
import { useCallback, useEffect, useMemo, useRef, useState, createElement as h } from 'react'
import { Btn, Sprite } from '../ui.jsx'
import { sfx } from './sfx.js'

/* ============================== 翻翻乐（记忆配对） ============================== */

// 卡面：assets 精灵图（mem-<name>.png），加载失败回退 emoji
const MEM_DECK = ['cat', 'dog', 'rabbit', 'bear', 'panda', 'fox', 'penguin', 'frog']
const MEM_EMOJI = { cat: '🐱', dog: '🐶', rabbit: '🐰', bear: '🐻', panda: '🐼', fox: '🦊', penguin: '🐧', frog: '🐸' }

function memShuffle() {
  const cards = [...MEM_DECK, ...MEM_DECK].map((face, i) => ({ id: i, face }))
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

export function GameMemory({ record, onSaveScore, onSaveState }) {
  const [cards, setCards] = useState(memShuffle)
  const [flipped, setFlipped] = useState([])   // 已翻开未配对的 id（最多 2）
  const [matched, setMatched] = useState(() => new Set()) // 已配对的 face
  const [moves, setMoves] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const restored = useRef(false)
  const won = matched.size === MEM_DECK.length

  // 存档恢复
  useEffect(() => {
    if (restored.current) return
    const s = record?.savedState
    if (s?.cards?.length === 16) {
      restored.current = true
      setCards(s.cards)
      setMatched(new Set(s.matched || []))
      setMoves(s.moves || 0)
      setElapsed(s.elapsed || 0)
    }
  }, [record])

  // 计时（未完成时走）
  useEffect(() => {
    if (won) return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [won])

  // 存档（防抖）
  useEffect(() => {
    if (!won) onSaveState({ cards, matched: [...matched], moves, elapsed })
  }, [cards, matched, moves, elapsed, won])

  const flip = (id) => {
    if (won || flipped.length >= 2) return
    const card = cards.find((c) => c.id === id)
    if (!card || matched.has(card.face) || flipped.includes(id)) return
    const next = [...flipped, id]
    setFlipped(next)
    sfx.play('flip')
    if (next.length === 2) {
      setMoves((m) => m + 1)
      const [a, b] = next.map((cid) => cards.find((c) => c.id === cid))
      if (a.face === b.face) {
        sfx.play('match')
        setTimeout(() => { setMatched((prev) => new Set([...prev, a.face])); setFlipped([]) }, 260)
      } else {
        setTimeout(() => { sfx.play('miss'); setFlipped([]) }, 620)
      }
    }
  }

  // 通关计分：步数和时间越少越高
  useEffect(() => {
    if (won) {
      sfx.play('win')
      onSaveScore(Math.max(60, 1000 - moves * 12 - elapsed * 3))
    }
  }, [won]) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    setCards(memShuffle())
    setFlipped([])
    setMatched(new Set())
    setMoves(0)
    setElapsed(0)
  }

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)' } },
      h('span', null, `👣 ${moves} 步`), h('span', null, `⏱️ ${elapsed}s`),
      h('span', null, `⭐ ${record?.bestScore || 0}`),
      h(Btn, { size: 'sm', onClick: restart }, '🔄 重开')),
    h('div', { className: 'fh-mem-grid' },
      cards.map((c) => {
        const isUp = flipped.includes(c.id) || matched.has(c.face)
        return h('button', {
          key: c.id,
          className: `fh-mem-card${isUp ? ' is-up' : ''}${matched.has(c.face) ? ' is-matched' : ''}`,
          onClick: () => flip(c.id),
          disabled: won,
        },
          h('span', { className: 'fh-mem-face' },
            h(Sprite, { name: `mem-${c.face}`, fallback: h('span', { className: 'fh-mem-emoji' }, MEM_EMOJI[c.face] || '🌸') })),
          h('span', { className: 'fh-mem-back' }, '❓'))
      })),
    won ? h('div', { className: 'fh-empty', style: { padding: 10 } },
      `🎉 全部配对！${moves} 步 · ${elapsed}s · 得分 ${Math.max(60, 1000 - moves * 12 - elapsed * 3)}`) : null,
    h('div', { className: 'fh-muted', style: { fontSize: 11.5 } }, '点开两张卡， emoji 相同即配对成功 🌸'),
  )
}

/* ============================== 贪吃蛇 ============================== */

const SN_W = 15, SN_H = 15
const SN_FOODS = ['apple', 'cake', 'berry']
const SN_EMOJI = { apple: '🍎', cake: '🍰', berry: '🍓' }
const SN_DIFFS = { slow: 260, normal: 180, fast: 120 }

function snKey(x, y) { return y * SN_W + x }

export function GameSnake({ record, onSaveScore, running, paused }) {
  const [diff, setDiff] = useState(() => { try { return localStorage.getItem('funhub.snake.diff') || 'normal' } catch { return 'normal' } })
  const [snake, setSnake] = useState(() => [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }])
  const [dir, setDir] = useState('right')
  const [food, setFood] = useState({ x: 11, y: 8, face: 'apple', emoji: SN_EMOJI })
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [started, setStarted] = useState(false)
  const dirRef = useRef(dir)
  dirRef.current = dir
  const stateRef = useRef({ snake, food, score })
  stateRef.current = { snake, food, score }

  const interval = useMemo(() => Math.max(80, (SN_DIFFS[diff] || 180) - Math.floor(score / 50) * 12), [diff, score])

  const pickDiff = (d) => {
    setDiff(d)
    try { localStorage.setItem('funhub.snake.diff', d) } catch { /* ignore */ }
    restart(d)
  }

  const randFood = (body) => {
    const taken = new Set(body.map((s) => snKey(s.x, s.y)))
    const free = []
    for (let i = 0; i < SN_W * SN_H; i++) if (!taken.has(i)) free.push(i)
    if (!free.length) return null
    const i = free[Math.floor(Math.random() * free.length)]
    return { x: i % SN_W, y: Math.floor(i / SN_W), face: SN_FOODS[Math.floor(Math.random() * SN_FOODS.length)] }
  }

  const restart = (d) => {
    const body = [{ x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }]
    setSnake(body)
    setDir('right')
    setFood(randFood(body) || { x: 11, y: 8, face: 'apple', emoji: SN_EMOJI })
    setScore(0)
    setOver(false)
    setStarted(true)
  }

  const turn = useCallback((nd) => {
    const opp = { left: 'right', right: 'left', up: 'down', down: 'up' }
    if (opp[nd] === dirRef.current) return
    setDir(nd)
    setStarted(true)
  }, [])

  const step = useCallback(() => {
    const { snake: body, food: f } = stateRef.current
    if (!body.length) return
    const head = body[0]
    const d = dirRef.current
    const nx = head.x + (d === 'left' ? -1 : d === 'right' ? 1 : 0)
    const ny = head.y + (d === 'up' ? -1 : d === 'down' ? 1 : 0)
    if (nx < 0 || nx >= SN_W || ny < 0 || ny >= SN_H) { setOver(true); sfx.play('over'); return } // 撞墙
    if (body.some((s) => s.x === nx && s.y === ny)) { setOver(true); sfx.play('over'); return }   // 撞自己
    const ate = f && f.x === nx && f.y === ny
    const next = [{ x: nx, y: ny }, ...body]
    if (!ate) next.pop()
    setSnake(next)
    if (ate) {
      sfx.play('eat')
      setScore((v) => v + 10)
      setFood(randFood(next))
    }
  }, [])

  useEffect(() => {
    if (over || paused || !running || !started) return
    const t = setInterval(step, interval)
    return () => clearInterval(t)
  }, [step, interval, over, paused, running, started])

  useEffect(() => { if (over) onSaveScore(score) }, [over])

  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' }
      const nd = map[e.key]
      if (nd) { e.preventDefault(); turn(nd) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [turn])

  const cellMap = new Map()
  snake.forEach((s, i) => cellMap.set(snKey(s.x, s.y), i === 0 ? 'head' : i === snake.length - 1 ? 'tail' : 'body'))
  if (food) cellMap.set(snKey(food.x, food.y), 'food')

  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' } },
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--fh-ink2)', flexWrap: 'wrap', justifyContent: 'center' } },
      h('span', null, `🍎 ${score}`), h('span', null, `⭐ ${record?.bestScore || 0}`), h('span', null, `${(1000 / interval).toFixed(1)} 格/秒`),
      Object.entries(SN_DIFFS).map(([k]) => h('button', {
        key: k, className: `fh-chip-btn${diff === k ? ' is-on' : ''}`, onClick: () => pickDiff(k),
      }, { slow: '🐢 慢', normal: '🙂 中', fast: '🔥 快' }[k])),
      h(Btn, { size: 'sm', onClick: restart }, '🔄 重开')),
    h('div', { className: 'fh-snake-board' },
      Array.from({ length: SN_W * SN_H }, (_, i) => {
        const kind = cellMap.get(i)
        const cls = kind === 'head' ? ' is-head' : kind === 'body' ? ' is-body' : kind === 'tail' ? ' is-tail' : kind === 'food' ? ' is-food' : ''
        return h('div', {
          key: i, className: `fh-snake-cell${cls}`,
          style: { gridRow: Math.floor(i / SN_W) + 1, gridColumn: (i % SN_W) + 1 },
        }, kind === 'food'
          ? h(Sprite, { name: `snake-food-${food.face}`, className: 'fh-snake-sprite', fallback: h('span', null, food.emoji?.[food.face] || '🍎') })
          : kind === 'head'
            ? h(Sprite, { name: 'snake-head', className: 'fh-snake-sprite', fallback: h('span', null, '🐣') })
            : kind === 'body' || kind === 'tail'
              ? h(Sprite, { name: 'snake-body', className: `fh-snake-sprite ${kind}`, fallback: null })
              : null)
      })),
    over ? h('div', { className: 'fh-empty', style: { padding: 10 } }, `💥 游戏结束 · 本局 ${score} 分`) : null,
    !started && !over ? h('div', { className: 'fh-empty', style: { padding: 10 } }, '按方向键或点击下方按钮开始 🐣') : null,
    // 触屏/鼠标方向垫
    h('div', { className: 'fh-snake-dpad' },
      h('button', { onClick: () => turn('up') }, '🔼'),
      h('div', null,
        h('button', { onClick: () => turn('left') }, '◀️'),
        h('button', { onClick: () => turn('down') }, '🔽'),
        h('button', { onClick: () => turn('right') }, '▶️'))),
    h('div', { className: 'fh-muted', style: { fontSize: 11.5 } }, '方向键 / WASD 转向，吃零食长身体，别撞墙也别咬自己 🐍'),
  )
}
