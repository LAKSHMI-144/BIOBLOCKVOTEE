import { useState } from 'react'
import { VoterCtx } from './voterContext'

export default function VoterProvider({ children }) {
  const [pendingId, setPendingId] = useState('')   // Voter ID typed on the login page
  const [voter, setVoter] = useState(null)         // { id, name } after face verification
  const [receipt, setReceipt] = useState(null)     // set after a successful vote
  const logout = () => { setPendingId(''); setVoter(null); setReceipt(null) }
  return <VoterCtx.Provider value={{ pendingId, setPendingId, voter, setVoter, receipt, setReceipt, logout }}>{children}</VoterCtx.Provider>
}
