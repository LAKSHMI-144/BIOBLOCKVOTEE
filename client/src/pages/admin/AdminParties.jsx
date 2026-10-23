import { useMemo, useState } from 'react'
import { adminApi, errText } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import Modal from '../../components/Modal'

const fieldErrors = e => Object.fromEntries(Object.entries(e?.response?.data?.errors || {}).map(([k, v]) => [k, v.message]))

export default function AdminParties() {
  const parties = useLoad(() => adminApi.get('/admin/parties'))
  const states = useLoad(() => adminApi.get('/admin/states'))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [dialog, setDialog] = useState(null)         // { kind: 'form', party? } | { kind: 'confirm', party }
  const [flash, setFlash] = useState(null)
  const stateName = useMemo(() => Object.fromEntries((states.data || []).map(s => [s.state_id, s.name])), [states.data])

  const all = parties.data || []
  const shown = all.filter(p => (!status || p.status === status) && (!q.trim() || `${p.name} ${p.abbreviation}`.toLowerCase().includes(q.trim().toLowerCase())))
  const done = msg => { setDialog(null); setFlash({ type: 'ok', text: msg }); parties.reload() }
  const toggle = async p => {
    try { await adminApi.post(`/admin/parties/${p.party_id}/active`, { active: p.status !== 'ACTIVE' }); done(`${p.abbreviation} ${p.status === 'ACTIVE' ? 'deactivated' : 'activated'}.`) }
    catch (e) { setDialog(null); setFlash({ type: 'bad', text: errText(e, 'Could not change the party status.') }) }
  }
  const scope = p => (p.all_states ? 'All states / UTs' : p.state_ids.length === 0 ? '—' : p.state_ids.length <= 2 ? p.state_ids.map(i => stateName[i] || i).join(', ') : `${p.state_ids.length} states / UTs`)

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Election setup</div>
          <h1>Political parties</h1>
          <p className="bb-page-subtitle">Party master data, kept separate from candidates. Each candidate references a party by ID.</p>
        </div>
        <button type="button" className="bb-button primary" onClick={() => setDialog({ kind: 'form' })}>+ Add Party</button>
      </header>
      <p className="note">The seeded parties are an illustrative starting set, not an exhaustive or officially verified list. Add or edit parties as needed.</p>
      {flash && <div className={`bb-flash ${flash.type}`} role="status">{flash.text}<button type="button" className="bb-flash-x" aria-label="Dismiss" onClick={() => setFlash(null)}>×</button></div>}

      <section className="bb-section-card">
        <div className="bb-filters" role="search">
          <input className="bb-input" placeholder="Search party name or abbreviation" aria-label="Search parties" value={q} onChange={e => setQ(e.target.value)} />
          <select className="bb-input" aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
        </div>
        <State loading={parties.loading && !parties.data} error={parties.error} />
        {parties.data && (shown.length === 0 ? (
          <div className="bb-empty-panel"><div className="bb-empty-panel-icon">◌</div><h3>{all.length ? 'No parties match' : 'No parties yet'}</h3><p>Use “Add Party” to create one.</p></div>
        ) : (
          <div className="bb-table-shell"><table className="bb-table">
            <thead><tr><th>Party</th><th>Abbr.</th><th>Contests in</th><th>Candidates</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{shown.map(p => (
              <tr key={p.party_id}>
                <td><strong>{p.name}</strong>{p.notes && <small className="bb-sub">{p.notes}</small>}</td><td>{p.abbreviation}</td><td title={p.all_states ? '' : p.state_ids.map(i => stateName[i]).join(', ')}>{scope(p)}</td><td>{p.candidates}</td>
                <td><span className={`bb-badge ${p.status === 'ACTIVE' ? 'success' : 'muted'}`}>{p.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></td>
                <td><div className="bb-actions">
                  <button type="button" className="bb-button subtle" onClick={() => setDialog({ kind: 'form', party: p })}>Edit</button>
                  {p.status === 'ACTIVE'
                    ? <button type="button" className="bb-button danger" onClick={() => setDialog({ kind: 'confirm', party: p })}>Deactivate</button>
                    : <button type="button" className="bb-button" onClick={() => toggle(p)}>Activate</button>}
                </div></td>
              </tr>))}</tbody>
          </table></div>
        ))}
      </section>

      {dialog?.kind === 'form' && <PartyForm party={dialog.party} states={states.data || []} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.kind === 'confirm' && (
        <Modal title="Deactivate party?" onClose={() => setDialog(null)} footer={<>
          <button type="button" className="bb-button ghost" onClick={() => setDialog(null)}>Cancel</button>
          <button type="button" className="bb-button danger" onClick={() => toggle(dialog.party)}>Deactivate</button></>}>
          <p>{dialog.party.name} will no longer be selectable for new candidates, and its candidates ({dialog.party.candidates}) stop appearing on ballots while the party is inactive. Recorded votes are kept.</p>
        </Modal>
      )}
    </div>
  )
}

