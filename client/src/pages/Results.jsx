import { adminApi } from '../api'
import useLoad from '../hooks/useLoad'
import State from '../components/State'

const palette = ['#6d7cff', '#8a6df6', '#2ec27e', '#f0b75a', '#ff6b7a', '#5ad1ff', '#49c6b4']

export default function Results() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/results'))
  const totalRegistered = Number(data?.total_registered || 0)
  const totalVotes = Number(data?.total_votes || 0)
  const turnout = totalRegistered ? ((totalVotes / totalRegistered) * 100).toFixed(1) : '0.0'

  const candidates = (data?.candidates || []).map((row, index) => ({
    ...row,
    value: Number(row.vote_count || 0),
    color: palette[index % palette.length],
  }))

  const max = Math.max(...candidates.map(c => c.value), 1)
  const totalCandidateVotes = candidates.reduce((sum, c) => sum + c.value, 0)

  let donutGradient = 'conic-gradient(#1d2a38 0 100%)'
  if (candidates.length && totalVotes > 0) {
    let start = 0
    const pieces = candidates.map(candidate => {
      const percent = totalVotes ? (candidate.value / totalVotes) * 100 : 0
      const end = start + percent
      const piece = `${candidate.color} ${start}% ${end}%`
      start = end
      return piece
    })
    donutGradient = `conic-gradient(${pieces.join(', ')})`
  }

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Election results</div>
          <h1>Results</h1>
          <p className="bb-page-subtitle">Aggregate voting results across the election.</p>
        </div>
      </header>

      <State loading={loading} error={error} />

      {data && (
        <>
          <div className="bb-summary-grid">
            <div className="bb-summary-card">
              <div className="bb-summary-label">Total votes</div>
              <div className="bb-summary-value">{totalVotes}</div>
              <div className="bb-summary-meta">Recorded ballots</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Turnout</div>
              <div className="bb-summary-value">{turnout}%</div>
              <div className="bb-summary-meta">Participation rate</div>
            </div>
            <div className="bb-summary-card">
              <div className="bb-summary-label">Candidates</div>
              <div className="bb-summary-value">{candidates.length}</div>
              <div className="bb-summary-meta">In the ballot</div>
            </div>
          </div>

          <div className="bb-panel-grid">
            <section className="bb-section-card">
              <div className="bb-section-top">
                <div>
                  <div className="bb-section-kicker">Vote split</div>
                  <h2>Candidate vote distribution</h2>
                </div>
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
                    {candidates.map(candidate => (
                      <div key={candidate.candidate_id} className="bb-legend-row">
                        <span className="bb-legend-dot" style={{ background: candidate.color }} />
                        <span className="bb-legend-name">{candidate.name}</span>
                        <span className="bb-legend-count">{candidate.value}</span>
                        <span className="bb-legend-percent">{Math.round(totalVotes ? (candidate.value / totalVotes) * 100 : 0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bb-empty-panel">
                  <div className="bb-empty-panel-icon">◌</div>
                  <h3>No results yet</h3>
                  <p>Aggregate results will be shown once the first vote is cast.</p>
                </div>
              )}
            </section>

            <section className="bb-section-card">
              <div className="bb-section-top">
                <div>
                  <div className="bb-section-kicker">Ranking</div>
                  <h2>Leaderboard</h2>
                </div>
              </div>

              {candidates.length === 0 ? (
                <div className="bb-empty-panel">
                  <div className="bb-empty-panel-icon">◌</div>
                  <h3>No candidates</h3>
                  <p>No ballot entries are currently available.</p>
                </div>
              ) : (
                <div className="bb-table-shell">
                  <table className="bb-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Candidate</th>
                        <th>Votes</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...candidates].sort((a, b) => b.value - a.value).map((candidate, index) => (
                        <tr key={candidate.candidate_id}>
                          <td>#{index + 1}</td>
                          <td>{candidate.name}</td>
                          <td>{candidate.value}</td>
                          <td>{totalVotes ? ((candidate.value / totalVotes) * 100).toFixed(1) : '0.0'}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {totalCandidateVotes > 0 && (
            <section className="bb-section-card" style={{ marginTop: '18px' }}>
              <div className="bb-section-top">
                <div>
                  <div className="bb-section-kicker">Results</div>
                  <h2>Candidate totals</h2>
                </div>
              </div>

              <div className="bb-result-list">
                {[...candidates].sort((a, b) => b.value - a.value).map(candidate => (
                  <div key={candidate.candidate_id} className="bb-result-row">
                    <div className="bb-result-name">
                      <span className="bb-legend-dot" style={{ background: candidate.color }} />
                      {candidate.name}
                    </div>
                    <div className="bb-result-bar">
                      <span style={{ width: `${(candidate.value / max) * 100}%`, background: candidate.color }} />
                    </div>
                    <div className="bb-result-stat">{candidate.value} votes</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
