import { useState } from 'react'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

const EMPTY = { name: '', party: '', symbol: '', description: '' }
const apiErr = e => ({ message: e?.response?.data?.message || (e?.request ? 'Cannot reach the server.' : 'Request failed'),
  fields: Object.fromEntries(Object.entries(e?.response?.data?.errors || {}).map(([k, v]) => [k, v.message])) })

export default function AdminCandidates() {
  const { data, error, loading, reload } = useLoad(() => adminApi.get('/admin/candidates'))
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)       // candidate_id or null (adding)
  const [errs, setErrs] = useState({})
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const done = text => { setMsg({ type: 'success', text }); setForm(EMPTY); setEditing(null); setErrs({}); reload() }
  const fail = e => { const r = apiErr(e); setErrs(r.fields); setMsg({ type: 'error', text: r.message }) }
  const save = async e => {
    e.preventDefault(); setBusy(true); setMsg(null); setErrs({})
    try {
      if (editing) { await adminApi.put(`/admin/candidates/${editing}`, form); done('Candidate updated.') }
      else { await adminApi.post('/admin/candidates', form); done('Candidate added.') }
    } catch (e2) { fail(e2) }
    setBusy(false)
  }
  const toggle = async c => {
    setBusy(true); setMsg(null)
    try { await adminApi.post(`/admin/candidates/${c.candidate_id}/active`, { active: !c.is_active }); done(c.is_active ? 'Candidate deactivated (hidden from voters).' : 'Candidate activated.') } catch (e) { fail(e) }
    setBusy(false)
  }
  const edit = c => { setEditing(c.candidate_id); setForm({ name: c.name, party: c.party, symbol: c.symbol || '', description: c.description || '' }); setMsg(null); setErrs({}) }
  const inp = (k, label, props = {}) => (
    <div><label htmlFor={`c-${k}`} className="lbl">{label}</label>
      <input id={`c-${k}`} className={`input${errs[k] ? ' invalid' : ''}`} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} {...props} />
      {errs[k] && <p className="field-err" role="alert">{errs[k]}</p>}</div>
  )

  return (
    <>
      <h1>Candidates</h1><p className="sub">Add, edit or deactivate candidates. Changes are blocked while the election is active or ended; candidates with votes are deactivated, never deleted.</p>
      <State loading={loading} error={error} />
      {data && (data.length === 0 ? <p className="empty">No candidates yet.</p> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>ID</th><th>Name</th><th>Party / group</th><th>Symbol</th><th>Description</th><th>Votes</th><th>Status</th><th /></tr></thead>
          <tbody>{data.map(c => (
            <tr key={c.candidate_id}>
              <td>{c.candidate_id}</td><td>{c.name}</td><td>{c.party}</td><td>{c.symbol}</td><td>{c.description || '—'}</td><td>{c.vote_count}</td>
              <td><span className={`pill ${c.is_active ? 'ok' : 'muted'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn secondary" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => edit(c)}>Edit</button>{' '}
                <button className="btn secondary" style={{ padding: '4px 10px' }} disabled={busy} onClick={() => toggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ))}
      <form className="card" style={{ maxWidth: 560, padding: 22, marginTop: 24 }} onSubmit={save} noValidate>
        <h3 style={{ marginBottom: 6 }}>{editing ? `Edit candidate #${editing}` : 'Add candidate'}</h3>
        {inp('name', 'Candidate name *')}{inp('party', 'Party / group *')}{inp('symbol', 'Symbol (optional, up to 4 characters)')}{inp('description', 'Description (optional)')}
        <div className="btn-row">
          <button className="btn primary" type="submit" disabled={busy}>{editing ? 'Save changes' : 'Add candidate'}</button>
          {editing && <button className="btn secondary" type="button" disabled={busy} onClick={() => { setEditing(null); setForm(EMPTY); setErrs({}); setMsg(null) }}>Cancel edit</button>}
        </div>
        {msg && <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'} style={{ textAlign: 'left' }}>{msg.text}</p>}
      </form>
    </>
  )
}
