import { useEffect, useState } from 'react'
import { errText } from '../api'

// Small loader for the admin pages: { data, error, loading }.
export default function useLoad(fetcher) {
  const [s, setS] = useState({ data: null, error: '', loading: true })
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    setS(p => ({ ...p, loading: true, error: '' }))
    fetcher().then(r => live && setS({ data: r.data, error: '', loading: false }))
      .catch(e => live && setS({ data: null, error: errText(e, 'Could not load data'), loading: false }))
    return () => { live = false }
  }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...s, reload: () => setN(x => x + 1) }
}

export const State = ({ loading, error }) =>
  loading ? <p className="empty">Loading...</p> : error ? <p className="msg error" role="alert" style={{ textAlign: 'left' }}>{error}</p> : null
