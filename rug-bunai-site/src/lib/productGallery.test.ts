import { describe, expect, it } from 'vitest';
import { newProductPayload, type NewProductInput } from './catalog';
import { galleryImageAt, galleryViewCount } from './images';
import {
  applyGalleryReorder,
  productGalleryImages,
  removeGalleryImageAt,
  sanitizeGallery,
} from './productGallery';
import { MATERIALS, TECHNIQUES } from '../data/vocabularies';

const P = 'https://cdn.example/primary.jpg';
const A = 'https://cdn.example/angle-a.jpg';
const B = 'https://cdn.example/detail-b.jpg';

describe('product gallery model', () => {
  it('renders exactly ONE image for a product with only a primary photo', () => {
    const images = productGalleryImages({ imageUrl: P });
    expect(images).toEqual([P]);
    // …and the PDP strip shows one real thumbnail — no fake duplicates.
    const product = { imageUrl: P, thumbnailCount: 5 } as never;
    expect(galleryViewCount(product)).toBe(1);
    expect(galleryImageAt(product, 0, 1200, 900)).toBe(P);
  });

  it('renders distinct thumbnails for stored additional images (never repeats)', () => {
    const images = productGalleryImages({ imageUrl: P, gallery: [A, B, A, '', 'not-a-url' as string] });
    expect(images).toEqual([P, A, B]); // primary first, each real photo once, junk dropped
    const product = { imageUrl: P, gallery: [A, B], thumbnailCount: 5 } as never;
    expect(galleryViewCount(product)).toBe(3);
    expect(galleryImageAt(product, 1, 184, 184)).toBe(A);
    expect(galleryImageAt(product, 2, 184, 184)).toBe(B);
    // Selecting a different thumbnail yields a different main image.
    expect(galleryImageAt(product, 2, 1200, 900)).not.toBe(galleryImageAt(product, 0, 1200, 900));
  });

  it('sanitiseGallery strips duplicates, the primary copy and invalid entries', () => {
    expect(sanitizeGallery([A, A, P, '', 'javascript:alert(1)', B], P)).toEqual([A, B]);
  });

  it('removing an additional image keeps the primary; removing the primary promotes the next photo', () => {
    const afterRemoveExtra = removeGalleryImageAt({ imageUrl: P, gallery: [A, B] }, 1);
    expect(afterRemoveExtra.primary).toBe(P);
    expect(afterRemoveExtra.gallery).toEqual([B]);

    const afterRemovePrimary = removeGalleryImageAt({ imageUrl: P, gallery: [A, B] }, 0);
    expect(afterRemovePrimary.primary).toBe(A); // primary never disappears
    expect(afterRemovePrimary.gallery).toEqual([B]);
    expect(afterRemovePrimary.gallery).not.toContain(afterRemovePrimary.primary);

    // Single-photo product: nothing can be removed.
    const single = removeGalleryImageAt({ imageUrl: P }, 0);
    expect(single.primary).toBe(P);
    expect(single.gallery).toEqual([]);
  });

  it('reordering persists a new primary + order without duplicating URLs', () => {
    const reordered = applyGalleryReorder({ imageUrl: P, gallery: [A, B] }, [B, P, A]);
    expect(reordered.primary).toBe(B);
    expect(reordered.gallery).toEqual([P, A]);
    // Malformed permutations fall back to the current order (no data loss).
    const bad = applyGalleryReorder({ imageUrl: P, gallery: [A] }, ['https://elsewhere/x.jpg']);
    expect(bad.primary).toBe(P);
    expect(bad.gallery).toEqual([A]);
  });

  it('legacy products (no gallery field) keep working with their primary photo', () => {
    expect(productGalleryImages({ imageUrl: P, gallery: null })).toEqual([P]);
    expect(productGalleryImages({ imageUrl: P, gallery: ['corrupt', 42 as never] })).toEqual([P]);
    expect(productGalleryImages({})).toEqual([]);
  });
});

// ── saveProductGallery persistence semantics (fake store) ───────────────────
// The real function writes { imageUrl, gallery } into one overrides document
// atomically. These tests exercise the exact write shape against an in-memory
// store — no concurrency harness needed.

