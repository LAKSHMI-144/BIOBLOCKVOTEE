// Small stroke icon set used by the admin pages (one style, inherits colour from CSS `color`).
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const Svg = ({ children, ...props }) => <svg {...base} {...props}>{children}</svg>

export function IconUsers(props) { return <Svg {...props}><><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c.4-3.4 3-5.2 6.2-5.2s5.8 1.8 6.2 5.2" /><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18.4 14.9c1.6.7 2.6 2.2 2.8 4.1" /></></Svg> }
export function IconBallot(props) { return <Svg {...props}><><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8.5h8M8 12.5h8M8 16.5h4" /></></Svg> }
export function IconCheck(props) { return <Svg {...props}><><circle cx="12" cy="12" r="8.5" /><path d="m8.5 12.3 2.5 2.5 4.6-5" /></></Svg> }
export function IconTrend(props) { return <Svg {...props}><><path d="M3.5 17.5 9 12l3.5 3.5 8-8" /><path d="M15 7.5h5.5V13" /></></Svg> }
export function IconShield(props) { return <Svg {...props}><><path d="M12 3.2 4.8 6v5.6c0 4.2 3 7.4 7.2 9.2 4.2-1.8 7.2-5 7.2-9.2V6L12 3.2Z" /><path d="m9 12 2.2 2.2L15.2 10" /></></Svg> }
export function IconLink(props) { return <Svg {...props}><><path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1-1" /></></Svg> }
export function IconAlert(props) { return <Svg {...props}><><path d="M12 3.6 2.8 19.6h18.4L12 3.6Z" /><path d="M12 10v4.2M12 17.2v.1" /></></Svg> }
export function IconClock(props) { return <Svg {...props}><><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></></Svg> }
export function IconRefresh(props) { return <Svg {...props}><><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></></Svg> }
export function IconFace(props) { return <Svg {...props}><><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.5-3.5 3.2-5.5 7-5.5s6.5 2 7 5.5" /><path d="M9.8 9h.1M14.1 9h.1M10 11.2c1.2.9 2.8.9 4 0" /></></Svg> }
export function IconKey(props) { return <Svg {...props}><><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M15 8l3 3M17 6l3 3" /></></Svg> }
export function IconLock(props) { return <Svg {...props}><><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></></Svg> }
export function IconDatabase(props) { return <Svg {...props}><><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></></Svg> }
export function IconClipboard(props) { return <Svg {...props}><><rect x="5" y="4.5" width="14" height="17" rx="2" /><path d="M9 4.5v-1h6v1M8.5 10h7M8.5 14h7M8.5 18h4" /></></Svg> }
