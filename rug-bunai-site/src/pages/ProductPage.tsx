import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatINR, type Product, type Variant } from '../data/products';
import { CLASSIFICATIONS, colorHex, findTerm, MATERIALS, TECHNIQUES } from '../data/vocabularies';
import { productPhoto, similarProducts } from '../lib/products';
import { useProducts } from '../lib/catalog';
import { useCart } from '../lib/cart';
import { ProductCard, Reveal } from '../components/ProductCard';

/**
 * PDP — where conversion happens. Interactive gallery with macro angles,
 * colour swatches + size pills (variants), exhaustive dual-unit specs,
 * craft storytelling tab, and typed product relationships ("complete the look").
 * Products resolve from the shared database-backed catalogue.
 */
export default function ProductPage() {
  const { slug } = useParams();
  const { products, bySlug, byId } = useProducts();
  const product = slug ? bySlug(slug) : undefined;
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [color, setColor] = useState<string>(product?.colorSlugs[0] ?? '');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [tab, setTab] = useState<'details' | 'craft' | 'care'>('details');
  const [toast, setToast] = useState<string | null>(null);
  const cart = useCart();

  useEffect(() => {
    if (!product) return;
    setColor(product.colorSlugs[0]);
    setVariantId(null);
    setAngle(0);
    window.scrollTo(0, 0);
  }, [slug, product]);

  const variantsInColor: Variant[] = useMemo(
    () => product?.variants.filter((v: Variant) => v.colorSlug === color) ?? [],
    [product, color],
  );
  const selected: Variant | undefined =
    product?.variants.find((v: Variant) => v.id === variantId) ??
    variantsInColor.find((v: Variant) => v.stock > 0) ??
    variantsInColor[0];

  if (!product) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">This design has left the archive.</h1>
        <p className="muted">It may have sold out permanently — browse what remains on the loom.</p>
        <Link to="/rugs" className="btn" style={{ marginTop: 22 }}>All Rugs</Link>
      </div>
    );
  }

  const tech = findTerm(TECHNIQUES, product.techniqueSlug)?.label ?? '';
  const mat = findTerm(MATERIALS, product.materialSlug)?.label ?? '';
  const classification = findTerm(CLASSIFICATIONS, product.classificationSlug)?.label ?? '';
  const related: Product[] = useMemo(() => {
    if (!product) return [];
    // Typed relationships first (DB product_relationships graph), then fill
    // out with attribute-scored similar pieces from the live catalogue.
    const linked = product.relationships
      .map((r) => byId(r.targetId))
      .filter((p): p is Product => Boolean(p));
    const seen = new Set([product.id, ...linked.map((p) => p.id)]);
    const extras = similarProducts(product, products.filter((p: Product) => !seen.has(p.id)));
    return [...linked, ...extras].slice(0, 4);
  }, [product, products, byId]);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const sqftPrice = selected
    ? Math.round(selected.priceInr / ((selected.width.cm * selected.length.cm) / 929.03))
    : null;

  return (
    <div className="wrap" style={{ paddingBottom: 'clamp(64px,8vw,120px)' }}>
      {/* Breadcrumb mirrors the primary taxonomy path */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span>
        <Link to="/rugs">Rugs</Link><span aria-hidden="true">/</span>
        <Link to={`/rugs?tech=${product.techniqueSlug}`}>{tech}</Link><span aria-hidden="true">/</span>
        <Link to={`/rugs?material=${product.materialSlug}`}>{mat}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="pdp">
        {/* Gallery — thumbnail strip exposes every angle (5–15 per spec) */}
        <section aria-label={`Photography of ${product.name}`}>
          <div className={`gallery-main ${zoom ? 'zoomed' : ''}`} onClick={() => setZoom((z) => !z)} title={zoom ? 'Click to zoom out' : 'Click to zoom into weave detail'}>
            <img src={rugImage(product, angle, 1200, 900)} alt={`${product.name} — view ${angle + 1} of ${product.thumbnailCount}`} />
          </div>
          <div className="gallery-thumbs" role="tablist" aria-label="Product views">
            {Array.from({ length: product.thumbnailCount }, (_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === angle}
                aria-current={i === angle}
                aria-label={`View ${i + 1}: ${['full rug', 'weave macro', 'corner detail', 'fringe finish', 'styled in room'][i % 5]}`}
                onClick={() => { setAngle(i); setZoom(false); }}
              >
                <img src={rugImage(product, i, 184, 184)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </section>

        {/* Buy column */}
        <aside>
          <p className="eyebrow">{classification}</p>
          <h1 className="headline" style={{ marginBlock: '10px 6px' }}>{product.name}</h1>
          <p className="serif-italic muted">{product.tagline}</p>
          <p className="card-rating" style={{ marginTop: 12 }}>★ {product.rating.toFixed(1)} · {product.reviewsCount} verified reviews</p>

          <p style={{ margin: '22px 0 8px' }} className="subhead">
            {selected ? formatINR(selected.priceInr) : formatINR(Math.min(...product.variants.map((v) => v.priceInr)))}
            {sqftPrice != null && (
              <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 300 }}> &nbsp;≈ ₹{sqftPrice.toLocaleString('en-IN')} / sq ft</span>
            )}
          </p>

          {/* Colour swatches — variants combined, comparable side by side */}
          <div style={{ marginTop: 24 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Colour — {color.replace(/-/g, ' ')}</p>
            <div className="card-swatches" role="group" aria-label="Choose colour">
              {product.colorSlugs.map((c) => (
                <button
                  key={c}
                  className={`swatch ${c === color ? 'active' : ''}`}
                  style={{ background: colorHex(c) }}
                  aria-pressed={c === color}
                  aria-label={`Colour ${c.replace(/-/g, ' ')}`}
                  title={c.replace(/-/g, ' ')}
                  onClick={() => { setColor(c); setVariantId(null); }}
                />
              ))}
            </div>
          </div>

          {/* Size pills (child variants) */}
          <div style={{ marginTop: 24 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>Size — metric &amp; imperial</p>
            <div className="variant-row">
              {variantsInColor.map((v) => (
                <button
                  key={v.id}
                  className={`size-pill ${selected?.id === v.id ? 'active' : ''} ${v.stock === 0 ? 'oos' : ''}`}
                  aria-pressed={selected?.id === v.id}
                  onClick={() => setVariantId(v.id)}
                >
                  <span>{v.sizeLabel}</span>
                  <small>{v.stock === 0 ? 'Sold out' : `${formatINR(v.priceInr)} · ${v.stock} in atelier`}</small>
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-solid btn-block"
            style={{ marginTop: 30 }}
            disabled={!selected || selected.stock === 0}
            onClick={() => {
              if (!selected) return;
              cart.add(selected.id);
              notify(`Added ${product.name} — ${selected.sizeLabel} to your cart`);
            }}
          >
            {selected && selected.stock === 0 ? 'Notify me when rewoven' : 'Add to Cart'}
          </button>
          <p className="muted" style={{ fontSize: '0.75rem', marginTop: 14, letterSpacing: '0.06em' }}>
            Free insured shipping across India · 30-day returns · Each piece one-of-a-kind
          </p>

          <hr className="rule" style={{ margin: '34px 0' }} />

          {/* Tabs: Specifications / Craft story / Care */}
          <div className="tabs" role="tablist">
            {([['details', 'Specifications'], ['craft', 'Craft Story'], ['care', 'Care']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <table className="spec-table">
              <tbody>
                <tr><th scope="row">Classification</th><td>{classification}</td></tr>
                <tr><th scope="row">Technique</th><td>{tech}, placed by hand in Bhadohi</td></tr>
                <tr><th scope="row">Pile height</th><td>{product.specs.pileHeightMm} mm ({(product.specs.pileHeightMm / 25.4).toFixed(1)} in)</td></tr>
                <tr><th scope="row">Weight</th><td>{product.specs.weightKgPerSqm} kg/m² ({(product.specs.weightKgPerSqm * 0.2048).toFixed(2)} lb/sq ft)</td></tr>
                {product.specs.knotsPerSqIn !== undefined && (
                  <tr><th scope="row">Knot density</th><td>{product.specs.knotsPerSqIn} knots per square inch</td></tr>
                )}
                {product.specs.warpMaterial && (
                  <tr><th scope="row">Foundation</th><td>{product.specs.warpMaterial} warp &amp; weft</td></tr>
                )}
                {product.specs.weaveMonthsApprox !== undefined && (
                  <tr><th scope="row">Time on loom</th><td>≈ {product.specs.weaveMonthsApprox} months per piece</td></tr>
                )}
                <tr><th scope="row">Backing</th><td>{product.specs.backing}</td></tr>
                <tr><th scope="row">Origin</th><td>{product.specs.countryOfOrigin}</td></tr>
                <tr><th scope="row">Current size</th><td>{selected ? `${selected.width.cm} × ${selected.length.cm} cm (${selected.width.in}″ × ${selected.length.in}″)` : 'Select a size'}</td></tr>
              </tbody>
            </table>
          )}
          {tab === 'craft' && (
            <div>
              <p className="muted">{product.description}</p>
              <blockquote className="pull-quote" style={{ marginBlock: 26 }}>{product.craftStory}</blockquote>
              <Link to="/journal/persian-vs-turkish-knot" className="clear-all">Learn the knot languages →</Link>
            </div>
          )}
          {tab === 'care' && (
            <div>
              <p className="muted">{product.specs.careInstructions}</p>
              <ul style={{ marginTop: 16 }}>
                {[
                  'Use a natural-fibre underlay to prevent slippage and pile crush.',
                  'Rotate 180° every season for even light exposure.',
                  'Never steam-clean a silk blend at home.',
                  'Professional washing restores lanolin and prevents dry-rot.',
                ].map((li) => (
                  <li key={li} className="muted" style={{ fontSize: '0.9rem', marginBottom: 8, paddingLeft: 18, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--umber)' }}>—</span>{li}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Typed relationships from the PIM graph */}
      {related.length > 0 && (
        <section className="section" style={{ paddingTop: 40 }}>
          <Reveal>
            <div className="axis-head">
              <div>
                <p className="eyebrow">From the Same Loom</p>
                <h2 className="headline">Complete the look</h2>
              </div>
            </div>
          </Reveal>
          <div className="related-grid">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 90}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
