// 设置：左侧菜单分区 —— 外观 / 阅读书源 / 洛雪音源 / 漫画源 / 图片源 / 首页布局 / 数据管理 / 关于。
// 各频道的快捷入口（如「去导入漫画源」）通过 actions.setView('settings', <分区id>) 直达对应分区。
// 不内置任何第三方源：所有源由用户自行寻找并以 URL / 本地文件导入。
import { useCallback, useRef, useState, createElement as h } from 'react'
import { api } from './api.js'
import { actions, getState, subscribe } from './store.js'
import { applyAccent } from './app.jsx'
import { Icon, Btn, Input, Toggle, Modal, useStore, fmtAgo } from './ui.jsx'

const CARD_LABELS = { novel: '小说阅读', comic: '漫画', gallery: '图片广场', music: '音乐', games: '小游戏', rss: 'RSS 订阅' }
const SIZE_LABELS = { '1x1': '小 1×1', '2x1': '宽 2×1', '1x2': '高 1×2', '2x2': '大 2×2' }

/** 分区清单：id 与 store.settingsSection 对齐；count 用于菜单角标。 */
const SECTIONS = [
  { id: 'appearance', label: '外观', icon: 'star', comp: AccentSection },
  { id: 'booksource', label: '阅读书源', icon: 'book', comp: BookSourceSection, count: (b) => b?.bookSources?.length },
  { id: 'lxsource', label: '洛雪音源', icon: 'music', comp: LxSourceSection, count: (b) => b?.lxSources?.length },
  { id: 'comicsource', label: '漫画源', icon: 'comic', comp: ComicSourceSection, count: (b) => b?.comicSources?.length },
  { id: 'imagesource', label: '图片源', icon: 'image', comp: ImageSourceSection },
  { id: 'video', label: '影视源', icon: 'film', comp: VideoSourceSection, count: (b) => b?.settings?.video?.emby?.length },
  { id: 'network', label: '网络 · 代理', icon: 'refresh', comp: NetworkSection },
  { id: 'layout', label: '首页布局', icon: 'grid', comp: LayoutSection },
  { id: 'data', label: '数据管理', icon: 'trash', comp: DataSection },
  { id: 'about', label: '关于', icon: 'doc', comp: AboutSection },
]

export function SettingsPage() {
  const snap = useStore({ getState, subscribe })
  const boot = snap.boot
  // 分区单一真源在 store：菜单点击与各频道快捷入口走同一个 setView('settings', id)
  const active = SECTIONS.find((s) => s.id === snap.settingsSection) || SECTIONS[0]

  // sticky top 对齐页头下缘（页头已吸顶 z40，菜单在其下滚动不被遮挡）
  const menu = h('nav', { style: { width: 176, flex: 'none', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 52 } },
    SECTIONS.map((s) => {
      const count = s.count?.(boot) || 0
      return h('button', {
        key: s.id,
        className: `fh-side-item${s.id === active.id ? ' is-on' : ''}`,
        onClick: () => actions.setView('settings', s.id),
      },
        h(Icon, { name: s.icon, size: 15 }),
        h('span', { style: { flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.label),
        count ? h('span', { className: 'fh-muted', style: { fontSize: 11 } }, count) : null)
    }))

  return h('div', { className: 'fh-page' },
    h('div', { className: 'fh-page-head' }, h('div', { className: 'fh-page-title' }, '设置')),
    h('div', { style: { display: 'flex', gap: 16, alignItems: 'flex-start' } },
      menu,
      h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 } },
        h(active.comp, { key: active.id }))))
}

function AboutSection() {
  return h('div', { className: 'fh-section', style: { opacity: .8 } },
    h('div', { className: 'fh-section-title' }, '关于 FunHub'),
    h('div', { className: 'fh-muted', style: { fontSize: 12.5, lineHeight: 1.8 } },
      '本地优先的娱乐工作台：小说 / 漫画 / 图片 / 音乐 / 小游戏 / RSS。', h('br'),
      '第三方源脚本（洛雪音源、venera 漫画源）运行在宿主隔离沙箱中，仅能通过受控网络通道访问公网；所有外部 HTML 渲染前均已清理。'))
}

/* ================= 外观（强调色） ================= */
const ACCENT_PRESETS = [
  { value: '', label: '跟随 DSH', css: null },
  { value: '#6c7bff', label: '靛蓝', css: '#6c7bff' },
  { value: '#ff7a6b', label: '珊瑚', css: '#ff7a6b' },
  { value: '#2fbf8f', label: '青翠', css: '#2fbf8f' },
  { value: '#f5a623', label: '琥珀', css: '#f5a623' },
  { value: '#a06bff', label: '紫罗兰', css: '#a06bff' },
]

function AccentSection() {
  const boot = getState().boot
  const current = boot?.settings?.accent || ''
  const atmo = boot?.settings?.atmosphere !== false
  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'star', size: 15 }), '外观 · 主题与强调色'),
    h('div', { className: 'fh-field' },
      h('label', null, '界面主题'),
      h('button', { className: `fh-chip-btn${boot?.settings?.theme !== 'light' ? ' is-on' : ''}`, onClick: async () => {
        await api.op('settings_save', { settings: { theme: 'dark' } }); await actions.reload()
      } }, '🌙 深色'),
      h('button', { className: `fh-chip-btn${boot?.settings?.theme === 'light' ? ' is-on' : ''}`, onClick: async () => {
        await api.op('settings_save', { settings: { theme: 'light' } }); await actions.reload()
      } }, '☀️ 浅色'),
      h('span', { className: 'fh-muted', style: { fontSize: 12 } }, '阅读器另有纸黄等独立主题；沉浸式播放器保持深色封面氛围')),

    h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
      ACCENT_PRESETS.map((a) => h('button', {
        key: a.value || 'auto', title: a.label,
        className: `fh-theme-dot${current === a.value ? ' is-on' : ''}`,
        style: {
          width: 32, height: 32,
          background: a.css ? `linear-gradient(135deg, ${a.css}, color-mix(in srgb, ${a.css} 52%, #b44bff))` : 'var(--fh-panel-2)',
          color: a.css ? '#fff' : 'var(--fh-ink2)',
        },
        onClick: async () => {
          applyAccent(a.value)
          await api.op('settings_save', { settings: { accent: a.value } })
          await actions.reload()
          actions.toast(`强调色：${a.label}`)
        },
      }, current === a.value ? '✓' : ''))),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '渐变强调色应用于按钮、进度条、播放器主键与侧栏选中态；「跟随 DSH」使用 Harness 主题主色。'),
    h('div', { className: 'fh-field' },
      h('label', null, '氛围背景'),
      h('div', { className: 'fh-spacer' }),
      h(Toggle, { checked: atmo, onChange: async (v) => {
        await api.op('settings_save', { settings: { atmosphere: v } })
        await actions.reload()
        actions.toast(v ? '已开启氛围背景' : '已关闭氛围背景（纯色渐变）')
      } }),
      h('span', { className: 'fh-muted', style: { fontSize: 12 } }, '首页星云欢迎区与小说 / 音乐 / RSS 卡片氛围图；关闭后仅保留 CSS 渐变')),
    h('div', { className: 'fh-field', style: { alignItems: 'flex-start' } },
      h('label', null, '背景图'),
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8 } },
        BG_SLOTS.map((slot) => h(BackgroundRow, { key: slot.key, slot }))),
    ),
  )
}

