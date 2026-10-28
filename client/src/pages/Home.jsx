import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useT } from '../i18n/i18nContext'

export default function Home() {
  const { t } = useT()
  return (
    <>
      <PublicHeader />
      <main>
        <section className="bb-hero">
          <div className="bb-wrap">
            <div className="bb-hero-copy">
              <h1 className="bb-project-name" aria-label="BioBlockVote"><span>Bio</span><span>Block</span><span>Vote</span></h1>
              <div className="bb-cta">
                <Link className="btn primary" to="/voter/login">{t('home.login')}</Link>
                <Link className="btn" to="/voter/register">{t('home.register')}</Link>
                <Link className="btn bb-admin-cta" to="/admin/login">{t('nav.admin')}</Link>
              </div>
              <p className="bb-hero-disclaimer">Academic prototype only. Not affiliated with or endorsed by the Election Commission of India.</p>
            </div>
            <div className="bb-democracy-art" aria-hidden="true">
              <div className="bb-art-orbit bb-art-orbit-one" />
              <div className="bb-art-orbit bb-art-orbit-two" />
              <div className="bb-art-card">
                <span className="bb-art-kicker">A voice in every choice</span>
                <div className="bb-flag">
                  <span className="bb-flag-band bb-flag-saffron" />
                  <span className="bb-flag-band bb-flag-white">
                    <svg className="bb-art-wheel" viewBox="0 0 120 120" fill="none">
                      <circle cx="60" cy="60" r="43" />
                      <circle cx="60" cy="60" r="4" />
                      {Array.from({ length: 24 }, (_, i) => <path key={i} d="M60 17V56" transform={`rotate(${i * 15} 60 60)`} />)}
                    </svg>
                  </span>
                  <span className="bb-flag-band bb-flag-green" />
                </div>
                <strong>Democracy, thoughtfully reimagined</strong>
                <small>Transparent by design. Built for learning.</small>
              </div>
              <span className="bb-art-star bb-art-star-one">✦</span>
              <span className="bb-art-star bb-art-star-two">✦</span>
            </div>
          </div>
        </section>
      </main>
      <footer className="bb-footer">{t('home.footer')}</footer>
    </>
  )
}
