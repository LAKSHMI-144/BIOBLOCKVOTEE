import { useState, useMemo, useEffect } from 'react'
import { I18nCtx, LANGS, LANG_KEY, translate } from './i18nContext'

const initial = () => { try { const l = localStorage.getItem(LANG_KEY); return LANGS[l] ? l : 'en' } catch { return 'en' } }

export default function I18nProvider({ children }) {
  const [lang, setLang] = useState(initial)
  useEffect(() => {
    document.documentElement.lang = lang
    try { localStorage.setItem(LANG_KEY, lang) } catch { /* storage unavailable: keep in memory */ }
  }, [lang])
  const value = useMemo(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang])
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}
