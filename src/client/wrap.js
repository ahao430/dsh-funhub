// 浏览器半片入口：工厂由 DSH ModuleLoader 物化，react 等外部依赖
// 在物化时经 require 注入（见 scripts/build.mjs）。
module.exports = require('./index.jsx')
