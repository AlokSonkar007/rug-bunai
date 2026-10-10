import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { useAuth } from '../lib/auth';
import { CARPET_CATEGORIES, MATERIALS, ROOMS, TECHNIQUES } from '../data/vocabularies';
import { rugImage } from '../lib/rugArt';
import { getProduct } from '../data/products';
import { CONTACT_PHONE_DISPLAY, WHATSAPP_TEL_HREF, useSiteContent } from '../lib/siteContent';

/** Desktop "Collections" mega-menu content — shared by hover panel & mobile drawer. */

/** Curated design categories split into two scannable columns (9 + 6). */
const CATEGORY_COLUMNS: [number, number] = [9, CARPET_CATEGORIES.length - 9];

function MegaMenu({ onNavigate }: { onNavigate?: () => void }) {
  const feature = getProduct('kashmiri-rose-medallion');
  return (
    <div className="mega-grid">
      <div className="mega-col mega-wide">
        <p className="eyebrow">Shop by Design Category</p>
        <div className="mega-cat-cols">
          {[CARPET_CATEGORIES.slice(0, CATEGORY_COLUMNS[0]), CARPET_CATEGORIES.slice(CATEGORY_COLUMNS[0])].map((col, i) => (
            <ul key={i}>
              {col.map((cat) => (
                <li key={cat.slug}>
                  <Link to={`/collections/${cat.slug}`} onClick={onNavigate}>{cat.label}</Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
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
        <p className="mega-view-all">
          <Link to="/rugs" onClick={onNavigate}>View all rugs →</Link>
        </p>
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
  const { content: siteContent } = useSiteContent();
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
      <p className="topbar">{siteContent.topbar}</p>

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

            <a
              href={WHATSAPP_TEL_HREF}
              className="icon-btn header-call"
              aria-label={`Call us on ${CONTACT_PHONE_DISPLAY}`}
              title={`Call ${CONTACT_PHONE_DISPLAY}`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 3.5 9 3l2 4.5-2.2 1.8a13.5 13.5 0 0 0 5.9 5.9l1.8-2.2 4.5 2-.5 2.5c-.2 1.3-1.4 2.2-2.7 2C11.6 19.9 4.1 12.4 3.5 6.2c-.2-1.3.7-2.5 2-2.7Z"/></svg>
            </a>
            <span className="account-links">
              {user ? (
                <>
                  <Link to="/wishlist" className="clear-all" style={{ fontSize: '0.72rem' }}>Wishlist</Link>
                  {profile?.role === 'admin' && <Link to="/admin" className="clear-all" style={{ fontSize: '0.72rem' }}>Studio</Link>}
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
                <p className="eyebrow">Design Category</p>
                <ul className="drawer-cat-list">
                  {CARPET_CATEGORIES.map((c) => (
                    <li key={c.slug}>
                      <Link to={`/collections/${c.slug}`}>{c.label}</Link>
                    </li>
                  ))}
                </ul>
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
                  {profile?.role === 'admin' && <Link to="/admin">Studio</Link>}
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

      {/* Floating WhatsApp concierge — bottom-right, expands label on hover */}
      <WhatsAppFab />
    </div>
  );
}

/** Floating green WhatsApp button with hover label ("Chat us on WhatsApp"). */
export function WhatsAppFab() {
  return (
    <a
      className="wa-fab"
      href="https://wa.me/919555036025"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat us on WhatsApp"
    >
      <span className="wa-fab-label">Chat us on WhatsApp</span>
      <span className="wa-fab-icon" aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="#ffffff">
          <path d="M16.04 3.2c-7.06 0-12.8 5.73-12.8 12.79 0 2.26.6 4.47 1.73 6.41L3.2 28.8l6.57-1.72a12.77 12.77 0 0 0 6.26 1.6h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.04a12.72 12.72 0 0 0-9.05-3.64zm0 23.32h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.02 1.05 1.08-3.92-.26-.4a10.58 10.58 0 0 1-1.62-5.66c0-5.86 4.77-10.63 10.63-10.63 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.52c0 5.87-4.77 10.63-10.64 10.63zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1.01 1.25-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.56-1.58-.94-.84-1.58-1.88-1.77-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66s1.14 3.08 1.3 3.29c.16.21 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37z"/>
        </svg>
      </span>
    </a>
  );
}

export function SiteFooter() {
  const { content } = useSiteContent();
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <p className="brand" style={{ marginBottom: 18 }}>Rug Bunai<small>Bhadohi Weaving House</small></p>
          <p className="muted" style={{ fontSize: '0.86rem', maxWidth: '34ch' }}>
            {content.footer.about}
          </p>
        </div>
        {content.footerColumns.map((col) => (
          <div className="footer-col" key={col.heading}>
            <h4>{col.heading}</h4>
            <ul>
              {col.links.map((l) => (
                <li key={`${col.heading}-${l.to}`}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wrap footer-base">
        <span>Rug Bunai · Bhadohi, Uttar Pradesh, India — 221401</span>
        <span>
          <a href={WHATSAPP_TEL_HREF} style={{ letterSpacing: '0.12em' }}>{content.footer.phone || CONTACT_PHONE_DISPLAY}</a>
        </span>
        <span>© {new Date().getFullYear()} Rug Bunai. All knots placed by hand.</span>
      </div>
    </footer>
  );
}
