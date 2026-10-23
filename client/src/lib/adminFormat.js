// Formatting helpers shared by the admin pages (no components here, so Fast Refresh stays happy).
export const PALETTE = ['#6b7bd6', '#3fae7c', '#d8a24f', '#d86b78', '#5aaed1', '#8f7bd6', '#d98f4f', '#4fb3a4', '#a3b86c', '#c27bb0']
export const colorAt = i => PALETTE[i % PALETTE.length]

// Plain-language names for the audit event types the backend records. Unknown types are shown as recorded.
export const EVENT_LABEL = {
  REGISTERED: 'Voter registered', REGISTRATION_REJECTED: 'Registration rejected', FACE_REGISTERED: 'Face template registered',
  FACE_REGISTRATION_FAILED: 'Face registration failed', AUTHENTICATED: 'Face authentication', VOTED: 'Vote cast', DUPLICATE_ATTEMPT: 'Duplicate vote attempt',
  VOTE_DENIED: 'Vote denied', VOTE_FAILED: 'Vote failed', RESULTS_VIEWED: 'Results viewed', ADMIN_LOGIN: 'Admin login', ADMIN_LOGIN_FAILED: 'Admin login failed',
  CANDIDATE_ADDED: 'Candidate added', CANDIDATE_EDITED: 'Candidate edited', CANDIDATE_ACTIVATED: 'Candidate activated', CANDIDATE_DEACTIVATED: 'Candidate deactivated',
  PARTY_CREATED: 'Party created', PARTY_UPDATED: 'Party updated', PARTY_ACTIVATED: 'Party activated', PARTY_DEACTIVATED: 'Party deactivated',
  CONSTITUENCY_CREATED: 'Constituency created', VOTER_CONSTITUENCY_SET: 'Voter constituency set',
  ELECTION_UPDATED: 'Election updated', ELECTION_OPENED: 'Election opened', ELECTION_CLOSED: 'Election closed',
}
export const eventLabel = t => EVENT_LABEL[t] || String(t || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

export const fmtTime = ts => {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
export const statusTone = s => (s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'bad' : s === 'DENIED' ? 'warn' : 'muted')
export const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0)
// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm"; the API stores/returns ISO.
export const toLocalInput = v => { if (!v) return ''; const d = new Date(v); if (Number.isNaN(d.getTime())) return ''; const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }
