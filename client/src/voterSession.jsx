import { createContext, useContext, useState } from 'react'

// In-memory only (cleared on refresh/logout). Holds who was verified and their receipt.
const Ctx = createContext(null)
export const useVoter = () => useContext(Ctx)

export function VoterProvider({ children }) {
  const [pendingId, setPendingId] = useState('')   // Voter ID typed on the login page
  const [voter, setVoter] = useState(null)         // { id, name } after face verification
  const [receipt, setReceipt] = useState(null)     // set after a successful vote
  const logout = () => { setPendingId(''); setVoter(null); setReceipt(null) }
  return <Ctx.Provider value={{ pendingId, setPendingId, voter, setVoter, receipt, setReceipt, logout }}>{children}</Ctx.Provider>
}
