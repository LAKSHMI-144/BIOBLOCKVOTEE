import { useEffect } from 'react'

// Accessible dialog: Escape and the backdrop close it, the title labels it. Used for forms and confirmations.
export default function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="bb-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`bb-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="bb-modal-head"><h2>{title}</h2><button type="button" className="bb-modal-x" aria-label="Close" onClick={onClose}>×</button></div>
        <div className="bb-modal-body">{children}</div>
        {footer && <div className="bb-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
