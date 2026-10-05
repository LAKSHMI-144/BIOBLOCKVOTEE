import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useVoter } from '../voterContext'

export default function VoterLogin() {
  const nav = useNavigate()
  const { setPendingId, logout } = useVoter()
  const [id, setId] = useState('')
  const [err, setErr] = useState('')

  const submit = e => {
    e.preventDefault()
    const v = id.trim().toUpperCase()
    if (!/^[A-Z0-9-]{4,20}$/.test(v)) return setErr('Enter your Voter ID (4-20 letters, digits or hyphens).')
    logout(); setPendingId(v)
    nav('/voter/authenticate')
  }

  return (
    <>
      <PublicHeader />
      <div className="bb-center">
        <form className="card bb-form" onSubmit={submit} noValidate>
          <h2>Voter Login</h2>
          <p className="hint" style={{ fontSize: 14 }}>Enter your Voter ID, then verify with your face.</p>
          <label htmlFor="vid">Voter ID</label>
          <input id="vid" className="input" value={id} autoFocus autoComplete="off" placeholder="e.g. V001" onChange={e => { setId(e.target.value); setErr('') }} />
          {err && <p className="msg error" role="alert" style={{ marginTop: 10, textAlign: 'left' }}>{err}</p>}
          <button className="btn primary" type="submit">Continue to face verification</button>
          <p className="hint" style={{ fontSize: 13, marginTop: 18, textAlign: 'center' }}>
            Not registered? <Link to="/voter/register" style={{ color: 'var(--accent)' }}>Register as a voter</Link>
          </p>
        </form>
      </div>
    </>
  )
}
