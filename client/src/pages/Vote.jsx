import { useState, useRef, useEffect } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { useNavigate, Navigate } from 'react-router-dom'
import { useVoter } from '../voterContext'
import { useT } from '../i18n/i18nContext'
import { API, apiError, bearer } from '../api'
import { displayCandidateName, displayConstituencyName } from '../lib/adminFormat'

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

// mode 'auth': face verification only, then on to the voter dashboard.
// mode 'vote': candidate selection + confirmation (requires a verified voter).
export default function Vote({ mode = 'auth' }) {
  const { t } = useT()
  const nav = useNavigate()
  const webcamRef = useRef(null)
  const streamRef = useRef(null)
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
  const [cameraReady, setCameraReady] = useState(false)
  const [livenessState, setLivenessState] = useState('camera_waiting')
  const [cameraKey, setCameraKey] = useState(0)
  const [activeChallenge, setActiveChallenge] = useState('')

  useEffect(() => () => {
    const stream = streamRef.current
    stream?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

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

  const stopCamera = () => {
    const stream = streamRef.current || webcamRef.current?.video?.srcObject
    stream?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  const resetVerification = () => {
    busy.current = false
    setLoading(false)
    setMsg(null)
    setActiveChallenge('')
    if (!cameraReady) {
      stopCamera()
      streamRef.current = null
      setLivenessState('camera_waiting')
      setCameraKey(key => key + 1)
      return
    }
    setLivenessState('camera_ready')
  }

  const authenticate = async () => {
    if (busy.current) return
    if (!cameraReady) {
      setLivenessState('service_error')
      return fail(t('auth.cameraError'))
    }
    busy.current = true
    setLoading(true)
    setMsg(null)
    setActiveChallenge('')
    setLivenessState('checking_liveness')
    let verificationStage = 'liveness'
    try {
      const challengeRes = await axios.post(`${API}/voters/liveness-challenge`, { voter_id: pendingId })
      const { challenge_token: challengeToken, actions, frame_count: frameCount } = challengeRes.data
      const challengeAction = actions?.[0]
      if (!challengeToken || !Array.isArray(actions) || actions.length !== 1 || !['blink', 'turn_left', 'turn_right'].includes(challengeAction) || ![16, 24].includes(frameCount)) {
        const error = new Error(t('auth.challengeInvalid'))
        error.code = 'CHALLENGE_INVALID'
        throw error
      }

      const frames = []
      const capture = () => {
        const screenshot = webcamRef.current?.getScreenshot()
        if (!screenshot) {
          const error = new Error(t('auth.cameraError'))
          error.code = 'CAMERA_CAPTURE_ERROR'
          throw error
        }
        frames.push(screenshot.split(',')[1])
      }
      capture()
      await delay(100)
      capture()
      setActiveChallenge(challengeAction)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (let frame = 0; frame < frameCount - 4; frame += 1) {
        await delay(240)
        capture()
      }
      await delay(200)
      capture()
      await delay(100)
      capture()

      if (frames.length !== frameCount) {
        const error = new Error(t('auth.challengeInvalid'))
        error.code = 'CHALLENGE_INVALID'
        throw error
      }
      const liveRes = await axios.post(`${API}/voters/check-liveness`, {
        challenge_token: challengeToken,
        frames,
        voter_id: pendingId
      })
      const identityFrameIndex = liveRes.data?.identity_frame_index
      if (
        !liveRes.data?.success
        || liveRes.data.liveness_passed !== true
        || !liveRes.data.liveness_token
        || !Number.isInteger(identityFrameIndex)
        || identityFrameIndex < 0
        || identityFrameIndex >= frames.length
      ) {
        const error = new Error(liveRes.data?.message || t('auth.blinkNotDetected'))
        error.response = { status: 403, data: liveRes.data }
        throw error
      }
      setActiveChallenge('')
      setLivenessState('liveness_passed')
      await delay(120)
      verificationStage = 'identity'
      setLivenessState('recognizing_face')
      const res = await axios.post(`${API}/voters/authenticate`, {
        liveness_token: liveRes.data.liveness_token,
        image: frames[identityFrameIndex],
        voter_id: pendingId
      })
      if (!res.data?.success || res.data.liveness_passed !== true || !res.data.session_token || !res.data.voter_id) {
        const error = new Error(res.data?.message || t('auth.faceNotRecognized'))
        error.response = { status: 403, data: { ...res.data, code: res.data?.code || 'IDENTITY_FAILED' } }
        throw error
      }
      setLivenessState('face_recognized')
      setMsg({ type: 'success', text: t('auth.success') })
      setVoter({ id: res.data.voter_id, name: res.data.voter_name })
      setToken(res.data.session_token)
      stopCamera()
      await delay(250)
      nav('/voter/dashboard')
    } catch (e) {
      setActiveChallenge('')
      const data = e.response?.data
      const code = data?.code
      if (e.code === 'CAMERA_CAPTURE_ERROR' || !e.response || e.response.status >= 500 || code?.includes('SERVICE') || code === 'AI_ERROR') {
        setLivenessState('service_error')
      } else if (code === 'ALREADY_VOTED') {
        setLivenessState('already_voted')
      } else if (code === 'NOT_ELIGIBLE') {
        setLivenessState('not_eligible')
      } else if (code === 'VOTER_NOT_FOUND') {
        setLivenessState('voter_not_found')
      } else if (verificationStage === 'identity' || data?.liveness_passed === true) {
        setLivenessState('identity_verification_failed')
      } else if (e.code === 'CHALLENGE_INVALID') {
        setLivenessState('liveness_failed')
      } else {
        setLivenessState('liveness_failed')
      }
      const knownError = code && t(`err.${code}`) !== `err.${code}` ? t(`err.${code}`) : null
      const errorMessage = e.code === 'CHALLENGE_INVALID' || e.code === 'CAMERA_CAPTURE_ERROR'
        ? e.message
        : apiError(e, t).message
      fail(knownError || data?.message || errorMessage)
    }
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
  const authStatusText = msg?.text || [
    t(`auth.status.${livenessState}`),
    activeChallenge && t(`auth.challenge.${activeChallenge}`)
  ].filter(Boolean).join(' · ')
  return (
    <div className="page">
      <h2 className="title">{step === 'auth' ? `🔐 ${t('auth.title')}` : step === 'vote' ? `🗳️ ${t('vote.title')}` : `✅ ${t('vote.doneTitle')}`}</h2>
      {step === 'auth' && (
        <div className="card center">
          <p className="hint">{t('auth.hint')}</p>
          <Webcam
            key={cameraKey}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.65}
            width={300}
            videoConstraints={{ facingMode: 'user' }}
            className="webcam"
            onUserMedia={stream => {
              streamRef.current = stream
              setCameraReady(true)
              setLivenessState('camera_ready')
            }}
            onUserMediaError={error => {
              const errorName = error?.name
              setCameraReady(false)
              setLivenessState('service_error')
              fail(errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError'
                ? t('auth.cameraDenied')
                : errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError'
                  ? t('auth.cameraUnavailable')
                  : t('auth.cameraError'))
            }}
          />
          <p className={`msg auth-status ${msg?.type || (['liveness_failed', 'identity_verification_failed', 'service_error', 'already_voted', 'not_eligible', 'voter_not_found'].includes(livenessState) ? 'error' : livenessState === 'liveness_passed' || livenessState === 'face_recognized' ? 'success' : 'info')}`} role={msg?.type === 'error' ? 'alert' : 'status'}>
            {authStatusText}
          </p>
          <button className="btn primary" style={{ width: '100%', padding: 14, fontSize: 16 }} onClick={msg ? (cameraReady ? authenticate : resetVerification) : authenticate} disabled={loading || (!cameraReady && !msg)}>{loading ? t('auth.verifying') : msg ? t('auth.retry') : `🔐 ${t('auth.verify')}`}</button>
          <button className="btn secondary" onClick={() => nav('/voter/login')} disabled={loading}>{t('common.back')}</button>
        </div>
      )}
      {step === 'vote' && (
        <div className="card">
          <p className="hint" style={{ marginBottom: 12 }}>{t('vote.voter', { name: voter?.name, id: voter?.id })}</p>
          {closed && <p className="msg error" role="alert" style={{ textAlign: 'left' }}>{t('vote.closed')}</p>}
          {ballot && <p className="hint" style={{ marginBottom: 12 }}>{t('vote.ballotFor', { constituency: displayConstituencyName(ballot.name), state: ballot.state })}</p>}
          <h3 style={{ marginBottom: 12 }}>{t('vote.select')}</h3>
          {candidates.length === 0 && !noBallot && <p className="hint">{t('vote.noCandidates')}</p>}
          {candidates.map(c => (
            <label key={c.candidate_id} className="cand-option">
              <input type="radio" name="cand" value={`${c.candidate_id}:${displayCandidateName(c.name)}`} disabled={closed} onChange={e => setSelected(e.target.value)} style={{ width: 18, height: 18 }} />
              <div>
                <span className="cand-name">{c.symbol} {displayCandidateName(c.name)}</span>
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
      {msg && mode !== 'auth' && <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
    </div>
  )
}
