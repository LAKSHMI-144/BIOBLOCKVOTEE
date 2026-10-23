import { useState, useRef, useEffect } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { useNavigate, Navigate } from 'react-router-dom'
import { useVoter } from '../voterContext'
import { useT } from '../i18n/i18nContext'
import { API, apiError, bearer } from '../api'

// mode 'auth': face verification only, then on to the voter dashboard.
// mode 'vote': candidate selection + confirmation (requires a verified voter).
export default function Vote({ mode = 'auth' }) {
  const { t } = useT()
  const nav = useNavigate()
  const webcamRef = useRef(null)
  const busy = useRef(false)
  const { voter, setVoter, token, setToken, pendingId, setReceipt: saveReceipt, logout } = useVoter()
  const [step, setStep] = useState(mode === 'vote' ? 'vote' : 'auth')
  const [candidates, setCandidates] = useState([])
  const [election, setElection] = useState(null)
  const [ballot, setBallot] = useState(null)         // { name, state } of the voter's constituency
  const [noBallot, setNoBallot] = useState(false)
  const [selected, setSelected] = useState('')
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    if (mode !== 'vote') return
    // The ballot is built by the server from this voter's own constituency; it needs the face-verification session token.
    axios.get(`${API}/votes/candidates`, bearer(token)).then(r => { setCandidates(r.data.candidates || []); setBallot(r.data.constituency || null) })
      .catch(e => {
        const er = apiError(e, t)
        if (er.code === 'VOTER_SESSION') { logout(); nav('/voter/login'); return }
        setNoBallot(er.code === 'NO_CONSTITUENCY'); setMsg({ type: 'error', text: er.message || t('vote.loadFailed') })
      })
    axios.get(`${API}/votes/election`).then(r => setElection(r.data)).catch(() => {})
  }, [mode])  // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (text) => setMsg({ type: 'error', text })

  const authenticate = async () => {
    if (busy.current) return
    const img = webcamRef.current?.getScreenshot()
    if (!img) return fail(t('auth.cameraError'))
    busy.current = true; setLoading(true); setMsg({ type: 'info', text: t('auth.verifying') })
    try {
      // The server checks that the face belongs to the Voter ID typed on the login page.
      const res = await axios.post(`${API}/voters/authenticate`, { face_image: img.split(',')[1], voter_id: pendingId })
      if (res.data.success) {
        setVoter({ id: res.data.voter_id, name: res.data.voter_name }); setToken(res.data.session_token)
        setMsg(null); nav('/voter/dashboard')
      } else {
        const k = `err.${res.data.code}`; const tr = res.data.code && t(k) !== k ? t(k) : null
        fail(tr || res.data.message || t('err.http.403'))
      }
    } catch (e) { fail(apiError(e, t).message) }
    busy.current = false; setLoading(false)
  }

  const castVote = async () => {
    if (busy.current) return
    if (!selected) return fail(t('vote.selectFirst'))
    const [cand_id, ...rest] = selected.split(':')
    if (!window.confirm(t('vote.confirm', { name: rest.join(':') }))) return
    busy.current = true; setLoading(true); setMsg(null)
    try {
      // No voter_id is sent: the server takes the voter from the session token.
      const res = await axios.post(`${API}/votes/cast`, { candidate_id: parseInt(cand_id) }, bearer(token))
      setReceipt(res.data); saveReceipt(res.data); setStep('done')
    } catch (e) {
      const er = apiError(e, t)
      if (er.code === 'VOTER_SESSION') { logout(); nav('/voter/login'); return }
      fail(er.message)
      if (er.code === 'VOTING_CLOSED') setElection(el => ({ ...(el || {}), open: false }))
    }
    busy.current = false; setLoading(false)
  }

  if ((mode === 'vote' && (!voter || !token)) || (mode === 'auth' && !pendingId)) return <Navigate to="/voter/login" replace />

  const closed = election && election.open === false
  return (
    <div className="page">
      <h2 className="title">{step === 'auth' ? `🔐 ${t('auth.title')}` : step === 'vote' ? `🗳️ ${t('vote.title')}` : `✅ ${t('vote.doneTitle')}`}</h2>
      {step === 'auth' && (
        <div className="card center">
          <p className="hint">{t('auth.hint')}</p>
          <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width={300} className="webcam" onUserMediaError={() => fail(t('face.permission'))} />
          <button className="btn primary" style={{ width: '100%', padding: 14, fontSize: 16 }} onClick={authenticate} disabled={loading}>{loading ? t('auth.verifying') : `🔐 ${t('auth.verify')}`}</button>
          <button className="btn secondary" onClick={() => nav('/voter/login')} disabled={loading}>{t('common.back')}</button>
        </div>
      )}
      {step === 'vote' && (
        <div className="card">
          <p className="hint" style={{ marginBottom: 12 }}>{t('vote.voter', { name: voter?.name, id: voter?.id })}</p>
          {closed && <p className="msg error" role="alert" style={{ textAlign: 'left' }}>{t('vote.closed')}</p>}
          {ballot && <p className="hint" style={{ marginBottom: 12 }}>{t('vote.ballotFor', { constituency: ballot.name, state: ballot.state })}</p>}
          <h3 style={{ marginBottom: 12 }}>{t('vote.select')}</h3>
          {candidates.length === 0 && !noBallot && <p className="hint">{t('vote.noCandidates')}</p>}
          {candidates.map(c => (
            <label key={c.candidate_id} className="cand-option">
              <input type="radio" name="cand" value={`${c.candidate_id}:${c.name}`} disabled={closed} onChange={e => setSelected(e.target.value)} style={{ width: 18, height: 18 }} />
              <div>
                <span className="cand-name">{c.symbol} {c.name}</span>
                <span className="cand-party">{c.party}{c.party_abbr && c.party_abbr !== c.party ? ` (${c.party_abbr})` : ''}</span>
              </div>
            </label>
          ))}
          <div className="btn-row">
            <button className="btn primary" onClick={castVote} disabled={loading || closed || candidates.length === 0}>{loading ? t('vote.submitting') : `✅ ${t('vote.submit')}`}</button>
            <button className="btn secondary" onClick={() => nav('/voter/dashboard')} disabled={loading}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="card center">
          <div className="big-icon">✅</div>
          <h3 style={{ color: '#00dd00' }}>{t('vote.doneTitle')}</h3>
          <div className="receipt">
            <p>🔗 {t('vote.blockHash')}: <code>{receipt?.block_hash?.substring(0, 35)}...</code></p>
            <p>🔒 {t('vote.voterHash')}: <code>{receipt?.voter_hash?.substring(0, 35)}...</code></p>
            <p>📦 {t('vote.blockIndex')}: <code>#{receipt?.block_index}</code></p>
            <p className="hint" style={{ marginTop: 8 }}>{t('vote.doneHint')}</p>
          </div>
          <button className="btn primary" onClick={() => nav('/voter/dashboard')}>{t('vote.toDashboard')}</button>
        </div>
      )}
      {msg && <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}
