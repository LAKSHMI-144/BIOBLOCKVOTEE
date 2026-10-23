import { useEffect, useState } from 'react'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import { eventLabel, fmtTime, statusTone } from '../../lib/adminFormat'

const BLANK = { q: '', event: '', role: '', status: '', from: '', to: '' }

export default function AdminAudit() {
  const [f, setF] = useState(BLANK)          // applied filters
  const [draftQ, setDraftQ] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const { data, error, loading, reload } = useLoad(() => adminApi.get('/admin/audit-logs', { params: { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, page_size: size } }))

  useEffect(() => { reload() }, [f, page, size])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { setPage(1); setF(p => (p.q === draftQ.trim() ? p : { ...p, q: draftQ.trim() })) }, 300); return () => clearTimeout(t) }, [draftQ])

  const change = (k, v) => { setPage(1); setF(p => ({ ...p, [k]: v })) }
  const s = data?.summary
  const filtered = Object.values(f).some(Boolean)
  const clear = () => { setPage(1); setDraftQ(''); setF(BLANK) }

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Audit & security</div>
          <h1>Audit logs</h1>
          <p className="bb-page-subtitle">Application events and administrative actions, newest first.</p>
        </div>
        <button type="button" className="bb-button" onClick={reload} disabled={loading}>Refresh</button>
      </header>

      <p className="note">The audit log records what happened in the application. It is a database table and is not claimed to be immutable. Tamper evidence for vote records is the job of the separate hash-linked blockchain prototype. Votes are logged without the chosen candidate, and no passwords, tokens, OTPs or biometric data are stored here.</p>

      <div className="bb-summary-grid bb-summary-4">
        <div className="bb-summary-card"><div className="bb-summary-label">Total events</div><div className="bb-summary-value">{s ? s.total : '–'}</div><div className="bb-summary-meta">all time</div></div>
        <div className="bb-summary-card"><div className="bb-summary-label">Voter events</div><div className="bb-summary-value">{s ? s.voter : '–'}</div><div className="bb-summary-meta">actor: voter</div></div>
        <div className="bb-summary-card"><div className="bb-summary-label">Admin events</div><div className="bb-summary-value">{s ? s.admin : '–'}</div><div className="bb-summary-meta">actor: admin</div></div>
        <div className="bb-summary-card"><div className="bb-summary-label">Failed / denied</div><div className="bb-summary-value">{s ? `${s.failed} / ${s.denied}` : '–'}</div><div className="bb-summary-meta">rejected or refused</div></div>
      </div>

      <section className="bb-section-card">
        <div className="bb-filters" role="search">
          <input className="bb-input" placeholder="Search User ID" aria-label="Search by user ID" value={draftQ} onChange={e => setDraftQ(e.target.value)} />
          <select className="bb-input" aria-label="Filter by event type" value={f.event} onChange={e => change('event', e.target.value)}>
            <option value="">All events</option>{(data?.event_types || []).map(t => <option key={t} value={t}>{eventLabel(t)}</option>)}</select>
          <select className="bb-input" aria-label="Filter by role" value={f.role} onChange={e => change('role', e.target.value)}>
            <option value="">All roles</option><option value="voter">Voter</option><option value="admin">Admin</option><option value="system">System</option></select>
          <select className="bb-input" aria-label="Filter by status" value={f.status} onChange={e => change('status', e.target.value)}>
            <option value="">Any status</option><option value="SUCCESS">Success</option><option value="FAILED">Failed</option><option value="DENIED">Denied</option></select>
          <label className="bb-inline-field">From <input type="date" className="bb-input" aria-label="From date" value={f.from} onChange={e => change('from', e.target.value)} /></label>
          <label className="bb-inline-field">To <input type="date" className="bb-input" aria-label="To date" value={f.to} onChange={e => change('to', e.target.value)} /></label>
          {filtered && <button type="button" className="bb-button ghost" onClick={clear}>Clear filters</button>}
        </div>

        <State loading={loading && !data} error={error} />
        {error && <div><button type="button" className="bb-button" onClick={reload}>Retry</button></div>}
        {data && (data.rows.length === 0 ? (
          <div className="bb-empty-panel"><div className="bb-empty-panel-icon">◌</div><h3>{filtered ? 'No events match these filters' : 'No audit events yet'}</h3>
            <p>{filtered ? 'Clear a filter to see more.' : 'Events appear here as voters register and vote and as admins make changes.'}</p></div>
        ) : (
          <>
            <div className="bb-table-shell"><table className="bb-table">
              <thead><tr><th>Log ID</th><th>Event type</th><th>User ID</th><th>Role</th><th>Timestamp</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>{data.rows.map(r => (
                <tr key={r.id}>
                  <td>#{r.id}</td><td title={r.event_type}>{eventLabel(r.event_type)}</td><td>{r.user_id || '—'}</td><td>{r.role}</td><td>{fmtTime(r.timestamp)}</td>
                  <td><span className={`bb-badge ${statusTone(r.status)}`}>{r.status}</span></td><td className="bb-wrap-cell">{r.details || '—'}</td>
                </tr>))}</tbody>
            </table></div>
            <div className="bb-pager">
              <span>{data.total} event(s) · page {data.page} of {data.pages}</span>
              <span className="bb-pager-btns">
                <select className="bb-input" aria-label="Rows per page" value={size} onChange={e => { setPage(1); setSize(Number(e.target.value)) }}>{[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}</select>
                <button type="button" className="bb-button" disabled={data.page <= 1 || loading} onClick={() => setPage(data.page - 1)}>Previous</button>
                <button type="button" className="bb-button" disabled={data.page >= data.pages || loading} onClick={() => setPage(data.page + 1)}>Next</button>
              </span>
            </div>
          </>
        ))}
      </section>
    </div>
  )
}
