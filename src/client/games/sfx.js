// 游戏音效：WebAudio 振荡器实时合成，不依赖任何音频素材文件。
// 浏览器自动播放策略：AudioContext 首次创建后可能处于 suspended，
// 音效都由用户按键/点击触发，resume 在手势上下文里调用即可正常出声。

let ctx = null
let enabled = (() => {
  try { return localStorage.getItem('funhub.sfx') !== 'off' } catch { return true } // SSR/无 localStorage 时默认开
})()

function ac() {
  if (typeof window === 'undefined') return null // SSR/测试环境无音频
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** 单音：freq→freqEnd 扫频 + 快起缓落包络。 */
function tone({ freq = 440, freqEnd, dur = 0.08, type = 'sine', vol = 0.12, delay = 0 }) {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** 白噪声爆发（爆炸/落地质感），线性衰减。 */
function noise({ dur = 0.2, vol = 0.15 }) {
  const a = ac()
  if (!a) return
  const n = Math.max(1, Math.floor(a.sampleRate * dur))
  const buf = a.createBuffer(1, n, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
  const src = a.createBufferSource()
  const gain = a.createGain()
  gain.gain.value = vol
  src.buffer = buf
  src.connect(gain).connect(a.destination)
  src.start()
}

/** 具名音效表：短促轻量，避免连发时吵闹。 */
const EFFECTS = {
  move: () => tone({ freq: 620, dur: 0.04, type: 'square', vol: 0.04 }),
  rotate: () => tone({ freq: 760, freqEnd: 980, dur: 0.06, type: 'triangle', vol: 0.07 }),
  lock: () => { tone({ freq: 220, freqEnd: 140, dur: 0.09, type: 'triangle', vol: 0.11 }); noise({ dur: 0.05, vol: 0.05 }) },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.09, type: 'triangle', vol: 0.09, delay: i * 0.06 })),
  over: () => [440, 349, 294, 220].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'sawtooth', vol: 0.07, delay: i * 0.12 })),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.09, delay: i * 0.09 })),
  eat: () => tone({ freq: 880, freqEnd: 1320, dur: 0.07, type: 'sine', vol: 0.1 }),
  flip: () => tone({ freq: 540, dur: 0.04, type: 'sine', vol: 0.06 }),
  match: () => { tone({ freq: 784, dur: 0.08, type: 'sine', vol: 0.09 }); tone({ freq: 1175, dur: 0.1, type: 'sine', vol: 0.08, delay: 0.07 }) },
  miss: () => tone({ freq: 300, freqEnd: 220, dur: 0.1, type: 'sine', vol: 0.05 }),
  boom: () => { noise({ dur: 0.4, vol: 0.2 }); tone({ freq: 120, freqEnd: 40, dur: 0.35, type: 'sawtooth', vol: 0.14 }) },
  flag: () => tone({ freq: 980, dur: 0.05, type: 'square', vol: 0.05 }),
  push: () => tone({ freq: 180, freqEnd: 150, dur: 0.08, type: 'triangle', vol: 0.09 }),
  goal: () => { tone({ freq: 1047, dur: 0.09, type: 'sine', vol: 0.08 }); tone({ freq: 1568, dur: 0.12, type: 'sine', vol: 0.07, delay: 0.08 }) },
  bad: () => tone({ freq: 200, freqEnd: 160, dur: 0.12, type: 'square', vol: 0.06 }),
  merge: () => { tone({ freq: 660, dur: 0.06, type: 'triangle', vol: 0.09 }); tone({ freq: 880, dur: 0.08, type: 'triangle', vol: 0.08, delay: 0.05 }) },
  place: () => tone({ freq: 420, freqEnd: 340, dur: 0.06, type: 'triangle', vol: 0.1 }),
}

export const sfx = {
  play(name) {
    if (!enabled) return
    try { EFFECTS[name]?.() } catch { /* 音频不可用时静默 */ }
  },
  get enabled() { return enabled },
  setEnabled(v) {
    enabled = v
    try { localStorage.setItem('funhub.sfx', v ? 'on' : 'off') } catch { /* ignore */ }
    if (v) ac() // 开启时预热 AudioContext（在手势上下文里调用）
  },
}
