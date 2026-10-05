import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

const Stat = ({ l, v, s, children }) => (
  <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
    <div className="l">{l}</div><div className="v">{v}{children}</div>{s && <div className="s">{s}</div>}
  </div>
)

export default function AdminDashboard() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/results'))
  const d = data
  const bc = d?.blockchain
  const turnout = d && d.total_registered ? Math.round((d.total_votes / d.total_registered) * 100) : 0
  const mismatch = bc && bc.total_blocks - 1 !== d.total_votes

  return (
    <>
      <h1>Dashboard</h1><p className="sub">Election overview</p>
      <State loading={loading} error={error} />
      {d && (
        <>
          <div className="bb-grid">
            <Stat l="Registered voters" v={d.total_registered} />
            <Stat l="Candidates" v={d.candidates.length} />
            <Stat l="Votes cast" v={d.total_votes} s={`${turnout}% turnout`} />
            <Stat l="Election status" v="" s="Election scheduling is not implemented in this version."><span className="pill muted" style={{ fontSize: 13 }}>Not configured</span></Stat>
            <Stat l="Blockchain" v="" s={`${bc.total_blocks} blocks (including genesis)`}>
              <span className={`pill ${bc.is_valid ? 'ok' : 'bad'}`} style={{ fontSize: 13 }}>{bc.is_valid ? 'VALID' : 'INVALID'}</span>
            </Stat>
          </div>
          {mismatch && (
            <p className="note" style={{ marginTop: 20 }}>
              Mismatch: {bc.total_blocks - 1} vote block(s) on the chain vs {d.total_votes} vote(s) in the database.
            </p>
          )}
          <p className="hint" style={{ marginTop: 20, fontSize: 13 }}>
            <Link to="/admin/blockchain" style={{ color: 'var(--accent)' }}>Inspect blockchain</Link> · <Link to="/admin/results" style={{ color: 'var(--accent)' }}>View results</Link> · <Link to="/admin/audit" style={{ color: 'var(--accent)' }}>Audit logs</Link>
          </p>
        </>
      )}
    </>
  )
}
