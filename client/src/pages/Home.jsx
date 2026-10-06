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
            <h1>{t('home.title1')}<br />{t('home.title2')}<br /><span>{t('home.title3')}</span></h1>
            <p>{t('home.desc')}</p>
            <div className="bb-cta">
              <Link className="btn primary" to="/voter/login">{t('home.login')}</Link>
              <Link className="btn" to="/voter/register">{t('home.register')}</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="bb-footer">{t('home.footer')}</footer>
    </>
  )
}
