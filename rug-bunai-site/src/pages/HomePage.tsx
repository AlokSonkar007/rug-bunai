import { Link } from 'react-router-dom';
import { getProduct } from '../data/products';
import { ROOMS } from '../data/vocabularies';
import { rugImage } from '../lib/rugArt';
import { Reveal } from '../components/ProductCard';
import Carousel from '../components/Carousel';
import ProductRail from '../components/ProductRail';
import { colourPalette, productsInCategory } from '../lib/search';
import { useCatalog } from '../lib/catalog';
import { useSiteContent, type TileContent, type SplitBlockContent } from '../lib/siteContent';

/** Seed product used for generated tile art when the admin hasn't uploaded an image. */
function seedProduct(slug: string | undefined, fallbackIndex: number, list: readonly { slug: string; name: string }[]) {
  const bySlug = slug ? getProduct(slug) : undefined;
  return bySlug ?? list[fallbackIndex % list.length];
}

/** Editable tile with optional admin-uploaded image. */
function EditableTile({ item, sample, i, alt }: { item: TileContent; sample: { slug: string; name: string }; i: number; alt: string }) {
  return (
    <Link to={item.to} className="tile">
      <img
        src={item.imageUrl ?? rugImage(sample as never, 0, 480, 640)}
        alt={alt}
        loading={i === 0 ? 'eager' : 'lazy'}
      />
      <figcaption><em>{item.title}</em>{item.blurb}</figcaption>
    </Link>
  );
}

/**
 * Homepage narrative follows the "archival luxury" directive: hero, rails,
 * tiles and editorial splits are fully editable from the Studio (text + image).
 * Swipeable snap-scroll rails keep phones/tablets from squishing content.
 */
