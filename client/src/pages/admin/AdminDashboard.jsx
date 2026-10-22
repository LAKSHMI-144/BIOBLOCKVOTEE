import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import { IconUsers, IconBallot, IconCheck, IconTrend, IconShield, IconLink, IconAlert, IconRefresh } from '../../components/Icons'

const palette = ['#6b7bd6', '#8f7bd6', '#3fae7c', '#d8a24f', '#d86b78', '#5aaed1', '#d98f4f', '#7d6bd6', '#4fb3a4']

// Plain-language names for audit actions. Anything unknown is shown as recorded.
const EVENT_LABEL = {
  REGISTERED: 'Voter registered',
  FACE_REGISTERED: 'Face template registered',
  AUTHENTICATED: 'Face verified',
  DUPLICATE_ATTEMPT: 'Duplicate vote attempt',
  VOTED_FOR: 'Vote recorded',
  VOTED: 'Vote recorded',
}
const isVote = a => /^VOTED/.test(a)
const isAlert = a => /DUPLICATE|REJECT|FAIL/.test(a)
const dayKey = ts => { const d = new Date(ts); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10) }

const Metric = ({ icon, label, value, hint, tone }) => (
  <div className="bb-metric-card">
    <div className="bb-metric-top">
      <span className={`bb-metric-icon ${tone}`}>{icon}</span>
      <span className="bb-metric-label">{label}</span>
    </div>
    <div className="bb-metric-value">{value}</div>
    <div className="bb-metric-hint">{hint}</div>
  </div>
)

const Status = ({ label, value, detail, tone }) => (
  <div className="bb-status-card">
    <div className="bb-status-head">{label}</div>
    <div className={`bb-status-value ${tone}`}>{value}</div>
    <div className="bb-status-detail">{detail}</div>
  </div>
)

