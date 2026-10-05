import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from './PublicHeader'
import { adminToken } from '../api'

const GROUPS = [
  [null, [['/admin', 'Dashboard', true]]],
  ['Election', [['/admin/election', 'Election Details']]],
  ['Candidates', [['/admin/candidates', 'View Candidates']]],
  ['Voters', [['/admin/voters', 'Registered Voters']]],
  ['Voting', [['/admin/voting', 'Votes & Progress']]],
  ['Audit & Security', [['/admin/audit', 'Audit Logs']]],
  ['Blockchain', [['/admin/blockchain', 'Chain & Integrity']]],
  ['Results', [['/admin/results', 'Election Results']]],
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
          {GROUPS.map(([title, links]) => (
            <div key={title || 'top'}>
              {title && <div className="grp">{title}</div>}
              {links.map(([to, label, end]) => (
                <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="lo" onClick={logout}>Log out</button>
      </aside>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />}
      <main className="bb-main"><Outlet /></main>
    </div>
  )
}
