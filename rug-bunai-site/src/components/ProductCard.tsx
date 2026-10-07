import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatINR, priceRange, type Product } from '../data/products';
import { COLORS, colorHex, findTerm, MATERIALS, TECHNIQUES } from '../data/vocabularies';
import { productImage } from '../lib/images';

/** Reveal-on-scroll wrapper (IntersectionObserver; honours reduced motion via CSS). */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && (setSeen(true), io.disconnect()),
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${seen ? 'in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/**
 * PLP card. Per discovery research: variants are combined into ONE list item
 * with colour swatches, and at least three additional thumbnails are exposed
 * on hover so shoppers can inspect weave/texture without clicking through.
 */
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const range = priceRange(product);
  const tech = findTerm(TECHNIQUES, product.techniqueSlug)?.label ?? 'Handmade';
  const mat = findTerm(MATERIALS, product.materialSlug)?.label ?? 'natural fibre';
  const sameSizeColors = [...new Set(product.variants.map((v) => v.colorSlug))];
  // 3 extra angle thumbnails beyond the hero (spec minimum), capped by design count
  const altAngles = [1, 2, 3].filter((i) => i < product.thumbnailCount);

  return (
    <article className="card">
      <div className="card-media">
        <Link to={`/rugs/${product.slug}`} aria-label={`${product.name} — view details`}>
          <img
            src={productImage(product, 0, 640, 480)}
            alt={`${product.name}, ${tech} ${mat.toLowerCase()} rug`}
            loading={eager ? 'eager' : 'lazy'}
            width={640}
            height={480}
          />
        </Link>
        <div className="card-alts" aria-hidden="true">
          {altAngles.map((i) => (
            <span key={i} className="alt-thumb">
              <img src={productImage(product, i, 120, 120)} alt="" loading="lazy" width={120} height={120} />
            </span>
          ))}
          <span className="alt-more">+{Math.max(product.thumbnailCount - 4, 0)}</span>
        </div>
        {product.bestSellerRank === 1 && <span className="tag" style={{ position: 'absolute', top: 12, left: 12 }}>Most coveted</span>}
        {product.addedDaysAgo <= 30 && <span className="tag" style={{ position: 'absolute', top: 12, right: 12 }}>New</span>}
      </div>
      <div className="card-body">
        <div className="card-row">
          <h3 className="card-name">
            <Link to={`/rugs/${product.slug}`}>{product.name}</Link>
          </h3>
          <p className="card-price">
            {range.min === range.max ? formatINR(range.min) : `From ${formatINR(range.min)}`}
          </p>
        </div>
        <p className="card-meta">{tech} · {mat}</p>
        <div className="card-swatches" role="group" aria-label="Available colours">
          {sameSizeColors.map((c) => (
            <span
              key={c}
              className="swatch"
              style={{ background: colorHex(c) }}
              title={findTerm(COLORS, c)?.label ?? c}
              aria-label={`Colour option: ${findTerm(COLORS, c)?.label ?? c.replace(/-/g, ' ')}`}
            />
          ))}
          <span className="muted" style={{ fontSize: '0.7rem', marginLeft: 4 }}>
            {product.variants.length} size{product.variants.length > 1 ? 's' : ''}
          </span>
        </div>
        <p className="card-rating">★ {product.rating.toFixed(1)} · {product.reviewsCount} reviews</p>
      </div>
    </article>
  );
}
