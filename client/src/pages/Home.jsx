import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader'
import { useT } from '../i18n/i18nContext'

export default function Home() {
  const { t } = useT()
  return (
    <>
      <PublicHeader />
      <main>
        <section className="bb-hero">
          <div className="bb-wrap">
            <div className="bb-hero-copy">
              <h1 className="bb-project-name" aria-label="BioBlockVote"><span>Bio</span><span>Block</span><span>Vote</span></h1>
              <p className="bb-hero-slogan">One Vote. One Voice. A More Trusted Tomorrow.</p>
              <div className="bb-hero-actions">
                <Link className="btn primary" to="/voter/login">{t('nav.voterLogin')}</Link>
                <Link className="btn bb-register-link" to="/voter/register">{t('home.register')}</Link>
              </div>
            </div>
            <div className="bb-flag-stage">
              <svg className="bb-flag-art" viewBox="0 0 560 390" role="img" aria-labelledby="flag-title flag-description">
                <title id="flag-title">Indian tricolour flag</title>
                <desc id="flag-description">A softly waving saffron, white and green fabric flag with a navy Ashoka Chakra.</desc>
                <defs>
                  <clipPath id="flag-cloth-shape">
                    <path d="M48 62 C172 48 314 82 516 58 L516 324 C348 347 188 306 48 328 Z" />
                  </clipPath>
                  <linearGradient id="flag-saffron" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#b85b32" />
                    <stop offset=".18" stopColor="#f3a261" />
                    <stop offset=".42" stopColor="#df8147" />
                    <stop offset=".7" stopColor="#ffba76" />
                    <stop offset="1" stopColor="#c96d3c" />
                  </linearGradient>
                  <linearGradient id="flag-white" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#b7c1c4" />
                    <stop offset=".2" stopColor="#fffdf7" />
                    <stop offset=".46" stopColor="#e2e4df" />
                    <stop offset=".72" stopColor="#fffdf8" />
                    <stop offset="1" stopColor="#b5bdc0" />
                  </linearGradient>
                  <linearGradient id="flag-green" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#286e4a" />
                    <stop offset=".2" stopColor="#72b181" />
                    <stop offset=".45" stopColor="#43885e" />
                    <stop offset=".72" stopColor="#8ac590" />
                    <stop offset="1" stopColor="#34794f" />
                  </linearGradient>
                  <linearGradient id="flag-folds" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#071019" stopOpacity=".4" />
                    <stop offset=".12" stopColor="#fff" stopOpacity=".3" />
                    <stop offset=".25" stopColor="#071019" stopOpacity=".24" />
                    <stop offset=".39" stopColor="#fff" stopOpacity=".12" />
                    <stop offset=".55" stopColor="#071019" stopOpacity=".28" />
                    <stop offset=".69" stopColor="#fff" stopOpacity=".24" />
                    <stop offset=".83" stopColor="#071019" stopOpacity=".18" />
                    <stop offset="1" stopColor="#fff" stopOpacity=".08" />
                  </linearGradient>
                  <linearGradient id="flag-edge-light" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity=".55" />
                    <stop offset=".5" stopColor="#fff" stopOpacity="0" />
                    <stop offset="1" stopColor="#06101b" stopOpacity=".42" />
                  </linearGradient>
                  <filter id="flag-fabric" x="-10%" y="-10%" width="120%" height="120%">
                    <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="8" result="grain" />
                    <feColorMatrix in="grain" type="saturate" values="0" result="mono-grain" />
                    <feComponentTransfer in="mono-grain" result="soft-grain">
                      <feFuncA type="table" tableValues="0 .07" />
                    </feComponentTransfer>
                    <feBlend in="SourceGraphic" in2="soft-grain" mode="soft-light" />
                  </filter>
                </defs>
                <path className="bb-flag-shadow" d="M48 69 C172 55 314 89 516 65 L516 331 C348 354 188 313 48 335 Z" />
                <g className="bb-flag-cloth" clipPath="url(#flag-cloth-shape)" filter="url(#flag-fabric)">
                  <path d="M34 59 C177 42 326 81 530 54 L530 153 C363 179 191 132 34 162 Z" fill="url(#flag-saffron)" />
                  <path d="M34 154 C188 125 365 179 530 145 L530 243 C361 272 188 216 34 251 Z" fill="url(#flag-white)" />
                  <path d="M34 243 C189 210 365 270 530 235 L530 338 C355 365 187 309 34 341 Z" fill="url(#flag-green)" />
                  <path className="bb-flag-folds" d="M42 56 C116 45 131 76 162 95 C187 111 183 275 163 333 C136 320 111 319 42 337 Z" fill="url(#flag-folds)" />
                  <path className="bb-flag-folds bb-flag-folds-late" d="M228 57 C268 66 281 89 303 104 C322 122 313 268 295 338 C269 328 250 326 228 322 Z" fill="url(#flag-folds)" />
                  <path className="bb-flag-folds" d="M392 61 C431 68 444 89 466 100 L466 327 C444 324 418 323 392 318 Z" fill="url(#flag-folds)" />
                  <path d="M49 66 C170 52 314 85 515 61 L515 325 C348 348 189 307 49 329 Z" fill="url(#flag-edge-light)" opacity=".34" />
                  <g transform="translate(282 201)">
                    <g className="bb-flag-chakra">
                      <circle r="37" fill="none" stroke="#173c65" strokeWidth="2.8" />
                      <circle r="5" fill="#173c65" />
                      {Array.from({ length: 24 }, (_, i) => (
                        <path key={i} d="M0 -5 V-35" transform={`rotate(${i * 15})`} fill="none" stroke="#173c65" strokeWidth="1.7" />
                      ))}
                    </g>
                  </g>
                  <path d="M48 62 C172 48 314 82 516 58" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="2" />
                  <path d="M48 328 C188 306 348 347 516 324" fill="none" stroke="#071019" strokeOpacity=".42" strokeWidth="3" />
                </g>
              </svg>
            </div>
          </div>
        </section>
      </main>
      <footer className="bb-footer">{t('home.footer')}</footer>
    </>
  )
}
