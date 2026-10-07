import { createContext, useContext } from 'react'

// Context + hook live in a plain .js module; the provider component is in VoterProvider.jsx
// so each file exports only components or only non-components (React Fast Refresh requirement).
export const VoterCtx = createContext(null)
export const useVoter = () => useContext(VoterCtx)
