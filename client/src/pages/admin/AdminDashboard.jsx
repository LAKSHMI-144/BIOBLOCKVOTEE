import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import { DonutChart, BarChart } from '../../components/Charts'
import { colorAt, eventLabel, fmtTime, statusTone } from '../../lib/adminFormat'
import { IconUsers, IconBallot, IconCheck, IconShield, IconLink, IconAlert, IconRefresh, IconClock } from '../../components/Icons'

const Metric = ({ icon, label, value, hint, tone }) => (
  <div className="bb-metric-card">
    <div className="bb-metric-top"><span className={`bb-metric-icon ${tone}`}>{icon}</span><span className="bb-metric-label">{label}</span></div>
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
const NAV = [['/admin/candidates', 'Candidates'], ['/admin/voters', 'Registered voters'], ['/admin/voting', 'Voting progress'], ['/admin/results', 'Results'], ['/admin/audit', 'Audit logs'], ['/admin/blockchain', 'Blockchain']]
const ELECTION_TONE = { ACTIVE: 'ok', SCHEDULED: 'warn', DRAFT: 'muted', ENDED: 'muted' }

export default function AdminDashboard() {
  const { data: d, error, loading, reload } = useLoad(() => adminApi.get('/admin/dashboard-stats'))

  // Chart rows come straight from the database tally; inactive candidates only appear if they hold votes.
  const rows = (d?.by_candidate || []).map((c, i) => ({ key: c.candidate_id, label: c.party_abbr ? `${c.name} (${c.party_abbr})` : c.name, value: Number(c.votes), color: colorAt(i) }))
  const chain = d?.blockchain
  const e = d?.election
  const mismatch = chain?.available && d && chain.vote_blocks !== d.votes.total

  return (
    <div className="bb-dashboard-shell">
      <div className="bb-header-strip">
        <div>
          <h1 className="bb-dashboard-title">Election Command Center</h1>
          <p className="bb-dashboard-subtitle">Live figures from the database. Nothing on this page is sample data.</p>
        </div>
        <div className="bb-header-status">
          <span className="bb-mini-tag">Election</span>
          <span className={`bb-mini-pill ${e ? ELECTION_TONE[e.status] : 'muted'}`}>{e ? e.status : loading ? 'Loading' : 'Not configured'}</span>
          <span className="bb-mini-tag">Blockchain</span>
          <span className={`bb-mini-pill ${chain?.available ? (chain.is_valid ? 'ok' : 'bad') : 'muted'}`}>{chain?.available ? (chain.is_valid ? 'Valid' : 'Invalid') : loading ? 'Loading' : 'Unavailable'}</span>
          <button type="button" className="bb-button ghost" onClick={reload} disabled={loading}><IconRefresh /> Refresh</button>
        </div>
      </div>

      <State loading={loading && !d} error={error} />
      {error && <div><button type="button" className="bb-button" onClick={reload}>Retry</button></div>}

      {d && (
        <>
          <div className="bb-metrics-grid">
            <Metric icon={<IconUsers />} label="Registered voters" value={d.voters.registered} hint={`${d.voters.face_registered} with a registered face`} tone="indigo" />
            <Metric icon={<IconShield />} label="Eligible voters" value={d.voters.eligible} hint={`${d.voters.registered - d.voters.eligible} not eligible`} tone="purple" />
            <Metric icon={<IconBallot />} label="Candidates" value={d.candidates.total} hint={`${d.candidates.active} active on ballots`} tone="amber" />
            <Metric icon={<IconCheck />} label="Votes cast" value={d.votes.total} hint={`${d.voters.remaining_eligible} eligible voters yet to vote`} tone="green" />
          </div>

          <div className="bb-secondary-grid">
            <Status label="Election" value={e ? e.name : 'Not configured'} detail={e ? `${e.status} · ${e.type?.toLowerCase()}${e.end_time ? ` · closes ${fmtTime(e.end_time)}` : ' · no schedule set'}` : 'No election record exists'} tone={e ? ELECTION_TONE[e.status] : 'muted'} />
            <Status label="Turnout" value={`${d.voters.turnout_percent}%`} detail={`${d.voters.voted} of ${d.voters.eligible} eligible voters`} tone="neutral" />
            <Status label="Blockchain integrity" value={chain?.available ? (chain.is_valid ? 'Valid' : 'Invalid') : 'Unavailable'} detail={chain?.available ? `${chain.total_blocks} blocks incl. genesis · in-memory` : 'AI service not reachable'} tone={chain?.available ? (chain.is_valid ? 'ok' : 'bad') : 'muted'} />
            <Status label="Audit events" value={d.audit.total} detail={`${d.audit.today} today · ${d.audit.failed} failed · ${d.audit.denied} denied`} tone={d.audit.failed + d.audit.denied > 0 ? 'warn' : 'neutral'} />
          </div>

          {(d.voters.without_constituency > 0 || d.candidates.unassigned > 0 || !d.votes.consistent || mismatch) && (
            <div className="bb-inline-note" role="status">
              {d.voters.without_constituency > 0 && <div>{d.voters.without_constituency} voter(s) have no constituency and cannot see a ballot.</div>}
              {d.candidates.unassigned > 0 && <div>{d.candidates.unassigned} candidate(s) have no party or constituency and cannot be activated.</div>}
              {!d.votes.consistent && <div>Candidate tallies ({d.votes.total}) differ from voters marked as voted ({d.votes.voters_marked_voted}).</div>}
              {mismatch && <div>Blockchain has {chain.vote_blocks} vote block(s) but {d.votes.total} vote(s) are tallied (the ledger is in memory and resets when the AI service restarts).</div>}
            </div>
          )}

          <div className="bb-panel-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Vote distribution</span><small>by candidate</small></div>
              <DonutChart items={rows} />
            </section>
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Votes per candidate</span><Link className="bb-panel-link" to="/admin/results">Results</Link></div>
              <BarChart items={rows} emptyText="Bars appear after the first vote is recorded." />
            </section>
          </div>

          <div className="bb-bottom-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Recent activity</span><Link className="bb-panel-link" to="/admin/audit">All audit logs</Link></div>
              {d.recent_activity.length === 0 ? (
                <div className="bb-empty-state"><div className="bb-empty-title">No activity yet</div><div className="bb-empty-text">Registrations, verifications, votes and admin actions are listed here as they happen.</div></div>
              ) : (
                <div className="bb-table-shell"><table className="bb-table">
                  <thead><tr><th>Event</th><th>User ID</th><th>Role</th><th>Time</th><th>Status</th></tr></thead>
                  <tbody>{d.recent_activity.map(r => (
                    <tr key={r.id}>
                      <td>{eventLabel(r.event_type)}</td><td>{r.user_id || '—'}</td><td>{r.role}</td><td>{fmtTime(r.timestamp)}</td>
                      <td><span className={`bb-badge ${statusTone(r.status)}`}>{r.status}</span></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </section>

            <div className="bb-stack">
              <section className="bb-panel">
                <div className="bb-panel-header"><span>Blockchain summary</span><Link className="bb-panel-link" to="/admin/blockchain">Inspect chain</Link></div>
                <div className="bb-chain-box">
                  <div className={`bb-chain-state ${chain?.available ? (chain.is_valid ? 'ok' : 'bad') : 'muted'}`}>
                    {chain?.available && chain.is_valid ? <IconShield /> : <IconAlert />}{chain?.available ? (chain.is_valid ? 'Chain valid' : 'Chain invalid') : 'Unavailable'}
                  </div>
                  <div className="bb-chain-meta"><IconLink /> {chain?.available ? `${chain.vote_blocks} vote block(s) + genesis` : 'The AI service did not return chain data'}</div>
                  <div className="bb-chain-meta bb-chain-note">Custom SHA-256 hash-linked prototype held in memory; resets when the AI service restarts.</div>
                </div>
              </section>
              <section className="bb-panel">
                <div className="bb-panel-header"><span>Audit summary</span><Link className="bb-panel-link" to="/admin/audit">Open</Link></div>
                <div className="bb-progress-summary">
                  <div className="bb-progress-item"><span>Total</span><strong>{d.audit.total}</strong></div>
                  <div className="bb-progress-item"><span>Today</span><strong>{d.audit.today}</strong></div>
                  <div className="bb-progress-item"><span>Failed</span><strong>{d.audit.failed}</strong></div>
                  <div className="bb-progress-item"><span>Denied</span><strong>{d.audit.denied}</strong></div>
                </div>
              </section>
            </div>
          </div>

          <section className="bb-panel">
            <div className="bb-panel-header"><span><IconClock /> Quick navigation</span></div>
            <div className="bb-quick-links">{NAV.map(([to, label]) => <Link key={to} className="bb-button" to={to}>{label}</Link>)}</div>
          </section>
        </>
      )}
    </div>
  )
}
