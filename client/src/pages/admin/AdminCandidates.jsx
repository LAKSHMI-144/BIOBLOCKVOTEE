import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

export default function AdminCandidates() {
  const { data, error, loading } = useLoad(() => adminApi.get('/votes/candidates'))
  return (
    <>
      <h1>Candidates</h1><p className="sub">Read-only view of registered candidates</p>
      <p className="note">Adding, editing and removing candidates is not available yet: the backend has no candidate-management API. Election and status columns are omitted because that data does not exist.</p>
      <State loading={loading} error={error} />
      {data && (data.length === 0 ? <p className="empty">No candidates found.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>ID</th><th>Name</th><th>Party</th><th>Symbol</th><th>Votes</th></tr></thead>
          <tbody>{data.map(c => (
            <tr key={c.candidate_id}><td>{c.candidate_id}</td><td>{c.name}</td><td>{c.party}</td><td>{c.symbol}</td><td>{c.vote_count}</td></tr>
          ))}</tbody>
        </table></div>
      ))}
    </>
  )
}
