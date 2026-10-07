export default function AdminElection() {
  return (
    <div className="bb-page-shell">
      <header className="bb-page-header">
        <div>
          <div className="bb-page-kicker">Election configuration</div>
          <h1>Election details</h1>
          <p className="bb-page-subtitle">View current election information and status.</p>
        </div>
      </header>

      <section className="bb-section-card">
        <div className="bb-section-top">
          <div>
            <div className="bb-section-kicker">Overview</div>
            <h2>Election overview</h2>
          </div>
        </div>

        <div className="bb-grid-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
          <div className="bb-summary-card">
            <div className="bb-summary-label">Election name</div>
            <div className="bb-summary-value" style={{ fontSize: '22px' }}>Not configured</div>
            <div className="bb-summary-meta">No election record exists</div>
          </div>
          <div className="bb-summary-card">
            <div className="bb-summary-label">Status</div>
            <div className="bb-summary-value" style={{ fontSize: '22px' }}><span className="bb-badge muted">Not configured</span></div>
            <div className="bb-summary-meta">Scheduling is not available</div>
          </div>
          <div className="bb-summary-card">
            <div className="bb-summary-label">Start date</div>
            <div className="bb-summary-value" style={{ fontSize: '22px' }}>—</div>
            <div className="bb-summary-meta">Awaiting election data</div>
          </div>
          <div className="bb-summary-card">
            <div className="bb-summary-label">End date</div>
            <div className="bb-summary-value" style={{ fontSize: '22px' }}>—</div>
            <div className="bb-summary-meta">Awaiting election data</div>
          </div>
        </div>
      </section>

      <div className="bb-empty-panel" style={{ marginTop: '12px' }}>
        <div className="bb-empty-panel-icon">⚠</div>
        <h3>Election configuration unavailable</h3>
        <p>The backend currently has no election table or API for scheduling, so the system is operating in a demo-ready setup.</p>
      </div>
    </div>
  )
}