/* ---- 背景图槽位：预设缩略图 / 自定义上传 / 恢复默认 ---- */
const BG_SLOTS = [
  { key: 'home', label: '首页欢迎区' },
  { key: 'music', label: '音乐卡片' },
  { key: 'novel', label: '小说卡片' },
  { key: 'rss', label: 'RSS 卡片' },
  { key: 'games', label: '小游戏页' },
]
const BG_PRESETS = [
  { label: '星云', path: '/funhub/api/asset/home-bg.webp' },
  { label: '声波', path: '/funhub/api/asset/music-bg.webp' },
  { label: '墨绿', path: '/funhub/api/asset/novel-bg.webp' },
  { label: '圆环', path: '/funhub/api/asset/rss-bg.webp' },
  { label: '弧光', path: '/funhub/api/asset/games-bg.webp' },
]
const BG_DEFAULTS = Object.fromEntries(BG_SLOTS.map((s, i) => [s.key, BG_PRESETS[i].path]))

function BackgroundRow({ slot }) {
  const boot = getState().boot
  const isLight = boot?.settings?.theme === 'light'
  // 预置素材按主题显示对应文件；自定义上传跨主题共用
  const themed = (path) => (isLight && /^\/funhub\/api\/asset\//.test(path) ? path.replace('-bg.webp', '-bg-light.webp') : path)
  const current = themed(boot?.settings?.backgrounds?.[slot.key] || BG_DEFAULTS[slot.key])
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const pick = async (path) => {
    await api.op('settings_save', { settings: { backgrounds: { [slot.key]: path } } })
    await actions.reload()
  }
  const upload = async (file) => {
    setUploading(true)
    try {
      const res = await fetch(`/funhub/api/bg/upload?slot=${slot.key}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      await actions.reload()
      actions.toast(`${slot.label}背景已更新`)
    } catch (err) {
      actions.toast(`上传失败：${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
    h('span', { style: { width: 76, flex: 'none', fontSize: 12.5, fontWeight: 600 } }, slot.label),
    h('div', { style: { width: 56, height: 38, borderRadius: 8, flex: 'none', background: `center/cover url(${current})`, border: '1px solid var(--fh-line)' } }),
    BG_PRESETS.map((p) => h('button', {
      key: p.path, title: `预设：${p.label}`,
      onClick: () => pick(p.path),
      style: { width: 40, height: 28, borderRadius: 6, border: current === themed(p.path) ? '2px solid var(--fh-accent)' : '1px solid var(--fh-line)', cursor: 'pointer', background: `center/cover url(${themed(p.path)})` },
    })),
    h(Btn, { size: 'sm', onClick: () => fileRef.current?.click(), disabled: uploading }, uploading ? '上传中…' : '自定义'),
    h(Btn, { size: 'sm', onClick: () => pick(BG_DEFAULTS[slot.key]), title: '恢复为预置素材' }, '默认'),
    h('input', { ref: fileRef, type: 'file', hidden: true, accept: 'image/jpeg,image/png,image/webp', onChange: async (e) => {
      const f = e.target.files?.[0]
      e.target.value = ''
      if (f) await upload(f)
    } }))
}


/* ================= 阅读书源 ================= */
/** 危险操作二次确认弹窗（检测清理等共用）：确认后执行 onConfirm，完成自动关闭。 */
function ConfirmModal({ title, message, hint, label = '确认执行', busyLabel = '执行中…', onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  return h(Modal, { title, onClose, width: 400 },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      h('div', { style: { fontSize: 13, lineHeight: 1.7 } }, message),
      hint ? h('div', { className: 'fh-muted', style: { fontSize: 12 } }, hint) : null,
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h(Btn, { onClick: onClose, disabled: busy }, '取消'),
        h(Btn, { kind: 'danger', disabled: busy, onClick: async () => {
          setBusy(true)
          try { await onConfirm(); onClose() } finally { setBusy(false) }
        } }, busy ? busyLabel : label))))
}

/** 清空源确认弹窗：书源 / 漫画源 / 影视源共用。历史与收藏独立存储，不受影响。 */
export function ClearSourcesModal({ what, count, op, fmt, onClose }) {
  const [busy, setBusy] = useState(false)
  return h(Modal, { title: `清空${what}`, onClose, width: 380 },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      h('div', { style: { fontSize: 13, lineHeight: 1.7 } },
        `确定删除全部 ${count} 个${what}吗？该操作不可恢复。`),
      h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '阅读历史与收藏不受影响，之后可重新导入。'),
      h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        h(Btn, { onClick: onClose, disabled: busy }, '取消'),
        h(Btn, { kind: 'danger', disabled: busy, onClick: async () => {
          setBusy(true)
          try {
            const r = await api.op(op, {})
            await actions.reload()
            actions.toast(fmt ? fmt(r) : `已清空${what}：删除 ${r.removed} 个`)
            onClose()
          } catch (err) {
            actions.toast(`清空失败：${err.message}`)
            setBusy(false)
          }
        } }, busy ? '清空中…' : '确认清空'))))
}