export default function AdminDashboard() {
  const res = useLoad(() => adminApi.get('/votes/results'))
  const log = useLoad(() => adminApi.get('/admin/audit-logs'))
  const d = res.data
  const events = Array.isArray(log.data) ? log.data : []

  const totalRegistered = Number(d?.total_registered || 0)
  const totalVotes = Number(d?.total_votes || 0)
  const turnout = totalRegistered ? Math.round((totalVotes / totalRegistered) * 100) : 0
  const remaining = Math.max(totalRegistered - totalVotes, 0)
  const chain = d?.blockchain
  const mismatch = chain && chain.total_blocks - 1 !== totalVotes

  const rows = (d?.candidates || []).map((c, i) => {
    const votes = Number(c.vote_count || 0)
    return { ...c, votes, percent: totalVotes ? (votes / totalVotes) * 100 : 0, color: palette[i % palette.length] }
  })
  let donut = 'conic-gradient(#1d2a38 0 100%)'
  if (rows.length && totalVotes > 0) {
    let start = 0
    donut = `conic-gradient(${rows.map(r => { const end = start + r.percent; const s = `${r.color} ${start}% ${end}%`; start = end; return s }).join(', ')})`
  }

  // Real data only: votes per day, counted from the audit log's vote events.
  const perDay = {}
  events.filter(e => isVote(e.action)).forEach(e => { const k = dayKey(e.timestamp); if (k) perDay[k] = (perDay[k] || 0) + 1 })
  const days = Object.keys(perDay).sort().slice(-7)
  const maxDay = Math.max(...days.map(k => perDay[k]), 1)
  const alerts = events.filter(e => isAlert(e.action)).length
  const recent = events.slice(0, 6)

  const reloadAll = () => { res.reload(); log.reload() }
  const latest = chain?.chain?.length ? `#${chain.chain[chain.chain.length - 1].index}` : 'Genesis'

  return (
    <div className="bb-dashboard-shell">
      <div className="bb-header-strip">
        <div>
          <h1 className="bb-dashboard-title">Election Command Center</h1>
          <p className="bb-dashboard-subtitle">Monitor election activity, security and integrity.</p>
        </div>
        <div className="bb-header-status">
          <span className="bb-mini-tag">Election</span>
          <span className="bb-mini-pill muted">Not configured</span>
          <span className="bb-mini-tag">Blockchain</span>
          <span className={`bb-mini-pill ${chain ? (chain.is_valid ? 'ok' : 'bad') : 'muted'}`}>{chain ? (chain.is_valid ? 'Valid' : 'Invalid') : res.loading ? 'Loading' : 'Unavailable'}</span>
          <button type="button" className="bb-button ghost" onClick={reloadAll} disabled={res.loading || log.loading}><IconRefresh /> Refresh</button>
        </div>
      </div>

      <State loading={res.loading} error={res.error} />

      {d && (
        <>
          <div className="bb-metrics-grid">
            <Metric icon={<IconUsers />} label="Registered voters" value={totalRegistered} hint="in the voter register" tone="indigo" />
            <Metric icon={<IconBallot />} label="Candidates" value={d.candidates.length} hint="on the ballot" tone="purple" />
            <Metric icon={<IconCheck />} label="Votes cast" value={totalVotes} hint={`${remaining} yet to vote`} tone="green" />
            <Metric icon={<IconTrend />} label="Turnout" value={`${turnout}%`} hint="of registered voters" tone="amber" />
          </div>

          <div className="bb-secondary-grid">
            <Status label="Election status" value="Not configured" detail="No election record or scheduling API exists" tone="muted" />
            <Status label="Blockchain integrity" value={chain ? (chain.is_valid ? 'Valid' : 'Invalid') : 'Unavailable'} detail={chain ? 'Recomputed from every block' : 'AI service not reachable'} tone={chain ? (chain.is_valid ? 'ok' : 'bad') : 'muted'} />
            <Status label="Blocks" value={chain ? chain.total_blocks : '–'} detail={chain ? `Latest ${latest} · includes genesis` : '—'} tone="neutral" />
            <Status label="Rejected / duplicate events" value={log.error ? '–' : alerts} detail={log.error ? 'Audit log unavailable' : `in the last ${events.length} audit events`} tone={alerts > 0 ? 'warn' : 'neutral'} />
          </div>

          <div className="bb-panel-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Candidate vote distribution</span></div>
              {totalVotes > 0 ? (
                <div className="bb-donut-layout">
                  <div className="bb-donut-wheel" style={{ background: donut }} role="img" aria-label="Vote share by candidate">
                    <div className="bb-donut-center"><strong>{totalVotes}</strong><span>votes</span></div>
                  </div>
                  <div className="bb-donut-legend">
                    {rows.map(r => (
                      <div key={r.candidate_id} className="bb-legend-row">
                        <span className="bb-legend-dot" style={{ background: r.color }} />
                        <span className="bb-legend-name">{r.name}</span>
                        <span className="bb-legend-count">{r.votes}</span>
                        <span className="bb-legend-percent">{Math.round(r.percent)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bb-empty-state">
                  <div className="bb-empty-title">No votes yet</div>
                  <div className="bb-empty-text">The distribution appears after the first vote is recorded.</div>
                </div>
              )}
            </section>

            <section className="bb-panel">
              <div className="bb-panel-header"><span>Voting progress</span></div>
              <div className="bb-progress-summary">
                <div className="bb-progress-item"><span>Registered</span><strong>{totalRegistered}</strong></div>
                <div className="bb-progress-item"><span>Votes cast</span><strong>{totalVotes}</strong></div>
                <div className="bb-progress-item"><span>Participation</span><strong>{turnout}%</strong></div>
                <div className="bb-progress-item"><span>Remaining</span><strong>{remaining}</strong></div>
              </div>
              <div className="bb-progress-visual">
                <div className="bb-progress-rail" role="img" aria-label={`${turnout}% turnout`}><span style={{ width: `${Math.min(turnout, 100)}%` }} /></div>
                <div className="bb-progress-label">{turnout}%</div>
              </div>
              <div className="bb-progress-caption">{totalVotes === 0 ? 'No votes have been recorded yet.' : `${totalVotes} of ${totalRegistered} registered voters have voted.`}</div>
            </section>
          </div>

          <section className="bb-panel bb-panel-wide">
            <div className="bb-panel-header"><span>Votes recorded per day</span><small>from the audit log (last 200 events)</small></div>
            {log.loading ? <div className="bb-empty-chart">Loading…</div>
              : log.error ? <div className="bb-empty-chart">Audit log unavailable: {log.error}</div>
              : days.length === 0 ? <div className="bb-empty-chart">No voting activity recorded yet.</div>
              : (
                <div className="bb-bars" role="img" aria-label="Votes recorded per day">
                  {days.map(k => (
                    <div key={k} className="bb-bar">
                      <span className="bb-bar-value">{perDay[k]}</span>
                      <div className="bb-bar-col"><div style={{ height: `${(perDay[k] / maxDay) * 100}%` }} /></div>
                      <span className="bb-bar-label">{k.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
          </section>

          <div className="bb-bottom-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Recent activity</span><Link className="bb-panel-link" to="/admin/audit">All audit logs</Link></div>
              {log.loading ? <div className="bb-empty-chart">Loading…</div>
                : log.error ? <div className="bb-empty-chart">Audit log unavailable: {log.error}</div>
                : recent.length === 0 ? <div className="bb-empty-state"><div className="bb-empty-title">No activity yet</div><div className="bb-empty-text">Registrations, verifications and votes will be listed here.</div></div>
                : (
                  <ul className="bb-activity-list">
                    {recent.map(e => (
                      <li key={e.id}>
                        <div className="bb-activity-left">
                          <span className={`bb-activity-status ${isAlert(e.action) ? 'warn' : 'success'}`} />
                          <div>
                            <strong>{EVENT_LABEL[e.action] || e.action}</strong>
                            <small>{e.voter_id ? `Voter ${e.voter_id} · ` : ''}{new Date(e.timestamp).toLocaleString()}</small>
                          </div>
                        </div>
                        <span className={`bb-activity-tag ${isAlert(e.action) ? 'warn' : ''}`}>{isAlert(e.action) ? 'Alert' : 'Info'}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </section>

            <section className="bb-panel">
              <div className="bb-panel-header"><span>Blockchain integrity</span><Link className="bb-panel-link" to="/admin/blockchain">Inspect chain</Link></div>
              <div className="bb-chain-box">
                <div className={`bb-chain-state ${chain ? (chain.is_valid ? 'ok' : 'bad') : 'muted'}`}>
                  {chain?.is_valid ? <IconShield /> : <IconAlert />}
                  {chain ? (chain.is_valid ? 'Chain valid' : 'Chain invalid') : 'Unavailable'}
                </div>
                <div className="bb-chain-meta"><IconLink /> {chain ? `${chain.total_blocks} blocks · latest ${latest}` : 'The AI service did not return chain data'}</div>
                <div className="bb-chain-meta bb-chain-note">Held in memory by the AI service; resets when it restarts.</div>
              </div>
              {mismatch && <div className="bb-inline-note">Block count does not match recorded votes: {chain.total_blocks - 1} blocks vs {totalVotes} votes.</div>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
