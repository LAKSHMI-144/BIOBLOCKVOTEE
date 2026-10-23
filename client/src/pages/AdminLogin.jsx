import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import PublicHeader from '../components/PublicHeader'
import { API, adminToken, errText } from '../api'

export default function AdminLogin() {
  const nav = useNavigate()
  const [f, setF] = useState({ username: '', password: '' })
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (!f.username || !f.password) return setErr('Enter your username and password.')
    setLoading(true); setErr('')
    try {
      const r = await axios.post(`${API}/admin/login`, f)
      adminToken.set(r.data.token)
      nav('/admin')
    } catch (e2) {
      setErr(errText(e2, 'Login failed'))
    }
    setLoading(false)
  }

  return (
    <>
      <PublicHeader />
      <div className="bb-center">
        <form className="card bb-form" onSubmit={submit} noValidate>
          <h2>Admin &amp; Auditor Login</h2>
          <p className="hint" style={{ fontSize: 14 }}>Authorised personnel only.</p>
          <label htmlFor="u">Username</label>
          <input id="u" className="input" autoComplete="username" autoFocus value={f.username} onChange={e => setF({ ...f, username: e.target.value })} />
          <label htmlFor="p">Password</label>
          <input id="p" className="input" type="password" autoComplete="current-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
          {err && <p className="msg error" role="alert" style={{ marginTop: 10, textAlign: 'left' }}>{err}</p>}
          <button className="btn primary" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <p className="hint" style={{ fontSize: 13, marginTop: 18, textAlign: 'center' }}><Link to="/" style={{ color: 'var(--accent)' }}>← Back to home</Link></p>
        </form>
      </div>
    </>
  )
}
