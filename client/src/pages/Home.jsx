import { useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'

const STEPS = [
  ['01', 'Register', 'A voter registers with their details and a short webcam capture. Only an encrypted face template is stored, never the photos.'],
  ['02', 'Verify', 'At voting time the webcam image is matched against registered voters. Only registered, eligible voters who have not yet voted proceed.'],
  ['03', 'Vote', 'The verified voter selects a candidate and casts one vote; the server blocks a second vote.'],
  ['04', 'Record', 'The vote is appended as a SHA-256 hash-linked block that administrators can inspect and verify.'],
]
const FEATURES = [
  ['Face verification', 'Webcam face detection and recognition using ArcFace embeddings.'],
  ['Protected biometrics', 'Face templates are stored encrypted; photos are never saved.'],
  ['One voter, one vote', 'Enforced by the server for every registered voter.'],
  ['Hash-linked records', 'Each vote is a SHA-256 block linked to the previous one.'],
  ['Audit trail', 'Registration, authentication and voting events are logged.'],
  ['Integrity check', 'Administrators can verify the chain at any time.'],
]

export default function Home() {
  const nav = useNavigate()
  return (
    <>
      <PublicHeader />
      <main>
        <section className="bb-hero" id="home">
          <div className="bb-wrap">
            <h1>Secure Voting.<br />Verified by AI.<br /><span>Recorded on Blockchain.</span></h1>
            <p>BlockBioVote combines facial authentication, AI-based voter verification, secure election workflows, and blockchain-based vote records to provide a transparent electronic voting platform.</p>
            <div className="bb-cta">
              <button className="btn primary" onClick={() => nav('/voter/login')}>Voter Portal</button>
              <button className="btn" onClick={() => nav('/admin/login')}>Admin / Auditor Portal</button>
            </div>
            <div className="bb-flow" aria-label="Workflow">
              <div>AI verification</div><i>→</i><div>Secure voting</div><i>→</i><div>Blockchain record</div>
            </div>
          </div>
        </section>

        <section className="bb-section" id="portals">
          <div className="bb-wrap">
            <h2>Choose your portal</h2>
            <p className="sub">Access is separated by role.</p>
            <div className="bb-grid">
              <div className="card bb-role" style={{ maxWidth: 'none' }}>
                <span className="pill muted" style={{ alignSelf: 'flex-start' }}>Voter</span>
                <h3>Voter Portal</h3>
                <p>Register, authenticate securely using the existing facial verification workflow, and cast your vote.</p>
                <button className="btn primary" onClick={() => nav('/voter/login')}>Voter Login</button>
              </div>
              <div className="card bb-role" style={{ maxWidth: 'none' }}>
                <span className="pill muted" style={{ alignSelf: 'flex-start' }}>Admin / Auditor</span>
                <h3>Admin &amp; Auditor Portal</h3>
                <p>Monitor elections, candidates, voting activity, audit records, results, and blockchain integrity.</p>
                <button className="btn" onClick={() => nav('/admin/login')}>Admin Login</button>
              </div>
            </div>
          </div>
        </section>

        <section className="bb-section" id="how">
          <div className="bb-wrap">
            <h2>How it works</h2>
            <p className="sub">Four stages from registration to a verifiable record.</p>
            <div className="bb-grid">
              {STEPS.map(([n, t, d]) => (
                <div className="card bb-tile" key={n} style={{ maxWidth: 'none', marginBottom: 0 }}>
                  <span className="num">{n}</span><h3>{t}</h3><p>{d}</p>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 16, fontSize: 13 }}>The blockchain is maintained automatically by the application. Administrators and auditors monitor and verify it; they do not create blocks.</p>
          </div>
        </section>

        <section className="bb-section" id="security">
          <div className="bb-wrap">
            <h2>Security &amp; features</h2>
            <p className="sub">What the platform provides.</p>
            <div className="bb-grid">
              {FEATURES.map(([t, d]) => (
                <div className="card bb-tile" key={t} style={{ maxWidth: 'none', marginBottom: 0 }}><h3>{t}</h3><p>{d}</p></div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="bb-footer">BlockBioVote — academic prototype · Malnad College of Engineering, Hassan</footer>
    </>
  )
}
