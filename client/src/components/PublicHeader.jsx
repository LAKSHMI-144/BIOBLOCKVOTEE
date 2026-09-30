import { Link } from 'react-router-dom'

export function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6b7cff" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 2 4 5.5v6c0 5 3.4 8.6 8 10.5 4.6-1.9 8-5.500 8-10.500v-6L12 2Z" />
      <path d="m8.500 12 2.500 2.500 4.500-5" />
    </svg>
  )
}

export default function PublicHeader() {
  return (
    <header className="bb-header">
      <div className="bb-wrap">
        <Link to="/" className="bb-brand"><Logo /><span>BlockBioVote<small>AI-Based Secure E-Voting System</small></span></Link>
        <nav className="bb-nav" aria-label="Main">
          <Link to="/" className="hide-sm">Home</Link>
          <a href="/#how" className="hide-sm">How It Works</a>
          <a href="/#security" className="hide-sm">Security</a>
          <a href="/#portals" className="btn primary" style={{ padding: '8px 16px' }}>Login</a>
        </nav>
      </div>
    </header>
  )
}
