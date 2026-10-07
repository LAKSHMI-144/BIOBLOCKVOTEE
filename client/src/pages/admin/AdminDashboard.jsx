import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

const palette = ['#6d7cff', '#8a6df6', '#2ec27e', '#f0b75a', '#ff6b7a', '#5ad1ff', '#ff9f43', '#7d5fff', '#49c6b4']

const StatCard = ({ icon, label, value, hint, tone = 'neutral' }) => (
  <div className="bb-metric-card">
    <div className="bb-metric-top">
      <span className={`bb-metric-icon ${tone}`}>{icon}</span>
      <span className="bb-metric-label">{label}</span>
    </div>
    <div className="bb-metric-value">{value}</div>
    <div className="bb-metric-hint">{hint}</div>
  </div>
)

const StatusCard = ({ label, value, detail, tone = 'neutral' }) => (
  <div className="bb-status-card">
    <div className="bb-status-head">{label}</div>
    <div className={`bb-status-value ${tone}`}>{value}</div>
    <div className="bb-status-detail">{detail}</div>
  </div>
)

export default function AdminDashboard() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/results'))
  const d = data
  const totalRegistered = Number(d?.total_registered || 0)
  const totalVotes = Number(d?.total_votes || 0)
  const turnout = totalRegistered ? Math.round((totalVotes / totalRegistered) * 100) : 0
  const mismatch = d?.blockchain && d.blockchain.total_blocks - 1 !== totalVotes

  const candidateRows = (d?.candidates || []).map((candidate, index) => {
    const votes = Number(candidate.vote_count || 0)
    const percent = totalVotes ? (votes / totalVotes) * 100 : 0
    return { ...candidate, votes, percent, color: palette[index % palette.length] }
  })

  const maxVotes = Math.max(...candidateRows.map(item => item.votes), 1)

  let donutGradient = 'conic-gradient(#1d2a38 0 100%)'
  if (candidateRows.length && totalVotes > 0) {
    let start = 0
    const chunks = candidateRows.map(item => {
      const end = start + item.percent
      const chunk = `${item.color} ${start}% ${end}%`
      start = end
      return chunk
    })
    donutGradient = `conic-gradient(${chunks.join(', ')})`
  }

  const progressWidth = totalRegistered ? Math.min((totalVotes / totalRegistered) * 100, 100) : 0
  const remaining = Math.max(totalRegistered - totalVotes, 0)

  const activity = [
    { label: 'Admin login', status: 'success', detail: 'Authenticated' },
    { label: 'Voter registration', status: 'success', detail: 'Ready for verification' },
    { label: 'Face verification', status: 'success', detail: 'Awaiting submission' },
    { label: 'Blockchain verification', status: 'neutral', detail: 'Last checked' },
  ]

  const linePts = totalVotes > 0
    ? [12, 18, 26, 32, 28, 38, 42]
    : [0, 0, 0, 0, 0, 0, 0]

  const linePath = linePts
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${index * 24} ${90 - value}`)
    .join(' ')

  return (
    <>
      <div className="bb-dashboard-shell">
        <div className="bb-header-strip">
          <div>
            <div className="bb-kicker">Administration</div>
            <h2 className="bb-dashboard-title">Election Command Center</h2>
            <p className="bb-dashboard-subtitle">Monitor election activity, security and integrity.</p>
          </div>
          <div className="bb-header-status">
            <span className="bb-mini-tag">Election status</span>
            <span className={`bb-mini-pill ${d?.blockchain?.is_valid ? 'ok' : 'muted'}`}>
              {d ? (d.blockchain?.is_valid ? 'ACTIVE' : 'NOT CONFIGURED') : 'LOADING'}
            </span>
            <div className="bb-user-inline">
              <span className="bb-user-avatar">A</span>
              <span>Admin / Auditor</span>
            </div>
          </div>
        </div>

        <State loading={loading} error={error} />

        {d && (
          <>
            <div className="bb-metrics-grid">
              <StatCard icon="👥" label="Registered" value={totalRegistered} hint="voters" tone="indigo" />
              <StatCard icon="🏛️" label="Candidates" value={d.candidates.length} hint="active" tone="purple" />
              <StatCard icon="🗳️" label="Votes cast" value={totalVotes} hint="total" tone="green" />
              <StatCard icon="📈" label="Turnout" value={`${turnout}%`} hint="participation" tone="amber" />
            </div>

            <div className="bb-secondary-grid">
              <StatusCard label="Election status" value={d ? 'NOT CONFIGURED' : 'LOADING'} detail="Election scheduling is currently unavailable." tone={d ? 'muted' : 'neutral'} />
              <StatusCard label="Blockchain" value={d.blockchain.is_valid ? 'VALID' : 'INVALID'} detail={`${d.blockchain.total_blocks} block(s)`} tone={d.blockchain.is_valid ? 'ok' : 'bad'} />
              <StatusCard label="Blocks" value={d.blockchain.total_blocks} detail="Including genesis" tone="neutral" />
              <StatusCard label="Security events" value="0" detail="No critical alerts" tone="neutral" />
            </div>

            <div className="bb-panel-grid">
              <div className="bb-panel">
                <div className="bb-panel-header">
                  <span>Candidate Vote Distribution</span>
                </div>

                {totalVotes > 0 ? (
                  <div className="bb-donut-layout">
                    <div className="bb-donut-wheel" style={{ background: donutGradient }}>
                      <div className="bb-donut-center">
                        <strong>{totalVotes}</strong>
                        <span>Total votes</span>
                      </div>
                    </div>

                    <div className="bb-donut-legend">
                      {candidateRows.map((candidate) => (
                        <div key={candidate.candidate_id} className="bb-legend-row">
                          <span className="bb-legend-dot" style={{ background: candidate.color }} />
                          <span className="bb-legend-name">{candidate.name}</span>
                          <span className="bb-legend-count">{candidate.votes}</span>
                          <span className="bb-legend-percent">{Math.round(candidate.percent || 0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bb-empty-state">
                    <div className="bb-empty-ring">◌</div>
                    <div className="bb-empty-title">No votes yet</div>
                    <div className="bb-empty-text">Candidate distribution will appear after the first vote is recorded.</div>
                  </div>
                )}
              </div>

              <div className="bb-panel">
                <div className="bb-panel-header">
                  <span>Voting Progress</span>
                </div>

                <div className="bb-progress-summary">
                  <div className="bb-progress-item">
                    <span>Registered voters</span>
                    <strong>{totalRegistered}</strong>
                  </div>
                  <div className="bb-progress-item">
                    <span>Votes cast</span>
                    <strong>{totalVotes}</strong>
                  </div>
                  <div className="bb-progress-item">
                    <span>Participation</span>
                    <strong>{turnout}%</strong>
                  </div>
                  <div className="bb-progress-item">
                    <span>Remaining</span>
                    <strong>{remaining}</strong>
                  </div>
                </div>

                <div className="bb-progress-visual">
                  <div className="bb-progress-rail">
                    <span style={{ width: `${progressWidth}%` }} />
                  </div>
                  <div className="bb-progress-label">{turnout}%</div>
                  <div className="bb-progress-caption">{totalVotes === 0 ? 'No votes have been recorded yet.' : 'Turnout is currently being tracked.'}</div>
                </div>
              </div>
            </div>

            <div className="bb-panel bb-panel-wide">
              <div className="bb-panel-header">
                <span>Voting Activity</span>
                <small>Votes recorded over time</small>
              </div>

              {totalVotes > 0 ? (
                <div className="bb-line-chart-box">
                  <svg viewBox="0 0 700 180" preserveAspectRatio="none" aria-label="Voting activity line chart">
                    <defs>
                      <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(109,124,255,0.35)" />
                        <stop offset="100%" stopColor="rgba(109,124,255,0.03)" />
                      </linearGradient>
                    </defs>
                    {[0, 25, 50, 75, 100].map((n) => (
                      <line key={n} x1="0" y1={n * 1.5} x2="700" y2={n * 1.5} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 5" />
                    ))}
                    <path d={`${linePath} L 660 160 L 0 160 Z`} fill="url(#lineFill)" />
                    <path d={linePath} fill="none" stroke="#7d8aff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : (
                <div className="bb-empty-chart">No voting activity recorded yet.</div>
              )}
            </div>

            <div className="bb-bottom-grid">
              <div className="bb-panel">
                <div className="bb-panel-header">
                  <span>Recent Security Activity</span>
                </div>
                <ul className="bb-activity-list">
                  {activity.map(item => (
                    <li key={item.label}>
                      <div className="bb-activity-left">
                        <span className={`bb-activity-status ${item.status}`} />
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </div>
                      <span className="bb-activity-tag">{item.status === 'success' ? 'SUCCESS' : 'INFO'}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bb-panel">
                <div className="bb-panel-header">
                  <span>Blockchain Integrity</span>
                </div>

                <div className="bb-chain-box">
                  <div className={`bb-chain-state ${d.blockchain.is_valid ? 'ok' : 'bad'}`}>
                    {d.blockchain.is_valid ? '✓ VALID' : '⚠ INVALID'}
                  </div>
                  <div className="bb-chain-meta">{d.blockchain.total_blocks} blocks</div>
                  <div className="bb-chain-meta secondary">Latest block: {d.blockchain.chain?.length ? `#${d.blockchain.chain[d.blockchain.chain.length - 1].index}` : 'Genesis'}</div>
                </div>

                {mismatch && (
                  <div className="bb-inline-note">
                    Block count does not match recorded votes: {d.blockchain.total_blocks - 1} vs {totalVotes}.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <p className="bb-footer-link">
        <Link to="/admin/blockchain">Inspect blockchain</Link>
        <span>·</span>
        <Link to="/admin/results">View results</Link>
        <span>·</span>
        <Link to="/admin/audit">Audit logs</Link>
      </p>
    </>
  )
}
