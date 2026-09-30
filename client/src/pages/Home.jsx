import { useNavigate } from 'react-router-dom'

export default function Home() {
  const nav = useNavigate()
  return (
    <div className="page">
      <div style={{textAlign:'center',marginBottom:10}}>
        <div style={{fontSize:50}}>🗳️</div>
        <h1 style={{color:'#e94560',fontSize:32}}>BlockBioVote</h1>
        <p className="hint" style={{marginTop:6,maxWidth:400}}>
          Blockchain-Based Biometric E-Voting System
        </p>
        <p className="hint" style={{marginTop:4}}>Malnad College of Engineering, Hassan</p>
      </div>
      <div className="home-btns">
        <button className="btn primary" onClick={() => nav('/register')}>👤 Register Voter</button>
        <button className="btn" style={{background:'#0f3460'}} onClick={() => nav('/vote')}>🔐 Cast Vote</button>
        <button className="btn" style={{background:'#16213e',border:'1px solid #533483'}} onClick={() => nav('/results')}>📊 View Results</button>
        <button className="btn secondary" onClick={() => nav('/blockchain')}>🔗 Blockchain Status</button>
      </div>
    </div>
  )
}
