import { useState } from 'react'
import { adminApi, errText } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import Modal from '../../components/Modal'
import { fmtTime, toLocalInput } from '../../lib/adminFormat'

const TONE = { ACTIVE: 'success', SCHEDULED: 'warn', DRAFT: 'muted', ENDED: 'muted' }
const TYPE = { PARLIAMENTARY: 'Parliamentary (Lok Sabha simulation)', ASSEMBLY: 'State assembly', OTHER: 'Other' }
const fieldErrors = e => Object.fromEntries(Object.entries(e?.response?.data?.errors || {}).map(([k, v]) => [k, v.message]))

export default function AdminElection() {
  const { data: e, error, loading, reload } = useLoad(() => adminApi.get('/admin/election'))
  const [edit, setEdit] = useState(false)
  const [confirm, setConfirm] = useState(null)       // 'close' | 'open'
  const [flash, setFlash] = useState(null)

  const act = async (path, text) => {
    try { await adminApi.post(path, path.endsWith('open-now') ? { hours: 2 } : {}); setFlash({ type: 'ok', text }); reload() }
    catch (err) { setFlash({ type: 'bad', text: errText(err, 'Action failed.') }) }
    setConfirm(null)
  }

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Election configuration</div>
          <h1>Election details</h1>
          <p className="bb-page-subtitle">Voting is possible only while the election is ACTIVE: scheduled, and the current time is inside its window.</p>
        </div>
        {e && <button type="button" className="bb-button primary" onClick={() => setEdit(true)}>Edit election</button>}
      </header>
      {flash && <div className={`bb-flash ${flash.type}`} role="status">{flash.text}<button type="button" className="bb-flash-x" aria-label="Dismiss" onClick={() => setFlash(null)}>×</button></div>}
      <State loading={loading && !e} error={error} />
      {!loading && !error && !e && <div className="bb-empty-panel"><div className="bb-empty-panel-icon">⚠</div><h3>Not configured</h3><p>No election record exists in the database.</p></div>}

      {e && (
        <>
          <div className="bb-grid-cards">
            <div className="bb-summary-card"><div className="bb-summary-label">Election name</div><div className="bb-summary-value bb-small">{e.name}</div><div className="bb-summary-meta">{TYPE[e.election_type] || e.election_type}</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">Status</div><div className="bb-summary-value bb-small"><span className={`bb-badge ${TONE[e.status]}`}>{e.status}</span></div>
              <div className="bb-summary-meta">{e.status === 'DRAFT' ? 'Voting is closed until the election is scheduled.' : e.status === 'ACTIVE' ? 'Voters can vote now.' : e.status === 'SCHEDULED' ? 'Opens at the start time.' : 'Voting has ended.'}</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">Start</div><div className="bb-summary-value bb-small">{e.start_time ? fmtTime(e.start_time) : '—'}</div><div className="bb-summary-meta">{e.start_time ? 'local time' : 'not set'}</div></div>
            <div className="bb-summary-card"><div className="bb-summary-label">End</div><div className="bb-summary-value bb-small">{e.end_time ? fmtTime(e.end_time) : '—'}</div><div className="bb-summary-meta">{e.end_time ? 'local time' : 'not set'}</div></div>
          </div>
          <section className="bb-section-card">
            <div className="bb-section-top"><div><div className="bb-section-kicker">Quick controls</div><h2>Open or close voting</h2></div></div>
            <p className="bb-sub">“Open now” schedules the election to run for two hours from this moment (useful for demonstrations). “Close” ends it immediately; candidates are then locked.</p>
            <div className="bb-actions" style={{ marginTop: 12 }}>
              <button type="button" className="bb-button" disabled={e.status === 'ENDED'} onClick={() => setConfirm('open')}>Open voting for 2 hours</button>
              <button type="button" className="bb-button danger" disabled={e.status === 'ENDED'} onClick={() => setConfirm('close')}>Close election</button>
            </div>
          </section>
        </>
      )}

      {edit && e && <ElectionForm e={e} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); setFlash({ type: 'ok', text: 'Election updated.' }); reload() }} />}
      {confirm && (
        <Modal title={confirm === 'close' ? 'Close the election?' : 'Open voting now?'} onClose={() => setConfirm(null)} footer={<>
          <button type="button" className="bb-button ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className={`bb-button ${confirm === 'close' ? 'danger' : 'primary'}`} onClick={() => act(confirm === 'close' ? '/admin/election/close' : '/admin/election/open-now', confirm === 'close' ? 'Election closed.' : 'Voting is open for the next 2 hours.')}>{confirm === 'close' ? 'Close election' : 'Open voting'}</button></>}>
          <p>{confirm === 'close' ? 'Voters will no longer be able to vote and candidates cannot be edited afterwards. This cannot be undone from this page.' : 'Eligible voters with a constituency and active candidates on their ballot will be able to vote immediately.'}</p>
        </Modal>
      )}
    </div>
  )
}

function ElectionForm({ e, onClose, onSaved }) {
  const [f, setF] = useState({ name: e.name, election_type: e.election_type, status: e.status_stored, start_time: toLocalInput(e.start_time), end_time: toLocalInput(e.end_time) })
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); setMsg('') }
  const save = async ev => {
    ev.preventDefault(); setBusy(true)
    try {
      await adminApi.put('/admin/election', { name: f.name, election_type: f.election_type, status: f.status,
        start_time: f.start_time ? new Date(f.start_time).toISOString() : null, end_time: f.end_time ? new Date(f.end_time).toISOString() : null })
      onSaved()
    } catch (err) { setErrors(fieldErrors(err)); setMsg(errText(err, 'Could not save the election.')); setBusy(false) }
  }
  const fld = (k, label, input) => <div className="bb-field"><label htmlFor={`e-${k}`}>{label}</label>{input}{errors[k] && <p className="bb-field-err" role="alert">{errors[k]}</p>}</div>
  return (
    <Modal title="Edit election" onClose={onClose} wide footer={<>
      <button type="button" className="bb-button ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" form="election-form" className="bb-button primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="election-form" onSubmit={save} noValidate className="bb-fgrid">
        {fld('name', 'Election name', <input id="e-name" className="bb-input" maxLength={150} value={f.name} onChange={ev => up('name', ev.target.value)} />)}
        {fld('election_type', 'Election type', <select id="e-election_type" className="bb-input" value={f.election_type} onChange={ev => up('election_type', ev.target.value)}>
          {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
        {fld('status', 'Stored status', <select id="e-status" className="bb-input" value={f.status} onChange={ev => up('status', ev.target.value)}>
          <option value="DRAFT">Draft (voting closed)</option><option value="SCHEDULED">Scheduled (opens inside the window)</option><option value="ENDED">Ended</option></select>)}
        <div className="bb-fgrid-row">
          {fld('start_time', 'Start', <input id="e-start_time" type="datetime-local" className="bb-input" value={f.start_time} onChange={ev => up('start_time', ev.target.value)} />)}
          {fld('end_time', 'End', <input id="e-end_time" type="datetime-local" className="bb-input" value={f.end_time} onChange={ev => up('end_time', ev.target.value)} />)}
        </div>
        <p className="bb-sub">The election type cannot be changed once candidates exist for it.</p>
        {msg && <p className="bb-field-err" role="alert">{msg}</p>}
      </form>
    </Modal>
  )
}
