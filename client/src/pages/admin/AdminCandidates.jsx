import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi, errText } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'
import Modal from '../../components/Modal'

const EMPTY = { name: '', symbol: '', position: '', description: '', state_id: '', constituency_id: '', party_id: '', status: 'ACTIVE' }
const first = (o = {}) => Object.keys(o).length

// A field-level error returned by the API ({ errors: { field: { message } } }) -> { field: message }.
const fieldErrors = e => Object.fromEntries(Object.entries(e?.response?.data?.errors || {}).map(([k, v]) => [k, v.message]))

export default function AdminCandidates() {
  const [filters, setFilters] = useState({ state_id: '', constituency_id: '', party_id: '', status: '', q: '' })
  const [group, setGroup] = useState(false)
  const [dialog, setDialog] = useState(null)        // { kind: 'view' | 'edit' | 'add' | 'confirm', candidate? }
  const [flash, setFlash] = useState(null)
  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')), [filters])

  const election = useLoad(() => adminApi.get('/admin/election'))
  const states = useLoad(() => adminApi.get('/admin/states'))
  const parties = useLoad(() => adminApi.get('/admin/parties'))
  const [consts, setConsts] = useState([])
  const list = useLoad(() => adminApi.get('/admin/candidates', { params: query }))
  const { reload } = list
  const [search, setSearch] = useState('')

  useEffect(() => { reload() }, [query])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    adminApi.get('/admin/constituencies', { params: filters.state_id ? { state_id: filters.state_id } : {} }).then(r => live && setConsts(r.data)).catch(() => live && setConsts([]))
    return () => { live = false }
  }, [filters.state_id])
  useEffect(() => { const t = setTimeout(() => setFilters(f => (f.q === search.trim() ? f : { ...f, q: search.trim() })), 300); return () => clearTimeout(t) }, [search])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v, ...(k === 'state_id' ? { constituency_id: '' } : {}) }))
  const data = list.data || []
  const active = data.filter(c => c.is_active).length
  const votes = data.reduce((n, c) => n + Number(c.vote_count || 0), 0)
  const done = msg => { setDialog(null); setFlash({ type: 'ok', text: msg }); reload() }

  const toggle = async c => {
    try { await adminApi.post(`/admin/candidates/${c.candidate_id}/active`, { active: !c.is_active }); done(`${c.name} ${c.is_active ? 'deactivated' : 'activated'}.`) }
    catch (e) { setDialog(null); setFlash({ type: 'bad', text: errText(e, 'Could not change the candidate status.') }) }
  }

  const groups = useMemo(() => {
    const m = new Map()
    for (const c of (list.data || [])) { const k = c.party_name || 'No party assigned'; if (!m.has(k)) m.set(k, []); m.get(k).push(c) }
    return [...m]
  }, [list.data])

  const row = c => (
    <tr key={c.candidate_id}>
      <td>#{c.candidate_id}</td>
      <td><div className="bb-entity-cell"><span className="bb-entity-bullet">{(c.name || '?')[0].toUpperCase()}</span><div><strong>{c.name}</strong>{c.symbol && <small>{c.symbol}</small>}</div></div></td>
      <td>{c.party_abbr ? <span title={c.party_name}>{c.party_abbr}</span> : <span className="bb-badge warn">Unassigned</span>}</td>
      <td>{c.state_name || '—'}</td><td>{c.constituency_name || '—'}</td><td>{c.position || '—'}</td><td>{Number(c.vote_count)}</td>
      <td><span className={`bb-badge ${c.is_active ? 'success' : 'muted'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><div className="bb-actions">
        <button type="button" className="bb-button ghost" onClick={() => setDialog({ kind: 'view', candidate: c })}>View</button>
        <button type="button" className="bb-button subtle" onClick={() => setDialog({ kind: 'edit', candidate: c })}>Edit</button>
        {c.is_active
          ? <button type="button" className="bb-button danger" onClick={() => setDialog({ kind: 'confirm', candidate: c })}>Deactivate</button>
          : <button type="button" className="bb-button" onClick={() => toggle(c)}>Activate</button>}
      </div></td>
    </tr>
  )
  const head = <thead><tr><th>ID</th><th>Candidate</th><th>Party</th><th>State / UT</th><th>Constituency</th><th>Position</th><th>Votes</th><th>Status</th><th>Actions</th></tr></thead>
  const el = election.data
  const locked = el && ['ACTIVE', 'ENDED'].includes(el.status)

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Candidate management</div>
          <h1>Candidates</h1>
          <p className="bb-page-subtitle">India → State / UT → Constituency → Party → Candidate. {el ? <>Election: <strong>{el.name}</strong> ({el.election_type?.toLowerCase()}, {el.status})</> : 'No election configured.'}</p>
        </div>
        <button type="button" className="bb-button primary" disabled={!el || locked} title={locked ? `Candidates are locked while the election is ${el.status}` : ''} onClick={() => setDialog({ kind: 'add' })}>+ Add Candidate</button>
      </header>

      <p className="note">Candidate names are entered by the administrator for this academic prototype. The system is not connected to the Election Commission of India, and the party list is an illustrative starting set.</p>
      {flash && <div className={`bb-flash ${flash.type}`} role="status">{flash.text}<button type="button" className="bb-flash-x" aria-label="Dismiss" onClick={() => setFlash(null)}>×</button></div>}

      <div className="bb-summary-grid">
        <div className="bb-summary-card"><div className="bb-summary-label">Shown</div><div className="bb-summary-value">{data.length}</div><div className="bb-summary-meta">matching the filters</div></div>
        <div className="bb-summary-card"><div className="bb-summary-label">Active</div><div className="bb-summary-value">{active}</div><div className="bb-summary-meta">appear on ballots</div></div>
        <div className="bb-summary-card"><div className="bb-summary-label">Votes</div><div className="bb-summary-value">{votes}</div><div className="bb-summary-meta">for the shown candidates</div></div>
      </div>

      <section className="bb-section-card">
        <div className="bb-filters" role="search">
          <input className="bb-input" placeholder="Search candidate name" aria-label="Search candidate name" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="bb-input" aria-label="Filter by state" value={filters.state_id} onChange={e => set('state_id', e.target.value)}>
            <option value="">All states / UTs</option>{(states.data || []).map(s => <option key={s.state_id} value={s.state_id}>{s.name}</option>)}
          </select>
          <select className="bb-input" aria-label="Filter by constituency" value={filters.constituency_id} onChange={e => set('constituency_id', e.target.value)}>
            <option value="">All constituencies</option>{consts.map(c => <option key={c.constituency_id} value={c.constituency_id}>{c.name}</option>)}
          </select>
          <select className="bb-input" aria-label="Filter by party" value={filters.party_id} onChange={e => set('party_id', e.target.value)}>
            <option value="">All parties</option>{(parties.data || []).map(p => <option key={p.party_id} value={p.party_id}>{p.abbreviation}</option>)}
          </select>
          <select className="bb-input" aria-label="Filter by status" value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
          <label className="bb-check"><input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} /> Group by party</label>
        </div>

        <State loading={list.loading && !list.data} error={list.error} />
        {list.data && (data.length === 0 ? (
          <div className="bb-empty-panel"><div className="bb-empty-panel-icon">◌</div><h3>{first(query) ? 'No candidates match these filters' : 'No candidates yet'}</h3>
            <p>{first(query) ? 'Clear a filter to see more.' : 'Use “Add Candidate” to create the first one. It will reach voters only after it is active and assigned a party and constituency.'}</p></div>
        ) : group ? groups.map(([party, items]) => (
          <div key={party}><h3 className="bb-subhead">{party} <span className="bb-badge muted">{items.length}</span></h3>
            <div className="bb-table-shell"><table className="bb-table">{head}<tbody>{items.map(row)}</tbody></table></div></div>
        )) : <div className="bb-table-shell"><table className="bb-table">{head}<tbody>{data.map(row)}</tbody></table></div>)}
      </section>

      {dialog?.kind === 'view' && <ViewDialog c={dialog.candidate} onClose={() => setDialog(null)} />}
      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <CandidateForm candidate={dialog.candidate} election={el} states={states.data || []} onClose={() => setDialog(null)} onSaved={done} />
      )}
      {dialog?.kind === 'confirm' && (
        <Modal title="Deactivate candidate?" onClose={() => setDialog(null)} footer={<>
          <button type="button" className="bb-button ghost" onClick={() => setDialog(null)}>Cancel</button>
          <button type="button" className="bb-button danger" onClick={() => toggle(dialog.candidate)}>Deactivate</button></>}>
          <p>{dialog.candidate.name} will disappear from ballots for new voting sessions. {dialog.candidate.has_votes ? `The ${dialog.candidate.vote_count} vote(s) already recorded are kept.` : 'No votes have been recorded for this candidate.'} You can activate the candidate again later.</p>
        </Modal>
      )}
    </div>
  )
}

function ViewDialog({ c, onClose }) {
  const rows = [['Candidate ID', `#${c.candidate_id}`], ['Name', c.name], ['Party', c.party_name ? `${c.party_name} (${c.party_abbr})` : 'Unassigned'], ['Symbol', c.symbol || '—'],
    ['State / UT', c.state_name || '—'], ['Constituency', c.constituency_name ? `${c.constituency_name} (${c.constituency_kind?.toLowerCase()})` : '—'], ['Election', c.election_name || '—'],
    ['Position', c.position || '—'], ['Status', c.is_active ? 'Active' : 'Inactive'], ['Votes recorded', c.vote_count], ['Description', c.description || '—']]
  return (
    <Modal title="Candidate details" onClose={onClose} footer={<button type="button" className="bb-button" onClick={onClose}>Close</button>}>
      <dl className="bb-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </Modal>
  )
}