export default function HomePage() {
  const { products } = useCatalog();
  const { content } = useSiteContent();

  const bestSellers = products.filter((p) => p.bestSellerRank).slice(0, 6);
  const newArrivals = [...products].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo).slice(0, 6);
  const palette = colourPalette(products);

  const roomTiles = ROOMS.map((room, i) => ({
    room,
    sample: productsInCategory(`rugs/${room.slug}`)[0] ?? products[i % products.length],
  }));

  const craftImg = (s: SplitBlockContent, angle: number) =>
    s.imageUrl ?? rugImage(seedProduct(s.productSlug, 1, products) as never, angle, 900, 680);

  return (
    <>
      {/* Hero slideshow — every slide editable in the Studio */}
      <section className="hero">
        <Carousel label="Featured collections" autoMs={6200} className="hero-carousel"
          slides={content.heroSlides.map((s, i) => (
            <div className="hero-slide" key={i}>
              <div className="hero-art" aria-hidden={i !== 0}>
                <img
                  src={s.imageUrl ?? rugImage(seedProduct(s.productSlug, i, products) as never, 4, 1600, 900)}
                  alt="" loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
              <div className="hero-inner">
                <p className="eyebrow">{s.eyebrow}</p>
                <h2 className="display slide-up">{s.title1}<br />{s.title2}</h2>
                <p className="hero-sub">{s.sub}</p>
                <div className="hero-cta">
                  <Link to={s.ctaTo} className="btn btn-light">{s.ctaLabel}</Link>
                  {s.altCtaLabel && (
                    <Link to={s.altCtaTo} className="btn btn-light" style={{ borderColor: 'rgba(247,243,236,.4)' }}>{s.altCtaLabel}</Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        />
      </section>

      {/* Stats / trust band */}
      <div className="wrap">
        <div className="stats-row">
          {content.stats.map((st, i) => (
            <Reveal key={i} delay={i * 80}><div className="stat"><b>{st.value}</b><span>{st.label}</span></div></Reveal>
          ))}
        </div>
      </div>

      {/* New arrivals rail (swipeable catalogue) */}
      <section className="wrap section" style={{ paddingTop: 34, paddingBottom: 34 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">{content.newArrivalsRail.eyebrow}</p>
              <h2 className="headline">{content.newArrivalsRail.title}</h2>
            </div>
            <Link to={content.newArrivalsRail.linkTo} className="clear-all">{content.newArrivalsRail.linkLabel}</Link>
          </div>
        </Reveal>
        <ProductRail products={newArrivals} />
      </section>

      {/* Axis 1: Technique & Material */}
      <section className="wrap section" style={{ paddingTop: 24 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">{content.techniqueHeading.eyebrow}</p>
              <h2 className="headline">{content.techniqueHeading.title}</h2>
            </div>
            <Link to="/rugs" className="clear-all">View all designs →</Link>
          </div>
        </Reveal>
        <div className="tiles">
          {content.techniqueTiles.map((tile, i) => {
            const sample = productsInCategory(tile.to.replace(/^\/c\//, ''))[0] ?? products[0];
            return (
              <Reveal key={i} delay={i * 80}>
                <EditableTile item={tile} sample={sample ?? products[0]} i={i} alt={`${tile.title} rug detail`} />
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Editorial split: craft storytelling pillar */}
      <section className="wrap section">
        <div className="split">
          <div className="media">
            <img src={craftImg(content.craftSplit, 1)} alt="Macro view of a hand-knotted wool pile showing individual knots" loading="lazy" />
          </div>
          <div className="split-body">
            <p className="eyebrow">{content.craftSplit.eyebrow}</p>
            <h2 className="headline">{content.craftSplit.title}</h2>
            <p className="muted">{content.craftSplit.body1}</p>
            {content.craftSplit.body2 && <p className="muted">{content.craftSplit.body2}</p>}
            <div style={{ display: 'flex', gap: 14, marginTop: 26, flexWrap: 'wrap' }}>
              <Link to={content.craftSplit.primaryTo} className="btn">{content.craftSplit.primaryLabel}</Link>
              {content.craftSplit.secondaryLabel && (
                <Link to={content.craftSplit.secondaryTo ?? '/rugs'} className="btn btn-solid">{content.craftSplit.secondaryLabel}</Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Best sellers rail */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">{content.bestSellersRail.eyebrow}</p>
              <h2 className="headline">{content.bestSellersRail.title}</h2>
            </div>
            <Link to={content.bestSellersRail.linkTo} className="clear-all">{content.bestSellersRail.linkLabel}</Link>
          </div>
        </Reveal>
        <ProductRail products={bestSellers} />
      </section>

      {/* Axis 2: Room & Use Case */}
      <section className="band">
        <div className="wrap" style={{ paddingBlock: 'clamp(56px,8vw,110px)' }}>
          <div className="axis-head">
            <div>
              <p className="eyebrow" style={{ color: 'var(--sand)' }}>{content.roomsBand.eyebrow}</p>
              <h2 className="headline" style={{ color: 'var(--paper)' }}>{content.roomsBand.title}</h2>
            </div>
          </div>
          <div className="tiles rooms">
            {content.roomTiles.map((tile, i) => {
              const room = ROOMS[i % ROOMS.length];
              const sample = roomTiles[i]?.sample ?? products[0];
              return (
                <Reveal key={i} delay={i * 70}>
                  <Link to={tile.to || `/rugs?room=${room.slug}`} className="tile">
                    <img
                      src={tile.imageUrl ?? rugImage(sample, 4, 420, 560)}
                      alt={`${tile.title} styled with a Rug Bunai piece`} loading="lazy"
                    />
                    <figcaption><em>{tile.title}</em>{productsInCategory(`rugs/${room.slug}`).length} {tile.blurb}</figcaption>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Shop by Colour — premium house-palette discovery band */}
      <section className="colour-band" aria-labelledby="colour-band-title">
        <div className="colour-band-inner">
          <Reveal>
            <div className="colour-band-head">
              <div>
                <p className="eyebrow">{content.colourBand.eyebrow}</p>
                <h2 className="headline" id="colour-band-title">{content.colourBand.title}</h2>
                <p className="muted" style={{ marginTop: 10, maxWidth: '46ch' }}>{content.colourBand.sub}</p>
              </div>
              <Link to="/rugs" className="clear-all">Browse every colour →</Link>
            </div>
          </Reveal>
          <ul className="colour-grid">
            {palette.map((c, i) => (
              <li key={c.slug}>
                <Reveal delay={Math.min(i, 8) * 50}>
                  <Link
                    to={`/rugs?color=${encodeURIComponent(c.slug)}`}
                    className={`colour-card${c.count === 0 ? ' is-quiet' : ''}`}
                    aria-label={`Shop ${c.label} rugs${c.count > 0 ? ` — ${c.count} design${c.count === 1 ? '' : 's'} available` : ' — made to order'}`}
                  >
                    <span className="colour-swatch" aria-hidden="true" style={{ background: c.hex }} />
                    <span className="colour-body">
                      <span className="colour-name">{c.label}</span>
                      <span className="colour-count">{c.count > 0 ? `${c.count} design${c.count === 1 ? '' : 's'}` : 'Made to order'}</span>
                    </span>
                    <span className="colour-go" aria-hidden="true">→</span>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Interior inspiration pillar */}
      <section className="wrap section">
        <div className="split flip">
          <div className="media">
            <img src={craftImg(content.inspirationSplit, 4)} alt="Geometric tonal rug staged in a minimalist living room" loading="lazy" />
          </div>
          <div className="split-body">
            <p className="eyebrow">{content.inspirationSplit.eyebrow}</p>
            <h2 className="headline">{content.inspirationSplit.title}</h2>
            <p className="muted">{content.inspirationSplit.body1}</p>
            <Link to={content.inspirationSplit.primaryTo} className="btn" style={{ marginTop: 22 }}>
              {content.inspirationSplit.primaryLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* Newsletter capture */}
      <section className="band">
        <div className="wrap band-inner">
          <div>
            <p className="eyebrow" style={{ color: 'var(--sand)' }}>{content.newsletter.eyebrow}</p>
            <h2 className="headline" style={{ color: 'var(--paper)', marginTop: 8 }}>{content.newsletter.title}</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); alert('Welcome to the Loom Letter.'); (e.target as HTMLFormElement).reset(); }}>
            <div className="newsletter-form">
              <input type="email" required placeholder="Your email address" aria-label="Email address" />
              <button type="submit">Subscribe</button>
            </div>
            <p style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 12, letterSpacing: '0.08em' }}>
              {content.newsletter.note}
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
