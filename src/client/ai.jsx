// AI 页：DSH 对话集成说明 + 快捷文案一键复制（源管理交给对话助手）。
// 能力预留见仓库 docs/funhub-ai-skill.md；MCP server 为计划项。
import { useState, createElement as h } from 'react'
import { Icon, Btn } from './ui.jsx'
import { actions } from './store.js'

const COPY_ITEMS = [
  { key: 'book', label: '导入阅读书源', text: '请在 FunHub 添加阅读书源（阅读3.0/Legado JSON）。书源 URL：' },
  { key: 'comic', label: '导入漫画源清单', text: '请在 FunHub 导入 venera 漫画源清单：https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json' },
  { key: 'lx', label: '导入洛雪音源', text: '请把下面这段洛雪（LX Music）音源脚本导入 FunHub 并检测支持的音源渠道：\n\n<在此粘贴音源脚本全文>' },
  { key: 'rss', label: '添加 RSS 订阅', text: '请给 FunHub 添加 RSS 订阅：' },
  { key: 'playlist', label: '导入网易歌单', text: '请把网易云歌单导入 FunHub：' },
  { key: 'local', label: '上传本地音乐目录', text: '请把目录 下的音频文件上传到 FunHub 音乐库，并创建同名歌单。' },
  { key: 'proxy', label: '设置出站代理', text: '请把 FunHub 出站代理设置为 http://127.0.0.1:7897 并保存后测试连通。' },
  { key: 'clean', label: '清理失效源', text: '请清理 FunHub 中失效/重复的洛雪音源与漫画源，并报告清理结果。' },
]

function CopyRow({ label, text }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板 API 不可用时退化为选区复制
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      ta.remove()
    }
    setDone(true)
    actions.toast('已复制，去 DSH 对话粘贴发送即可')
    setTimeout(() => setDone(false), 1800)
  }
  return h('div', { className: 'fh-ai-row' },
    h('span', { className: 'lbl' }, label),
    h('div', { className: 'txt' }, text),
    h(Btn, { size: 'sm', kind: done ? 'default' : 'primary', onClick: copy },
      h(Icon, { name: done ? 'check' : 'doc', size: 12 }), done ? ' 已复制' : ' 复制'))
}

export function AiPage() {
  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' },
      h('div', { className: 'fh-page-title' }, 'AI 助手'),
      h('div', { className: 'fh-spacer' }),
      h('span', { className: 'fh-page-sub' }, '让 DSH 对话里的 AI 替你管理源与内容')),
    h('div', { className: 'fh-section' },
      h('div', { className: 'fh-section-title' }, '怎么用'),
      h('div', { className: 'fh-muted', style: { fontSize: 12.5, lineHeight: 1.8 } },
        '1. 从下面挑一条快捷文案，点「复制」；', h('br'),
        '2. 粘贴到 DSH 对话框，补上你的链接/路径后发送；', h('br'),
        '3. AI 会调用 FunHub 的接口完成导入，回 FunHub 面板即可看到结果。', h('br'),
        '操作说明已预留在插件包 docs/funhub-ai-skill.md，AI 可读取该文件了解全部可用操作（书源/漫画源/音源/RSS/歌单/代理/清理）。')),
    h('div', { className: 'fh-section' },
      h('div', { className: 'fh-section-title' }, '快捷文案 · 一键复制'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        COPY_ITEMS.map((it) => h(CopyRow, { key: it.key, ...it })))),
    h('div', { className: 'fh-section' },
      h('div', { className: 'fh-section-title' }, '能力预留'),
      h('div', { className: 'fh-muted', style: { fontSize: 12.5, lineHeight: 1.8 } },
        '· Skill 接入：已提供 docs/funhub-ai-skill.md（本插件包内），AI 读取后可执行全部源管理操作；', h('br'),
        '· MCP Server：预留五个工具语义（add_book_source / import_comic_source / add_lx_source / add_rss / import_playlist），按 skill 文档中的端点转发即可，无需等面板改造；', h('br'),
        '· FunHub API 全部走 DSH 会话鉴权，AI 在宿主同源通道内调用，安全边界与手动操作一致。')),
  )
}
