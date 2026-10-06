import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

const Stat = ({ l, v, s, children }) => (
  <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
    <div className="l">{l}</div><div className="v">{v}{children}</div>{s && <div className="s">{s}</div>}
  </div>
)
const pill = s => ({ ACTIVE: 'ok', SCHEDULED: 'warn', ENDED: 'bad', DRAFT: 'muted' }[s] || 'muted')
const okPill = v => <span className={`pill ${v === 'ok' || v === 'configured' ? 'ok' : 'bad'}`} style={{ fontSize: 13 }}>{String(v).toUpperCase()}</span>

export default function AdminDashboard() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/results'))
  const sec = useLoad(() => adminApi.get('/admin/security'))
  const d = data, bc = d?.blockchain, s = sec.data
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
            <Stat l="Candidates" v={d.candidates.filter(c => c.is_active).length} s={`${d.candidates.length} total`} />
            <Stat l="Votes cast" v={d.total_votes} s={`${turnout}% turnout`} />
            <Stat l="Election" v="" s={d.election?.name}><span className={`pill ${pill(d.election?.status)}`} style={{ fontSize: 13 }}>{d.election?.status || 'DRAFT'}</span></Stat>
            <Stat l="Blockchain" v="" s={bc ? `${bc.total_blocks} blocks (including genesis)` : 'AI service unreachable'}>
              {bc ? <span className={`pill ${bc.is_valid ? 'ok' : 'bad'}`} style={{ fontSize: 13 }}>{bc.is_valid ? 'VALID' : 'INVALID'}</span> : <span className="pill bad" style={{ fontSize: 13 }}>UNKNOWN</span>}
            </Stat>
          </div>
          {mismatch && <p className="note" style={{ marginTop: 20 }}>Mismatch: {bc.total_blocks - 1} vote block(s) on the chain vs {d.total_votes} vote(s) in the database. (The chain is memory-only and resets when the AI service restarts.)</p>}
        </>
      )}

      <h2 style={{ fontSize: 17, margin: '28px 0 12px' }}>Security status</h2>
      <State loading={sec.loading} error={sec.error} />
      {s && (
        <div className="tbl-wrap"><table className="tbl"><tbody>
          <tr><td>Admin authentication</td><td>{okPill(s.admin_auth)}</td></tr>
          <tr><td>Database</td><td>{okPill(s.database)}</td></tr>
          <tr><td>AI verification service</td><td>{okPill(s.ai_service)}</td></tr>
          <tr><td>Blockchain integrity</td><td>{s.blockchain ? okPill(s.blockchain.is_valid ? 'ok' : 'INVALID') : <span className="pill muted">unknown</span>}</td></tr>
          <tr><td>Blockchain persistence</td><td>{s.blockchain_persistence}</td></tr>
          <tr><td>Identity verification</td><td>{s.identity.mode} · provider “{s.identity.provider}”{s.identity.development && <span className="pill warn" style={{ marginLeft: 8 }}>Development / Demo</span>}</td></tr>
          <tr><td>Session secret</td><td>{s.session_secret}</td></tr>
        </tbody></table></div>
      )}
      <p className="hint" style={{ marginTop: 20, fontSize: 13 }}>
        <Link to="/admin/election" style={{ color: 'var(--accent)' }}>Election</Link> · <Link to="/admin/blockchain" style={{ color: 'var(--accent)' }}>Blockchain</Link> · <Link to="/admin/results" style={{ color: 'var(--accent)' }}>Results</Link> · <Link to="/admin/audit" style={{ color: 'var(--accent)' }}>Audit logs</Link>
      </p>
    </>
  )
}
