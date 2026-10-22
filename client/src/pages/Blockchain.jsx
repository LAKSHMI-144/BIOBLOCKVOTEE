import { adminApi } from '../api'
import useLoad from '../hooks/useLoad'
import State from '../components/State'

const short = h => (h ? h : '-')

export default function Blockchain() {
  const { data, error, loading, reload } = useLoad(() => adminApi.get('/admin/blockchain'))
  const chain = data?.chain || []
  const latest = chain[chain.length - 1]

  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Security</div>
          <h1>Blockchain</h1>
          <p className="bb-page-subtitle">Blocks are created automatically by the application; this page is for verification.</p>
        </div>
        <button type="button" className="bb-button" onClick={reload} disabled={loading}>{loading ? 'Verifying…' : 'Re-verify chain'}</button>
      </header>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="bb-grid">
            <div className="bb-stat">
              <div className="l">Chain integrity</div>
              <div className="v"><span className={`pill ${data.is_valid ? 'ok' : 'bad'}`} style={{ fontSize: 14 }}>{data.is_valid ? 'VALID' : 'INVALID - tampering detected'}</span></div>
              <div className="s">Recomputed from every block on load</div>
            </div>
            <div className="bb-stat">
              <div className="l">Total blocks</div><div className="v">{data.total_blocks}</div><div className="s">Including the genesis block</div>
            </div>
            <div className="bb-stat">
              <div className="l">Latest block</div><div className="v">#{latest?.index}</div>
              <div className="s"><code>{short(latest?.hash)}</code></div>
            </div>
          </div>
          <p className="note">Chain is held in memory (resets when the AI service restarts). Voter IDs appear only as SHA-256 hashes.</p>
          <div className="chain" role="list" aria-label="Blockchain blocks">
            {chain.map((b, i) => (
              <div key={b.index} style={{ display: 'flex' }} role="listitem">
                {i > 0 && <div className="link" aria-hidden="true" />}
                <div className="blk">
                  <h4><span>Block #{b.index}</span><span className="pill muted">{b.index === 0 ? 'Genesis' : 'Vote'}</span></h4>
                  <div className="k">Hash</div><code>{b.hash}</code>
                  <div className="k">Previous hash</div><code>{i === 0 ? '0' : chain[i - 1].hash}</code>
                  <div className="k">Voter (hashed)</div><code>{b.voter_hash}</code>
                  <div className="k">Vote reference</div><div>{b.index === 0 ? '-' : b.candidate}</div>
                  <div className="k">Timestamp</div><div>{new Date(parseFloat(b.timestamp) * 1000).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
