import { useNavigate } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'

export default function Home() {
  const nav = useNavigate()

  return (
    <>
      <PublicHeader />
      <main>
        <section className="bb-hero" id="home">
          <div className="bb-wrap">
            <div className="eyebrow">Verified digital elections</div>
            <h1>BlockBioVote</h1>
            <p className="tagline">AI-Based Secure E-Voting System</p>
            <div className="bb-cta">
              <button className="btn primary" onClick={() => nav('/voter/login')}>Login</button>
              <button className="btn secondary" onClick={() => nav('/voter/register')}>Register</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="bb-footer">BlockBioVote — secure voting workflow</footer>
    </>
  )
}