function CandidateForm({ candidate, election, states, onClose, onSaved }) {
  const editing = !!candidate
  const [f, setF] = useState(() => editing ? { name: candidate.name, symbol: candidate.symbol || '', position: candidate.position || '', description: candidate.description || '', state_id: String(candidate.state_id || ''),
    constituency_id: String(candidate.constituency_id || ''), party_id: String(candidate.party_id || ''), status: candidate.status } : EMPTY)
  const [consts, setConsts] = useState([])
  const [parties, setParties] = useState([])
  const [errors, setErrors] = useState({})
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const identityLocked = editing && candidate.has_votes

  useEffect(() => {
    if (!f.state_id) return
    let live = true
    adminApi.get('/admin/constituencies', { params: { state_id: f.state_id } }).then(r => live && setConsts(r.data.filter(c => c.is_active && (!election || election.election_type === 'OTHER' || c.kind === election.election_type)))).catch(() => live && setConsts([]))
    adminApi.get('/admin/parties', { params: { state_id: f.state_id, status: 'ACTIVE' } }).then(r => live && setParties(r.data)).catch(() => live && setParties([]))
    return () => { live = false }
  }, [f.state_id, election])

  const up = (k, v) => { setF(p => ({ ...p, [k]: v, ...(k === 'state_id' ? { constituency_id: '', party_id: '' } : {}) })); setErrors(p => ({ ...p, [k]: undefined })); setMsg('') }
  const save = useCallback(async e => {
    e.preventDefault()
    const local = {}
    if (f.name.trim().length < 2) local.name = 'Enter the candidate name (2-100 characters).'
    if (!f.state_id) local.state_id = 'Select a state or union territory.'
    if (!f.constituency_id) local.constituency_id = 'Select a constituency.'
    if (!f.party_id) local.party_id = 'Select a party (or Independent).'
    if (first(local)) return setErrors(local)
    setBusy(true)
    const body = { name: f.name, symbol: f.symbol, position: f.position, description: f.description, party_id: Number(f.party_id), constituency_id: Number(f.constituency_id), election_id: election?.election_id, status: f.status }
    try {
      if (editing) await adminApi.put(`/admin/candidates/${candidate.candidate_id}`, body)
      else await adminApi.post('/admin/candidates', body)
      onSaved(editing ? `${f.name.trim()} updated.` : `${f.name.trim()} added.`)
    } catch (err) { setErrors(fieldErrors(err)); setMsg(errText(err, 'Could not save the candidate.')); setBusy(false) }
  }, [f, editing, candidate, election, onSaved])

  const fld = (k, label, input) => <div className="bb-field"><label htmlFor={`c-${k}`}>{label}</label>{input}{errors[k] && <p className="bb-field-err" role="alert">{errors[k]}</p>}</div>
  return (
    <Modal title={editing ? 'Edit candidate' : 'Add candidate'} onClose={onClose} wide footer={<>
      <button type="button" className="bb-button ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="submit" form="candidate-form" className="bb-button primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add candidate'}</button></>}>
      <form id="candidate-form" onSubmit={save} noValidate className="bb-fgrid">
        {identityLocked && <p className="bb-inline-note">This candidate already has {candidate.vote_count} recorded vote(s). Name, party and constituency are locked so past votes keep their meaning; description, symbol and position can still be edited.</p>}
        <p className="bb-fgrid-note">Election: <strong>{election?.name || '—'}</strong> ({election?.election_type?.toLowerCase()})</p>
        {fld('name', 'Candidate name *', <input id="c-name" className="bb-input" value={f.name} disabled={identityLocked} maxLength={100} onChange={e => up('name', e.target.value)} />)}
        {fld('state_id', 'State / UT *', <select id="c-state_id" className="bb-input" value={f.state_id} disabled={identityLocked} onChange={e => up('state_id', e.target.value)}>
          <option value="">Select state / UT</option>{states.map(s => <option key={s.state_id} value={s.state_id}>{s.name}</option>)}</select>)}
        {fld('constituency_id', 'Constituency *', <select id="c-constituency_id" className="bb-input" value={f.constituency_id} disabled={identityLocked || !f.state_id} onChange={e => up('constituency_id', e.target.value)}>
          <option value="">Select constituency</option>{consts.map(c => <option key={c.constituency_id} value={c.constituency_id}>{c.name}</option>)}</select>)}
        {fld('party_id', 'Party *', <select id="c-party_id" className="bb-input" value={f.party_id} disabled={identityLocked || !f.state_id} onChange={e => up('party_id', e.target.value)}>
          <option value="">Select party</option>{parties.map(p => <option key={p.party_id} value={p.party_id}>{p.name} ({p.abbreviation})</option>)}</select>)}
        <div className="bb-fgrid-row">
          {fld('symbol', 'Symbol (max 4 characters)', <input id="c-symbol" className="bb-input" value={f.symbol} maxLength={8} onChange={e => up('symbol', e.target.value)} />)}
          {fld('position', 'Position', <input id="c-position" className="bb-input" value={f.position} maxLength={100} onChange={e => up('position', e.target.value)} placeholder="e.g. Member of Parliament" />)}
        </div>
        {fld('description', 'Description', <textarea id="c-description" className="bb-input" rows={3} maxLength={500} value={f.description} onChange={e => up('description', e.target.value)} />)}
        {!editing && fld('status', 'Status', <select id="c-status" className="bb-input" value={f.status} onChange={e => up('status', e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>)}
        {msg && <p className="bb-field-err" role="alert">{msg}</p>}
      </form>
    </Modal>
  )
}
