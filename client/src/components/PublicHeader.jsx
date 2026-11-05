import { Link } from 'react-router-dom'
import { useT } from '../i18n/i18nContext'
import LanguageSwitcher from './LanguageSwitcher'

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d99a64" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 2 4 5.5v6c0 5 3.4 8.6 8 10.5 4.6-1.9 8-5.500 8-10.500v-6L12 2Z" />
      <path d="m8.500 12 2.500 2.500 4.500-5" />
    </svg>
  )
}

// Public navigation. Admin is deliberately a small, muted link – not a portal card.
export default function PublicHeader() {
  const { t } = useT()
  return (
    <header className="bb-header">
      <div className="bb-wrap">
        <Link to="/" className="bb-brand"><Logo /><span>BioBlockVote</span></Link>
        <nav className="bb-nav" aria-label="Main">
          <Link to="/" aria-current="page">{t('nav.home')}</Link>
          <LanguageSwitcher />
          <Link to="/voter/login" className="btn primary" style={{ padding: '8px 16px' }}>{t('nav.voterLogin')}</Link>
          <Link to="/voter/register" className="btn bb-register-link">{t('home.register')}</Link>
          <Link to="/admin/login" className="nav-admin">{t('nav.admin')}</Link>
        </nav>
      </div>
    </header>
  )
}
