import { createContext, useContext } from 'react'
import en from './en'
import kn from './kn'
import hi from './hi'

export const LANGS = { en, kn, hi }
export const LANG_KEY = 'bbv_lang'

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s)
// Falls back to English, then to the key itself, so a missing translation never breaks the page.
export const translate = (lang, key, vars) => fill((LANGS[lang] && LANGS[lang][key]) ?? en[key] ?? key, vars)

export const I18nCtx = createContext({ lang: 'en', setLang: () => {}, t: (k, v) => translate('en', k, v) })
export const useT = () => useContext(I18nCtx)
