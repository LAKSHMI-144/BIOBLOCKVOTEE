import PublicHeader from '../components/PublicHeader'
import { IconAlert, IconBallot, IconCheck, IconClipboard, IconDatabase, IconFace, IconKey, IconLink, IconLock, IconUsers } from '../components/Icons'
import { useT } from '../i18n/i18nContext'

const HOW_ICONS = [IconUsers, IconFace, IconKey, IconBallot, IconCheck, IconLink, IconClipboard]
const SECURITY_ICONS = [IconFace, IconLock, IconKey, IconDatabase, IconCheck, IconClipboard, IconLink]

export default function Info({ kind }) {
  const { t } = useT()
  const security = kind === 'security'
  const section = security ? 'info.sec' : 'info.how'
  const items = security ? SECURITY_ICONS : HOW_ICONS

  return (
    <>
      <PublicHeader />
      <main className="bb-info-page">
        <header className="bb-info-heading">
          <span className="bb-info-kicker">{security ? t('info.sec.kicker') : t('info.how.kicker')}</span>
          <h1>{t(`${section}.title`)}</h1>
          <p>{t(`${section}.subtitle`)}</p>
        </header>

        <ol className={security ? 'bb-info-grid' : 'bb-info-steps'}>
          {items.map((Icon, index) => {
            const number = index + 1
            return (
              <li className="bb-info-card" key={number}>
                <span className="bb-info-number">{String(number).padStart(2, '0')}</span>
                <div className="bb-info-card-copy">
                  <div className="bb-info-card-heading">
                    <span className="bb-info-icon"><Icon /></span>
                    <h2>{t(`${section}.${number}.title`)}</h2>
                  </div>
                  <p>{t(`${section}.${number}.text`)}</p>
                </div>
              </li>
            )
          })}
        </ol>

        {security && (
          <aside className="bb-info-caveat" aria-labelledby="security-limits-title">
            <span className="bb-info-caveat-icon"><IconAlert /></span>
            <div>
              <h2 id="security-limits-title">{t('info.sec.notice.title')}</h2>
              <p>{t('info.sec.notice.text')}</p>
            </div>
          </aside>
        )}
      </main>
      <footer className="bb-footer">{t('home.footer')}</footer>
    </>
  )
}
