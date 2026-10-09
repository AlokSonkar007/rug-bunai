import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { MATERIALS, ROOMS, TECHNIQUES, CARPET_CATEGORIES, carpetCategoryPath } from '../data/vocabularies';
import { rugImage } from '../lib/rugArt';
import { getProduct } from '../data/products';
import { whatsappLink } from '../lib/siteContent';

/** Desktop "Collections" mega-menu content — shared by hover panel & mobile drawer. */
function MegaMenu({ onNavigate }: { onNavigate?: () => void }) {
  const feature = getProduct('kashmiri-rose-medallion');
  return (
    <div className="mega-grid">
      <div className="mega-col">
        <p className="eyebrow">By Technique</p>
        <ul>
          {TECHNIQUES.map((tech) => (
            <li key={tech.slug}>
              <Link to={`/rugs?tech=${tech.slug}`} onClick={onNavigate}>{tech.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mega-col">
        <p className="eyebrow">By Material</p>
        <ul>
          {MATERIALS.map((m) => (
            <li key={m.slug}>
              <Link to={`/rugs?material=${m.slug}`} onClick={onNavigate}>{m.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mega-col">
        <p className="eyebrow">By Room</p>
        <ul>
          {ROOMS.map((room) => (
            <li key={room.slug}>
              <Link to={`/rugs?room=${room.slug}`} onClick={onNavigate}>{room.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="mega-col">
        <p className="eyebrow">Carpet Categories</p>
        <ul>
          {CARPET_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link to={carpetCategoryPath(category.slug)} onClick={onNavigate}>{category.label}</Link>
            </li>
          ))}
        </ul>
      </div>
      {feature && (
        <div className="mega-col mega-feature">
          <Link to="/rugs?sort=newest" onClick={onNavigate} className="mega-tile">
            <img src={rugImage(feature, 0, 420, 300)} alt="" loading="lazy" />
            <span className="mega-tile-label">New this season →</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { count } = useCart();
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const megaTimer = useRef<number | null>(null);
  const [sp] = useSearchParams();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Lock body scroll while drawer is open (prevents background scrolling on mobile)
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Compact header once the page scrolls
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    setSearchOpen(false);
  };

  const openMega = () => {
    if (megaTimer.current) window.clearTimeout(megaTimer.current);
    setMegaOpen(true);
  };
  const closeMega = () => {
    megaTimer.current = window.setTimeout(() => setMegaOpen(false), 160);
  };

  return (
    <div className={`shell ${drawerOpen ? 'nav-open' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>
      <p className="topbar">Free shipping across India · Handwoven in Bhadohi since 1982</p>

      <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="wrap header-grid">
          <button
            className="menu-toggle icon-btn"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>

          <Link to="/" className="brand" aria-label="Rug Bunai home">
            Rug Bunai
            <small>Bhadohi Weaving House</small>
          </Link>

          <nav className="nav nav-desktop" aria-label="Primary">
            <NavLink to="/rugs">All Rugs</NavLink>
            <div
              className="mega-host"
              onMouseEnter={openMega}
              onMouseLeave={closeMega}
            >
              <button
                className={`mega-trigger ${megaOpen ? 'open' : ''}`}
                aria-expanded={megaOpen}
                onClick={() => setMegaOpen((o) => !o)}
              >
                Collections
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 9 7 7 7-7"/></svg>
              </button>
              {megaOpen && (
                <div className="mega-panel" onMouseEnter={openMega} onMouseLeave={closeMega}>
                  <MegaMenu onNavigate={() => setMegaOpen(false)} />
                </div>
              )}
            </div>
            <NavLink to="/journal">Journal</NavLink>
            <NavLink to="/story">Our Story</NavLink>
          </nav>

          <div className="header-actions">
            {/* Expanding search field (all breakpoints) */}
            <form
              onSubmit={submitSearch}
              role="search"
              aria-label="Search rugs"
              className={`header-search ${searchOpen ? 'open' : ''}`}
            >
              <button
                type={searchOpen ? 'submit' : 'button'}
                className="icon-btn"
                aria-label={searchOpen ? 'Submit search' : 'Open search'}
                onClick={() => {
                  if (!searchOpen) {
                    setSearchOpen(true);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
              </button>
              <input
                ref={searchRef}
                type="search"
                name="q"
                placeholder="Search rugs, fibres, rooms…"
                aria-label="Search rugs"
                onBlur={() => { if (!searchRef.current?.value) setSearchOpen(false); }}
              />
              {searchOpen && (
                <button
                  type="button"
                  className="icon-btn search-close"
                  aria-label="Close search"
                  onClick={() => { setSearchOpen(false); if (searchRef.current) searchRef.current.value = ''; }}
                >
                  ×
                </button>
              )}
            </form>

            <span className="account-links">
              {user ? (
                <>
                  <Link to="/wishlist" className="clear-all" style={{ fontSize: '0.72rem' }}>Wishlist</Link>
                  {profile?.role === 'admin' && <Link to="/studio" className="clear-all" style={{ fontSize: '0.72rem' }}>Studio</Link>}
                  <button className="clear-all" style={{ fontSize: '0.72rem' }} onClick={() => void signOut()}>Sign out</button>
                </>
              ) : (
                <Link to="/login" className="clear-all sign-in-link" style={{ fontSize: '0.72rem' }}>Sign in</Link>
              )}
            </span>
            <Link to="/cart" className="icon-btn" aria-label={`Cart, ${count} items`}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8h14l-1.2 12H6.2L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
              {count > 0 && <span className="cart-badge">{count}</span>}
            </Link>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <nav className="nav-drawer" aria-label="Mobile">
            <div className="drawer-head">
              <p className="eyebrow">Rug Bunai</p>
              <button className="drawer-close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            <Link to="/rugs" className="drawer-primary">All Rugs</Link>
            <details className="drawer-group" open>
              <summary>Collections</summary>
              <div className="drawer-sub">
                <p className="eyebrow">Technique</p>
                <div className="drawer-chips">
                  {TECHNIQUES.map((t) => (<Link key={t.slug} to={`/rugs?tech=${t.slug}`}>{t.label}</Link>))}
                </div>
                <p className="eyebrow">Material</p>
                <div className="drawer-chips">
                  {MATERIALS.map((m) => (<Link key={m.slug} to={`/rugs?material=${m.slug}`}>{m.label}</Link>))}
                </div>
                <p className="eyebrow">Room</p>
                <div className="drawer-chips">
                  {ROOMS.map((r) => (<Link key={r.slug} to={`/rugs?room=${r.slug}`}>{r.label}</Link>))}
                </div>
              </div>
            </details>
            <Link to="/journal">Journal</Link>
            <Link to="/story">Our Story</Link>
            <Link to="/contact">Contact</Link>
            <hr className="rule" />
            <div className="drawer-chips">
              {user ? (
                <>
                  <Link to="/wishlist">Wishlist</Link>
                  {profile?.role === 'admin' && <Link to="/studio">Studio</Link>}
                  <button className="clear-all" onClick={() => void signOut()}>Sign out</button>
                </>
              ) : (
                <Link to="/login">Sign in</Link>
              )}
              <Link to="/cart">Cart ({count})</Link>
            </div>
          </nav>
        </>
      )}

      <main id="main">
        <Outlet />
      </main>

      <SiteFooter />
      <WhatsAppFab />
    </div>
  );
}

/** Floating WhatsApp contact bubble — bottom-right on every page. */
function WhatsAppFab() {
  return (
    <a
      className="whatsapp-fab"
      href={whatsappLink('Hello Rug Bunai! I have a question about your rugs.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M16 2.9c-7.2 0-13.1 5.9-13.1 13.1 0 2.3.6 4.5 1.7 6.5L2.9 29.1l7-1.8a13.1 13.1 0 0 0 6.1 1.5h0c7.2 0 13.1-5.9 13.1-13.1S23.2 2.9 16 2.9zm0 23.9h0a10.8 10.8 0 0 1-5.5-1.5l-.4-.2-4.1 1.1 1.1-4-.3-.4A10.8 10.8 0 1 1 16 26.8zm5.9-8c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2-.2.3-.8 1.1-1 1.3-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.6-.1-.2-.7-1.8-1-2.4-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.2 3.3 5.3 4.6.7.3 1.3.5 1.8.6.7.2 1.4.2 1.9.1.6-.1 1.9-.8 2.1-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z" />
      </svg>
      <span className="whatsapp-fab-label">Chat with us on WhatsApp</span>
    </a>
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
