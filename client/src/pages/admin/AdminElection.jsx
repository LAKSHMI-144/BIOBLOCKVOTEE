export default function AdminElection() {
  return (
    <>
      <h1>Election</h1><p className="sub">Election details and status</p>
      <div className="tbl-wrap"><table className="tbl"><tbody>
        <tr><td>Election name</td><td><span className="pill muted">Not configured</span></td></tr>
        <tr><td>Start / end</td><td><span className="pill muted">Not configured</span></td></tr>
        <tr><td>Status</td><td><span className="pill muted">Not configured</span></td></tr>
      </tbody></table></div>
      <p className="hint" style={{ marginTop: 14, fontSize: 13 }}>The backend has no election table or API yet, so these fields cannot be set.</p>
    </>
  )
}
