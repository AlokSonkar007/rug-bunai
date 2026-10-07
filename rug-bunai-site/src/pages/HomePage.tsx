import { Link } from 'react-router-dom';
import { PRODUCTS, getProduct } from '../data/products';
import { ROOMS, TECHNIQUES } from '../data/vocabularies';
import { rugImage } from '../lib/rugArt';
import { Reveal } from '../components/ProductCard';
import Carousel from '../components/Carousel';
import ProductRail from '../components/ProductRail';
import { productsInCategory } from '../lib/search';

/**
 * Homepage narrative follows the "archival luxury" directive: the hero tells
 * the story of Bhadohi's weaving tradition — the 1982 founding date appears
 * only as supporting evidence of longevity, never as the headline.
 * The hero is now a full-bleed slideshow carousel; curated rows use
 * swipeable snap-scroll rails so nothing squishes on phones & tablets.
 */
export default function HomePage() {
  const bestSellers = PRODUCTS.filter((p) => p.bestSellerRank).slice(0, 6);
  const newArrivals = [...PRODUCTS].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo).slice(0, 6);

  // Hero slideshow — three editorial slides, each a different craft story
  const heroSlides = [
    {
      product: getProduct('kashmiri-rose-medallion')!,
      eyebrow: 'The Weaving Coast of Uttar Pradesh',
      title: <>Before it was a rug,<br />it was a language.</>,
      sub: 'For five centuries, the looms of Bhadohi have translated sketch-books kept by weaver families into wool, silk and shadow.',
    },
    {
      product: getProduct('mughal-garden-floral')!,
      eyebrow: 'Hand-Knotted Archive',
      title: <>One knot per pixel.<br />Eleven months per floor.</>,
      sub: 'The asymmetric Persian knot lets a karigar draw the curl of a vine — the reason our floral fields breathe.',
    },
    {
      product: getProduct('desert-line-geometric')!,
      eyebrow: 'Warm Minimalism',
      title: <>Texture holds light<br />the way colour cannot.</>,
      sub: 'In a pared-back room, a hand-loomed neutral anchors everything — start from your floor plan.',
    },
  ];

  const techniqueTiles = [
    { tech: TECHNIQUES[0], path: 'rugs/hand-knotted/wool', blurb: 'A knot for every pixel' },
    { tech: TECHNIQUES[1], path: 'rugs/hand-tufted/wool', blurb: 'Carved relief, punched by hand' },
    { tech: TECHNIQUES[2], path: 'rugs/flat-woven/cotton', blurb: 'Pattern as structure' },
    { tech: TECHNIQUES[3], path: 'rugs/loom-woven/bamboo-silk', blurb: 'Sheen woven lengthwise' },
  ];
  const roomTiles = ROOMS.map((room, i) => ({
    room,
    sample: productsInCategory(`rugs/${room.slug}`)[0] ?? PRODUCTS[i % PRODUCTS.length],
  }));

  return (
    <>
      {/* Hero slideshow */}
      <section className="hero">
        <Carousel label="Featured collections" autoMs={6200} className="hero-carousel"
          slides={heroSlides.map((s, i) => (
            <div className="hero-slide" key={i}>
              <div className="hero-art" aria-hidden={i !== 0}>
                <img src={rugImage(s.product, 4, 1600, 900)} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
              </div>
              <div className="hero-inner">
                <p className="eyebrow">{s.eyebrow}</p>
                <h2 className="display slide-up">{s.title}</h2>
                <p className="hero-sub">{s.sub}</p>
                <div className="hero-cta">
                  <Link to="/rugs" className="btn btn-light">Explore the Archive</Link>
                  <Link to="/story" className="btn btn-light" style={{ borderColor: 'rgba(247,243,236,.4)' }}>The Craft Story</Link>
                </div>
              </div>
            </div>
          ))}
        />
      </section>

      {/* Stats / trust band */}
      <div className="wrap">
        <div className="stats-row">
          <Reveal><div className="stat"><b>1982</b><span>Kilns lit since — four decades unbroken</span></div></Reveal>
          <Reveal delay={80}><div className="stat"><b>169</b><span>Knots per square inch, our finest archive piece</span></div></Reveal>
          <Reveal delay={160}><div className="stat"><b>11</b><span>Months on the loom for a single masterpiece</span></div></Reveal>
          <Reveal delay={240}><div className="stat"><b>100%</b><span>Hand-finished, natural fibres, no synthetic backing</span></div></Reveal>
        </div>
      </div>

      {/* New arrivals rail (swipeable catalogue) */}
      <section className="wrap section" style={{ paddingTop: 34, paddingBottom: 34 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">Fresh off the Loom</p>
              <h2 className="headline">New this season</h2>
            </div>
            <Link to="/rugs?sort=newest" className="clear-all">View all →</Link>
          </div>
        </Reveal>
        <ProductRail products={newArrivals} />
      </section>

      {/* Axis 1: Technique & Material */}
      <section className="wrap section" style={{ paddingTop: 24 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">By Technique &amp; Material</p>
              <h2 className="headline">Choose how it was made</h2>
            </div>
            <Link to="/rugs" className="clear-all">View all designs →</Link>
          </div>
        </Reveal>
        <div className="tiles">
          {techniqueTiles.map(({ tech, path, blurb }, i) => {
            const sample = productsInCategory(path)[0];
            return (
              <Reveal key={tech.slug} delay={i * 80}>
                <Link to={`/c/${path}`} className="tile">
                  <img src={rugImage(sample ?? PRODUCTS[0], 0, 480, 640)} alt={`${tech.label} rug detail`} loading="lazy" />
                  <figcaption><em>{tech.label}</em>{blurb}</figcaption>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Editorial split: craft storytelling pillar */}
      <section className="wrap section">
        <div className="split">
          <div className="media">
            <img src={rugImage(getProduct('mughal-garden-floral')!, 1, 900, 680)} alt="Macro view of a hand-knotted wool pile showing individual knots" loading="lazy" />
          </div>
          <div className="split-body">
            <p className="eyebrow">The Persian Knot</p>
            <h2 className="headline">Why curves need an asymmetric knot</h2>
            <p className="muted">
              A symmetric Turkish knot locks the pattern into straight geometry. The asymmetric
              Senneh knot — half-wrapped around its warp — lets a Bhadohi karigar draw the curl
              of a vine or the eye of a medallion. It is slower, harder, and the reason our
              floral fields breathe.
            </p>
            <p className="muted">
              Read the full field guide in the Journal, then see the technique in the pieces
              themselves.
            </p>
            <div style={{ display: 'flex', gap: 14, marginTop: 26, flexWrap: 'wrap' }}>
              <Link to="/journal/persian-vs-turkish-knot" className="btn">Read the Field Guide</Link>
              <Link to="/rugs?tech=hand-knotted" className="btn btn-solid">Hand-Knotted Rugs</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Best sellers rail */}
      <section className="wrap section" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">Most Coveted</p>
              <h2 className="headline">Chosen again and again</h2>
            </div>
            <Link to="/rugs?sort=best-selling" className="clear-all">View all →</Link>
          </div>
        </Reveal>
        <ProductRail products={bestSellers} />
      </section>

      {/* Axis 2: Room & Use Case */}
      <section className="band">
        <div className="wrap" style={{ paddingBlock: 'clamp(56px,8vw,110px)' }}>
          <div className="axis-head">
            <div>
              <p className="eyebrow" style={{ color: 'var(--sand)' }}>By Room &amp; Use</p>
              <h2 className="headline" style={{ color: 'var(--paper)' }}>Start from your floor plan</h2>
            </div>
          </div>
          <div className="tiles rooms">
            {roomTiles.map(({ room, sample }, i) => (
              <Reveal key={room.slug} delay={i * 70}>
                <Link to={`/rugs?room=${room.slug}`} className="tile">
                  <img src={rugImage(sample, 4, 420, 560)} alt={`${room.label} styled with a Rug Bunai piece`} loading="lazy" />
                  <figcaption><em>{room.label}</em>{productsInCategory(`rugs/${room.slug}`).length} designs</figcaption>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Interior inspiration pillar */}
      <section className="wrap section">
        <div className="split flip">
          <div className="media">
            <img src={rugImage(getProduct('desert-line-geometric')!, 4, 900, 680)} alt="Geometric tonal rug staged in a minimalist living room" loading="lazy" />
          </div>
          <div className="split-body">
            <p className="eyebrow">Interior Inspiration</p>
            <h2 className="headline">Warm minimalism lives underfoot</h2>
            <p className="muted">
              In a pared-back room, texture does what colour cannot: it holds light, softens
              sound, and makes restraint feel generous. Our sizing guide walks through the
              three front-leg rules that decide whether a rug anchors a room or floats in it.
            </p>
            <Link to="/journal/rug-size-guide" className="btn" style={{ marginTop: 22 }}>How to Choose the Right Size</Link>
          </div>
        </div>
      </section>

      {/* Newsletter capture */}
      <section className="band">
        <div className="wrap band-inner">
          <div>
            <p className="eyebrow" style={{ color: 'var(--sand)' }}>The Loom Letter</p>
            <h2 className="headline" style={{ color: 'var(--paper)', marginTop: 8 }}>One story, one new weave, monthly.</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); alert('Welcome to the Loom Letter.'); (e.target as HTMLFormElement).reset(); }}>
            <div className="newsletter-form">
              <input type="email" required placeholder="Your email address" aria-label="Email address" />
              <button type="submit">Subscribe</button>
            </div>
            <p style={{ fontSize: '0.7rem', opacity: 0.55, marginTop: 12, letterSpacing: '0.08em' }}>
              No noise. Unsubscribe anytime.
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
