import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

// Everything here comes from existing endpoints: /votes/results (totals) and /voters/all (per-voter status).
export default function AdminVoting() {
  const res = useLoad(() => adminApi.get('/votes/results'))
  const vot = useLoad(() => adminApi.get('/voters/all'))
  const r = res.data, voters = vot.data
  const pct = r && r.total_registered ? Math.round((r.total_votes / r.total_registered) * 100) : 0
  const voted = voters ? voters.filter(v => v.has_voted) : []

  return (
    <>
      <h1>Voting</h1><p className="sub">Votes cast and election progress</p>
      <State loading={res.loading || vot.loading} error={res.error || vot.error} />
      {r && voters && (
        <>
          <div className="bb-grid" style={{ marginBottom: 20 }}>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Votes cast</div><div className="v">{r.total_votes}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Yet to vote</div><div className="v">{r.total_registered - r.total_votes}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
              <div className="l">Progress</div><div className="v">{pct}%</div>
              <div className="rbar" style={{ marginTop: 10 }} role="img" aria-label={`${pct}% turnout`}><div style={{ width: `${pct}%` }} /></div>
            </div>
          </div>
          <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Voters who have voted</h3>
          {voted.length === 0 ? <p className="empty">No votes cast yet.</p> : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Voter ID</th><th>Name</th></tr></thead>
              <tbody>{voted.map(v => <tr key={v.voter_id}><td>{v.voter_id}</td><td>{v.name}</td></tr>)}</tbody>
            </table></div>
          )}
        </>
      )}
    </>
  )
}