function BookSourceSection() {
  const boot = getState().boot
  const sources = boot?.bookSources || []
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmProbe, setConfirmProbe] = useState(false)
  const fileRef = useRef(null)

  const [probing, setProbing] = useState(false)
  const [probeProgress, setProbeProgress] = useState(null)
  const pollProbe = useCallback(() => {
    const timer = setInterval(async () => {
      try {
        const r = await api.get('/booksource/clean-progress')
        setProbeProgress(r.progress)
        if (!r.progress.running) {
          clearInterval(timer)
          setProbing(false)
          setProbeProgress(null)
          await actions.reload()
          actions.toast(`检测完成：移除 ${r.progress.removed} 个失效源，保留 ${r.progress.kept} 个${r.progress.skipped ? `，跳过 ${r.progress.skipped} 个近期已验证` : ''}`)
        }
      } catch { /* 静默重试 */ }
    }, 1200)
  }, [])
  const stopProbe = useCallback(async () => {
    try { await fetch('/funhub/api/booksource/clean-stop', { method: 'POST', credentials: 'same-origin' }) } catch { /* ignore */ }
    actions.toast('正在停止检测：探测中的源结束后收尾，已删除的会保留')
  }, [])
  const startProbe = useCallback(async () => {
    setProbing(true)
    setProbeProgress({ done: 0, total: sources.length, current: '' })
    try {
      const res = await fetch('/funhub/api/booksource/clean-dead', { method: 'POST', credentials: 'same-origin' })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        if (res.status === 409) {
          // 已有任务在跑：不报错，直接接管显示它的进度
          actions.toast('已有检测任务进行中，已显示其进度')
          pollProbe()
          return
        }
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      pollProbe()
    } catch (err) {
      actions.toast(`启动检测失败：${err.message}`)
      setProbing(false)
      setProbeProgress(null)
    }
  }, [pollProbe, sources.length])

  const send = useCallback(async (payload) => {
    setImporting(true)
    setResult(null)
    try {
      const res = await fetch('/funhub/api/booksource/import', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      setResult(body)
      await actions.reload()
      actions.toast(`书源导入完成：新增 ${body.added} 个`)
      // 导入后自动检测新源可用性（后台探测 404/死站并清理，进度条可见，可随时停止）
      if (body.added > 0 && !probing) startProbe()
    } catch (err) {
      actions.toast(`导入失败：${err.message}`)
    } finally {
      setImporting(false)
    }
  }, [startProbe, probing])

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'book', size: 15 }), '阅读书源（阅读3.0 格式）'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      'FunHub 不内置任何书源。请自行寻找可靠的书源 JSON（阅读3.0 / Legado 格式），支持多个书源的 JSON 数组或单个对象，带 JS 规则的书源会被标记不兼容。'),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Input, { value: url, onChange: setUrl, placeholder: '书源 JSON 文件的 URL…', style: { flex: 1, minWidth: 260 } }),
      h(Btn, { kind: 'primary', onClick: () => send({ url: url.trim() }), disabled: importing || !url.trim() }, importing ? '导入中…' : '从 URL 导入'),
      h(Btn, { onClick: () => fileRef.current?.click(), disabled: importing }, '从文件导入'),
      sources.some((x) => x.compatible === false) ? h(Btn, { kind: 'danger', onClick: async () => {
        const r = await api.op('booksource_clean')
        await actions.reload()
        actions.toast(`已清理 ${r.removed} 个不兼容书源`)
      } }, `清理不兼容 ${sources.filter((x) => x.compatible === false).length}`) : null,
      probing ? h(Btn, { onClick: stopProbe }, '停止检测') : (sources.length ? h(Btn, { kind: 'danger', onClick: () => setConfirmProbe(true) }, '检测清理失效源') : null),
      sources.length ? h(Btn, { kind: 'danger', onClick: () => setConfirmClear(true), title: '删除全部书源' }, '清空全部') : null,
      h('input', { ref: fileRef, type: 'file', hidden: true, accept: '.json,.txt,application/json,text/plain', onChange: async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) await send({ text: await file.text() })
      } })),
    probeProgress ? h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      `探测中 ${probeProgress.done}/${probeProgress.total}`
      + (probeProgress.skipped ? ` · 跳过 ${probeProgress.skipped}` : '')
      + (probeProgress.removed ? ` · 已删 ${probeProgress.removed}` : '')
      + (probeProgress.current ? ' · 当前: ' + probeProgress.current : ''),
      probeProgress.removedNames?.length ? h('div', { style: { fontSize: 11, lineHeight: 1.6, marginTop: 4 } },
        probeProgress.removedNames.slice(-6).map((n, i) => h('div', { key: i }, `✕ ${n}`))) : null) : null,
    result ? h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      `新增 ${result.added} · 跳过 ${result.skipped}`,
      result.compat?.length ? ` · 兼容性：${result.compat.filter((c) => c.compatible).length}/${result.compat.length} 可用` : '') : null,
    sources.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      sources.map((s) => h('div', { key: s.id, className: 'fh-src-row' },
        h(Toggle, { checked: s.enabled, onChange: async (v) => { await api.op('booksource_toggle', { id: s.id, enabled: v }); await actions.reload() } }),
        h('span', { className: 'name' }, s.name),
        s.compatible === false ? h('span', { className: 'fh-chip', style: { color: 'var(--fh-danger)' } }, '不兼容') : null,
        h('span', { className: 'meta', title: s.issues?.join('；') }, s.group || s.url),
        h('div', { className: 'fh-spacer' }),
        h('button', { className: 'fh-icon-btn', title: '删除', onClick: async () => { await api.op('booksource_remove', { id: s.id }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 }))))) : h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '尚未导入书源'),
    confirmClear ? h(ClearSourcesModal, { what: '书源', count: sources.length, op: 'booksource_clear', onClose: () => setConfirmClear(false) }) : null,
    confirmProbe ? h(ConfirmModal, {
      title: '检测清理失效书源',
      message: `将逐一在线探测全部 ${sources.length} 个书源，无法访问或无搜索/发现能力的会被删除。`,
      hint: '正常源保留；近期已验证过的跳过。可随时停止；已删除的不会恢复。',
      label: '开始检测', busyLabel: '启动中…',
      onClose: () => setConfirmProbe(false),
      onConfirm: () => startProbe(),
    }) : null,
  )
}

