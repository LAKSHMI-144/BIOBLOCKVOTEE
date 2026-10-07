import { useState, useRef, useEffect } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { useNavigate, Navigate } from 'react-router-dom'
import { useVoter } from '../voterContext'
import { API, errText } from '../api'

// mode 'auth': face verification only, then on to the voter dashboard.
// mode 'vote': candidate selection + confirmation (requires a verified voter).
export default function Vote({ mode = 'auth' }) {
  const nav = useNavigate()
  const webcamRef = useRef(null)
  const { voter, setVoter, pendingId, setReceipt: saveReceipt } = useVoter()
  const [step, setStep] = useState(mode === 'vote' ? 'vote' : 'auth')
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    axios.get(`${API}/votes/candidates`).then(r => setCandidates(r.data)).catch(()=>{})
  }, [])

  const authenticate = async () => {
    const img = webcamRef.current?.getScreenshot()
    if (!img) { setMsg('❌ Camera error'); return }
    setLoading(true); setMsg('🔍 Authenticating...')
    const res = await axios.post(`${API}/voters/authenticate`, { face_image: img.split(',')[1] }).catch(e=>({data:{success:false,message:errText(e,'Server error')}}))
    if (res.data.success && pendingId && String(res.data.voter_id).toUpperCase() !== pendingId) {
      // Browser-side consistency check only; the server does not yet bind the entered ID to the face.
      setMsg('❌ The verified face does not match the Voter ID you entered.')
    } else if (res.data.success) {
      setVoter({ id: res.data.voter_id, name: res.data.voter_name })
      setMsg(''); nav('/voter/dashboard')
    } else {
      setMsg('❌ ' + res.data.message)
    }
    setLoading(false)
  }

  const castVote = async () => {
    if (!selected) { setMsg('❌ Select a candidate'); return }
    if (!window.confirm(`Confirm vote for ${selected.split(':')[1]}?`)) return
    const [cand_id] = selected.split(':')
    setLoading(true)
    const res = await axios.post(`${API}/votes/cast`, { voter_id: voter.id, candidate_id: parseInt(cand_id) }).catch(e=>({data:{success:false,message:errText(e,'Server error')}}))
    if (res.data.success) { setReceipt(res.data); saveReceipt(res.data); setStep('done') }
    else setMsg('❌ ' + res.data.message)
    setLoading(false)
  }

  if ((mode === 'vote' && !voter) || (mode === 'auth' && !pendingId)) return <Navigate to="/voter/login" replace />

  return (
    <div className="page">
      <h2 className="title">{step==='auth'?'🔐 Face Authentication':step==='vote'?'🗳️ Cast Your Vote':'✅ Vote Confirmed'}</h2>
      {step === 'auth' && (
        <div className="card center">
          <p className="hint">Look at camera then click Authenticate</p>
          <Webcam ref={webcamRef} screenshotFormat="image/jpeg" width={300} className="webcam" />
          <button className="btn primary" style={{width:'100%',padding:14,fontSize:16}} onClick={authenticate} disabled={loading}>{loading?'Authenticating...':'🔐 Authenticate'}</button>
          <button className="btn secondary" onClick={()=>nav('/voter/login')}>← Back</button>
        </div>
      )}
      {step === 'vote' && (
        <div className="card">
          <p className="hint" style={{marginBottom:12}}>Voter: {voter?.name} | ID: {voter?.id}</p>
          <h3 style={{marginBottom:12}}>Select Candidate:</h3>
          {candidates.map(c => (
            <label key={c.candidate_id} className="cand-option">
              <input type="radio" name="cand" value={`${c.candidate_id}:${c.name}`} onChange={e=>setSelected(e.target.value)} style={{width:18,height:18}} />
              <div>
                <span className="cand-name">{c.symbol} {c.name}</span>
                <span className="cand-party">{c.party}</span>
              </div>
            </label>
          ))}
          <div className="btn-row">
            <button className="btn primary" onClick={castVote} disabled={loading}>{loading?'Submitting...':'✅ Submit Vote'}</button>
            <button className="btn secondary" onClick={()=>nav('/voter/dashboard')}>Cancel</button>
          </div>
        </div>
      )}
      {step === 'done' && (
        <div className="card center">
          <div className="big-icon">✅</div>
          <h3 style={{color:'#00dd00'}}>Vote Successfully Cast!</h3>
          <div className="receipt">
            <p>🔗 Block Hash: <code>{receipt?.block_hash?.substring(0,35)}...</code></p>
            <p>🔒 Voter Hash: <code>{receipt?.voter_hash?.substring(0,35)}...</code></p>
            <p>📦 Block Index: <code>#{receipt?.block_index}</code></p>
            <p className="hint" style={{marginTop:8}}>Your voter ID is recorded on the chain only as a hash. Keep these values as your receipt.</p>
          </div>
          <button className="btn primary" onClick={()=>nav('/voter/dashboard')}>Back to dashboard</button>
        </div>
      )}
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}
