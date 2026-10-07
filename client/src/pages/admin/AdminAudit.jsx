import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

const EVENTS = {
  REGISTERED: ['Voter registration', true],
  FACE_REGISTERED: ['Face registration', true],
  AUTHENTICATED: ['Authentication', true],
  VOTED_FOR: ['Vote cast', true],
  DUPLICATE_ATTEMPT: ['Duplicate voting attempt', false],
  REGISTRATION_REJECTED: ['Registration rejected', false],
  FACE_REGISTRATION_FAILED: ['Face registration failed', false],
}

export default function AdminAudit() {
  const { data, error, loading } = useLoad(() => adminApi.get('/admin/audit-logs'))

  const total = data?.length || 0
  const successful = data?.filter(r => {
    const [, ok] = EVENTS[r.action?.split(':')[0]] || [r.action, true]
    return ok
  }).length || 0
  const failed = total - successful

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Audit & security</div>
          <h1>Audit logs</h1>
          <p className="bb-page-subtitle">Monitor recent security events and administrative activity.</p>
        </div>
      </header>

      <State loading={loading} error={error} />

      {data && (
        <>
          <div className="bb-summary-grid">
            <div className="bb-summary-card">
              <div className="bb-summary-label">Total events</div>
              <div className="bb-summary-value">{total}</div>
              <div className="bb-summary-meta">Recorded since start</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Successful</div>
              <div className="bb-summary-value">{successful}</div>
              <div className="bb-summary-meta">Operational events</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Warnings</div>
              <div className="bb-summary-value">{failed}</div>
              <div className="bb-summary-meta">Rejected or flagged records</div>
            </div>
          </div>

          <section className="bb-section-card">
            <div className="bb-section-top">
              <div>
                <div className="bb-section-kicker">Recent activity</div>
                <h2>Security event list</h2>
              </div>
            </div>

            {data.length === 0 ? (
              <div className="bb-empty-panel">
                <div className="bb-empty-panel-icon">◌</div>
                <h3>No security events</h3>
                <p>Activity will appear here once voter and admin actions are logged.</p>
              </div>
            ) : (
              <div className="bb-table-shell">
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event</th>
                      <th>Status</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(r => {
                      const [label, ok] = EVENTS[r.action?.split(':')[0]] || [r.action, true]
                      return (
                        <tr key={r.id}>
                          <td>{new Date(r.timestamp).toLocaleString()}</td>
                          <td>{label}</td>
                          <td><span className={`bb-badge ${ok ? 'success' : 'muted'}`}>{ok ? 'SUCCESS' : 'FAILED'}</span></td>
                          <td>{r.voter_id || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