function PartyForm({ party, states, onClose, onSaved }) {
  const editing = !!party
  const [f, setF] = useState(() => editing ? { name: party.name, abbreviation: party.abbreviation, notes: party.notes || '', all_states: party.all_states, state_ids: party.state_ids } : { name: '', abbreviation: '', notes: '', all_states: false, state_ids: [] })
  const [find, setFind] = useState('')
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const up = (k, v) => { setF(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); setMsg('') }
  const flip = id => up('state_ids', f.state_ids.includes(id) ? f.state_ids.filter(x => x !== id) : [...f.state_ids, id])
  const visible = states.filter(s => s.name.toLowerCase().includes(find.trim().toLowerCase()))

  const save = async e => {
    e.preventDefault()
    const local = {}
    if (f.name.trim().length < 2) local.name = 'Enter the party name (2-150 characters).'
    if (f.abbreviation.trim().length < 2) local.abbreviation = 'Enter an abbreviation (2-20 characters).'
    if (!f.all_states && f.state_ids.length === 0) local.state_ids = 'Choose the states this party contests in, or tick “contests everywhere”.'
    if (Object.keys(local).length) return setErrors(local)
    setBusy(true)
    try {
      if (editing) await adminApi.put(`/admin/parties/${party.party_id}`, f)
      else await adminApi.post('/admin/parties', f)
      onSaved(editing ? `${f.abbreviation.trim()} updated.` : `${f.abbreviation.trim()} added.`)
    } catch (err) { setErrors(fieldErrors(err)); setMsg(errText(err, 'Could not save the party.')); setBusy(false) }
  }
  const fld = (k, label, input) => <div className="bb-field"><label htmlFor={`p-${k}`}>{label}</label>{input}{errors[k] && <p className="bb-field-err" role="alert">{errors[k]}</p>}</div>
  return (
    <Modal title={editing ? 'Edit party' : 'Add party'} onClose={onClose} wide footer={<>
      <button type="button" className="bb-button ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" form="party-form" className="bb-button primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add party'}</button></>}>
      <form id="party-form" onSubmit={save} noValidate className="bb-fgrid">
        {fld('name', 'Party name *', <input id="p-name" className="bb-input" maxLength={150} value={f.name} onChange={e => up('name', e.target.value)} />)}
        <div className="bb-fgrid-row">
          {fld('abbreviation', 'Abbreviation *', <input id="p-abbreviation" className="bb-input" maxLength={20} value={f.abbreviation} onChange={e => up('abbreviation', e.target.value)} />)}
          {fld('notes', 'Notes', <input id="p-notes" className="bb-input" maxLength={250} value={f.notes} onChange={e => up('notes', e.target.value)} />)}
        </div>
        <label className="bb-check"><input type="checkbox" checked={f.all_states} onChange={e => up('all_states', e.target.checked)} /> Contests in every state / UT</label>
        {!f.all_states && (
          <div className="bb-field">
            <label htmlFor="p-find">States / UTs this party contests in ({f.state_ids.length} selected)</label>
            <input id="p-find" className="bb-input" placeholder="Filter the list" value={find} onChange={e => setFind(e.target.value)} />
            <div className="bb-checklist">{visible.map(s => <label key={s.state_id} className="bb-check"><input type="checkbox" checked={f.state_ids.includes(s.state_id)} onChange={() => flip(s.state_id)} /> {s.name}{s.kind === 'UT' ? ' (UT)' : ''}</label>)}</div>
            {errors.state_ids && <p className="bb-field-err" role="alert">{errors.state_ids}</p>}
          </div>
        )}
        {msg && <p className="bb-field-err" role="alert">{msg}</p>}
      </form>
    </Modal>
  )
}
