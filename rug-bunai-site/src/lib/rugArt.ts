import type { Product, Variant } from '../data/products';

// Rug imagery is generated as deterministic SVG weavings: pattern geometry is
// derived from the product's technique + style so each design reads distinctly,
// with a subtle woven-texture overlay standing in for commissioned photography
// until production assets arrive (per spec: macro detail must show weave & pile).

type Angle = 'full' | 'macro' | 'corner' | 'fringe' | 'lifestyle';

const PALETTES: Record<string, [string, string]> = {
  'hand-knotted': ['#EDE4D3', '#8A6B4F'],
  'hand-tufted': ['#E7E2D8', '#4C4A45'],
  'flat-woven': ['#F0E9DA', '#A2714B'],
  'loom-woven': ['#EAE6DE', '#5D5B57'],
};

/** Tiny deterministic PRNG so a seed always renders the same "photograph". */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
}

export function productRugImage(product: Product, angleIndex = 0, w = 900, h = 620): string {
  const variantColor = product.colorSlugs[angleIndex % product.colorSlugs.length];
  const accent = COLOR_HEX[variantColor] ?? '#8A6B4F';
  const [base, dark] = PALETTES[product.techniqueSlug] ?? PALETTES['hand-knotted'];
  const r = rng(product.imageSeed + ':' + angleIndex);
  const angle: Angle =
    angleIndex === 0 ? 'full' : angleIndex % 4 === 1 ? 'macro' : angleIndex % 4 === 2 ? 'corner' : angleIndex % 4 === 3 ? 'fringe' : 'lifestyle';

  const parts: string[] = [];
  parts.push(`<rect width="${w}" height="${h}" fill="#EFEAE0"/>`);

  // room floor backdrop for lifestyle/full shots
  if (angle === 'lifestyle') {
    parts.push(`<rect width="${w}" height="${h}" fill="#E4DDD0"/>`);
    parts.push(`<rect x="0" y="0" width="${w}" height="${h * 0.34}" fill="#D9D2C4"/>`);
  }

  const rx = angle === 'full' ? w * 0.12 : angle === 'lifestyle' ? w * 0.16 : 0;
  const ry = angle === 'full' ? h * 0.14 : angle === 'lifestyle' ? h * 0.4 : 0;
  const rw = angle === 'full' ? w * 0.76 : angle === 'lifestyle' ? w * 0.68 : w;
  const rh = angle === 'full' ? h * 0.7 : angle === 'lifestyle' ? h * 0.52 : h;

  if (angle !== 'macro' && angle !== 'corner' && angle !== 'fringe') {
    parts.push(`<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${base}"/>`);
  } else {
    parts.push(`<rect width="${w}" height="${h}" fill="${base}"/>`);
  }

  const fx = angle === 'macro' || angle === 'corner' || angle === 'fringe' ? 0 : rx;
  const fy = angle === 'macro' || angle === 'corner' || angle === 'fringe' ? 0 : ry;
  const fw = angle === 'macro' || angle === 'corner' || angle === 'fringe' ? w : rw;
  const fh = angle === 'macro' || angle === 'corner' || angle === 'fringe' ? h : rh;
  const scale = angle === 'macro' ? 3.2 : angle === 'corner' ? 1.8 : 1;

  // Pattern families by style vocabulary
  const style = product.styleSlugs[0];
  if (style === 'geometric') {
    const step = (fw / 10) * scale;
    for (let i = 0; i < 26; i++) {
      const x = fx + ((i * step) % fw);
      const y = fy + (i * step * 0.6) % fh;
      parts.push(
        `<path d="M ${x} ${y} l ${step / 2} ${step / 3} l -${step / 2} ${step / 3} l -${step / 2} -${step / 3} Z" fill="${i % 2 ? accent : dark}" opacity="${0.5 + r() * 0.3}"/>`,
      );
    }
  } else if (style === 'traditional') {
    // central medallion + border field
    const cx = fx + fw / 2, cy = fy + fh / 2;
    parts.push(`<rect x="${fx + 8}" y="${fy + 8}" width="${fw - 16}" height="${fh - 16}" fill="none" stroke="${dark}" stroke-width="${fh * 0.05}" opacity="0.75"/>`);
    for (let ring = 3; ring > 0; ring--) {
      const rr = fh * 0.1 * ring * scale;
      parts.push(
        `<path d="M ${cx} ${cy - rr} Q ${cx + rr} ${cy} ${cx} ${cy + rr} Q ${cx - rr} ${cy} ${cx} ${cy - rr} Z" fill="${ring % 2 ? accent : dark}" opacity="${0.35 + ring * 0.15}"/>`,
      );
    }
    for (let i = 0; i < 18; i++) {
      const px = fx + 20 + r() * (fw - 40), py = fy + 20 + r() * (fh - 40);
      parts.push(`<circle cx="${px}" cy="${py}" r="${2.5 * scale}" fill="${dark}" opacity="0.35"/>`);
    }
  } else if (style === 'abstract' || style === 'modern') {
    for (let i = 0; i < 7; i++) {
      const y = fy + (fh / 8) * (i + 1);
      const amp = fh * 0.05 * scale;
      parts.push(
        `<path d="M ${fx} ${y} C ${fx + fw * 0.3} ${y - amp}, ${fx + fw * 0.7} ${y + amp}, ${fx + fw} ${y - amp / 2}" stroke="${i % 2 ? accent : dark}" stroke-width="${(5 + r() * 10) * scale}" fill="none" opacity="${0.28 + r() * 0.4}" stroke-linecap="round"/>`,
      );
    }
  } else {
    // botanical
    for (let i = 0; i < 22; i++) {
      const x = fx + r() * fw, y = fy + r() * fh;
      const s = (6 + r() * 10) * scale;
      parts.push(
        `<path d="M ${x} ${y} q ${s} -${s} ${2 * s} 0 q -${s} ${s} -${2 * s} 0 Z" fill="${i % 2 ? accent : dark}" opacity="${0.4 + r() * 0.35}"/>`,
      );
    }
  }

  // Woven texture overlay — horizontal weft lines, denser for macro angles
  const lineGap = angle === 'macro' ? 5 : 9;
  let tex = '';
  for (let y = 0; y < h; y += lineGap) tex += `M0 ${y} H${w}`;
  parts.push(`<path d="${tex}" stroke="#191919" stroke-width="1" opacity="0.07"/>`);
  if (angle === 'macro' || angle === 'fringe') {
    let warp = '';
    for (let x = 0; x < w; x += 4) warp += `M${x} 0 V${h}`;
    parts.push(`<path d="${warp}" stroke="#191919" stroke-width="0.6" opacity="0.06"/>`);
  }

  if (angle === 'fringe') {
    for (let x = 10; x < w; x += 14) {
      parts.push(`<path d="M ${x} ${h * 0.72} q ${(r() - 0.5) * 10} ${h * 0.14} ${(r() - 0.5) * 16} ${h * 0.26}" stroke="${dark}" stroke-width="2" fill="none" opacity="0.6"/>`);
    }
    parts.push(`<rect y="0" width="${w}" height="${h * 0.72}" fill="${accent}" opacity="0.85"/>`);
  }

  if (angle === 'lifestyle') {
    // furniture shadow to stage the room
    parts.push(`<ellipse cx="${w * 0.32}" cy="${h * 0.3}" rx="${w * 0.2}" ry="${h * 0.06}" fill="#000" opacity="0.08"/>`);
    parts.push(`<rect x="${w * 0.14}" y="${h * 0.06}" width="${w * 0.36}" height="${h * 0.2}" rx="8" fill="#CFC6B4" opacity="0.9"/>`);
  }

  // soft vignette for photographic depth
  parts.push(
    `<radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#3a2f22" stop-opacity="0.22"/></radialGradient><rect width="${w}" height="${h}" fill="url(#v)"/>`,
  );

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('')}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const COLOR_HEX: Record<string, string> = {
  ivory: '#F3EDE2', sand: '#D8C7A9', taupe: '#A89684', charcoal: '#3B3A38',
  'deep-brown': '#5A4232', navy: '#2C3A4D', sage: '#9AA88F', terracotta: '#B0714F', black: '#191919',
};

export function swatch(colorSlug: string, hex: string): string {
  void colorSlug;
  return hex;
}

export type { Variant };
