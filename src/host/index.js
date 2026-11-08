/**
 * FunHub Host 半片：/funhub/* 接口、本地数据存储、外部内容源代理与隔离脚本运行时。
 * Host / Client 通过 DSH webServer 同源 HTTP 通信；所有出站请求都经过
 * fetcher.js 的统一安全通道（URL 校验、SSRF 防护、超时与大小上限）。
 */
import { Store } from './store.js'
import { route } from './api.js'

export const name = 'funhub'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Web 服务不会替插件路由鉴权，所以每个请求都要自己走一遍 Host/Origin 和登录凭证检查。
 * 拿不到鉴权服务时一律拒绝。
 */
function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

export const inject = ['webServer', 'connection']

export function apply(ctx) {
  const store = new Store()
  const logger = ctx.logger

  // 第三方脚本（洛雪音源 / venera 漫画源）的异步回调可能产生 unhandled rejection，
  // Node 默认行为是崩掉整个宿主进程——这里兜底为记录日志，保护 DSH 宿主与其余插件。
  const onUnhandledRejection = (reason) => {
    logger.warn(`[funhub] 未处理的 Promise rejection（已兜底）: ${reason?.message || reason}`)
  }
  const onUncaughtException = (err) => {
    logger.warn(`[funhub] 未捕获异常（已兜底）: ${err?.message || err}`)
  }
  process.on('unhandledRejection', onUnhandledRejection)
  process.on('uncaughtException', onUncaughtException)
  ctx.effect(() => () => {
    process.off('unhandledRejection', onUnhandledRejection)
    process.off('uncaughtException', onUncaughtException)
  }, 'funhub: process rejection guards')

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: '/funhub',
      handler: async (req, res) => {
        try {
          const rejection = requestRejection(ctx, req)
          if (rejection) {
            json(res, rejection, { error: '未授权' })
            return
          }
          await route(ctx, store, req, res)
        } catch (err) {
          logger.warn(`[funhub] 请求处理失败 ${req.url}: ${err.message}`)
          if (!res.headersSent) json(res, err.status || 500, { error: err.message || '服务内部错误' })
          else res.end()
        }
      },
    }, 'funhub: /funhub routes'),
  )

  logger.info('[funhub] 娱乐工作台已启动：/funhub/* API 就绪')
}
