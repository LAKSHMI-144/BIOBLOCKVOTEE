import { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function Blockchain() {
  const nav = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    axios.get('http://localhost:5001/blockchain-status').then(r=>setData(r.data)).catch(()=>{})
  }, [])

  return (
    <div className="page">
      <h2 className="title">🔗 Blockchain Status</h2>
      {data ? (
        <>
          <div className="card center">
            <p>Status: <span className={`badge ${data.is_valid?'valid':'invalid'}`}>{data.is_valid?'✅ VALID':'❌ TAMPERED'}</span></p>
            <p style={{color:'#a8a8a8'}}>Total Blocks: {data.total_blocks}</p>
          </div>
          <div className="card" style={{width:'100%',maxWidth:500}}>
            <h3 style={{marginBottom:12}}>Blocks:</h3>
            {data.chain?.map(b=>(
              <div key={b.index} className="chain-block">
                <p>📦 Block #{b.index} | 🕐 {new Date(parseFloat(b.timestamp)*1000).toLocaleTimeString()}</p>
                <p>🗳️ Vote: {b.candidate}</p>
                <p>🔒 Voter: <code>{b.voter_hash}</code></p>
                <p>🔗 Hash: <code>{b.hash}</code></p>
              </div>
            ))}
          </div>
        </>
      ) : <p className="hint">Loading blockchain data...</p>}
      <button className="btn secondary" onClick={()=>nav('/')}>← Back</button>
    </div>
  )
}
