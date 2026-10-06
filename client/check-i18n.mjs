// Fails if kn/hi miss or add keys compared with en. Run: npm run check:i18n
import en from './src/i18n/en.js'; import kn from './src/i18n/kn.js'; import hi from './src/i18n/hi.js'
let bad = 0
for (const [n, d] of [['kn', kn], ['hi', hi]]) {
  const miss = Object.keys(en).filter(k => !(k in d)), extra = Object.keys(d).filter(k => !(k in en))
  const vars = Object.keys(en).filter(k => k in d && JSON.stringify((en[k].match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((d[k].match(/\{\w+\}/g) || []).sort()))
  if (miss.length || extra.length || vars.length) { bad++; console.log(n, { missing: miss, extra, placeholderMismatch: vars }) }
}
console.log(bad ? 'i18n check FAILED' : `i18n OK (${Object.keys(en).length} keys x 3 languages)`); process.exit(bad ? 1 : 0)
