import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/PublicHeader'
import { useVoter } from '../voterSession'

export default function VoterDashboard() {
  const nav = useNavigate()
  const { voter, receipt, logout } = useVoter()
  if (!voter) return <Navigate to="/voter/login" replace />
  const voted = !!receipt
  const out = () => { logout(); nav('/') }

  return (
    <>
      <header className="bb-header">
        <div className="bb-wrap">
          <span className="bb-brand"><Logo />BlockBioVote</span>
          <button className="btn secondary" style={{ padding: '7px 14px' }} onClick={out}>Log out</button>
        </div>
      </header>
      <div className="bb-vwrap">
        <h1 style={{ fontSize: 24, letterSpacing: '-.02em' }}>Welcome, {voter.name}</h1>
        <p className="hint" style={{ margin: '4px 0 24px', fontSize: 14 }}>Voter ID {voter.id} · identity verified by face match</p>

        <div className="bb-grid">
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">My voting status</div>
            <div className="v" style={{ fontSize: 20 }}>{voted ? <span className="pill ok">Vote recorded</span> : <span className="pill warn">Not yet voted</span>}</div>
            <div className="s">{voted ? 'You cannot vote again.' : 'You are eligible to vote.'}</div>
          </div>
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">Election information</div>
            <div className="v" style={{ fontSize: 16, marginTop: 10 }}>Current election</div>
            <div className="s">Election name and dates are not configured in this version.</div>
          </div>
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">Cast vote</div>
            <button className="btn primary" style={{ marginTop: 12, width: '100%', padding: 12 }} disabled={voted} onClick={() => nav('/voter/vote')}>
              {voted ? 'Vote already cast' : 'Cast My Vote'}
            </button>
            <div className="s">Candidates are shown at the next step.</div>
          </div>
        </div>

        <div className="card bb-stat" style={{ maxWidth: 'none', marginTop: 16 }}>
          <div className="l">Vote confirmation / receipt</div>
          {receipt ? (
            <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.9 }}>
              <div>Block index: <code>#{receipt.block_index}</code></div>
              <div>Block hash: <code>{receipt.block_hash}</code></div>
              <div>Voter hash: <code>{receipt.voter_hash}</code></div>
            </div>
          ) : <p className="hint" style={{ marginTop: 10, fontSize: 14 }}>Your receipt will appear here after you vote.</p>}
        </div>
      </div>
    </>
  )
}