/* ================= 洛雪音源 ================= */
function LxSourceSection() {
  const boot = getState().boot
  const sources = boot?.lxSources || []
  const [script, setScript] = useState('')
  const [probing, setProbing] = useState(false)
  const fileRef = useRef(null)

  const probe = useCallback(async (scriptText) => {
    setProbing(true)
    try {
      const res = await fetch('/funhub/api/lxsource/probe', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ script: scriptText }),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      await actions.reload()
      if (body.error) actions.toast(`音源已导入但异常：${body.error}`)
      else {
        const caps = Object.keys(body.status?.capabilities || {})
        actions.toast(`音源导入成功，支持 ${caps.join(' / ')}`)
      }
    } catch (err) {
      actions.toast(`导入失败：${err.message}`)
    } finally {
      setProbing(false)
      setScript('')
    }
  }, [])

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'music', size: 15 }), '洛雪音源（LX Music 自定义源）'),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Input, { value: script, onChange: setScript, placeholder: '粘贴音源脚本内容…', style: { flex: 1, minWidth: 260 } }),
      h(Btn, { kind: 'primary', onClick: () => probe(script), disabled: probing || script.length < 50 }, probing ? '检测中…' : '导入并检测'),
      h(Btn, { onClick: () => fileRef.current?.click(), disabled: probing }, '从文件导入'),
      (() => {
        const errored = sources.filter((x) => x.error).length
        const seen = new Set()
        let dups = 0
        for (const x of sources) { const k = `${x.name}|${x.version || ''}`; if (seen.has(k)) dups += 1; else seen.add(k) }
        const cleanable = errored + dups
        return cleanable > 0 ? h(Btn, { kind: 'danger', onClick: async () => {
          const r = await api.op('lxsource_clean')
          await actions.reload()
          actions.toast(`已清理 ${r.removed} 个无效/重复音源`)
        } }, `清理无效/重复 ${cleanable}`) : null
      })(),
      h('input', { ref: fileRef, type: 'file', hidden: true, accept: '.js', onChange: async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) await probe(await file.text())
      } })),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '脚本在宿主隔离沙箱中运行：无文件系统访问、仅限公网请求、带超时与大小限制'),
    sources.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      sources.map((s) => h('div', { key: s.id, className: 'fh-src-row' },
        h(Toggle, { checked: s.enabled, onChange: async (v) => { await api.op('lxsource_toggle', { id: s.id, enabled: v }); await actions.reload() } }),
        h('span', { className: 'name' }, `${s.name}${s.version ? ` v${s.version}` : ''}`),
        s.error ? h('span', { className: 'fh-chip', style: { color: 'var(--fh-danger)' }, title: s.error }, '异常') : null,
        h('span', { className: 'meta' }, Object.keys(s.capabilities || {}).join(' / ') || '—'),
        h('div', { className: 'fh-spacer' }),
        h('span', { className: 'fh-muted', style: { fontSize: 11 } }, fmtAgo(s.addedAt)),
        h('button', { className: 'fh-icon-btn', title: '删除', onClick: async () => { await api.op('lxsource_remove', { id: s.id }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 }))))) : h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '尚未导入音源（音乐播放依赖音源解析直链）'),
  )
}

