import { useState } from 'react'
import { adminApi } from '../api'
import useLoad from '../hooks/useLoad'
import State from '../components/State'
import { DonutChart, BarChart } from '../components/Charts'
import { colorAt, displayCandidateName, displayConstituencyName, pct } from '../lib/adminFormat'

// Aggregate results only: candidate totals, never who voted for whom. Same tally (config/stats.js) as the dashboard.
export default function Results() {
  const { data, error, loading, reload } = useLoad(() => adminApi.get('/votes/results'))
  const [cons, setCons] = useState('')

  const all = data?.candidates || []
  const constituencies = [...new Map(all.filter(c => c.constituency_id).map(c => [c.constituency_id, `${displayConstituencyName(c.constituency_name)}, ${c.state_name}`])).entries()]
  // Inactive candidates stay in the results only if they received votes (history is never hidden).
  const rows = all.filter(c => (c.is_active || c.votes > 0) && (!cons || String(c.constituency_id) === cons))
  const shown = rows.reduce((n, c) => n + c.votes, 0)
  const items = rows.map((c, i) => ({ key: c.candidate_id, label: c.party_abbr ? `${displayCandidateName(c.name)} (${c.party_abbr})` : displayCandidateName(c.name), value: c.votes, color: colorAt(i) }))
  const byParty = {}
  rows.forEach(c => { const k = c.party_abbr || 'Unassigned'; byParty[k] = (byParty[k] || 0) + c.votes })
  const partyRows = Object.entries(byParty).map(([label, value], i) => ({ key: label, label, value, color: colorAt(i) })).sort((a, b) => b.value - a.value)
  const turnout = data?.total_registered ? pct(data.total_votes, data.total_registered) : 0

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Election results</div>
          <h1>Results</h1>
          <p className="bb-page-subtitle">Aggregate candidate totals. Individual votes are never linked to voters here.</p>
        </div>
        <button type="button" className="bb-button" onClick={reload} disabled={loading}>Refresh</button>
      </header>
      <State loading={loading && !data} error={error} />

      {data && (
        <>
          <div className="bb-summary-grid bb-summary-4">
            <div className="bb-summary-card"><div className="bb-summary-label">Total votes</div><div className="bb-summary-value">{data.total_votes}</div><div className="bb-summary-meta">{data.voters_marked_voted === data.total_votes ? 'matches the voter register' : `voter register says ${data.voters_marked_voted}`}</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">Registered voters</div><div className="bb-summary-value">{data.total_registered}</div><div className="bb-summary-meta">in the register</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">Turnout</div><div className="bb-summary-value">{turnout}%</div><div className="bb-summary-meta">votes ÷ registered</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">Election</div><div className="bb-summary-value bb-small">{data.election?.name || 'Not configured'}</div><div className="bb-summary-meta">{data.election?.status || '—'}</div></div>
          </div>

          <div className="bb-filters">
            <select className="bb-input" aria-label="Filter results by constituency" value={cons} onChange={e => setCons(e.target.value)}>
              <option value="">All constituencies</option>{constituencies.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
            <span className="bb-sub">{cons ? `${shown} vote(s) in this constituency` : `${shown} vote(s) in total`}</span>
          </div>

          <div className="bb-panel-grid">
            <section className="bb-panel"><div className="bb-panel-header"><span>Vote distribution</span><small>by candidate</small></div><DonutChart items={items} /></section>
            <section className="bb-panel"><div className="bb-panel-header"><span>Votes per candidate</span></div><BarChart items={items} /></section>
          </div>

          <section className="bb-section-card">
            <div className="bb-section-top"><div><div className="bb-section-kicker">Ranking</div><h2>Candidate results</h2></div></div>
            {rows.length === 0 ? (
              <div className="bb-empty-panel"><div className="bb-empty-panel-icon">◌</div><h3>No candidates</h3><p>No candidates are available for this view.</p></div>
            ) : (
              <div className="bb-table-shell"><table className="bb-table">
                <thead><tr><th>Rank</th><th>Candidate</th><th>Party</th><th>Constituency</th><th>Votes</th><th>Percentage</th></tr></thead>
                <tbody>{[...rows].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)).map((c, i) => (
                  <tr key={c.candidate_id}>
                    <td>#{i + 1}</td><td>{displayCandidateName(c.name)}{!c.is_active && <span className="bb-badge muted bb-ml">Inactive</span>}</td><td>{c.party_abbr || '—'}</td><td>{displayConstituencyName(c.constituency_name) || '—'}</td>
                    <td>{c.votes}</td><td>{pct(c.votes, shown)}%</td>
                  </tr>))}</tbody>
              </table></div>
            )}
            <p className="bb-sub" style={{ marginTop: 10 }}>Percentage is the share of the {shown} vote(s) shown above.</p>
          </section>

          <section className="bb-panel">
            <div className="bb-panel-header"><span>Votes by party</span></div>
            <BarChart items={partyRows} unit="votes" emptyText="Party totals appear after the first vote is recorded." />
          </section>
        </>
      )}
    </div>
  )
}
