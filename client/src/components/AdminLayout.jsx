import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from './PublicHeader'
import { adminToken } from '../api'

const NAV = [
  { id: 'dashboard', title: 'Dashboard', links: [{ to: '/admin', label: 'Dashboard', end: true }] },
  { id: 'election', title: 'Election', links: [{ to: '/admin/election', label: 'Election Details' }, { to: '/admin/candidates', label: 'Candidates' }] },
  { id: 'voters', title: 'Voters', links: [{ to: '/admin/voters', label: 'Registered Voters' }, { to: '/admin/voting', label: 'Voting Progress' }] },
  { id: 'security', title: 'Security', links: [{ to: '/admin/audit', label: 'Audit Logs' }, { to: '/admin/blockchain', label: 'Blockchain Integrity' }] },
  { id: 'results', title: 'Results', links: [{ to: '/admin/results', label: 'Results' }] },
]

export default function AdminLayout() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  if (!adminToken.get()) return <Navigate to="/admin/login" replace />

  const logout = () => {
    adminToken.clear()
    nav('/admin/login')
  }

  return (
    <div className="bb-admin-shell">
      <aside className={`bb-admin-sidebar ${open ? 'open' : ''}`}>
        <div className="bb-sidebar-brand">
          <div className="bb-brand-mark"><Logo /></div>
          <div>
            <div className="bb-brand-name">BlockBioVote</div>
            <div className="bb-brand-subtitle">Admin / Auditor</div>
          </div>
        </div>

        <nav className="bb-admin-nav" aria-label="Admin navigation">
          {NAV.map(group => (
            <div key={group.id} className="bb-nav-group">
              {group.title && <div className="bb-nav-label">{group.title}</div>}
              {group.links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `bb-nav-item ${isActive ? 'active' : ''}`}
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <button className="bb-logout" onClick={logout}>Log out</button>
      </aside>

      <div className="bb-admin-content">
        <header className="bb-admin-topbar">
          <div className="bb-topbar-left">
            <button className="bb-menu-btn" aria-label="Open menu" onClick={() => setOpen(!open)}>☰</button>
            <div>
              <div className="bb-topbar-kicker">Administration</div>
              <h1>Election Command Center</h1>
            </div>
          </div>
          <div className="bb-topbar-user">
            <span className="bb-user-badge">A</span>
            <span>Admin / Auditor</span>
          </div>
        </header>

        <main className="bb-admin-main">
          <Outlet />
        </main>
      </div>

      {open && <button className="bb-overlay" aria-label="Close menu" onClick={() => setOpen(false)} />}
    </div>
  )
}
