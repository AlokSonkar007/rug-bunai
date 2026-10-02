import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { MATERIALS, TECHNIQUES } from '../data/vocabularies';

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { count } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [sp] = useSearchParams();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Sync header search box with ?q= when on shop pages
  useEffect(() => {
    if (searchRef.current && location.pathname.startsWith('/rugs')) {
      searchRef.current.value = sp.get('q') ?? '';
    }
  }, [location.search, location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchRef.current?.value.trim() ?? '';
    const params = new URLSearchParams(location.search);
    if (q) params.set('q', q); else params.delete('q');
    const qs = params.toString();
    navigate(`/rugs${qs ? '?' + qs : ''}`);
  };

  return (
    <div className={`shell ${drawerOpen ? 'nav-open' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <p className="topbar">Free shipping across India · Handwoven in Bhadohi since 1982</p>

      <header className="site-header">
        <div className="wrap header-grid">
          <form onSubmit={submitSearch} role="search" aria-label="Search rugs" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" className="icon-btn" aria-label="Submit search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
            </button>
            <input
              ref={searchRef}
              type="search"
              name="q"
              placeholder="Search"
              aria-label="Search rugs"
              style={{ border: 0, background: 'transparent', borderBottom: '1px solid var(--line)', padding: '6px 2px', width: 120, fontSize: '0.78rem', letterSpacing: '0.08em' }}
            />
          </form>

          <Link to="/" className="brand" aria-label="Rug Bunai home">
            Rug Bunai
            <small>Bhadohi Weaving House</small>
          </Link>

          <div className="header-actions">
            <nav className="nav nav-desktop" aria-label="Primary">
              <NavLink to="/rugs">All Rugs</NavLink>
              <div className="nav" style={{ gap: 20 }}>
                {TECHNIQUES.slice(0, 3).map((tech) => (
                  <NavLink key={tech.slug} to={`/rugs?tech=${tech.slug}`} title={`${tech.label} rugs`}>
                    {tech.label}
                  </NavLink>
                ))}
              </div>
              <NavLink to="/journal">Journal</NavLink>
              <NavLink to="/story">Our Story</NavLink>
            </nav>
            <Link to="/cart" className="icon-btn" aria-label={`Cart, ${count} items`}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
              {count > 0 && <span className="cart-badge">{count}</span>}
            </Link>
            <button className="menu-toggle icon-btn" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <nav className="nav-drawer" aria-label="Mobile">
            <button className="drawer-close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>×</button>
            <Link to="/rugs">All Rugs</Link>
            <p className="eyebrow">By Technique &amp; Material</p>
            {TECHNIQUES.map((t) => (
              <Link key={t.slug} to={`/rugs?tech=${t.slug}`}>{t.label}</Link>
            ))}
            <p className="eyebrow">Materials</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {MATERIALS.map((m) => (
                <Link key={m.slug} to={`/rugs?material=${m.slug}`} style={{ fontSize: '0.95rem', fontFamily: 'var(--sans)' }}>{m.label}</Link>
              ))}
            </div>
            <Link to="/journal">Journal</Link>
            <Link to="/story">Our Story</Link>
            <Link to="/contact">Contact</Link>
          </nav>
        </>
      )}

      <main id="main">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <p className="brand" style={{ marginBottom: 18 }}>Rug Bunai<small>Bhadohi Weaving House</small></p>
          <p className="muted" style={{ fontSize: '0.86rem', maxWidth: '34ch' }}>
            Guardians of a weaving tradition older than any single family — each rug knotted, washed and finished by hand in Uttar Pradesh.
          </p>
        </div>
        <div className="footer-col">
          <h4>Collections</h4>
          <ul>
            <li><Link to="/rugs?tech=hand-knotted">Hand-Knotted</Link></li>
            <li><Link to="/rugs?tech=hand-tufted">Hand-Tufted</Link></li>
            <li><Link to="/rugs?tech=flat-woven">Flat-Woven</Link></li>
            <li><Link to="/rugs?tech=loom-woven">Loom-Woven</Link></li>
            <li><Link to="/rugs">All Rugs</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Rooms</h4>
          <ul>
            <li><Link to="/rugs?room=living-room">Living Room</Link></li>
            <li><Link to="/rugs?room=bedroom">Bedroom</Link></li>
            <li><Link to="/rugs?room=dining-room">Dining Room</Link></li>
            <li><Link to="/rugs?room=hallway">Hallways &amp; Runners</Link></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Care &amp; Company</h4>
          <ul>
            <li><Link to="/story">Our Story</Link></li>
            <li><Link to="/journal">Journal</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/policies/shipping">Shipping</Link></li>
            <li><Link to="/policies/returns">Returns</Link></li>
            <li><Link to="/policies/privacy">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="wrap footer-base">
        <span>Rug Bunai · Bhadohi, Uttar Pradesh, India — 221401</span>
        <span>
          <a href="tel:+919044169163" style={{ letterSpacing: '0.12em' }}>+91 90441 69163</a>
        </span>
        <span>© {new Date().getFullYear()} Rug Bunai. All knots placed by hand.</span>
      </div>
    </footer>
  );
}
