import { useState, useRef, useCallback } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

import { API } from '../api'
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
  const [form, setForm] = useState({ voter_id: '', name: '', mobile: '', aadhaar: '', age: '', gender: '', address: '' })
  const [images, setImages] = useState([])        // base64 JPEG without prefix; held in memory only
  const [cameraReady, setCameraReady] = useState(false)
  const [msg, setMsg] = useState(null)            // { type: 'error' | 'success' | 'info', text }
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [otpSent, setOtpSent] = useState(false)
  const [demoOtp, setDemoOtp] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [faceStatus, setFaceStatus] = useState({ type: 'info', text: 'Capture 3–5 clear images in good lighting.' })

  const setStatus = (type, text) => setMsg({ type, text })
  const showFaceStatus = (type, text) => setFaceStatus({ type, text })

  const resetFaceCapture = () => {
    setImages([])
    setFaceStatus({ type: 'info', text: 'Capture 3–5 clear images in good lighting.' })
    setMsg(null)
  }

  const validateStepOne = () => {
    const nextErrors = {}
    const voterId = form.voter_id.trim().toUpperCase()
    const name = form.name.trim()
    const mobile = form.mobile.trim()
    const aadhaar = form.aadhaar.trim().replace(/\s+/g, '')
    const age = form.age
    const address = form.address.trim()

    if (!voterId) nextErrors.voter_id = 'Please enter your Voter ID.'
    else if (!/^[A-Z0-9-]{4,20}$/.test(voterId)) nextErrors.voter_id = 'Voter ID must be 4-20 letters, digits, or hyphens.'

    if (!name) nextErrors.name = 'Please enter your name.'
    else if (name.length < 2) nextErrors.name = 'Please enter your full name.'

    if (!mobile) nextErrors.mobile = 'Please enter your mobile number.'
    else if (!/^[+0-9\s-]{10,15}$/.test(mobile)) nextErrors.mobile = 'Please enter a valid mobile number.'

    if (!aadhaar) nextErrors.aadhaar = 'Please enter your Aadhaar number.'
    else if (!/^\d{12}$/.test(aadhaar)) nextErrors.aadhaar = 'Aadhaar number must be 12 digits.'

    if (!age) nextErrors.age = 'Please enter your age.'
    else if (!Number.isInteger(Number(age))) nextErrors.age = 'Please enter a valid age.'
    else if (Number(age) < 18) nextErrors.age = 'You must be 18 or older to register.'

    if (!address) nextErrors.address = 'Please enter your address.'

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const nextFromStepOne = () => {
    if (!validateStepOne()) {
      setStatus('error', 'Please complete all required fields before continuing.')
      return
    }

    setMsg(null)
    setStep(2)
  }

  const sendOtp = () => {
    const generated = String(Math.floor(100000 + Math.random() * 900000))
    setDemoOtp(generated)
    setOtpSent(true)
    setOtpVerified(false)
    setOtpInput('')
    setStatus('info', `Demo OTP sent. For this demo, use the code shown in the page.`)
  }

  const verifyOtp = () => {
    if (!otpSent) {
      setStatus('error', 'Please send the demo OTP first.')
      return
    }
    if (!otpInput.trim()) {
      setStatus('error', 'Please enter the OTP.')
      return
    }
    if (otpInput.trim() !== demoOtp) {
      setStatus('error', 'The OTP is incorrect. Please check and try again.')
      return
    }
    setOtpVerified(true)
    setStatus('success', 'Demo identity verification complete.')
  }

  const continueToFaceVerification = async () => {
    if (!otpVerified) {
      setStatus('error', 'Please verify the demo OTP before continuing.')
      return
    }

    const payload = {
      ...form,
      voter_id: form.voter_id.trim().toUpperCase(),
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      aadhaar: form.aadhaar.trim().replace(/\s+/g, ''),
      address: form.address.trim(),
      age: Number(form.age),
      gender: form.gender
    }

    setLoading(true)
    setStatus('info', 'Saving your registration details...')

    try {
      const res = await axios.post(`${API}/voters/register`, payload)
      if (res.data?.success) {
        setForm(payload)
        setStatus('success', res.data.message || 'Registration details saved. Continue with face verification.')
        setStep(3)
      } else {
        // Show the actual error message from backend
        const errorMsg = res.data?.message || 'Registration could not be completed.'
        setStatus('error', errorMsg)
        console.error('Registration error:', errorMsg)
      }
    } catch (e) {
      // Try to get detailed error from backend or network
      let message = ''
      if (e.response?.data?.message) {
        // Backend sent an error message
        message = e.response.data.message
      } else if (e.response?.status === 503) {
        // Service unavailable - likely database or backend issue
        message = 'Backend service is unavailable. Ensure the backend is running and database is initialized.'
      } else if (e.request && !e.response) {
        // Request was made but no response - network/connection issue
        message = 'Cannot reach the backend server. Make sure it\'s running on the correct port.'
      } else if (e.message?.includes('Network')) {
        message = 'Network error. Check your connection and that the backend is running.'
      } else {
        message = e.message || 'Unable to save registration details. Please check your connection and try again.'
      }
      setStatus('error', message)
      console.error('Registration step save error:', message)
    }

    setLoading(false)
  }

  const capture = useCallback(async () => {
    if (loading) return
    if (images.length >= MAX_IMAGES) return showFaceStatus('info', `${MAX_IMAGES} images already captured.`)
    const shot = webcamRef.current?.getScreenshot()
    if (!shot) return showFaceStatus('error', 'Camera is not ready yet. Allow camera permissions and try again.')
    const b64 = shot.split(',')[1]
    setLoading(true)
    showFaceStatus('info', 'Checking face quality and camera frame...')
    try {
      const response = await axios.post(`${API}/voters/check-face`, { image: b64 })
      if (response.data?.success) {
        const nextImages = [...images, b64]
        setImages(nextImages)
        const count = nextImages.length
        const nextPrompt = count >= MIN_IMAGES ? 'Good capture. Add more if needed or continue to register.' : `${count}/${MIN_IMAGES} required images accepted`
        showFaceStatus('success', `${nextPrompt} — Image accepted.`)
      } else {
        const reason = response.data?.message || 'Face not accepted.'
        showFaceStatus('error', reason)
      }
    } catch (e) {
      const message = errMsg(e, 'Image rejected')
      showFaceStatus('error', message)
    }
    setLoading(false)
  }, [images, loading])

  const submitFace = async () => {
    if (images.length < MIN_IMAGES) return showFaceStatus('error', `Capture at least ${MIN_IMAGES} clear, accepted images before continuing.`)
    setLoading(true)
    showFaceStatus('info', 'Processing your face template and completing registration...')
    try {
      const res = await axios.post(`${API}/voters/register-face`, { voter_id: form.voter_id, images })
      if (res.data?.success) {
        setStatus('success', 'Registration complete! Redirecting to login...')
        setImages([])
        setFaceStatus({ type: 'success', text: 'Registration complete. Redirecting to voter login...' })
        setStep(4)
        setTimeout(() => nav('/voter/login'), 1500)
        return
      }
      const message = res.data?.message || 'Unable to save face registration.'
      showFaceStatus('error', message)
      setStatus('error', message)
    } catch (e) {
      let message = ''
      if (e.response?.data?.message) {
        message = e.response.data.message
      } else if (e.response?.status === 503) {
        message = 'Face verification service is unavailable. Ensure the AI service is running.'
      } else if (e.response?.status === 404) {
        message = 'Voter not found. Please complete Step 1 registration first.'
      } else if (e.request && !e.response) {
        message = 'Cannot reach the backend. Check that the server is running.'
      } else {
        message = errMsg(e, 'Face registration failed.')
      }
      showFaceStatus('error', message)
      setStatus('error', message)
      console.error('Face registration error:', message)
    } finally {
      setLoading(false)
    }
  }

  const stepLabels = ['Step 1', 'Step 2', 'Face Registration', 'Complete']

  const renderSuccess = () => (
    <div className="registration-success">
      <div className="success-icon">✅</div>
      <h3>Registration Complete</h3>
      <p>Your voter registration has been completed successfully. Face verification is enabled and you can now continue to voter login.</p>
      <div className="success-grid">
        <div className="success-box"><strong>Voter ID</strong><span>{form.voter_id}</span></div>
        <div className="success-box"><strong>Face</strong><span>Registered ✓</span></div>
      </div>
      <button className="btn primary" onClick={() => nav('/voter/login')}>Go to Voter Login</button>
    </div>
  )

  const faceCaptureStatusClass = faceStatus.type === 'error' ? 'error' : faceStatus.type === 'success' ? 'success' : 'info'

  return (
    <div className="page">
      <div className="bb-register-shell">
        <div className="card register-card">
          <div className="register-header">
            <h2>Voter Registration</h2>
            <div className="progress-segments" aria-label="Registration progress">
              {stepLabels.map((label, index) => (
                <span key={label} className={`progress-segment ${step >= index + 1 ? 'active' : ''}`}>
                  {label}
                  {index < stepLabels.length - 1 && <span className="segment-line" />}
                </span>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div>
              <div className="step-intro">Step 1 · Personal / Identity Details</div>

              <div className="field-wrap">
                <label htmlFor="voter_id">Voter ID *</label>
                <input id="voter_id" className="input" value={form.voter_id} onChange={e => { setForm({ ...form, voter_id: e.target.value }); if (fieldErrors.voter_id) setFieldErrors({ ...fieldErrors, voter_id: '' }) }} />
                {fieldErrors.voter_id && <p className="field-error">{fieldErrors.voter_id}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="name">Full Name *</label>
                <input id="name" className="input" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: '' }) }} />
                {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="mobile">Mobile Number *</label>
                <input id="mobile" className="input" value={form.mobile} onChange={e => { setForm({ ...form, mobile: e.target.value }); if (fieldErrors.mobile) setFieldErrors({ ...fieldErrors, mobile: '' }) }} placeholder="+91 98765 43210" />
                {fieldErrors.mobile && <p className="field-error">{fieldErrors.mobile}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="aadhaar">Aadhaar Number *</label>
                <input id="aadhaar" className="input" value={form.aadhaar} onChange={e => { setForm({ ...form, aadhaar: e.target.value }); if (fieldErrors.aadhaar) setFieldErrors({ ...fieldErrors, aadhaar: '' }) }} placeholder="XXXX XXXX XXXX" />
                {fieldErrors.aadhaar && <p className="field-error">{fieldErrors.aadhaar}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="age">Age *</label>
                <input id="age" className="input" type="number" min="18" value={form.age} onChange={e => { setForm({ ...form, age: e.target.value }); if (fieldErrors.age) setFieldErrors({ ...fieldErrors, age: '' }) }} />
                {fieldErrors.age && <p className="field-error">{fieldErrors.age}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="address">Address *</label>
                <input id="address" className="input" value={form.address} onChange={e => { setForm({ ...form, address: e.target.value }); if (fieldErrors.address) setFieldErrors({ ...fieldErrors, address: '' }) }} />
                {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
              </div>

              <div className="field-wrap">
                <label htmlFor="gender">Gender</label>
                <select id="gender" className="input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option value="">Prefer not to say</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>

              <p className="hint" style={{ textAlign: 'left' }}>Voters aged 18 or above are eligible to vote.</p>

              <div className="btn-row">
                <button className="btn primary" onClick={nextFromStepOne} disabled={loading}>{loading ? 'Saving...' : 'Next →'}</button>
                <button className="btn secondary" onClick={() => nav('/voter/login')}>← Back</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="step-intro">Step 2 · Demo OTP Verification</div>

              <div className="field-wrap">
                <label htmlFor="aadhaar-mask">Aadhaar Number</label>
                <input id="aadhaar-mask" className="input" value={form.aadhaar ? 'XXXX XXXX ' + form.aadhaar.slice(-4) : ''} readOnly />
              </div>

              <div className="field-wrap">
                <label htmlFor="mobile-display">Mobile Number</label>
                <input id="mobile-display" className="input" value={form.mobile || ''} readOnly />
              </div>

              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn secondary" type="button" onClick={() => setStep(1)} disabled={loading}>← Back</button>
                <button className="btn primary" type="button" onClick={sendOtp} disabled={loading}>Send OTP</button>
              </div>

              {otpSent && (
                <>
                  <div className="field-wrap" style={{ marginTop: 18 }}>
                    <label htmlFor="otp">Enter OTP</label>
                    <input id="otp" className="input" value={otpInput} onChange={e => setOtpInput(e.target.value)} placeholder="Enter 6-digit demo OTP" />
                    <p className="hint" style={{ marginTop: 8, fontSize: 12 }}>Demo OTP: <strong>{demoOtp}</strong> (visible only for local demo usage)</p>
                  </div>

                  <div className="btn-row">
                    <button className="btn primary" onClick={verifyOtp} disabled={loading}>Verify OTP</button>
                    <button className="btn secondary" onClick={sendOtp} disabled={loading}>Resend OTP</button>
                  </div>
                </>
              )}

              {otpVerified && (
                <div className="btn-row" style={{ marginTop: 18 }}>
                  <button className="btn primary" onClick={continueToFaceVerification} disabled={loading}>{loading ? 'Please wait...' : 'Continue to Face Registration →'}</button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="card inner-card center">
              <p className="hint">Voter <b>{form.voter_id}</b> — only you should be in the frame, with good lighting.</p>
              <p className="prompt">{images.length < MAX_IMAGES ? PROMPTS[images.length] : 'All images captured'}</p>
              <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.92}
                videoConstraints={VIDEO} className="webcam" style={{ width: 320, maxWidth: '100%' }}
                onUserMedia={() => setCameraReady(true)}
                onUserMediaError={() => { setCameraReady(false); setStatus('error', 'Camera unavailable. Allow camera access in your browser and reload.') }} />
              <div className="face-capture-status">
                <div className={`status-panel ${faceCaptureStatusClass}`}>
                  <p className="status-text">{faceStatus.text}</p>
                </div>
                <div className="capture-counters">
                  <div className="counter-item">
                    <span className="counter-value">{images.length}</span>
                    <span className="counter-label">Captured</span>
                  </div>
                  <div className="counter-item">
                    <span className="counter-value">{MIN_IMAGES}</span>
                    <span className="counter-label">Required</span>
                  </div>
                </div>
              </div>
              <div className="btn-row">
                <button className="btn secondary" onClick={() => setStep(2)} disabled={loading}>← Back</button>
                <button className="btn danger" onClick={capture} disabled={loading || !cameraReady || images.length >= MAX_IMAGES}>📸 Capture</button>
                <button className="btn secondary" onClick={() => { setImages([]); setMsg(null) }} disabled={loading || images.length === 0}>↺ Retake all</button>
                <button className="btn primary" onClick={submitFace} disabled={loading || images.length < MIN_IMAGES}>{loading ? 'Please wait...' : '✅ Register Face'}</button>
              </div>

              {msg && <p className={`msg ${msg.type}`} role="status">{msg.text}</p>}
            </div>
          )}

          {step === 4 && renderSuccess()}

          {msg && <p className={`msg ${msg.type}`} role="status">{msg.text}</p>}
        </div>
      </div>
    </div>
  )
}
