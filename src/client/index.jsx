// FunHub 客户端半片：
//   1. sidebar.panellist 图标 + main 面板（工作台 UI）
//   2. body portal 独立 React 树挂全局音乐播放器（面板切换不中断播放）
import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from './app.jsx'
import { PlayerRoot } from './player-ui.jsx'

function FunHubIcon({ size = 18 }) {
  return h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z' }),
    h('path', { d: 'M6.5 7.2h1.4M16 7.2h1.5M6.5 16.8h1.4M15.2 16.8l1.6-1.7' }))
}

export const inject = ['slots']

export function apply(ctx) {
  /* 主面板 */
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: 'funhub', label: 'FunHub' },
      AppShell,
    ))

  /* 侧栏入口 */
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      { name: 'sidebar.panellist', id: 'funhub', order: 8, label: 'FunHub' },
      FunHubIcon,
    ))

  /* 全局播放器（body portal，独立于主面板生命周期） */
  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-funhub-player', '')
    document.body.appendChild(host)
    let root
    try {
      root = createRoot(host)
      root.render(h(PlayerRoot))
    } catch (err) {
      ctx.logger?.error?.('[funhub] 播放器挂载失败:', err)
    }
    return () => {
      root?.unmount()
      host.remove()
    }
  }, 'funhub: global player mount')
}
