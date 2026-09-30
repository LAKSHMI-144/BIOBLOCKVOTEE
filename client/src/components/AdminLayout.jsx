import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from './PublicHeader'
import { adminToken } from '../api'

const LINKS = [
  ['/admin', 'Dashboard', true],
  ['/admin/candidates', 'Candidates'],
  ['/admin/voters', 'Voters'],
  ['/admin/audit', 'Audit Logs'],
  ['/admin/blockchain', 'Blockchain'],
  ['/admin/results', 'Results'],
]

export default function AdminLayout() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  if (!adminToken.get()) return <Navigate to="/admin/login" replace />
  const logout = () => { adminToken.clear(); nav('/admin/login') }

  return (
    <div className="bb-admin">
      <div className="bb-topbar">
        <span className="bb-brand"><Logo />BlockBioVote</span>
        <button className="btn secondary" style={{ padding: '6px 12px' }} aria-label="Open menu" onClick={() => setOpen(true)}>Menu</button>
      </div>
      <aside className={`bb-side ${open ? 'open' : ''}`}>
        <span className="bb-brand"><Logo /><span>BlockBioVote<small>Admin / Auditor</small></span></span>
        <nav aria-label="Admin">
          {LINKS.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
          ))}
        </nav>
        <button className="lo" onClick={logout}>Log out</button>
      </aside>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />}
      <main className="bb-main"><Outlet /></main>
    </div>
  )
}
