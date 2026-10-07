import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Carousel — the modern e-commerce slideshow primitive.
 *  • autoplay (pauses on hover / focus / reduced-motion)
 *  • swipe + drag support with pointer events (touch-friendly)
 *  • prev/next arrows, dot indicators, keyboard navigation
 *  • crossfade slides with a slow "Ken Burns" zoom on each image
 * Used by the homepage hero and the featured-products rail.
 */
export default function Carousel({
  slides,
  autoMs = 5200,
  className = '',
  label,
}: {
  slides: React.ReactNode[];
  autoMs?: number;
  className?: string;
  label: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  // Autoplay
  useEffect(() => {
    if (paused || n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), autoMs);
    return () => window.clearInterval(id);
  }, [paused, n, autoMs]);

  // Swipe / drag
  const dragX = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { dragX.current = e.clientX; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragX.current === null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { go(index + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { go(index - 1); e.preventDefault(); }
  };

  return (
    <div
      className={`carousel ${className}`}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { dragX.current = null; }}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          className={`carousel-slide ${i === index ? 'is-active' : ''}`}
          aria-hidden={i !== index}
        >
          {slide}
        </div>
      ))}

      {n > 1 && (
        <>
          <button
            className="carousel-arrow prev"
            aria-label="Previous slide"
            onClick={(e) => { e.stopPropagation(); go(index - 1); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <button
            className="carousel-arrow next"
            aria-label="Next slide"
            onClick={(e) => { e.stopPropagation(); go(index + 1); }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 5l7 7-7 7"/></svg>
          </button>
          <div className="carousel-dots" role="tablist" aria-label="Choose slide">
            {slides.map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1} of ${n}`}
                className={i === index ? 'active' : ''}
                onClick={(e) => { e.stopPropagation(); go(i); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
