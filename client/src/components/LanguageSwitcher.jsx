import { useT, LANGS } from '../i18n/i18nContext'

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useT()
  return (
    <select className="lang-select" aria-label={t('nav.language')} value={lang} onChange={e => setLang(e.target.value)}>
      {Object.keys(LANGS).map(k => <option key={k} value={k}>{LANGS[k]['lang.name']}</option>)}
    </select>
  )
}
