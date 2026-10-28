import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import { DonutChart, BarChart } from '../../components/Charts'
import { colorAt, displayCandidateName } from '../../lib/adminFormat'

// Counts and chart values come from database-backed admin/results and admin/dashboard-stats endpoints.
export default function AdminVoting() {
  const res = useLoad(() => adminApi.get('/votes/results'))
  const vot = useLoad(() => adminApi.get('/voters/all'))
  const stats = useLoad(() => adminApi.get('/admin/dashboard-stats'))
  const r = res.data, voters = vot.data, d = stats.data
  const eligible = d?.voters.eligible || 0
  const votedCount = d?.voters.voted || 0
  const pct = eligible ? Math.round((votedCount / eligible) * 1000) / 10 : 0
  const voted = voters ? voters.filter(v => v.has_voted) : []
  const voteProgress = [
    { label: 'Voted', value: votedCount, color: '#46b985' },
    { label: 'Yet to vote', value: Math.max(eligible - votedCount, 0), color: '#e1a653' }
  ]
  const candidateVotes = (r?.candidates || []).map((c, i) => ({
    key: c.candidate_id,
    label: c.party_abbr ? `${displayCandidateName(c.name)} (${c.party_abbr})` : displayCandidateName(c.name),
    value: Number(c.vote_count || 0),
    color: colorAt(i)
  })).sort((a, b) => b.value - a.value).slice(0, 8)
  const refresh = () => { res.reload(); vot.reload(); stats.reload() }

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Voters</div>
          <h1>Voting progress</h1>
          <p className="bb-page-subtitle">Live turnout and vote totals from the voter register and database tally.</p>
        </div>
        <button type="button" className="bb-button" onClick={refresh} disabled={res.loading || vot.loading || stats.loading}>Refresh</button>
      </header>
      <State loading={res.loading || vot.loading || stats.loading} error={res.error || vot.error || stats.error} />
      {r && voters && d && (
        <>
          <div className="bb-grid">
            <div className="bb-stat"><div className="l">Votes recorded</div><div className="v">{r.total_votes}</div><div className="s">Candidate tally in the database</div></div>
            <div className="bb-stat"><div className="l">Eligible voters yet to vote</div><div className="v">{d.voters.remaining_eligible}</div><div className="s">Excludes ineligible registrations</div></div>
            <div className="bb-stat">
              <div className="l">Eligible voter turnout</div><div className="v">{pct}%</div>
              <div className="rbar" style={{ marginTop: 10 }} role="img" aria-label={`${pct}% turnout`}><div style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              <div className="s">{votedCount} of {eligible} eligible voters</div>
            </div>
          </div>
          <div className="bb-progress-chart-grid">
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Eligible voter progress</span><small>{eligible} eligible</small></div>
              <div className="bb-progress-overview">
                <DonutChart items={voteProgress} centerLabel="eligible" emptyTitle="No eligible voters" emptyText="Turnout appears when eligible voters are registered." />
              </div>
            </section>
            <section className="bb-panel">
              <div className="bb-panel-header"><span>Votes by candidate</span><small>top 8 · database tally</small></div>
              <BarChart items={candidateVotes} emptyTitle="No recorded votes" emptyText="Candidate totals appear after the first vote is recorded." />
            </section>
          </div>
          {(r.total_votes !== d.votes.total || d.votes.total !== votedCount) && (
            <div className="bb-progress-note" role="status">The candidate tally ({d.votes.total}) and voter records ({votedCount} marked as voted) do not currently match. Check the latest vote records before relying on turnout.</div>
          )}
          <h3 className="bb-subhead">Voters who have voted</h3>
          {voted.length === 0 ? <p className="empty">No votes cast yet.</p> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Voter ID</th><th>Name</th></tr></thead>
              <tbody>{voted.map(v => <tr key={v.voter_id}><td>{v.voter_id}</td><td>{v.name}</td></tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  )
}
