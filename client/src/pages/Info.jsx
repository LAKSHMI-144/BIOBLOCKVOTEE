import PublicHeader from '../components/PublicHeader'
import { useT } from '../i18n/i18nContext'

// Short explanatory pages reached from the navigation (kept off the landing page on purpose).
export default function Info({ kind }) {
  const { t } = useT()
  const p = kind === 'security' ? 'info.sec' : 'info.how'
  const items = kind === 'security' ? [1, 2, 3, 4] : [1, 2, 3, 4]
  return (
    <>
      <PublicHeader />
      <main className="bb-vwrap">
        <h1 style={{ fontSize: 28, letterSpacing: '-.02em', marginBottom: 20 }}>{t(`${p}.title`)}</h1>
        <ol className="info-list">
          {items.map(n => <li key={n} className="card" style={{ maxWidth: 'none' }}><span className="num">{String(n).padStart(2, '0')}</span><p>{t(`${p}.${n}`)}</p></li>)}
        </ol>
      </main>
    </>
  )
}