/* ================= venera 漫画源 ================= */
function ComicSourceSection() {
  const boot = getState().boot
  const sources = boot?.comicSources || []
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(null) // 导入进度
  const [cleaning, setCleaning] = useState(false)
  const [cleanProgress, setCleanProgress] = useState(null) // {done, total, removed, kept, removedNames, running, current}
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmClean, setConfirmClean] = useState(false)
  const fileRef = useRef(null)

  const pollClean = useCallback(() => {
    const timer = setInterval(async () => {
      try {
        const res = await api.get('/comicsource/clean-progress')
        setCleanProgress(res.progress)
        if (!res.progress.running) {
          clearInterval(timer)
          setCleaning(false)
          setCleanProgress(null)
          await actions.reload()
          actions.toast(`清理完成：移除 ${res.progress.removed} 个，保留 ${res.progress.kept} 个`)
        }
      } catch { /* 轮询失败静默重试 */ }
    }, 1500)
  }, [])

  const startClean = useCallback(async () => {
    setCleaning(true)
    try {
      const res = await fetch('/funhub/api/comicsource/clean-test', { method: 'POST', credentials: 'same-origin' })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      pollClean()
    } catch (err) {
      actions.toast(`启动清理失败：${err.message}`)
      setCleaning(false)
    }
  }, [pollClean])

  const pollProgress = useCallback(() => {
    const timer = setInterval(async () => {
      try {
        const res = await api.get('/comicsource/progress')
        setProgress(res.progress)
        if (!res.progress.running) {
          clearInterval(timer)
          setProgress(null)
          setImporting(false)
          await actions.reload()
          const skippedText = res.progress.skipped ? `，跳过重复 ${res.progress.skipped}` : ''
          const failedText = res.progress.failed?.length ? `，失败 ${res.progress.failed.length}` : ''
          actions.toast(`清单导入完成：新增 ${res.progress.added}/${res.progress.total}${skippedText}${failedText}`)
        }
      } catch { /* 轮询失败静默重试 */ }
    }, 1500)
  }, [])

  const send = useCallback(async (payload) => {
    setImporting(true)
    try {
      const res = await fetch('/funhub/api/comicsource/import', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      await actions.reload()
      if (body.manifest && body.started) {
        pollProgress()
      } else {
        setImporting(false)
        actions.toast(body.skipped ? '同 key 漫画源已存在，脚本已更新' : (body.error ? `导入异常：${body.error}` : `已导入漫画源 ${body.comicSource?.name || ''}`))
      }
    } catch (err) {
      actions.toast(`导入失败：${err.message}`)
      setImporting(false)
    }
  }, [pollProgress])

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'comic', size: 15 }), '漫画源（venera 格式）'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      'FunHub 不内置任何漫画源。支持 venera（ComicSource）格式：填单个脚本 .js 的 URL / 本地文件，或填一个清单 index.json 的 URL（数组、每项含 fileName）自动批量导入全部脚本。'),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Input, { value: url, onChange: setUrl, placeholder: '漫画源脚本 / 清单 index.json 的 URL…', style: { flex: 1, minWidth: 260 } }),
      h(Btn, { kind: 'primary', onClick: () => send({ url: url.trim() }), disabled: importing || !url.trim() }, importing ? '导入中…' : '从 URL 导入'),
      h(Btn, { onClick: () => fileRef.current?.click(), disabled: importing }, '从文件导入'),
      sources.length ? h(Btn, { kind: 'danger', onClick: () => setConfirmClean(true), disabled: cleaning }, cleaning ? '探测中…' : '检测清理失效源') : null,
      sources.length ? h(Btn, { kind: 'danger', onClick: () => setConfirmClear(true), title: '删除全部漫画源' }, '清空全部') : null,
      sources.some((x) => x.compatible === false) ? h(Btn, { kind: 'danger', onClick: async () => {
        const r = await api.op('booksource_clean')
        await actions.reload()
        actions.toast(`已清理 ${r.removed} 个不兼容书源`)
      } }, `清理不兼容 ${sources.filter((x) => x.compatible === false).length}`) : null,
      h('input', { ref: fileRef, type: 'file', hidden: true, accept: '.js,.json,text/javascript,application/json', onChange: async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) await send({ script: await file.text() })
      } })),
    progress ? h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      `后台导入中 ${progress.done}/${progress.total}（成功 ${progress.added}，失败 ${progress.failed?.length || 0}）`) : null,
    cleanProgress ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
      h('div', { className: 'fh-muted', style: { fontSize: 12 } },
        `探测中 ${cleanProgress.done}/${cleanProgress.total}（已移除 ${cleanProgress.removed}，保留 ${cleanProgress.kept}）${cleanProgress.current ? ` · 当前: ${cleanProgress.current}` : ''}`),
      cleanProgress.removedNames?.length ? h('div', { className: 'fh-muted', style: { fontSize: 11, lineHeight: 1.6 } },
        cleanProgress.removedNames.slice(-6).map((n, i) => h('div', { key: i }, `✕ ${n}`))) : null) : null,
    sources.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      sources.map((s) => h('div', { key: s.id, className: 'fh-src-row' },
        h(Toggle, { checked: s.enabled, onChange: async (v) => { await api.op('comicsource_toggle', { id: s.id, enabled: v }); await actions.reload() } }),
        h('span', { className: 'name' }, s.name),
        s.error ? h('span', { className: 'fh-chip', style: { color: 'var(--fh-danger)' }, title: s.error }, '异常') : null,
        h('span', { className: 'meta' }, s.version ? `v${s.version}` : ''),
        h('div', { className: 'fh-spacer' }),
        h('button', { className: 'fh-icon-btn', title: '删除', onClick: async () => { await api.op('comicsource_remove', { id: s.id }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 }))))) : h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '尚未导入漫画源'),
    confirmClear ? h(ClearSourcesModal, { what: '漫画源', count: sources.length, op: 'comicsource_clear', onClose: () => setConfirmClear(false) }) : null,
    confirmClean ? h(ConfirmModal, {
      title: '检测清理失效漫画源',
      message: `将逐个在线探测全部 ${sources.length} 个漫画源，脚本损坏 / 网络不可达 / 接口全挂的会被删除。`,
      hint: '正常源保留；重复导入的副本也会被清理。可随时停止；已删除的不会恢复。',
      label: '开始检测', busyLabel: '启动中…',
      onClose: () => setConfirmClean(false),
      onConfirm: () => startClean(),
    }) : null,
  )
}

/* ================= 图片源 ================= */
/* 图片源清单：free=免 Key 开箱即用；key=需申请 */
const IMAGE_SOURCE_ROWS = [
  { key: 'bing', label: 'Bing 每日壁纸', free: true },
  { key: 'picsum', label: 'Picsum 随机摄影', free: true },
  { key: 'wallhaven', label: 'Wallhaven 壁纸', free: true, keyOptional: true },
  { key: 'artic', label: '芝加哥艺术学院 · 公版艺术', free: true },
  { key: 'nasa', label: 'NASA 影像', free: true },
  { key: 'wikimedia', label: 'Wikimedia Commons', free: true },
  { key: 'pixiv', label: 'Pixiv 排行榜', free: true },
  { key: 'boredpanda', label: 'Bored Panda 创意图集', free: true },
  { key: 'designboom', label: 'Designboom 建筑·设计', free: true },
  { key: 'mymodernmet', label: 'My Modern Met 艺术·摄影', free: true },
  { key: 'pexels', label: 'Pexels', applyUrl: 'https://www.pexels.com/api/' },
  { key: 'unsplash', label: 'Unsplash', applyUrl: 'https://unsplash.com/developers' },
  { key: 'pixabay', label: 'Pixabay', applyUrl: 'https://pixabay.com/api/docs/' },
]

