import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useT } from '../i18n/i18nContext'
import { displayConstituencyName } from '../lib/adminFormat'
import { API, apiError, regToken, bearer } from '../api'

const MIN_IMAGES = 3, MAX_IMAGES = 3
const VIDEO = { width: 640, height: 480, facingMode: 'user' }
const NAME_RE = /^\p{L}[\p{L}\p{M}\s.'-]{1,98}$/u
const EMPTY = { voter_id: '', demo_identity_number: '', name: '', age: '', gender: '', address: '', district: '', state_id: '', constituency_id: '' }

// Same rules as the server (which re-validates everything). Returns { field: errorCode }.
function validate(f) {
  const e = {}, demoId = f.demo_identity_number.trim(), name = f.name.trim().replace(/\s+/g, ' '), addr = f.address.trim(), age = Number(f.age)
  if (!/^\d{12}$/.test(demoId)) e.demo_identity_number = 'DEMO_ID_INVALID'
  if (!f.district.trim()) e.district = 'DISTRICT_REQUIRED'
  if (!name) e.name = 'NAME_REQUIRED'; else if (!NAME_RE.test(name) || (name.match(/\p{L}/gu) || []).length < 2) e.name = 'NAME_INVALID'
  if (String(f.age).trim() === '') e.age = 'AGE_REQUIRED'; else if (!Number.isInteger(age) || age < 1 || age > 120) e.age = 'AGE_INVALID'; else if (age < 18) e.age = 'AGE_MIN'
  if (!addr) e.address = 'ADDRESS_REQUIRED'; else if (addr.length < 5) e.address = 'ADDRESS_SHORT'
  if (!['Male', 'Female', 'Other'].includes(f.gender)) e.gender = 'GENDER_INVALID'
  if (!f.state_id) e.state_id = 'STATE_REQUIRED'
  if (f.state_id && !f.constituency_id) e.constituency_id = 'CONSTITUENCY_REQUIRED'
  return e
}

export default function Register() {
  const { t } = useT()
  const nav = useNavigate()
  const webcamRef = useRef(null)
  const busy = useRef(false)                       // blocks double submissions even before React re-renders
  const [step, setStep] = useState(1)              // 1 details · 2 identity · 3 face · 4 done
  const [identityOn, setIdentityOn] = useState(true)
  const [idvInfo, setIdvInfo] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})         // { field: translated message }
  const [loading, setLoading] = useState('')       // label of the request in flight ('' = idle)
  const [msg, setMsg] = useState(null)             // { type, text }
  // identity
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(null)     // { masked, hint }
  const [cooldown, setCooldown] = useState(0)
  // face
  const [images, setImages] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [camError, setCamError] = useState(false)
  const [faceStatus, setFaceStatus] = useState('')
  // India master data for the ballot: state/UT, then that state's constituencies (public, read-only endpoints)
  const [states, setStates] = useState([])
  const [consts, setConsts] = useState([])
  const [geoErr, setGeoErr] = useState(false)

  const total = identityOn ? 3 : 2
  const shown = step === 1 ? 1 : step === 2 ? 2 : identityOn ? 3 : 2
  const say = (type, text) => setMsg(text ? { type, text } : null)
  const clearErr = f => setErrors(p => (p[f] ? { ...p, [f]: undefined } : p))

  useEffect(() => { axios.get(`${API}/config`).then(r => { setIdentityOn(r.data.identity.mode === 'required'); setIdvInfo(r.data.identity) }).catch(() => {}) }, [])
  useEffect(() => { axios.get(`${API}/geo/states`).then(r => setStates(r.data)).catch(() => setGeoErr(true)) }, [])
  useEffect(() => {
    if (!form.state_id) return
    let live = true
    axios.get(`${API}/geo/constituencies`, { params: { state_id: form.state_id } }).then(r => live && (setConsts(r.data), setGeoErr(false))).catch(() => live && setGeoErr(true))
    return () => { live = false }
  }, [form.state_id])
  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(id) }, [cooldown])

  // One place for every API call: blocks re-entry, shows a label, maps errors.
  const run = async (label, fn) => {
    if (busy.current) return null
    busy.current = true; setLoading(label); say('info', label)
    try { const r = await fn(); say(null); return r }
    catch (e) { const er = apiError(e, t); say('error', er.message); return { error: er } }
    finally { busy.current = false; setLoading('') }
  }

  const submitDetails = async e => {
    e?.preventDefault()
    const local = validate(form)
    if (Object.keys(local).length) {
      setErrors(Object.fromEntries(Object.entries(local).map(([f, c]) => [f, c === 'DEMO_ID_INVALID' ? 'Enter exactly 12 digits for the synthetic demo identity number.' : c === 'DISTRICT_REQUIRED' ? 'Enter your district.' : t(`err.${c}`)])))
      return say('error', t('reg.fixErrors'))
    }
    setErrors({})
    const body = { ...form, demo_identity_number: form.demo_identity_number.trim(), name: form.name.trim().replace(/\s+/g, ' '), age: Number(form.age), address: form.address.trim(), district: form.district.trim(), state_id: Number(form.state_id), constituency_id: Number(form.constituency_id) }
    const r = await run(t('reg.checking'), () => axios.post(`${API}/voters/register`, body, bearer(regToken.get())))
    if (!r) return
    if (r.error) return setErrors(r.error.fields)
    regToken.set(r.data.registration_token)
    setForm(f => ({ ...f, ...body, voter_id: r.data.voter_id, age: String(body.age), state_id: String(body.state_id), constituency_id: String(body.constituency_id) }))
    if (identityOn) {
      const s = await axios.get(`${API}/identity/status`, bearer(r.data.registration_token)).catch(() => null)   // resumed registration may already be verified
      setStep(s?.data?.verified ? 3 : 2)
    } else setStep(3)
  }

  // ---- identity step
  const sendOtp = async () => {
    const contact = `DEMO-${form.voter_id}`
    const r = await run(t('idv.sending'), async () => {
      const tok = regToken.get()
      await axios.post(`${API}/identity/start`, { contact }, bearer(tok))
      return axios.post(`${API}/identity/send-otp`, { contact }, bearer(tok))
    })
    if (!r) return
    if (r.error) { if (r.error.retryAfter) setCooldown(r.error.retryAfter); return }
    if (r.data.already_verified) return setStep(3)
    setOtpSent({ hint: r.data.dev_hint }); setOtp(''); setCooldown(r.data.resend_in || 30)
    say('success', 'Demo OTP generated. Enter the displayed test code.')
  }
  const verifyOtp = async e => {
    e?.preventDefault()
    if (!/^\d{6}$/.test(otp)) return say('error', t('idv.otp'))
    const contact = `DEMO-${form.voter_id}`
    const r = await run(t('idv.verifying'), () => axios.post(`${API}/identity/verify-otp`, { contact, otp }, bearer(regToken.get())))
    if (!r || r.error) return
    say('success', t('idv.verified')); setStep(3)
  }

  // ---- face step: three quick guided captures (front, left, right).
  // Quality and same-person validation run on the server when the voter submits the three images.
  const capture = useCallback(() => {
    if (busy.current || !cameraReady || images.length >= MAX_IMAGES) return
    const shot = webcamRef.current?.getScreenshot()
    if (!shot) return say('error', t('face.waiting'))
    const b64 = shot.split(',')[1]
    setImages(current => [...current, b64])
    setFaceStatus(t('face.accepted', { n: images.length + 1 }))
    say('success', t('face.accepted', { n: images.length + 1 }))
  }, [cameraReady, images.length, t])

  const submitFace = async () => {
    if (images.length !== MIN_IMAGES) return say('error', t('face.needMore', { min: MIN_IMAGES }))
    const r = await run(t('reg.processing'), () => axios.post(
      `${API}/voters/register-face`,
      { images },
      { ...bearer(regToken.get()), timeout: 90000 }
    ))
    if (!r) return
    if (r.error) return
    setImages([])
    regToken.clear()
    say(null)
    setStep(4)
  }

  const field = (f, label, type = 'text', extra = {}) => (
    <div key={f}>
      <label htmlFor={f}>{label} *</label>
      <input id={f} className={`input${errors[f] ? ' invalid' : ''}`} type={type} value={form[f]} disabled={!!loading} aria-invalid={!!errors[f]} aria-describedby={errors[f] ? `${f}-err` : undefined}
        onChange={e => { setForm({ ...form, [f]: e.target.value }); clearErr(f) }} {...extra} />
      {errors[f] && <p id={`${f}-err`} className="field-err" role="alert">{errors[f]}</p>}
    </div>
  )
  const msgEl = msg && <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>{msg.text}</p>
  const stepper = (
    <div className="stepper" aria-hidden="true">
      {(identityOn ? ['reg.s1', 'reg.s2', 'reg.s3'] : ['reg.s1', 'reg.s3']).map((k, i) => <span key={k} className={i + 1 === shown ? 'on' : i + 1 < shown || step === 4 ? 'done' : ''}>{i + 1}. {t(k)}</span>)}
    </div>
  )

  return (
    <>
      <PublicHeader />
      <div className="page" style={{ paddingTop: 28 }}>
        <h2 className="title">{t('reg.title')}{step < 4 && <> — {t('reg.step', { n: shown, total })}</>}</h2>
        {stepper}

        {step === 1 && (
          <form className="card reg-card" noValidate onSubmit={submitDetails}>
            {field('demo_identity_number', '12-digit demo identity number', 'text', { inputMode: 'numeric', maxLength: 12, autoComplete: 'off' })}
            {field('name', t('reg.name'))}
            {field('age', t('reg.age'), 'number', { min: 1, max: 120 })}
            {field('address', t('reg.address'))}
            {field('district', 'District')}
            <div>
              <label htmlFor="gender">{t('reg.gender')} *</label>
              <select id="gender" className={`input${errors.gender ? ' invalid' : ''}`} value={form.gender} disabled={!!loading} onChange={e => { setForm({ ...form, gender: e.target.value }); clearErr('gender') }}>
                <option value="">{t('reg.genderSelect')}</option>
                <option value="Male">{t('reg.male')}</option><option value="Female">{t('reg.female')}</option><option value="Other">{t('reg.other')}</option>
              </select>
              {errors.gender && <p className="field-err" role="alert">{errors.gender}</p>}
            </div>
            <div>
              <label htmlFor="state_id">{t('reg.state')} *</label>
              <select id="state_id" className={`input${errors.state_id ? ' invalid' : ''}`} value={form.state_id} disabled={!!loading} onChange={e => { setConsts([]); setForm({ ...form, state_id: e.target.value, constituency_id: '' }); clearErr('state_id') }}>
                <option value="">{t('reg.stateSelect')}</option>
                {states.map(s => <option key={s.state_id} value={s.state_id}>{s.name}{s.kind === 'UT' ? ' (UT)' : ''}</option>)}
              </select>
              {errors.state_id && <p className="field-err" role="alert">{errors.state_id}</p>}
            </div>
            <div>
              <label htmlFor="constituency_id">Lok Sabha constituency *</label>
              <select id="constituency_id" className={`input${errors.constituency_id ? ' invalid' : ''}`} value={form.constituency_id} disabled={!!loading || !form.state_id} onChange={e => { setForm({ ...form, constituency_id: e.target.value }); clearErr('constituency_id') }}>
                <option value="">{t('reg.constSelect')}</option>
                {consts.map(c => <option key={c.constituency_id} value={c.constituency_id}>{displayConstituencyName(c.name)}</option>)}
              </select>
              {errors.constituency_id && <p className="field-err" role="alert">{errors.constituency_id}</p>}
              {geoErr && <p className="field-err" role="alert">{t('reg.geoError')}</p>}
            </div>
            <p className="hint" style={{ textAlign: 'left', fontSize: 13, marginTop: 4 }}>Select your parliamentary Lok Sabha constituency. Your ballot will show only the candidate options assigned to this constituency. This is a college simulation; candidate names are fictional demo data.</p>
            <p className="hint" style={{ textAlign: 'left', fontSize: 13, marginTop: 14 }}>{t('reg.hint18')}</p>
            <div className="btn-row">
              <button type="submit" className="btn primary" disabled={!!loading}>{loading || t('common.next')}</button>
              <button type="button" className="btn secondary" disabled={!!loading} onClick={() => nav('/voter/login')}>{t('common.back')}</button>
            </div>
            {msgEl}
          </form>
        )}

        {step === 2 && (
          <form className="card reg-card" noValidate onSubmit={otpSent ? verifyOtp : e => { e.preventDefault(); sendOtp() }}>
            <h3 style={{ textAlign: 'left' }}>{t('idv.title')}</h3>
            {(!idvInfo || idvInfo.development) && <div className="dev-banner" role="note">{t('idv.devBanner')}</div>}
            <p className="hint" style={{ textAlign: 'left', fontSize: 13 }}>College demo OTP verification. No mobile number or SMS is used.</p>
            {otpSent?.hint && <p className="hint" style={{ textAlign: 'left', fontSize: 13 }}>{otpSent.hint}</p>}
            {otpSent && (
              <>
                <label htmlFor="otp">{t('idv.otp')}</label>
                <input id="otp" className="input otp-input" inputMode="numeric" maxLength={6} autoFocus value={otp} disabled={!!loading} autoComplete="one-time-code"
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="______" />
                <p className="hint" style={{ textAlign: 'left', fontSize: 13, marginTop: 8 }}>
                  {cooldown > 0 ? t('idv.resendIn', { s: cooldown }) : <button type="button" className="link-btn" onClick={sendOtp} disabled={!!loading}>{t('idv.resend')}</button>}
                  {' · '}<button type="button" className="link-btn" onClick={() => { setOtpSent(null); setOtp(''); say(null) }} disabled={!!loading}>Restart demo OTP</button>
                </p>
              </>
            )}
            <div className="btn-row">
              <button type="submit" className="btn primary" disabled={!!loading || (otpSent ? otp.length !== 6 : false)}>{loading || (otpSent ? t('idv.verify') : 'Generate demo OTP')}</button>
              <button type="button" className="btn secondary" disabled={!!loading} onClick={() => { say(null); setStep(1) }}>{t('common.back')}</button>
            </div>
            {msgEl}
          </form>
        )}

        {step === 3 && (
          <div className="card reg-card center">
            <h3>Face registration</h3>
            <ol className="face-steps">
              <li>Keep your face centered and look straight at the camera.</li>
              <li>Turn your head slightly to your left and capture.</li>
              <li>Turn your head slightly to your right and capture.</li>
              <li>Use even lighting; remove masks or sunglasses.</li>
            </ol>
            <p className="hint">Capture exactly three clear views: front, left and right.</p>
            <p className="hint">Your voter ID will be generated automatically after successful face registration.</p>
            <p className="prompt">{images.length < MAX_IMAGES ? t(`face.prompt${images.length + 1}`) : 'All three views captured.'}</p>
            <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.92} videoConstraints={VIDEO}
              className="webcam" style={{ width: 320, maxWidth: '100%' }}
              onUserMedia={() => { setCameraReady(true); setCamError(false) }} onUserMediaError={() => { setCameraReady(false); setCamError(true) }} />
            <p className="status-line" role="status">{camError ? t('face.permission') : !cameraReady ? t('face.waiting') : faceStatus}</p>
            <div className="dots">{Array.from({ length: MAX_IMAGES }).map((_, i) => <div key={i} className={`dot ${i < images.length ? 'filled' : ''}`} />)}</div>
            <p className="hint">{images.length}/3 views captured</p>
            <div className="btn-row">
              <button type="button" className="btn danger" onClick={capture} disabled={!!loading || !cameraReady || images.length >= MAX_IMAGES}>📸 {images.length === 0 ? 'Capture front' : images.length === 1 ? 'Capture left' : 'Capture right'}</button>
              <button type="button" className="btn secondary" onClick={() => { setImages([]); setFaceStatus(''); say(null) }} disabled={!!loading || images.length === 0}>↺ Retake all</button>
              <button type="button" className="btn primary" onClick={submitFace} disabled={!!loading || images.length !== MIN_IMAGES}>{loading === t('reg.processing') ? t('reg.processing') : 'Complete registration'}</button>
              <button type="button" className="btn secondary" disabled={!!loading} onClick={() => { say(null); setStep(identityOn ? 2 : 1) }}>{t('common.back')}</button>
            </div>
            {msgEl}
          </div>
        )}

        {step === 4 && (
          <div className="card reg-card center">
            <div className="big-icon">✅</div>
            <h3 style={{ color: 'var(--ok)' }}>{t('reg.success')}</h3>
            <p className="hint">{t('face.registered')} {t('reg.successHint')}</p>
            <p className="hint">Your automatically generated Voter ID:</p>
            <h2 style={{ letterSpacing: 2 }}>{form.voter_id}</h2>
            <div className="btn-row" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/voter/login">{t('reg.goLogin')}</Link></div>
          </div>
        )}
      </div>
    </>
  )
}
