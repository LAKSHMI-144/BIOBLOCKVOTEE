// Small dependency-free SVG/CSS charts. Both take real data only and show an empty state when there is nothing to draw.
import { colorAt } from '../lib/adminFormat'

const R = 52, C = 2 * Math.PI * R

// items: [{ label, value }]; draws a doughnut + legend. total is the sum of values.
export function DonutChart({ items, centerLabel = 'votes', emptyTitle = 'No votes yet', emptyText = 'The distribution appears after the first vote is recorded.', ariaLabel = 'Vote share' }) {
  const total = items.reduce((n, i) => n + i.value, 0)
  if (total === 0) return <div className="bb-empty-state"><div className="bb-empty-title">{emptyTitle}</div><div className="bb-empty-text">{emptyText}</div></div>
  const shown = items.filter(i => i.value > 0)
  const starts = shown.map((_, k) => shown.slice(0, k).reduce((n, x) => n + (x.value / total) * C, 0))
  return (
    <div className="bb-donut-layout">
      <svg className="bb-donut-svg" viewBox="0 0 140 140" role="img" aria-label={`${ariaLabel}: ${items.map(i => `${i.label} ${i.value}`).join(', ')}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface2)" strokeWidth="18" />
        {shown.map((i, k) => (
          <circle key={i.key ?? i.label} cx="70" cy="70" r={R} fill="none" stroke={i.color ?? colorAt(items.indexOf(i))} strokeWidth="18"
            strokeDasharray={`${(i.value / total) * C} ${C - (i.value / total) * C}`} strokeDashoffset={-starts[k]} transform="rotate(-90 70 70)" />
        ))}
        <text x="70" y="68" textAnchor="middle" className="bb-donut-num">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="bb-donut-sub">{centerLabel}</text>
      </svg>
      <div className="bb-donut-legend">
        {items.map((i, idx) => (
          <div key={i.key ?? i.label} className="bb-legend-row">
            <span className="bb-legend-dot" style={{ background: i.color ?? colorAt(idx) }} />
            <span className="bb-legend-name" title={i.label}>{i.label}</span>
            <span className="bb-legend-count">{i.value}</span>
            <span className="bb-legend-percent">{Math.round((i.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal bars (long candidate names stay readable). Bars start at zero.
export function BarChart({ items, unit = 'votes', emptyTitle = 'No votes yet', emptyText = 'Bars appear after the first vote is recorded.' }) {
  const max = Math.max(...items.map(i => i.value), 0)
  if (items.length === 0 || max === 0) return <div className="bb-empty-state"><div className="bb-empty-title">{emptyTitle}</div><div className="bb-empty-text">{emptyText}</div></div>
  return (
    <div className="bb-hbars" role="img" aria-label={`${unit} per item: ${items.map(i => `${i.label} ${i.value}`).join(', ')}`}>
      {items.map((i, idx) => (
        <div key={i.key ?? i.label} className="bb-hbar-row">
          <span className="bb-hbar-label" title={i.label}>{i.label}</span>
          <span className="bb-hbar-track"><span className="bb-hbar-fill" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? colorAt(idx) }} /></span>
          <span className="bb-hbar-value">{i.value}</span>
        </div>
      ))}
    </div>
  )
}
