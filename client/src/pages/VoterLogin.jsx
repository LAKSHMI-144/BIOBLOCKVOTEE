import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useVoter } from '../voterContext'
import { useT } from '../i18n/i18nContext'

export default function VoterLogin() {
  const { t } = useT()
  const nav = useNavigate()
  const { setPendingId, logout } = useVoter()
  const [id, setId] = useState('')
  const [err, setErr] = useState('')

  const submit = e => {
    e.preventDefault()
    const v = id.trim().toUpperCase()
    if (!v) return setErr(t('err.ID_REQUIRED'))
    if (!/^[A-Z0-9-]{4,20}$/.test(v)) return setErr(t('err.ID_FORMAT'))
    logout(); setPendingId(v)
    nav('/voter/authenticate')
  }

  return (
    <>
      <PublicHeader />
      <div className="bb-center">
        <form className="card bb-form" onSubmit={submit} noValidate>
          <h2>{t('login.title')}</h2>
          <p className="hint" style={{ fontSize: 14 }}>{t('login.hint')}</p>
          <label htmlFor="vid">{t('login.voterId')}</label>
          <input id="vid" className={`input${err ? ' invalid' : ''}`} value={id} autoFocus autoComplete="off" placeholder={t('login.placeholder')} onChange={e => { setId(e.target.value); setErr('') }} />
          {err && <p className="field-err" role="alert">{err}</p>}
          <button className="btn primary" type="submit">{t('login.continue')}</button>
          <p className="hint" style={{ fontSize: 13, marginTop: 18, textAlign: 'center' }}>
            {t('login.notRegistered')} <Link to="/voter/register" style={{ color: 'var(--accent)' }}>{t('login.registerLink')}</Link>
          </p>
        </form>
      </div>
    </>
  )
}
