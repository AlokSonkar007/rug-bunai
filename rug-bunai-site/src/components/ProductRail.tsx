import { useRef, useState } from 'react';
import type { Product } from '../data/products';
import { ProductCard } from './ProductCard';

/**
 * ProductRail — a snap-scrolling horizontal "catalogue rail" of products,
 * the pattern every modern storefront (Zara, West Elm, RH) uses for
 * curated collections on mobile & tablet. Arrows appear on pointer devices;
 * touch users simply swipe. Items never squish — they keep a fixed card width.
 */
export default function ProductRail({ products, imageMode = 'catalogue' }: { products: readonly Product[]; imageMode?: 'catalogue' | 'homepage' }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.8, 260);
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  };

  return (
    <div className="rail-wrap">
      <div className="rail" ref={scroller} onScroll={measure}>
        {products.map((p) => (
          <div className="rail-item" key={p.id}>
            <ProductCard product={p} imageMode={imageMode} />
          </div>
        ))}
      </div>
      <button
        className="rail-arrow prev"
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        style={{ opacity: edges.start ? 0.3 : 1 }}
        disabled={edges.start}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <button
        className="rail-arrow next"
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        style={{ opacity: edges.end ? 0.3 : 1 }}
        disabled={edges.end}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5l7 7-7 7"/></svg>
      </button>
    </div>
  );
}
