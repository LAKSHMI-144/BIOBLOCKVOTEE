import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import { DonutChart, BarChart } from '../../components/Charts'
import { colorAt, displayCandidateName, fmtTime } from '../../lib/adminFormat'
import { IconUsers, IconBallot, IconCheck, IconShield, IconRefresh } from '../../components/Icons'

const Metric = ({ icon, label, value, hint, tone }) => (
  <div className="bb-metric-card">
    <div className="bb-metric-top"><span className={`bb-metric-icon ${tone}`}>{icon}</span><span className="bb-metric-label">{label}</span></div>
    <div className="bb-metric-value">{value}</div>
    <div className="bb-metric-hint">{hint}</div>
  </div>
)
export default function AdminDashboard() {
  const { data: d, error, loading, reload } = useLoad(() => adminApi.get('/admin/dashboard-stats'))

  const voteRows = (d?.by_candidate || []).map((c, i) => ({
    key: c.candidate_id,
    label: c.party_abbr ? `${displayCandidateName(c.name)} (${c.party_abbr})` : displayCandidateName(c.name),
    value: Number(c.votes),
    color: colorAt(i)
  }))
  const partyRows = (d?.candidate_counts_by_party || []).map((p, i) => ({
    key: p.party_id,
    label: p.party_name,
    value: Number(p.candidates),
    color: colorAt(i)
  }))
  const stateRows = (d?.candidate_counts_by_state || []).map((s, i) => ({
    key: s.state_id,
    label: s.kind === 'UT' ? `${s.state_name} (UT)` : s.state_name,
    value: Number(s.candidates),
    color: colorAt(i)
  }))
  const namedRegions = stateRows.filter(s => s.key !== 0)
  const stateCount = d?.candidate_counts_by_state?.filter(s => s.kind === 'STATE').length || 0
  const utCount = d?.candidate_counts_by_state?.filter(s => s.kind === 'UT').length || 0
  const zeroCandidateRegions = namedRegions.filter(s => s.value === 0).length
  const participationRows = d ? [
    { label: 'Voted', value: Number(d.voters.voted), color: '#46b985' },
    { label: 'Yet to vote', value: Number(d.voters.remaining_eligible), color: '#e1a653' }
  ] : []
  const chain = d?.blockchain
  const e = d?.election
  const mismatch = chain?.available && d && chain.vote_blocks !== d.votes.total

  return (
    <div className="bb-dashboard-shell">
      <div className="bb-header-strip">
        <div>
          <h1 className="bb-dashboard-title">Election Command Center</h1>
          <p className="bb-dashboard-subtitle">Live figures from application data.</p>
        </div>
        <div className="bb-header-status">
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

          <div className="bb-dashboard-status">
            <div>
              <span>Election</span>
              <strong>{e ? e.name : 'Not configured'}</strong>
              <small>{e ? `${e.status} · ${e.type?.toLowerCase()}${e.end_time ? ` · closes ${fmtTime(e.end_time)}` : ' · no schedule set'}` : 'No election record exists'}</small>
            </div>
            <div>
              <span>Turnout</span>
              <strong>{d.voters.turnout_percent}%</strong>
              <small>{d.voters.voted} of {d.voters.eligible} eligible voters</small>
            </div>
            <div>
              <span>Blockchain integrity</span>
              <strong className={chain?.available ? (chain.is_valid ? 'ok' : 'bad') : 'muted'}>{chain?.available ? (chain.is_valid ? 'Valid' : 'Invalid') : 'Unavailable'}</strong>
              <small>{chain?.available ? `${chain.total_blocks} blocks · in-memory` : 'AI service not reachable'} · <Link to="/admin/blockchain">Details</Link></small>
            </div>
          </div>

          {(d.voters.without_constituency > 0 || d.candidates.unassigned > 0 || !d.votes.consistent || mismatch) && (
            <div className="bb-inline-note" role="status">
              {d.voters.without_constituency > 0 && <div>{d.voters.without_constituency} voter(s) have no constituency and cannot see a ballot.</div>}
              {d.candidates.unassigned > 0 && <div>{d.candidates.unassigned} candidate(s) have no party or constituency and cannot be activated.</div>}
              {!d.votes.consistent && <div>Candidate tallies ({d.votes.total}) differ from voters marked as voted ({d.votes.voters_marked_voted}).</div>}
              {mismatch && <div>Blockchain has {chain.vote_blocks} vote block(s) but {d.votes.total} vote(s) are tallied (the ledger is in memory and resets when the AI service restarts).</div>}
            </div>
          )}

          <div className="bb-dashboard-chart-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Candidates by party</span><small>candidate records</small></div>
              <DonutChart items={partyRows} centerLabel="candidates" emptyTitle="No candidate data available" emptyText="Candidate counts appear when candidate records are added." ariaLabel="Candidate records by party" />
            </section>
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Candidates by state / UT</span><small>{stateCount} states + {utCount} UTs · {zeroCandidateRegions} with 0</small></div>
              <div className="bb-dashboard-state-chart">
                <BarChart items={stateRows} unit="candidates" emptyTitle="No candidate data available" emptyText="State totals appear when candidates are assigned to a constituency." />
              </div>
            </section>
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Voting participation</span><small>{d.voters.eligible} eligible voters</small></div>
              <DonutChart items={participationRows} centerLabel="eligible" emptyTitle="No eligible voters" emptyText="Participation data is unavailable until eligible voters are registered." ariaLabel="Voting participation among eligible voters" />
            </section>
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Votes per candidate</span><Link className="bb-panel-link" to="/admin/results">Results</Link></div>
              <div className="bb-dashboard-votes-chart">
                <BarChart items={voteRows} emptyTitle="No voting data available yet" emptyText="Votes per candidate appear here after votes are recorded." />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
