import { useState, useRef, useCallback } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
const MIN_IMAGES = 3
const MAX_IMAGES = 5
const PROMPTS = ['Look straight at the camera', 'Turn your head very slightly left', 'Turn your head very slightly right', 'Look straight again (optional)', 'Look straight again (optional)']
const VIDEO = { width: 640, height: 480, facingMode: 'user' }

// Pull the server's message out of an axios error (4xx/5xx JSON body) or explain a network failure.
const errMsg = (e, fallback = 'Something went wrong') =>
  e?.response?.data?.message || (e?.request ? 'Cannot reach the server. Is the backend running?' : fallback)

export default function Register() {
  const nav = useNavigate()
  const webcamRef = useRef(null)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ voter_id: '', name: '', age: '', gender: '', address: '' })
  const [images, setImages] = useState([])        // base64 JPEG without prefix; held in memory only
  const [cameraReady, setCameraReady] = useState(false)
  const [msg, setMsg] = useState(null)            // { type: 'error' | 'success' | 'info', text }
  const [loading, setLoading] = useState(false)
  const set = (type, text) => setMsg({ type, text })

  const submitDetails = async () => {
    const v = { ...form, voter_id: form.voter_id.trim().toUpperCase(), name: form.name.trim() }
    if (!v.voter_id || !v.name || !v.age) return set('error', 'Voter ID, name and age are required')
    if (!/^[A-Z0-9-]{4,20}$/.test(v.voter_id)) return set('error', 'Voter ID must be 4-20 letters, digits or hyphens')
    if (Number(v.age) < 18) return set('error', 'You must be 18 or older to register')
    setLoading(true); setMsg(null)
    try {
      const res = await axios.post(`${API}/voters/register`, v)
      setForm(v)
      set('success', res.data.message)
      setStep(2)
    } catch (e) {
      set('error', errMsg(e))
    }
    setLoading(false)
  }

  const capture = useCallback(async () => {
    if (loading) return
    if (images.length >= MAX_IMAGES) return set('info', `${MAX_IMAGES} images already captured`)
    const shot = webcamRef.current?.getScreenshot()
    if (!shot) return set('error', 'Camera is not ready yet')
    const b64 = shot.split(',')[1]
    setLoading(true); set('info', 'Checking image...')
    try {
      await axios.post(`${API}/voters/check-face`, { image: b64 })   // server rejects no/multiple/poor faces
      setImages(p => [...p, b64])
      set('success', `Image ${images.length + 1} accepted ✅`)
    } catch (e) {
      set('error', errMsg(e, 'Image rejected') + ' — please retake.')
    }
    setLoading(false)
  }, [images, loading])

  const submitFace = async () => {
    if (images.length < MIN_IMAGES) return set('error', `Capture at least ${MIN_IMAGES} accepted images`)
    setLoading(true); set('info', 'Processing face... this can take a few seconds')
    try {
      await axios.post(`${API}/voters/register-face`, { voter_id: form.voter_id, images })
      set('success', 'Registration complete! Redirecting...')
      setImages([])
      setTimeout(() => nav('/'), 1500)
    } catch (e) {
      set('error', errMsg(e))
      setImages([])   // captures are discarded on failure; the voter retakes them
    }
    setLoading(false)
  }

  return (
    <div className="page">
      <h2 className="title">👤 Voter Registration — Step {step}/2</h2>
      {step === 1 && (
        <div className="card">
          {[['voter_id', 'Voter ID *', 'text'], ['name', 'Full Name *', 'text'], ['age', 'Age *', 'number'], ['address', 'Address', 'text']].map(([f, l, t]) => (
            <div key={f}>
              <label htmlFor={f}>{l}</label>
              <input id={f} className="input" type={t} placeholder={l} value={form[f]} disabled={loading}
                onChange={e => setForm({ ...form, [f]: e.target.value })} />
            </div>
          ))}
          <label htmlFor="gender">Gender</label>
          <select id="gender" className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option value="">Prefer not to say</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
          <p className="hint" style={{ textAlign: 'left' }}>Voters aged 18 or above are eligible to vote.</p>
          <div className="btn-row">
            <button className="btn primary" onClick={submitDetails} disabled={loading}>{loading ? 'Saving...' : 'Next →'}</button>
            <button className="btn secondary" onClick={() => nav('/')}>← Back</button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="card center">
          <p className="hint">Voter <b>{form.voter_id}</b> — only you should be in the frame, with good lighting.</p>
          <p className="prompt">{images.length < MAX_IMAGES ? PROMPTS[images.length] : 'All images captured'}</p>
          <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.92}
            videoConstraints={VIDEO} className="webcam" style={{ width: 320, maxWidth: '100%' }}
            onUserMedia={() => setCameraReady(true)}
            onUserMediaError={() => { setCameraReady(false); set('error', 'Camera unavailable. Allow camera access in your browser and reload.') }} />
          <div className="dots">
            {Array.from({ length: MAX_IMAGES }).map((_, i) => <div key={i} className={`dot ${i < images.length ? 'filled' : ''}`} />)}
          </div>
          <p className="hint">{images.length}/{MIN_IMAGES} required images accepted (up to {MAX_IMAGES})</p>
          <div className="btn-row">
            <button className="btn danger" onClick={capture} disabled={loading || !cameraReady || images.length >= MAX_IMAGES}>📸 Capture</button>
            <button className="btn secondary" onClick={() => { setImages([]); setMsg(null) }} disabled={loading || images.length === 0}>↺ Retake all</button>
            <button className="btn primary" onClick={submitFace} disabled={loading || images.length < MIN_IMAGES}>{loading ? 'Please wait...' : '✅ Register Face'}</button>
          </div>
        </div>
      )}
      {msg && <p className={`msg ${msg.type}`} role="status">{msg.text}</p>}
    </div>
  )
}
