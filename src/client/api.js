// Host API 客户端：同源 fetch /funhub/api/*，统一错误与写操作入口。

const BASE = '/funhub/api'

async function request(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok || !body?.ok) {
    throw new Error(body?.error || `HTTP ${res.status}`)
  }
  return body
}

export const api = {
  get: (path) => request(path),

  /** 写操作单入口：op + 参数。 */
  op: async (op, payload = {}) => {
    const res = await request('/op', { method: 'POST', body: JSON.stringify({ op, ...payload }) })
    return res.result
  },

  /** 上传本地音频（二进制直传）。 */
  uploadAudio: async (file, onProgress) => {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE}/music/upload`)
      xhr.setRequestHeader('content-type', file.type || 'audio/mpeg')
      xhr.setRequestHeader('content-disposition', `attachment; filename="${encodeURIComponent(file.name)}"`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText)
          if (xhr.status === 200 && body.ok) resolve(body)
          else reject(new Error(body?.error || `HTTP ${xhr.status}`))
        } catch {
          reject(new Error(`HTTP ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('上传失败'))
      xhr.send(file)
    })
  },
}

export { request }
