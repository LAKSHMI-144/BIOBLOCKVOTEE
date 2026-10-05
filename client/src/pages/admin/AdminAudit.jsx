import { adminApi } from '../../api'
import useLoad, { State } from '../../components/useLoad'

// Labels are derived from the stored action code; the table has no separate actor/status columns.
const EVENTS = {
  REGISTERED: ['Voter registration', true],
  FACE_REGISTERED: ['Face registration', true],
  AUTHENTICATED: ['Authentication', true],
  VOTED_FOR: ['Vote cast', true],
  DUPLICATE_ATTEMPT: ['Duplicate voting attempt', false],
  REGISTRATION_REJECTED: ['Registration rejected', false],
  FACE_REGISTRATION_FAILED: ['Face registration failed', false],
}

export default function AdminAudit() {
  const { data, error, loading } = useLoad(() => adminApi.get('/admin/audit-logs'))
  return (
    <>
      <h1>Audit Logs</h1><p className="sub">Most recent 200 recorded events</p>
      <p className="sub" style={{ marginTop: -16 }}>Not recorded: failed authentication, candidate / election changes, block creation.</p>
      <State loading={loading} error={error} />
      {data && (data.length === 0 ? <p className="empty">No events recorded yet.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Status</th><th>Reference ID</th></tr></thead>
          <tbody>{data.map(r => {
            const [label, ok] = EVENTS[r.action.split(':')[0]] || [r.action, true]
            return (
              <tr key={r.id}>
                <td>{new Date(r.timestamp).toLocaleString()}</td><td>{label}</td><td>Voter</td>
                <td><span className={`pill ${ok ? 'ok' : 'bad'}`}>{ok ? 'Success' : 'Rejected'}</span></td><td>{r.voter_id || '-'}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
      ))}
    </>
  )
}
