// 洛雪（LX Music）自定义音源脚本运行时（父侧 RPC 客户端）。
// 实际脚本执行在独立子进程沙箱（runners/source-runner.mjs）：脚本任何异常最多杀掉
// 子进程（自动重启），宿主进程绝对安全——DSH 宿主对漏网 rejection 有终身 fatal handler，
// 脚本必须进程隔离。plan §8.3 / §17.1 的隔离要求由进程边界实现。
import { SandboxProcess } from './sandbox-process.js'

export const LX_PLATFORM_NAMES = { wy: '网易云音乐', tx: 'QQ音乐', kw: '酷我音乐', kg: '酷狗音乐', mg: '咪咕音乐' }

/** 从脚本头部注释提取元信息（@name/@version/@author/@description）。 */
export function parseScriptMeta(source) {
  const meta = {}
  const head = String(source || '').slice(0, 4000)
  const patterns = { name: /@name\s+(.+)/, version: /@version\s+(.+)/, author: /@author\s+(.+)/, description: /@description\s+(.+)/ }
  for (const [key, re] of Object.entries(patterns)) {
    const m = re.exec(head)
    if (m) meta[key] = m[1].trim().slice(0, 120)
  }
  return meta
}

export class LxRuntime {
  /** @param {string} scriptText @param {{onLog?: Function}} deps */
  constructor(scriptText, deps = {}) {
    this.scriptText = String(scriptText || '')
    this.onLog = deps.onLog
    this.disposed = false
    this.capabilitiesCache = null

    this.process = new SandboxProcess({
      mode: 'lx',
      script: this.scriptText,
      onLog: deps.onLog,
      proxy: deps.proxy || '',
    })
  }

  /** 等 ready（脚本 inited 或超时），返回 {capabilities, loadError}。 */
  async ensureReady() {
    if (this.disposed) throw new Error('脚本已卸载')
    const info = await this.process.readyPromise
    this.capabilitiesCache = info?.capabilities || {}
    return info
  }

  /** inited 事件声明的音源能力：{ wy: {name, actions, qualitys}, ... } */
  capabilities() {
    return this.capabilitiesCache || {}
  }

  status() {
    return {
      loadError: this.process.info?.loadError || null,
      inited: Boolean(this.process.info?.capabilities && Object.keys(this.process.info.capabilities).length),
      capabilities: this.capabilities(),
      logs: [],
    }
  }

  /**
   * 处理一次 request 事件（musicUrl / lyric / pic）。
   * @param {{action: string, source: string, info: object}} payload
   */
  async handleRequest(payload) {
    if (this.disposed) throw new Error('脚本已卸载')
    return await this.process.call('request', [payload.action, payload.source, payload.info])
  }

  dispose() {
    this.disposed = true
    this.process.dispose()
  }
}
