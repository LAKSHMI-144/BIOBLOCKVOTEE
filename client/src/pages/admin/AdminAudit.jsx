import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

// Labels are derived from the stored action code; `actor` is 'voter' or 'admin'.
const EVENTS = {
  REGISTERED: ['Voter registration', true],
  FACE_REGISTERED: ['Face registration', true],
  AUTHENTICATED: ['Authentication', true],
  VOTED: ['Vote cast', true],
  VOTED_FOR: ['Vote cast', true],
  IDENTITY_STARTED: ['Identity verification started', true],
  OTP_SENT: ['OTP sent', true],
  OTP_FAILED: ['OTP verification failed', false],
  IDENTITY_VERIFIED: ['Identity verified', true],
  AUTH_ID_MISMATCH: ['Face did not match entered Voter ID', false],
  ELECTION_UPDATED: ['Election updated', true],
  ELECTION_OPENED: ['Election opened', true],
  ELECTION_CLOSED: ['Election closed', true],
  CANDIDATE_ADDED: ['Candidate added', true],
  CANDIDATE_EDITED: ['Candidate edited', true],
  CANDIDATE_ACTIVATED: ['Candidate activated', true],
  CANDIDATE_DEACTIVATED: ['Candidate deactivated', true],
  DUPLICATE_ATTEMPT: ['Duplicate voting attempt', false],
  REGISTRATION_REJECTED: ['Registration rejected', false],
  FACE_REGISTRATION_FAILED: ['Face registration failed', false],
}

export default function AdminAudit() {
  const { data, error, loading } = useLoad(() => adminApi.get('/admin/audit-logs'))
  return (
    <>
      <h1>Audit Logs</h1><p className="sub">Most recent 200 recorded events</p>
      <p className="sub" style={{ marginTop: -16 }}>Not recorded: failed face-login attempts and block creation. Identity numbers, OTPs and biometric data are never logged.</p>
      <State loading={loading} error={error} />
      {data && (data.length === 0 ? <p className="empty">No events recorded yet.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Timestamp</th><th>Event</th><th>Actor</th><th>Status</th><th>Reference ID</th></tr></thead>
          <tbody>{data.map(r => {
            const [label, ok] = EVENTS[r.action.split(':')[0]] || [r.action, true]
            return (
              <tr key={r.id}>
                <td>{new Date(r.timestamp).toLocaleString()}</td><td>{label}</td><td>{r.actor === 'admin' ? 'Admin' : 'Voter'}</td>
                <td><span className={`pill ${ok ? 'ok' : 'bad'}`}>{ok ? 'Success' : 'Rejected'}</span></td><td>{r.voter_id || (r.action.includes(':') ? `#${r.action.split(':')[1]}` : '-')}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
      ))}
    </>
  )
}
