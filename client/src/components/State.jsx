// Presentational loading / error line for pages that use the useLoad hook.
export default function State({ loading, error }) {
  if (loading) return <p className="empty">Loading...</p>
  if (error) return <p className="msg error" role="alert" style={{ textAlign: 'left' }}>{error}</p>
  return null
}
