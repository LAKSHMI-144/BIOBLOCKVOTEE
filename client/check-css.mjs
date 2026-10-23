// Fails when an admin page uses a bb-* class that no stylesheet defines (the cause of the unstyled dashboard).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const src = new URL('./src/', import.meta.url).pathname
const css = ['App.css', 'index.css', 'theme.css', 'admin.css'].map(f => readFileSync(join(src, f), 'utf8')).join('\n')
const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]))
const files = [...readdirSync(join(src, 'pages/admin')).map(f => `pages/admin/${f}`), 'pages/Results.jsx', 'pages/Blockchain.jsx', 'components/AdminLayout.jsx']
let missing = 0
for (const f of files) {
  const t = readFileSync(join(src, f), 'utf8')
  const used = new Set()
  for (const m of t.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) for (const g of [m[1], m[2]]) if (g) for (const c of g.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^bb-/.test(c)) used.add(c)
  const miss = [...used].filter(c => !defined.has(c))
  if (miss.length) { missing += miss.length; console.log(`${f}: undefined classes: ${miss.join(', ')}`) }
}
console.log(missing ? `FAIL: ${missing} undefined bb-* class(es)` : `OK: every bb-* class used by ${files.length} admin files is defined`)
process.exit(missing ? 1 : 0)
