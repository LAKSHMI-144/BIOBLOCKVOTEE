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
