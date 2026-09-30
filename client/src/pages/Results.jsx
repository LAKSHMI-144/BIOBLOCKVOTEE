import { useState, useEffect } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'

export default function Results() {
  const nav = useNavigate()
  const [data, setData] = useState({ candidates:[], total_votes:0, total_registered:0 })

  useEffect(() => {
    axios.get('http://localhost:5000/api/votes/results').then(r=>setData(r.data)).catch(()=>{})
  }, [])

  const max = Math.max(...data.candidates.map(c=>c.vote_count), 1)

  return (
    <div className="page">
      <h2 className="title">📊 Live Election Results</h2>
      <p className="hint">Votes Cast: {data.total_votes} / Registered: {data.total_registered}</p>
      <div className="card" style={{marginTop:15,width:'100%',maxWidth:500}}>
        {data.candidates.map((c,i)=>(
          <div key={c.candidate_id} className="result-row">
            <div style={{width:130,fontSize:14}}>
              {i===0&&c.vote_count>0?'👑 ':''}{c.name}
              <div style={{color:'#a8a8a8',fontSize:11}}>{c.party}</div>
            </div>
            <div className="bar-container">
              <div className="bar" style={{width:`${(c.vote_count/max)*100}%`,background:i===0?'#e94560':'#533483'}}/>
            </div>
            <div style={{width:30,textAlign:'right',fontWeight:'bold'}}>{c.vote_count}</div>
          </div>
        ))}
      </div>
      <button className="btn secondary" onClick={()=>nav('/')}>← Back</button>
    </div>
  )
}
