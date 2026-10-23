import { useState } from 'react'
import { VoterCtx } from './voterContext'

// In-memory only (cleared on refresh/logout). Holds who was verified, the server-issued
// session token (the only thing /votes/cast accepts as proof of identity) and the receipt.
export default function VoterProvider({ children }) {
  const [pendingId, setPendingId] = useState('')   // Voter ID typed on the login page
  const [voter, setVoter] = useState(null)         // { id, name } after face verification
  const [token, setToken] = useState('')           // server-signed voter session token
  const [receipt, setReceipt] = useState(null)     // set after a successful vote
  const logout = () => { setPendingId(''); setVoter(null); setToken(''); setReceipt(null) }
  return <VoterCtx.Provider value={{ pendingId, setPendingId, voter, setVoter, token, setToken, receipt, setReceipt, logout }}>{children}</VoterCtx.Provider>
}