function ImageSourceSection() {
  const boot = getState().boot
  const cfg = boot?.settings?.imageSources || {}
  const [keys, setKeys] = useState({
    wallhaven: cfg.wallhaven?.apiKey || '',
    pexels: cfg.pexels?.apiKey || '',
    unsplash: cfg.unsplash?.apiKey || '',
    pixabay: cfg.pixabay?.apiKey || '',
  })

  const toggle = async (key, v, extra = {}) => {
    await api.op('settings_save', { settings: { imageSources: { [key]: { enabled: v, ...extra } } } })
    await actions.reload()
  }

  const saveKey = async (key, label) => {
    await api.op('settings_save', { settings: { imageSources: { [key]: { enabled: Boolean(keys[key]), apiKey: keys[key] } } } })
    await actions.reload()
    actions.toast(`已保存 ${label} Key`)
  }

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'image', size: 15 }), '图片源'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      '开关控制该源是否出现在图片广场的选择列表；免 Key 源开箱即用，需 Key 的源申请后填入。'),
    IMAGE_SOURCE_ROWS.map((s) => {
      const row = cfg[s.key] || {}
      const on = s.free ? row.enabled !== false : Boolean(row.enabled && row.apiKey)
      return h('div', { className: 'fh-src-row', key: s.key },
        h(Toggle, { checked: on, onChange: (v) => toggle(s.key, v, s.free ? {} : { apiKey: keys[s.key] || row.apiKey || '' }) }),
        h('span', { className: 'name' }, s.label),
        s.free
          ? h('span', { className: 'meta' }, '免 Key')
          : h('span', { className: 'meta', style: { color: row.apiKey ? 'var(--fh-good)' : 'var(--fh-ink3)' } }, row.apiKey ? 'Key 已配置' : '需要 Key'),
        h('div', { className: 'fh-spacer' }),
        (s.applyUrl || s.keyOptional) ? h(Input, {
          value: keys[s.key] ?? '', onChange: (v) => setKeys((k) => ({ ...k, [s.key]: v })),
          placeholder: s.keyOptional ? '可选 Key，解锁更多内容' : '粘贴 API Key…', style: { width: 190 },
        }) : null,
        (s.applyUrl || s.keyOptional) ? h(Btn, { size: 'sm', onClick: () => saveKey(s.key, s.label) }, '保存') : null,
        s.applyUrl ? h('a', { className: 'fh-btn fh-btn-sm', href: s.applyUrl, target: '_blank', rel: 'noopener noreferrer' }, '去申请') : null)
    }))
}

/* ================= 网络：出站代理 ================= */
/* ================= 影视源（Emby，用户自行添加，不内置） ================= */
function VideoSourceSection() {
  const boot = getState().boot
  const embyServers = boot?.settings?.video?.emby || []
  const [probing, setProbing] = useState(false)
  const [probeProgress, setProbeProgress] = useState(null)
  const [confirmProbe, setConfirmProbe] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const pollProbe = useCallback(() => {
    const timer = setInterval(async () => {
      try {
        const r = await api.get('/video/clean-progress')
        setProbeProgress(r.progress)
        if (!r.progress.running) {
          clearInterval(timer)
          setProbing(false)
          setProbeProgress(null)
          actions.toast(`检测完成：可用 ${r.progress.ok} 个，连接失败 ${r.progress.failed} 个（已保留）`)
        }
      } catch { /* 静默重试 */ }
    }, 1200)
  }, [])
  const stopProbe = useCallback(async () => {
    try { await fetch('/funhub/api/video/clean-stop', { method: 'POST', credentials: 'same-origin' }) } catch { /* ignore */ }
    actions.toast('正在停止检测')
  }, [])
  const startProbe = useCallback(async () => {
    setProbing(true)
    setProbeProgress({ done: 0, total: embyServers.length, current: '' })
    try {
      const res = await fetch('/funhub/api/video/clean-dead', { method: 'POST', credentials: 'same-origin' })
      const body = await res.json()
      if (!res.ok || !body.ok) {
        if (res.status === 409) {
          actions.toast('已有检测任务进行中，已显示其进度')
          pollProbe()
          return
        }
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      pollProbe()
    } catch (err) {
      actions.toast(`启动检测失败：${err.message}`)
      setProbing(false)
      setProbeProgress(null)
    }
  }, [pollProbe, embyServers.length])

  // Emby 添加表单
  const [embyUrl, setEmbyUrl] = useState('')
  const [embyUser, setEmbyUser] = useState('')
  const [embyPass, setEmbyPass] = useState('')
  const [embyKey, setEmbyKey] = useState('')
  const [embyUserId, setEmbyUserId] = useState('')
  const [embyBusy, setEmbyBusy] = useState(false)
  const [manual, setManual] = useState(false)
  // 公共字幕站（OpenSubtitles）Key
  const [osKey, setOsKey] = useState('')
  const saveOsKey = async () => {
    try {
      await api.op('settings_save', { settings: { video: { subtitleProviders: { opensubtitlesKey: osKey.trim() } } } })
      setOsKey('')
      await actions.reload()
      actions.toast('OpenSubtitles Key 已保存')
    } catch (err) { actions.toast(`保存失败：${err.message}`) }
  }

  const addEmby = async () => {
    setEmbyBusy(true)
    try {
      let server
      if (manual) {
        const r = await api.op('video_emby_add', { server: { url: embyUrl, apiKey: embyKey, userId: embyUserId, name: 'Emby' } })
        void r
      } else {
        const res = await fetch('/funhub/api/video/emby/auth', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url: embyUrl, username: embyUser, password: embyPass }),
        })
        const body = await res.json()
        if (!res.ok || !body.ok) throw new Error(body?.error || `HTTP ${res.status}`)
        server = body.server
        await api.op('video_emby_add', { server })
      }
      setEmbyUrl(''); setEmbyUser(''); setEmbyPass(''); setEmbyKey(''); setEmbyUserId('')
      await actions.reload()
      actions.toast('Emby 服务器已添加')
    } catch (err) {
      actions.toast(`添加失败：${err.message}`)
    } finally { setEmbyBusy(false) }
  }

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'film', size: 15 }), '影视源（Emby）'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      'FunHub 不内置影视源。填你的 Emby 服务器地址用账号登录，或用 API Key + 用户 ID 方式添加；播放经宿主代理，API Key 不会下发到浏览器。'),

    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 } },
      h(Input, { value: embyUrl, onChange: setEmbyUrl, placeholder: 'https://emby.example.com', style: { flex: 1, minWidth: 200 } }),
      manual ? h(Input, { value: embyKey, onChange: setEmbyKey, placeholder: 'API Key', style: { width: 150 } }) : null,
      manual ? h(Input, { value: embyUserId, onChange: setEmbyUserId, placeholder: '用户 ID', style: { width: 120 } }) : null,
      !manual ? h(Input, { value: embyUser, onChange: setEmbyUser, placeholder: '用户名', style: { width: 120 } }) : null,
      !manual ? h(Input, { value: embyPass, onChange: setEmbyPass, placeholder: '密码', type: 'password', style: { width: 120 } }) : null,
      h(Btn, { kind: 'primary', onClick: addEmby, disabled: embyBusy || !embyUrl.trim() || (manual ? (!embyKey.trim() || !embyUserId.trim()) : !embyUser.trim()) }, embyBusy ? '连接中…' : '添加'),
      h('button', { className: 'fh-chip-btn', onClick: () => setManual((m) => !m) }, manual ? '账密登录' : 'API Key 方式'),
      embyServers.length ? (probing
        ? h(Btn, { onClick: stopProbe }, '停止检测')
        : h(Btn, { kind: 'danger', onClick: () => setConfirmProbe(true) }, '检测连通性')) : null,
      embyServers.length ? h(Btn, { kind: 'danger', onClick: () => setConfirmClear(true), title: '删除全部 Emby 服务器' }, '清空全部') : null),
    probeProgress ? h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      `探测中 ${probeProgress.done}/${probeProgress.total}`
      + (probeProgress.failed ? ` · 失败 ${probeProgress.failed}（保留）` : '')
      + (probeProgress.current ? ' · 当前: ' + probeProgress.current : '')) : null,
    embyServers.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      embyServers.map((s) => h('div', { key: s.id, className: 'fh-src-row' },
        h('span', { className: 'name' }, s.name),
        h('span', { className: 'meta', title: s.url }, s.url),
        h('div', { className: 'fh-spacer' }),
        h('button', { className: 'fh-icon-btn', title: '删除', onClick: async () => { await api.op('video_emby_remove', { id: s.id }); await actions.reload() } }, h(Icon, { name: 'trash', size: 13 }))))) : h('div', { className: 'fh-muted', style: { fontSize: 12.5 } }, '尚未添加 Emby 服务器'),

    /* 公共字幕源（OpenSubtitles）：Key 存宿主，不下发浏览器 */
    (() => {
      const keySet = Boolean(boot?.settings?.video?.subtitleProviders?.opensubtitlesKeySet)
      return h('div', { style: { marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--fh-line)' } },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h(Input, {
            value: osKey, onChange: setOsKey, placeholder: 'OpenSubtitles API Key（公共字幕站搜索）',
            style: { flex: 1, minWidth: 200 }, type: 'password',
          }),
          keySet ? h('span', { className: 'fh-chip', style: { color: 'var(--fh-good)' } }, '已配置') : null,
          h(Btn, { onClick: saveOsKey, disabled: !osKey.trim() && !keySet }, '保存')),
        h('div', { className: 'fh-muted', style: { fontSize: 11.5, marginTop: 6 } },
          '选填。不填也能用：字幕菜单自带免 Key 的 SubtitleCat 公共源（中文变体优先）。填入后额外启用 OpenSubtitles（opensubtitles.com 免费注册，API Keys 页生成，免费档 20 次下载/天）。'),
      )
    })(),

    confirmClear ? h(ClearSourcesModal, {
      what: 'Emby 服务器', count: embyServers.length, op: 'video_emby_clear',
      fmt: (r) => `已清空：删除 ${r.removed} 个 Emby 服务器`,
      onClose: () => setConfirmClear(false),
    }) : null,
    confirmProbe ? h(ConfirmModal, {
      title: '检测 Emby 服务器连通性',
      message: `将逐个连接全部 ${embyServers.length} 个 Emby 服务器检查可用性；连接失败只提示、不会删除。`,
      hint: '自建服务器可能临时休眠或仅内网可达。可随时停止。',
      label: '开始检测', busyLabel: '启动中…',
      onClose: () => setConfirmProbe(false),
      onConfirm: () => startProbe(),
    }) : null,
  )
}

