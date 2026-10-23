import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

// Everything here comes from existing endpoints: /votes/results (totals) and /voters/all (per-voter status).
export default function AdminVoting() {
  const res = useLoad(() => adminApi.get('/votes/results'))
  const vot = useLoad(() => adminApi.get('/voters/all'))
  const r = res.data, voters = vot.data
  const pct = r && r.total_registered ? Math.round((r.total_votes / r.total_registered) * 100) : 0
  const voted = voters ? voters.filter(v => v.has_voted) : []

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Voters</div>
          <h1>Voting progress</h1>
          <p className="bb-page-subtitle">Votes cast and turnout, from the voter register.</p>
        </div>
      </header>
      <State loading={res.loading || vot.loading} error={res.error || vot.error} />
      {r && voters && (
        <>
          <div className="bb-grid">
            <div className="bb-stat"><div className="l">Votes cast</div><div className="v">{r.total_votes}</div></div>
            <div className="bb-stat"><div className="l">Yet to vote</div><div className="v">{r.total_registered - r.total_votes}</div></div>
            <div className="bb-stat">
              <div className="l">Progress</div><div className="v">{pct}%</div>
              <div className="rbar" style={{ marginTop: 10 }} role="img" aria-label={`${pct}% turnout`}><div style={{ width: `${pct}%` }} /></div>
            </div>
          </div>
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
