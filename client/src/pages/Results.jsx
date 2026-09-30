import { adminApi } from '../api'
import useLoad, { State } from '../components/useLoad'

export default function Results() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/results'))
  const max = data ? Math.max(...data.candidates.map(c => c.vote_count), 1) : 1
  const turnout = data && data.total_registered ? ((data.total_votes / data.total_registered) * 100).toFixed(1) : '0.0'

  return (
    <>
      <h1>Results</h1><p className="sub">Live tally from the database</p>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="bb-grid" style={{ marginBottom: 20 }}>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Registered voters</div><div className="v">{data.total_registered}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Votes cast</div><div className="v">{data.total_votes}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Turnout</div><div className="v">{turnout}%</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Election status</div><div className="v"><span className="pill muted" style={{ fontSize: 13 }}>Not configured</span></div></div>
          </div>
          <div className="card" style={{ maxWidth: 'none', padding: 20 }}>
            {data.candidates.map(c => (
              <div key={c.candidate_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0' }}>
                <div style={{ width: 170, fontSize: 14 }}>{c.name}<div className="hint" style={{ fontSize: 12 }}>{c.party}</div></div>
                <div className="rbar" role="img" aria-label={`${c.name}: ${c.vote_count} votes`}><div style={{ width: `${(c.vote_count / max) * 100}%` }} /></div>
                <div style={{ width: 36, textAlign: 'right', fontWeight: 700 }}>{c.vote_count}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
