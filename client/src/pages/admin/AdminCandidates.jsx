import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

export default function AdminCandidates() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/candidates'))
  const total = data?.length || 0
  const active = data?.filter(c => String(c.status || 'Active').toLowerCase() !== 'inactive').length || 0
  const votes = data?.reduce((sum, c) => sum + Number(c.vote_count || 0), 0) || 0

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Candidate management</div>
          <h1>Candidates</h1>
          <p className="bb-page-subtitle">Manage candidates participating in the election.</p>
        </div>
        <button className="bb-button primary">+ Add Candidate</button>
      </header>

      <State loading={loading} error={error} />

      {data && (
        <>
          <div className="bb-summary-grid">
            <div className="bb-summary-card">
              <div className="bb-summary-label">Total candidates</div>
              <div className="bb-summary-value">{total}</div>
              <div className="bb-summary-meta">Registered</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Active</div>
              <div className="bb-summary-value">{active}</div>
              <div className="bb-summary-meta">Eligible</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Total votes</div>
              <div className="bb-summary-value">{votes}</div>
              <div className="bb-summary-meta">Across all candidates</div>
            </div>
          </div>

          <section className="bb-section-card">
            <div className="bb-section-top">
              <div>
                <div className="bb-section-kicker">Candidate roster</div>
                <h2>Candidate list</h2>
              </div>
            </div>

            {data.length === 0 ? (
              <div className="bb-empty-panel">
                <div className="bb-empty-panel-icon">◌</div>
                <h3>No candidates available</h3>
                <p>Candidate records will appear here once they are added to the election.</p>
              </div>
            ) : (
              <div className="bb-table-shell">
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Party</th>
                      <th>Symbol</th>
                      <th>Votes</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(c => {
                      const status = String(c.status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active'
                      return (
                        <tr key={c.candidate_id}>
                          <td>
                            <div className="bb-entity-cell">
                              <span className="bb-entity-bullet">A</span>
                              <div>
                                <strong>{c.name}</strong>
                                <small>{c.position || 'President'}</small>
                              </div>
                            </div>
                          </td>
                          <td>{c.party}</td>
                          <td><span className="bb-symbol">{c.symbol || '—'}</span></td>
                          <td>{Number(c.vote_count || 0)}</td>
                          <td><span className={`bb-badge ${status === 'Active' ? 'success' : 'muted'}`}>{status}</span></td>
                          <td>
                            <div className="bb-actions">
                              <button className="bb-button ghost">View</button>
                              <button className="bb-button subtle">Edit</button>
                              <button className="bb-button danger">Deactivate</button>
                            </div>
                          </td>
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