function NetworkSection() {
  const boot = getState().boot
  const cfg = boot?.settings?.proxy || {}
  const [host, setHost] = useState(cfg.host || '127.0.0.1')
  const [port, setPort] = useState(String(cfg.port || 7890))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState(null) // {ok, ms, via, error}

  const save = async (patch = {}) => {
    setSaving(true)
    try {
      await api.op('settings_save', { settings: { proxy: {
        enabled: patch.enabled ?? Boolean(cfg.enabled),
        host: host.trim() || '127.0.0.1',
        port: Number(port) || 7890,
      } } })
      const st = await actions.reload()
      // 回读校验：宿主进程若是旧版本（未含 proxy 白名单）会静默丢弃该字段
      const saved = st?.settings?.proxy
      if (!saved || Number(saved.port) !== (Number(port) || 7890) || Boolean(saved.enabled) !== (patch.enabled ?? Boolean(cfg.enabled))) {
        actions.toast('保存未生效：请重启 DSH 应用后重试（宿主版本较旧）')
        return
      }
      actions.toast('代理设置已保存')
    } catch (err) {
      actions.toast(err.message)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      // 先保存当前输入再测试（测的就是将要生效的配置）
      await save()
      const res = await fetch('/funhub/api/network/check', { method: 'POST', credentials: 'same-origin' })
      setResult(await res.json())
    } catch (err) {
      setResult({ ok: false, error: err.message })
    } finally {
      setTesting(false)
    }
  }

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'refresh', size: 15 }), '网络 · 出站代理'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      '书源 / 图源 / RSS / 洛雪音源与漫画源脚本的全部出站请求统一走此代理（HTTP 代理）。保存后立即生效；正在运行的脚本沙箱会按新代理自动重启。'),
    h('div', { className: 'fh-field' },
      h('label', null, '启用代理'),
      h('div', { className: 'fh-spacer' }),
      h(Toggle, { checked: Boolean(cfg.enabled), onChange: (v) => save({ enabled: v }) }),
      h('span', { className: 'fh-muted', style: { fontSize: 12 } }, cfg.enabled ? '已启用' : '直连')),
    h('div', { className: 'fh-field' },
      h('label', null, '代理地址与端口'),
      h(Input, { value: host, onChange: setHost, placeholder: '127.0.0.1', style: { width: 150 } }),
      h('span', { className: 'fh-muted' }, ':'),
      h(Input, { value: port, onChange: setPort, placeholder: '7890', style: { width: 80 } }),
      h(Btn, { size: 'sm', kind: 'primary', onClick: () => save(), disabled: saving }, saving ? '保存中…' : '保存'),
      h(Btn, { size: 'sm', onClick: test, disabled: testing }, testing ? '测试中…' : '测试连通')),
    result ? h('div', { style: { fontSize: 12, color: result.ok ? 'var(--fh-good)' : 'var(--fh-danger)' } },
      result.ok ? `✓ 连通正常（${result.via} · ${result.ms}ms）` : `✗ ${result.error || '连接失败'}（${result.via || ''}）`) : null,
    h('div', { className: 'fh-muted', style: { fontSize: 12 } }, '常见端口：Clash 7890 · V2RayN 10809 · Surge 6152 · Shadowrocket 1080'),
  )
}

