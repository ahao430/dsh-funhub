// 第三方源脚本的子进程 RPC 客户端。
// 隔离保证：脚本任何异常最多杀掉子进程（父侧自动重启），宿主进程绝对安全——
// DSH 宿主对漏网 rejection 有终身 fatal handler，脚本必须进程隔离（见 runners/source-runner.mjs）。
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const RUNNER_PATH = fileURLToPath(new URL('./runners/source-runner.mjs', import.meta.url))

const CALL_TIMEOUT_MS = 32_000
const READY_TIMEOUT_MS = 15_000

export class SandboxProcess {
  /**
   * @param {{mode: 'lx'|'venera', script: string, data?: object, settings?: object,
   *          onLog?: Function, onDataChange?: Function}} opts
   */
  constructor(opts) {
    this.opts = opts
    this.seq = 0
    this.pending = new Map()
    this.info = null
    this.ready = false
    this.dead = false
    this.child = null
    this.readyPromise = null
    this.spawn()
  }

  spawn() {
    if (this.child) return this.readyPromise
    this.dead = false
    this.pending.forEach(({ reject }) => reject(new Error('沙箱重启中，请重试')))
    this.pending.clear()
    const child = fork(RUNNER_PATH, [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      execArgv: [],
    })
    this.child = child
    child.stderr?.on('data', (chunk) => {
      const line = String(chunk).trim()
      if (line) this.opts.onLog?.('stderr', line.slice(0, 400))
    })
    child.on('message', (msg) => {
      if (msg?.type === 'ready') {
        this.info = msg.info || {}
        this.ready = true
        this.readyResolve?.(this.info)
        return
      }
      if (msg?.type === 'result') {
        const entry = this.pending.get(msg.seq)
        if (!entry) return
        this.pending.delete(msg.seq)
        clearTimeout(entry.timer)
        if (msg.ok) entry.resolve(msg.data)
        else entry.reject(new Error(msg.error || '脚本调用失败'))
        return
      }
      if (msg?.type === 'logs') {
        for (const line of msg.logs || []) this.opts.onLog?.(line.level, line.line)
        return
      }
      if (msg?.type === 'data') {
        this.opts.onDataChange?.(msg.data)
      }
    })
    child.on('exit', (code, signal) => {
      this.child = null
      this.dead = true
      this.ready = false
      this.info = null
      this.readyPromise = null
      this.pending.forEach(({ reject }) => reject(new Error(`沙箱进程退出（${code ?? signal ?? '?'}）`)))
      this.pending.clear()
      this.opts.onLog?.('warn', `沙箱进程退出（${code ?? signal ?? '?'}），下次调用将自动重启`)
    })
    child.on('error', (err) => {
      this.opts.onLog?.('error', `沙箱进程错误：${err.message}`)
    })

    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      const timer = setTimeout(() => reject(new Error('沙箱初始化超时')), READY_TIMEOUT_MS)
      this.readyResolve = (info) => { clearTimeout(timer); resolve(info) }
      child.once('exit', () => { clearTimeout(timer); if (!this.ready) reject(new Error('沙箱启动失败')) })
    })
    child.send({ type: 'init', mode: this.opts.mode, script: this.opts.script, data: this.opts.data || {}, settings: this.opts.settings || {}, proxy: this.opts.proxy || '' })
    return this.readyPromise
  }

  /** 等 ready 后发 call；子进程死亡时下次调用自动重启。 */
  async call(fn, args, { timeoutMs = CALL_TIMEOUT_MS } = {}) {
    if (!this.child) await this.spawn().catch((err) => { throw new Error(err.message) })
    const seq = ++this.seq
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq)
        reject(new Error('脚本处理超时'))
      }, timeoutMs)
      this.pending.set(seq, { resolve, reject, timer })
      try {
        this.child.send({ type: 'call', seq, fn, args: args || [] })
      } catch (err) {
        this.pending.delete(seq)
        clearTimeout(timer)
        reject(new Error(`沙箱通信失败：${err.message}`))
      }
    })
  }

  dispose() {
    const child = this.child
    this.child = null
    this.dead = true
    this.pending.forEach(({ reject }) => reject(new Error('脚本已卸载')))
    this.pending.clear()
    if (child) {
      try { child.kill() } catch { /* ignore */ }
    }
  }
}
