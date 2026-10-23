import axios from 'axios'

// VITE_API_BASE_URL = Node server root (e.g. http://localhost:5000); '/api' is appended.
const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')
export const API = `${BASE}/api`

const TOKEN_KEY = 'bbv_admin_token'
export const adminToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: t => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

// Axios instance for admin-only endpoints: attaches the token, and returns to login when it expires.
export const adminApi = axios.create({ baseURL: API })
adminApi.interceptors.request.use(cfg => {
  const t = adminToken.get()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})
adminApi.interceptors.response.use(r => r, e => {
  if (e.response?.status === 401) { adminToken.clear(); window.location.assign('/admin/login') }
  return Promise.reject(e)
})

export const errText = (e, fallback = 'Something went wrong') =>
  e?.response?.data?.message || (e?.request ? 'Cannot reach the server. Is the backend running?' : fallback)

// ---- Voter-side helpers -------------------------------------------------------------------
// Registration ticket from /voters/register (kept for this browser tab only).
const REG_KEY = 'bbv_reg_token'
export const regToken = {
  get: () => sessionStorage.getItem(REG_KEY),
  set: t => sessionStorage.setItem(REG_KEY, t),
  clear: () => sessionStorage.removeItem(REG_KEY),
}
export const bearer = tok => (tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})

// Turns any axios error into { message, code, status, fields } for display.
// Known codes are translated; otherwise the backend's (safe) message; otherwise a generic per-status text.
export function apiError(e, t) {
  const tr = k => { const s = t(k); return s === k ? null : s }
  if (!e?.response) return { message: tr('err.network') || errText(e), code: 'NETWORK', status: 0, fields: {} }
  const { status, data = {} } = e.response
  const fields = {}
  for (const [f, v] of Object.entries(data.errors || {})) fields[f] = tr(`err.${v.code}`) || v.message
  const message = (data.code && tr(`err.${data.code}`)) || data.message || tr(`err.http.${status}`) || tr('err.http.500')
  return { message, code: data.code, status, fields, retryAfter: data.retry_after }
}