/* ================= 首页布局：可视化拖拽网格编辑器 ================= */
const TYPE_ICONS = { novel: 'book', comic: 'comic', gallery: 'image', music: 'music', games: 'game', rss: 'rss' }
const SIZE_ORDER = ['1x1', '2x1', '1x2', '2x2']

function LayoutSection() {
  const boot = getState().boot
  const layout = [...(boot?.layout || [])]
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  const save = async (next) => {
    await api.op('layout_save', { layout: next })
    await actions.reload()
  }

  // 拖拽 A 到 B 上 = 交换两者在布局数组中的顺序（首页 grid-auto-flow:dense 按顺序+跨度排布）
  const swap = (i, j) => {
    if (i == null || j == null || i === j) return
    const next = [...layout]
    ;[next[i], next[j]] = [next[j], next[i]]
    void save(next)
  }

  const cycleSize = (i) => {
    const next = [...layout]
    const cur = SIZE_ORDER.indexOf(next[i].size || '1x1')
    next[i] = { ...next[i], size: SIZE_ORDER[(cur + 1) % SIZE_ORDER.length] }
    void save(next)
  }

  const toggleShow = (i) => {
    const next = [...layout]
    next[i] = { ...next[i], show: next[i].show === false }
    void save(next)
  }

  const visible = layout.map((c, i) => ({ c, i })).filter(({ c }) => c.show !== false)
  const hidden = layout.map((c, i) => ({ c, i })).filter(({ c }) => c.show === false)

  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'grid', size: 15 }), '首页布局'),
    h('div', { className: 'fh-muted', style: { fontSize: 12 } },
      '拖拽卡片交换位置 · 点击尺寸标签循环 小/宽/高/大 · 「隐藏」从首页移除（下方可恢复）。与首页 4 列网格同构，改动立即生效。'),
    h('div', { className: 'fh-layout-grid' },
      visible.map(({ c, i }) => h('div', {
        key: c.type,
        className: `fh-layout-tile size-${c.size || '1x1'}${dragIndex === i ? ' is-dragging' : ''}${overIndex === i && dragIndex !== null && dragIndex !== i ? ' is-over' : ''}`,
        draggable: true,
        onDragStart: (e) => {
          setDragIndex(i)
          e.dataTransfer.effectAllowed = 'move'
          try { e.dataTransfer.setData('text/plain', String(i)) } catch { /* 兼容 */ }
        },
        onDragEnd: () => { setDragIndex(null); setOverIndex(null) },
        onDragOver: (e) => { e.preventDefault(); if (overIndex !== i) setOverIndex(i) },
        onDragLeave: () => setOverIndex((o) => (o === i ? null : o)),
        onDrop: (e) => { e.preventDefault(); swap(dragIndex, i); setDragIndex(null); setOverIndex(null) },
      },
        h('div', { className: 'tile-head' },
          h(Icon, { name: TYPE_ICONS[c.type] || 'grid', size: 17 }),
          h('span', { className: 'lbl' }, CARD_LABELS[c.type] || c.type)),
        h('div', { className: 'acts' },
          h('button', { onClick: () => cycleSize(i), title: '循环切换尺寸' }, SIZE_LABELS[c.size] || '1×1'),
          h('button', { onClick: () => toggleShow(i), title: '从首页隐藏' }, '隐藏')))),
    ),
    hidden.length ? h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 } },
      h('span', { className: 'fh-muted', style: { fontSize: 12 } }, '已隐藏：'),
      hidden.map(({ c, i }) => h('button', {
        key: c.type, className: 'fh-chip-btn',
        onClick: () => toggleShow(i),
      }, `${CARD_LABELS[c.type] || c.type} ↩ 显示`))) : null,
  )
}

/* ================= 数据管理 ================= */
function DataSection() {
  const [confirming, setConfirming] = useState(false)
  const scopes = [
    { key: 'imageHistory', label: '图片浏览历史' },
    { key: 'playbackHistory', label: '播放历史' },
    { key: 'rssArticles', label: 'RSS 文章缓存' },
    { key: 'favorites', label: '全部收藏' },
    { key: 'novelHistory', label: '小说阅读历史' },
    { key: 'comicHistory', label: '漫画阅读历史' },
    { key: 'all', label: '所有用户数据（保留源配置）' },
  ]
  return h('div', { className: 'fh-section' },
    h('div', { className: 'fh-section-title' }, h(Icon, { name: 'trash', size: 15 }), '数据管理'),
    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      h(Btn, { onClick: async () => {
        const state = getState().boot
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `funhub-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(a.href)
      } }, h(Icon, { name: 'doc', size: 13 }), ' 导出数据快照'),
      h(Btn, { kind: 'danger', onClick: () => setConfirming(true) }, '清理数据')),
    confirming
      ? h(Modal, { title: '清理数据', onClose: () => setConfirming(false), width: 420 },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            scopes.map((s) => h('button', {
              key: s.key, className: 'fh-btn', style: { justifyContent: 'flex-start' },
              onClick: async () => {
                await api.op('data_clear', { scope: s.key })
                await actions.reload()
                setConfirming(false)
                actions.toast(`已清理：${s.label}`)
              },
            }, s.label))))
      : null,
  )
}
