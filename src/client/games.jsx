// 小游戏频道：游戏列表 + 收藏 + 运行台（plan §9）。
// 游戏本体单独包错误边界：单个游戏崩溃只在游戏台内显示，可重试或退出。
import { createElement as h, useCallback, useState } from 'react'
import { api } from './api.js'
import { actions, getState } from './store.js'
import { Icon, Btn, ErrorBoundary } from './ui.jsx'
import { Game2048, GameMinesweeper, GameSudoku, GameTetris } from './games/builtin.jsx'
import { GameMemory, GameSnake } from './games/cute.jsx'
import { GameGomoku } from './games/gomoku.jsx'
import { GameSokoban } from './games/sokoban.jsx'
import { sfx } from './games/sfx.js'

/** 音效开关（localStorage 持久化，全部游戏共用）。 */
function SoundToggle() {
  const [on, setOn] = useState(sfx.enabled)
  return h('button', {
    className: `fh-chip-btn${on ? ' is-on' : ''}`, title: on ? '关闭游戏音效' : '开启游戏音效',
    onClick: () => { const v = !on; sfx.setEnabled(v); setOn(v) },
  }, on ? '🔊 音效' : '🔇 静音')
}

// 卡片主题色（--gc1/--gc2 渐变对），每个游戏一套可爱配色
const GAMES = {
  g2048: { name: '2048', emoji: '🔢', desc: '滑动合并数字，冲向 2048', comp: Game2048, gc: ['#ffd6a5', '#ffadad'] },
  minesweeper: { name: '扫雷', emoji: '💣', desc: '推理排雷，三档难度', comp: GameMinesweeper, gc: ['#a0c4ff', '#9bf6ff'] },
  sudoku: { name: '数独', emoji: '🧩', desc: '经典数独，一键换局', comp: GameSudoku, gc: ['#b9fbc0', '#98f5e1'] },
  tetris: { name: '俄罗斯方块', emoji: '🧱', desc: '消除方块，挑战高分', comp: GameTetris, gc: ['#ffc6ff', '#bdb2ff'] },
  memory: { name: '翻翻乐', emoji: '🧁', desc: '翻牌配对萌物，考验记忆力', comp: GameMemory, gc: ['#ffd6f5', '#c1f0dc'] },
  snake: { name: '贪吃蛇', emoji: '🐍', desc: '吃零食长身体，可爱又刺激', comp: GameSnake, gc: ['#d0f4de', '#a9def9'] },
  gomoku: { name: '五子棋', emoji: '♟️', desc: '连珠规则带禁手，AI 对弈', comp: GameGomoku, gc: ['#ffe8c2', '#fcd2a8'] },
  sokoban: { name: '推箱子', emoji: '📦', desc: '经典推箱子，30 关递进', comp: GameSokoban, gc: ['#ffe3b3', '#ffd6e0'] },
}

export function GamesPage() {
  const boot = getState().boot
  const records = boot?.gameRecords || {}
  const favs = boot?.gameFavs || []
  const favGames = favs.filter((id) => GAMES[id])
  const recent = Object.entries(records).sort((a, b) => (b[1].lastPlayedAt || 0) - (a[1].lastPlayedAt || 0))
  const highlight = favGames.length ? favGames : recent.map(([id]) => id).filter((id) => GAMES[id]).slice(0, 6)
  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, '小游戏'),
      h('div', { className: 'fh-spacer' }),
      h(SoundToggle, null),
      h('span', { className: 'fh-page-sub', style: { marginLeft: 8 } }, '成绩与进度保存在本地')),
    /* 拱廊横幅 */
    h('div', { className: 'fh-arcade' },
      h('span', { className: 'deco d1' }, '🎈'), h('span', { className: 'deco d2' }, '⭐'), h('span', { className: 'deco d3' }, '🍬'),
      h('div', { className: 'ttl' }, '🌈 游戏街机'),
      h('div', { className: 'sub' }, `${Object.keys(GAMES).length} 款小游戏 · ${Object.values(records).reduce((n, r) => n + (r.playCount || 0), 0)} 次畅玩 · 累计最高分等你刷新 🏅`)),
    highlight.length ? h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
      h('span', { className: 'fh-muted', style: { fontSize: 12 } }, favGames.length ? '💖 我的收藏' : '🕒 最近游玩'),
      highlight.map((id) => h('button', { key: id, className: 'fh-chip-btn', onClick: () => actions.openGame(id) }, `${GAMES[id].emoji} ${GAMES[id].name}`))) : null,
    h('div', { className: 'fh-arcade-grid' },
      Object.entries(GAMES).map(([id, g]) => {
        const rec = records[id]
        const fav = favs.includes(id)
        return h('div', {
          key: id, className: 'fh-game-card',
          style: { '--gc1': g.gc[0], '--gc2': g.gc[1] },
          onClick: () => actions.openGame(id),
        },
          h('button', {
            className: `fh-game-fav${fav ? ' is-on' : ''}`, title: '收藏', onClick: (e) => {
              e.stopPropagation()
              void (async () => { await api.op('game_fav_toggle', { gameId: id }); await actions.reload() })()
            },
          }, h(Icon, { name: 'heart', size: 14 })),
          h('div', { className: 'blob' }, h('span', { className: 'emoji' }, g.emoji)),
          h('div', { className: 'name' }, g.name),
          h('div', { className: 'desc' }, g.desc),
          h('div', { className: 'pills' },
            rec?.bestScore ? h('span', { className: 'pill' }, `🏅 最高 ${rec.bestScore}`) : h('span', { className: 'pill' }, '✨ 未玩过'),
            rec?.playCount ? h('span', { className: 'pill' }, `🎮 ${rec.playCount} 次`) : null),
          h('div', { className: 'play' }, '开始玩 ›'))
      })),
  )
}

/* ---------- 游戏运行台 ---------- */
export function GameStage() {
  const session = getState().game
  if (!session || !GAMES[session.id]) return null
  return h(GameStageInner, { key: session.id, gameId: session.id })
}

function GameStageInner({ gameId }) {
  const boot = getState().boot
  const record = boot?.gameRecords?.[gameId]
  const game = GAMES[gameId]
  const [paused, setPaused] = useState(false)

  const saveScore = useCallback(async (score) => {
    await api.op('game_record', { gameId, score }).catch(() => {})
    await actions.reload()
  }, [gameId])

  const saveState = useCallback((savedState) => {
    void api.op('game_save', { gameId, savedState }).catch(() => {})
  }, [gameId])

  const onPauseToggle = () => setPaused((p) => !p)

  return h('div', { className: 'fh-game-stage' },
    h('div', { className: 'fh-game-bar' },
      h('button', { className: 'fh-icon-btn', onClick: () => actions.openGame(null), title: '退出游戏' }, h(Icon, { name: 'back', size: 16 })),
      h('span', { style: { fontWeight: 600 } }, `${game.emoji} ${game.name}`),
      h('div', { className: 'fh-spacer' }),
      h(SoundToggle, null),
      record?.bestScore ? h('span', { className: 'fh-chip' }, `最高 ${record.bestScore}`) : null,
      h('button', { className: 'fh-icon-btn', title: '退出游戏', onClick: () => actions.openGame(null) }, h(Icon, { name: 'close', size: 15 }))),
    h('div', { className: 'fh-game-body' },
      h(ErrorBoundary, { label: game.name, key: gameId },
        h(game.comp, { record, onSaveScore: saveScore, onSaveState: saveState, running: true, paused, onPauseToggle }))),
  )
}
