// Venera 漫画源脚本运行时（父侧 RPC 客户端）。
// 实际脚本执行在独立子进程沙箱（runners/source-runner.mjs）：脚本任何异常最多杀掉
// 子进程（自动重启），宿主进程绝对安全——DSH 宿主对漏网 rejection 有终身 fatal handler，
// 脚本必须进程隔离。对外接口与旧进程内实现完全一致。
import { SandboxProcess } from './sandbox-process.js'

const CALL_TIMEOUT_MS = 30_000

export class VeneraRuntime {
  /**
   * @param {string} scriptText
   * @param {{data?: object, settings?: object, onLog?: Function}} opts
   */
  constructor(scriptText, opts = {}) {
    this.scriptText = String(scriptText || '')
    this.data = { ...(opts.data || {}) }
    this.settings = { ...(opts.settings || {}) }
    this.disposed = false
    this.loadError = null
    this.explorePages = []
    this.onLog = opts.onLog
    this.onDataChange = null

    this.process = new SandboxProcess({
      mode: 'venera',
      script: this.scriptText,
      data: this.data,
      settings: this.settings,
      onLog: opts.onLog,
      proxy: opts.proxy || '',
      onDataChange: (data) => {
        this.data = data || this.data
        this.onDataChange?.()
      },
    })
  }

  /** 等 ready（含 init），超时抛错。 */
  async ensureReady() {
    if (this.disposed) throw new Error('脚本已卸载')
    const info = await this.process.readyPromise
    if (info?.loadError) this.loadError = info.loadError
    this.explorePages = info?.explorePages || []
    return info
  }

  info() {
    return {
      name: this.process.info?.name || '',
      key: this.process.info?.key || '',
      version: this.process.info?.version || '',
      hasSearch: Boolean(this.process.info?.hasSearch),
      hasExplore: Boolean(this.process.info?.hasExplore),
      loadError: this.process.info?.loadError || this.loadError,
      logs: [],
    }
  }

  async call(fn, args, { timeoutMs } = {}) {
    if (this.disposed) throw new Error('脚本已卸载')
    return await this.process.call(fn, args, { timeoutMs: timeoutMs ?? CALL_TIMEOUT_MS })
  }

  /** 搜索（options 按 venera 约定取每项默认值，runner 内实现）。 */
  async search(keyword, page = 1) {
    return await this.call('search', [keyword, page])
  }

  async getComic(id) {
    return await this.call('getComic', [id])
  }

  /** 章节目录（runner 内已归一化为 {group,id,title}[]）。 */
  async getChapters(id) {
    return await this.call('chapters', [id])
  }

  async loadEp(comicId, epId) {
    return await this.call('ep', [comicId, epId])
  }

  /** 发现页清单（runner ready 信息，需先 ensureReady）。 */
  exploreList() {
    return this.explorePages
  }

  /** 加载发现页并归一化为 sections（父侧做形状兼容）。 */
  async loadExplore(index, page = 1) {
    const raw = await this.call('explore', [index, page])
    const mapComic = (c) => ({
      id: String(c?.id ?? ''),
      title: String(c?.title ?? ''),
      subtitle: String(c?.subtitle ?? ''),
      cover: String(c?.cover ?? ''),
      tags: Array.isArray(c?.tags) ? c.tags.slice(0, 6).map(String) : [],
    })
    const sections = []
    const items = Array.isArray(raw) ? raw : raw?.comics
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && Array.isArray(item.comics)) {
          sections.push({ title: String(item.title || ''), comics: item.comics.map(mapComic).filter((c) => c.id && c.title) })
        } else if (item && (item.id || item.title)) {
          if (!sections.length) sections.push({ title: '', comics: [] })
          const comic = mapComic(item)
          if (comic.id && comic.title) sections[0].comics.push(comic)
        }
      }
    }
    return { sections }
  }

  /** 图片加载配置（url + headers，runner 内执行 onImageLoad）。 */
  async imageConfig(url) {
    try {
      const conf = await this.call('imageConfig', [url], { timeoutMs: 8_000 })
      if (conf && typeof conf === 'object' && conf.url) return conf
    } catch { /* 脚本异常时退化为直链 */ }
    return { url, headers: {} }
  }

  dispose() {
    this.disposed = true
    this.process.dispose()
  }
}
