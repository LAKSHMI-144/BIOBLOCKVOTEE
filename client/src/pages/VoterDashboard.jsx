import { useEffect, useState } from 'react'
import axios from 'axios'
import { Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/PublicHeader'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useVoter } from '../voterContext'
import { useT } from '../i18n/i18nContext'
import { API } from '../api'

export default function VoterDashboard() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const { voter, receipt, logout } = useVoter()
  const [election, setElection] = useState(null)
  useEffect(() => { axios.get(`${API}/votes/election`).then(r => setElection(r.data)).catch(() => {}) }, [])
  if (!voter) return <Navigate to="/voter/login" replace />
  const voted = !!receipt
  const out = () => { logout(); nav('/') }
  const fmt = d => (d ? new Date(d).toLocaleString(lang) : '—')
  const open = election?.open

  return (
    <>
      <header className="bb-header">
        <div className="bb-wrap">
          <span className="bb-brand"><Logo />BlockBioVote</span>
          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <LanguageSwitcher />
            <button className="btn secondary" style={{ padding: '7px 14px' }} onClick={out}>{t('common.logout')}</button>
          </span>
        </div>
      </header>
      <div className="bb-vwrap">
        <h1 style={{ fontSize: 24, letterSpacing: '-.02em' }}>{t('dash.welcome', { name: voter.name })}</h1>
        <p className="hint" style={{ margin: '4px 0 24px', fontSize: 14 }}>{t('dash.verifiedLine', { id: voter.id })}</p>

        <div className="bb-grid">
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">{t('dash.status')}</div>
            <div className="v" style={{ fontSize: 20 }}>{voted ? <span className="pill ok">{t('dash.voted')}</span> : <span className="pill warn">{t('dash.notVoted')}</span>}</div>
            <div className="s">{voted ? t('dash.cannotAgain') : t('dash.eligible')}</div>
          </div>
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">{t('dash.election')}</div>
            <div className="v" style={{ fontSize: 16, marginTop: 10 }}>{election?.name || '—'}</div>
            <div className="s">
              {election && <span className={`pill ${open ? 'ok' : 'muted'}`}>{t(`dash.status.${election.status}`)}</span>}
              {election?.start_time && <div style={{ marginTop: 6 }}>{t('dash.window', { start: fmt(election.start_time), end: fmt(election.end_time) })}</div>}
            </div>
          </div>
          <div className="card bb-stat" style={{ maxWidth: 'none', marginBottom: 0 }}>
            <div className="l">{t('dash.castVote')}</div>
            <button className="btn primary" style={{ marginTop: 12, width: '100%', padding: 12 }} disabled={voted || !open} onClick={() => nav('/voter/vote')}>
              {voted ? t('dash.alreadyCast') : t('dash.castBtn')}
            </button>
            {!voted && election && !open && <div className="s" style={{ color: 'var(--warn)' }}>{t('vote.closed')}</div>}
          </div>
        </div>

        <div className="card bb-stat" style={{ maxWidth: 'none', marginTop: 16 }}>
          <div className="l">{t('dash.receipt')}</div>
          {receipt ? (
            <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.9 }}>
              <div>{t('vote.blockIndex')}: <code>#{receipt.block_index}</code></div>
              <div>{t('vote.blockHash')}: <code>{receipt.block_hash}</code></div>
              <div>{t('vote.voterHash')}: <code>{receipt.voter_hash}</code></div>
            </div>
          ) : <p className="hint" style={{ marginTop: 10, fontSize: 14 }}>{t('dash.receiptEmpty')}</p>}
        </div>
      </div>
    </>
  )
}
