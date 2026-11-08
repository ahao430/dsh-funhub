// 测试失效保护：宿主 apply() 会注册 process 级 uncaughtException/unhandledRejection
// 兜底（保护 DSH 进程不被第三方脚本回调弄崩）。副作用：E2E 测试里顶层裸 assert
// 失败也被兜底吞掉，进程以 0 退出 → 测试假绿。
// 本模块在宿主之前注册自己的处理器并直接 process.exit(1)，保证失败立刻显形。
// 用法：受影响测试的第一行 import './lib/failfast.mjs'（必须先于 apply() 调用）。
process.on('uncaughtException', (err) => {
  console.error('\n测试失败:', err?.stack || err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('\n测试失败 (rejection):', reason?.stack || reason)
  process.exit(1)
})
