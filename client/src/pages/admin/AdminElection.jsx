import { useEffect, useState } from 'react'
import { adminApi } from '../../api'
import useLoad from '../../hooks/useLoad'
import State from '../../components/State'

// <input type="datetime-local"> works in local time; the API stores/returns ISO instants.
const toLocal = iso => { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
const pill = s => ({ ACTIVE: 'ok', SCHEDULED: 'warn', ENDED: 'bad', DRAFT: 'muted' }[s] || 'muted')
const apiMsg = e => e?.response?.data?.message || (e?.request ? 'Cannot reach the server.' : 'Request failed')

export default function AdminElection() {
  const { data, error, loading, reload } = useLoad(() => adminApi.get('/admin/election'))
  const [f, setF] = useState({ name: '', start: '', end: '' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setF({ name: data.name, start: toLocal(data.start_time), end: toLocal(data.end_time) }) }, [data])

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ type: 'success', text: ok }); reload() } catch (e) { setMsg({ type: 'error', text: apiMsg(e) }) }
    setBusy(false)
  }
  const iso = v => (v ? new Date(v).toISOString() : null)
  const schedule = e => { e.preventDefault(); act(() => adminApi.put('/admin/election', { name: f.name, status: 'SCHEDULED', start_time: iso(f.start), end_time: iso(f.end) }), 'Election scheduled.') }
  const saveDraft = () => act(() => adminApi.put('/admin/election', { name: f.name, status: 'DRAFT', start_time: iso(f.start), end_time: iso(f.end) }), 'Saved as draft (voting closed).')

  return (
    <>
      <h1>Election</h1><p className="sub">Name, voting window and status. The server only accepts votes while start ≤ now ≤ end.</p>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="bb-grid" style={{ marginBottom: 20 }}>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Status</div><div className="v"><span className={`pill ${pill(data.status)}`} style={{ fontSize: 14 }}>{data.status}</span></div>
              <div className="s">{data.status === 'ACTIVE' ? 'Voting is open.' : 'Voters see: "Voting is currently closed."'}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Starts</div><div className="v" style={{ fontSize: 16 }}>{data.start_time ? new Date(data.start_time).toLocaleString() : '—'}</div></div>
            <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}><div className="l">Ends</div><div className="v" style={{ fontSize: 16 }}>{data.end_time ? new Date(data.end_time).toLocaleString() : '—'}</div></div>
          </div>
          <form className="card" style={{ maxWidth: 560, padding: 22 }} onSubmit={schedule} noValidate>
            <label htmlFor="en" className="lbl">Election name</label>
            <input id="en" className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
            <label htmlFor="es" className="lbl">Start (your local time)</label>
            <input id="es" className="input" type="datetime-local" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} />
            <label htmlFor="ee" className="lbl">End (your local time)</label>
            <input id="ee" className="input" type="datetime-local" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} />
            <div className="btn-row">
              <button className="btn primary" type="submit" disabled={busy}>Schedule election</button>
              <button className="btn secondary" type="button" disabled={busy} onClick={saveDraft}>Save as draft</button>
            </div>
          </form>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={() => act(() => adminApi.post('/admin/election/open-now', { hours: 2 }), 'Voting opened for 2 hours.')}>Open voting now (2 h)</button>
            <button className="btn danger" disabled={busy || data.status === 'ENDED'} onClick={() => window.confirm('End the election now? Voting will close immediately.') && act(() => adminApi.post('/admin/election/close'), 'Election ended.')}>End election now</button>
          </div>
          {msg && <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'} style={{ textAlign: 'left' }}>{msg.text}</p>}
        </>
      )}
    </>
  )
}
