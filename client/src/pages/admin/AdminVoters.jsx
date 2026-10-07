import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

const badge = (value, success = 'Verified', failure = 'Pending') => (
  <span className={`bb-badge ${value ? 'success' : 'muted'}`}>{value ? success : failure}</span>
)

export default function AdminVoters() {
  const { data, error, loading } = useLoad(() => adminApi.get('/voters/all'))

  const total = data?.length || 0
  const faceVerified = data?.filter(v => v.face_registered).length || 0
  const voted = data?.filter(v => v.has_voted).length || 0
  const notVoted = Math.max(total - voted, 0)

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Voter registry</div>
          <h1>Registered voters</h1>
          <p className="bb-page-subtitle">View registered voters and verification status.</p>
        </div>
      </header>

      <State loading={loading} error={error} />

      {data && (
        <>
          <div className="bb-summary-grid">
            <div className="bb-summary-card">
              <div className="bb-summary-label">Total registered</div>
              <div className="bb-summary-value">{total}</div>
              <div className="bb-summary-meta">Active records</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Face verified</div>
              <div className="bb-summary-value">{faceVerified}</div>
              <div className="bb-summary-meta">Biometric checks passed</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Not voted</div>
              <div className="bb-summary-value">{notVoted}</div>
              <div className="bb-summary-meta">Pending participation</div>
            </div>
          </div>

          <section className="bb-section-card">
            <div className="bb-section-top">
              <div>
                <div className="bb-section-kicker">Registry</div>
                <h2>Voter list</h2>
              </div>
            </div>

            {data.length === 0 ? (
              <div className="bb-empty-panel">
                <div className="bb-empty-panel-icon">◌</div>
                <h3>No voters registered</h3>
                <p>Voter records will appear here once the registration flow is completed.</p>
              </div>
            ) : (
              <div className="bb-table-shell">
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>Voter ID</th>
                      <th>Name</th>
                      <th>Registration</th>
                      <th>Face</th>
                      <th>Voting</th>
                      <th>Registered on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map(v => (
                      <tr key={v.voter_id}>
                        <td><strong>{v.voter_id}</strong></td>
                        <td>{v.name || 'Unknown voter'}</td>
                        <td>{badge(Boolean(v.is_eligible), 'Eligible', 'Not eligible')}</td>
                        <td>{badge(Boolean(v.face_registered), 'Verified', 'Pending')}</td>
                        <td>{badge(Boolean(v.has_voted), 'Voted', 'Not voted')}</td>
                        <td>{new Date(v.registered_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
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