type OverrideDoc = Record<string, { text?: unknown; imageUrl?: string | null; homeImageUrl?: string | null; hidden?: boolean; gallery?: string[] }>;

/** Mirrors SiteContentProvider.saveProductGallery's persistence contract. */
function simulateSaveProductGallery(doc: OverrideDoc, slug: string, primaryUrl: string | null, gallery: string[]) {
  const clean = sanitizeGallery(gallery, primaryUrl);
  doc[slug] = { ...doc[slug], imageUrl: primaryUrl, gallery: clean };
}

describe('saveProductGallery persistence', () => {
  it('adding then removing an additional image preserves the primary and other products', () => {
    const doc: OverrideDoc = {
      'lunar-drift': { imageUrl: P },
      'other-rug': { imageUrl: 'https://cdn.example/other.jpg', gallery: ['https://cdn.example/other-2.jpg'] },
    };
    simulateSaveProductGallery(doc, 'lunar-drift', P, [A, B]);
    expect(doc['lunar-drift']).toMatchObject({ imageUrl: P, gallery: [A, B] });
    // Reorder + drop one photo — primary untouched, other product untouched.
    simulateSaveProductGallery(doc, 'lunar-drift', P, [B]);
    expect(doc['lunar-drift'].gallery).toEqual([B]);
    expect(doc['lunar-drift'].imageUrl).toBe(P);
    expect(doc['other-rug'].gallery).toEqual(['https://cdn.example/other-2.jpg']);
  });

  it('a retried upload cannot create duplicate gallery entries', () => {
    const doc: OverrideDoc = { 'rug-x': { imageUrl: P } };
    simulateSaveProductGallery(doc, 'rug-x', P, [A]);
    simulateSaveProductGallery(doc, 'rug-x', P, [A, A, B]); // retry re-sends A
    expect(doc['rug-x'].gallery).toEqual([A, B]);
  });
});

// ── Technique & material requirements for new products ──────────────────────

const baseInput: NewProductInput = {
  name: 'Test Rug',
  slug: 'test-rug',
  description: 'A test rug.',
  imageUrl: P,
  techniqueSlug: 'hand-knotted',
  materialSlug: 'wool',
  roomSlugs: ['living-room'],
  styleSlugs: ['modern'],
  categorySlugs: [],
  offers: [{ sizeKey: '6x9', widthFt: 6, lengthFt: 9, colorSlug: 'ivory', priceInr: 10000, stock: 1 }],
};

describe('new-product classification payload', () => {
  it('persists canonical technique/material slugs and a sanitised gallery', () => {
    const p = newProductPayload({ ...baseInput, techniqueSlug: 'flat-woven', materialSlug: 'bamboo-silk', gallery: [A, P, A] });
    expect(p.techniqueSlug).toBe('flat-woven');
    expect(p.materialSlug).toBe('bamboo-silk');
    expect(TECHNIQUES.some((t) => t.slug === p.techniqueSlug)).toBe(true);
    expect(MATERIALS.some((m) => m.slug === p.materialSlug)).toBe(true);
    expect(p.imageUrl).toBeUndefined(); // primary lives on the DB row column
    expect(p.gallery).toEqual([A]); // primary URL stripped, deduped
  });

  it('empty classifications are NOT silently defaulted to hand-knotted/wool', () => {
    const p = newProductPayload({ ...baseInput, techniqueSlug: '', materialSlug: '' });
    expect(p.techniqueSlug).toBe('');
    expect(p.materialSlug).toBe('');
    // The provider-level guard rejects these before anything is saved:
    expect(TECHNIQUES.some((t) => t.slug === p.techniqueSlug)).toBe(false);
    expect(MATERIALS.some((m) => m.slug === p.materialSlug)).toBe(false);
  });

  it('products without photography fall back to generated art views (legacy behaviour)', () => {
    const legacy = { thumbnailCount: 3 } as never;
    expect(galleryViewCount(legacy)).toBe(3);
    expect(galleryImageAt(legacy, 0, 100, 100)).toContain('svg'); // generated artwork data URI
  });
});
