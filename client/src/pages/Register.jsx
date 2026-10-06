import { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'
import axios from 'axios'
import { Link, useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useT } from '../i18n/i18nContext'
import { API, apiError, regToken, bearer } from '../api'

const MIN_IMAGES = 3, MAX_IMAGES = 5
const VIDEO = { width: 640, height: 480, facingMode: 'user' }
const ID_RE = /^[A-Z0-9-]{4,20}$/, NAME_RE = /^\p{L}[\p{L}\p{M}\s.'-]{1,98}$/u, PHONE_RE = /^[6-9]\d{9}$/
const EMPTY = { voter_id: '', name: '', age: '', gender: '', address: '' }

// Same rules as the server (which re-validates everything). Returns { field: errorCode }.
function validate(f) {
  const e = {}, id = f.voter_id.trim().toUpperCase(), name = f.name.trim().replace(/\s+/g, ' '), addr = f.address.trim(), age = Number(f.age)
  if (!id) e.voter_id = 'ID_REQUIRED'; else if (!ID_RE.test(id)) e.voter_id = 'ID_FORMAT'
  if (!name) e.name = 'NAME_REQUIRED'; else if (!NAME_RE.test(name) || (name.match(/\p{L}/gu) || []).length < 2) e.name = 'NAME_INVALID'
  if (String(f.age).trim() === '') e.age = 'AGE_REQUIRED'; else if (!Number.isInteger(age) || age < 1 || age > 120) e.age = 'AGE_INVALID'; else if (age < 18) e.age = 'AGE_MIN'
  if (!addr) e.address = 'ADDRESS_REQUIRED'; else if (addr.length < 5) e.address = 'ADDRESS_SHORT'
  if (!['Male', 'Female', 'Other'].includes(f.gender)) e.gender = 'GENDER_INVALID'
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
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(null)     // { masked, hint }
  const [cooldown, setCooldown] = useState(0)
  // face
  const [images, setImages] = useState([])
  const [cameraReady, setCameraReady] = useState(false)
  const [camError, setCamError] = useState(false)
  const [faceStatus, setFaceStatus] = useState('')

  const total = identityOn ? 3 : 2
  const shown = step === 1 ? 1 : step === 2 ? 2 : identityOn ? 3 : 2
  const say = (type, text) => setMsg(text ? { type, text } : null)
  const clearErr = f => setErrors(p => (p[f] ? { ...p, [f]: undefined } : p))

  useEffect(() => { axios.get(`${API}/config`).then(r => { setIdentityOn(r.data.identity.mode === 'required'); setIdvInfo(r.data.identity) }).catch(() => {}) }, [])
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
      setErrors(Object.fromEntries(Object.entries(local).map(([f, c]) => [f, t(`err.${c}`)])))
      return say('error', t('reg.fixErrors'))
    }
    setErrors({})
    const body = { ...form, voter_id: form.voter_id.trim().toUpperCase(), name: form.name.trim().replace(/\s+/g, ' '), age: Number(form.age), address: form.address.trim() }
    const r = await run(t('reg.checking'), () => axios.post(`${API}/voters/register`, body, bearer(regToken.get())))
    if (!r) return
    if (r.error) return setErrors(r.error.fields)
    regToken.set(r.data.registration_token)
    setForm(f => ({ ...f, ...body, age: String(body.age) }))
    if (identityOn) {
      const s = await axios.get(`${API}/identity/status`, bearer(r.data.registration_token)).catch(() => null)   // resumed registration may already be verified
      setStep(s?.data?.verified ? 3 : 2)
    } else setStep(3)
  }

  // ---- identity step
  const sendOtp = async () => {
    if (!PHONE_RE.test(phone)) return say('error', t('err.PHONE_INVALID'))
    const r = await run(t('idv.sending'), async () => {
      const tok = regToken.get()
      await axios.post(`${API}/identity/start`, { contact: phone }, bearer(tok))
      return axios.post(`${API}/identity/send-otp`, { contact: phone }, bearer(tok))
    })
    if (!r) return
    if (r.error) { if (r.error.retryAfter) setCooldown(r.error.retryAfter); return }
    if (r.data.already_verified) return setStep(3)
    setOtpSent({ masked: r.data.masked, hint: r.data.dev_hint }); setOtp(''); setCooldown(r.data.resend_in || 30)
    say('success', t('idv.sentTo', { masked: r.data.masked }))
  }
  const verifyOtp = async e => {
    e?.preventDefault()
    if (!/^\d{6}$/.test(otp)) return say('error', t('idv.otp'))
    const r = await run(t('idv.verifying'), () => axios.post(`${API}/identity/verify-otp`, { contact: phone, otp }, bearer(regToken.get())))
    if (!r || r.error) return
    say('success', t('idv.verified')); setStep(3)
  }

  // ---- face step
  const capture = useCallback(async () => {
    if (busy.current) return
    if (images.length >= MAX_IMAGES) return
    const shot = webcamRef.current?.getScreenshot()
    if (!shot) return say('error', t('face.waiting'))
    const b64 = shot.split(',')[1]
    const r = await run(t('face.checkingImage'), () => axios.post(`${API}/voters/check-face`, { image: b64 }))
    if (!r) return
    if (r.error) return setFaceStatus(r.error.message)
    setImages(p => [...p, b64]); setFaceStatus(t('face.detected')); say('success', t('face.accepted', { n: images.length + 1 }))
  }, [images, t])  // eslint-disable-line react-hooks/exhaustive-deps

  const submitFace = async () => {
    if (images.length < MIN_IMAGES) return say('error', t('face.needMore', { min: MIN_IMAGES }))
    const r = await run(t('reg.processing'), () => axios.post(`${API}/voters/register-face`, { voter_id: form.voter_id.trim().toUpperCase(), images }, bearer(regToken.get())))
    if (!r) return
    setImages([])                                   // captures are never kept after a try
    if (r.error) { if (r.error.code === 'REG_SESSION') setStep(1); return }
    regToken.clear(); say(null); setStep(4)
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
            {field('voter_id', t('reg.voterId'), 'text', { autoComplete: 'off' })}
            {field('name', t('reg.name'))}
            {field('age', t('reg.age'), 'number', { min: 1, max: 120 })}
            {field('address', t('reg.address'))}
            <div>
              <label htmlFor="gender">{t('reg.gender')} *</label>
              <select id="gender" className={`input${errors.gender ? ' invalid' : ''}`} value={form.gender} disabled={!!loading} onChange={e => { setForm({ ...form, gender: e.target.value }); clearErr('gender') }}>
                <option value="">{t('reg.genderSelect')}</option>
                <option value="Male">{t('reg.male')}</option><option value="Female">{t('reg.female')}</option><option value="Other">{t('reg.other')}</option>
              </select>
              {errors.gender && <p className="field-err" role="alert">{errors.gender}</p>}
            </div>
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
            <label htmlFor="phone">{t('idv.mobile')} *</label>
            <input id="phone" className="input" inputMode="numeric" maxLength={10} value={phone} disabled={!!loading || !!otpSent} autoComplete="off"
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
            <p className="hint" style={{ textAlign: 'left', fontSize: 12.5, marginTop: 6 }}>{t('idv.mobileHint')}</p>
            {otpSent && (
              <>
                <label htmlFor="otp">{t('idv.otp')}</label>
                <input id="otp" className="input otp-input" inputMode="numeric" maxLength={6} autoFocus value={otp} disabled={!!loading} autoComplete="one-time-code"
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="______" />
                <p className="hint" style={{ textAlign: 'left', fontSize: 13, marginTop: 8 }}>
                  {cooldown > 0 ? t('idv.resendIn', { s: cooldown }) : <button type="button" className="link-btn" onClick={sendOtp} disabled={!!loading}>{t('idv.resend')}</button>}
                  {' · '}<button type="button" className="link-btn" onClick={() => { setOtpSent(null); setOtp(''); say(null) }} disabled={!!loading}>{t('idv.change')}</button>
                </p>
              </>
            )}
            <div className="btn-row">
              <button type="submit" className="btn primary" disabled={!!loading || (otpSent ? otp.length !== 6 : phone.length !== 10)}>{loading || (otpSent ? t('idv.verify') : t('idv.sendOtp'))}</button>
              <button type="button" className="btn secondary" disabled={!!loading} onClick={() => { say(null); setStep(1) }}>{t('common.back')}</button>
            </div>
            {msgEl}
          </form>
        )}

        {step === 3 && (
          <div className="card reg-card center">
            <h3>{t('face.title')}</h3>
            <ol className="face-steps">
              {['face.i1', 'face.i2', 'face.i3', 'face.i4', 'face.i5'].map(k => <li key={k}>{t(k)}</li>)}
              <li>{t('face.i6', { min: MIN_IMAGES })}</li>
            </ol>
            <p className="hint">{t('reg.voterId')}: <b>{form.voter_id.trim().toUpperCase()}</b></p>
            <p className="prompt">{images.length < MAX_IMAGES ? t(`face.prompt${images.length + 1}`) : t('face.allCaptured')}</p>
            <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" screenshotQuality={0.92} videoConstraints={VIDEO}
              className="webcam" style={{ width: 320, maxWidth: '100%' }}
              onUserMedia={() => { setCameraReady(true); setCamError(false) }} onUserMediaError={() => { setCameraReady(false); setCamError(true) }} />
            <p className="status-line" role="status">{camError ? t('face.permission') : !cameraReady ? t('face.waiting') : faceStatus}</p>
            <div className="dots">{Array.from({ length: MAX_IMAGES }).map((_, i) => <div key={i} className={`dot ${i < images.length ? 'filled' : ''}`} />)}</div>
            <p className="hint">{t('face.progress', { n: images.length, min: MIN_IMAGES, max: MAX_IMAGES })}</p>
            <div className="btn-row">
              <button type="button" className="btn danger" onClick={capture} disabled={!!loading || !cameraReady || images.length >= MAX_IMAGES}>📸 {t('face.capture')}</button>
              <button type="button" className="btn secondary" onClick={() => { setImages([]); setFaceStatus(''); say(null) }} disabled={!!loading || images.length === 0}>↺ {t('face.retake')}</button>
              <button type="button" className="btn primary" onClick={submitFace} disabled={!!loading || images.length < MIN_IMAGES}>{loading === t('reg.processing') ? t('reg.processing') : t('face.register')}</button>
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
            <div className="btn-row" style={{ justifyContent: 'center' }}><Link className="btn primary" to="/voter/login">{t('reg.goLogin')}</Link></div>
          </div>
        )}
      </div>
    </>
  )
}
