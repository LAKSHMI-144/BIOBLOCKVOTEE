import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

const Yes = ({ v, yes = 'Yes', no = 'No' }) => <span className={`pill ${v ? 'ok' : 'muted'}`}>{v ? yes : no}</span>

export default function AdminVoters() {
  const { data, error, loading } = useLoad(() => adminApi.get('/voters/all'))
  return (
    <>
      <h1>Registered Voters</h1><p className="sub">Verification and voting status. Biometric data is never shown.</p>
      <State loading={loading} error={error} />
      {data && (data.length === 0 ? <p className="empty">No voters registered yet.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Voter ID</th><th>Name</th><th>Age</th><th>Eligible</th><th>Face registered</th><th>Voted</th><th>Registered</th></tr></thead>
          <tbody>{data.map(v => (
            <tr key={v.voter_id}>
              <td>{v.voter_id}</td><td>{v.name}</td><td>{v.age}</td>
              <td><Yes v={v.is_eligible} /></td><td><Yes v={v.face_registered} /></td><td><Yes v={v.has_voted} /></td>
              <td>{new Date(v.registered_at).toLocaleDateString()}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
    </>
  )
}
