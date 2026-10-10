// ─────────────────────────────────────────────────────────────────────────────
// SITE CONTENT STORE — every marketing text & image on the storefront is
// editable from the Studio (admin). Values are deep-merged over defaults so
// partial edits never wipe other fields. Persisted to Supabase table
// `site_content` when configured, and mirrored to localStorage for instant,
// offline-safe reads (falls back gracefully when Supabase is not set up).
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type { Product } from '../data/products';
import { supabase } from './supabase';

export const WHATSAPP_NUMBER = '919555036025'; // +91-9555036025
export const CONTACT_PHONE_DISPLAY = '+91 95550 36025';
export const WHATSAPP_TEL_HREF = `tel:+${WHATSAPP_NUMBER}`; // +91-9555036025
export const whatsappLink = (text: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

// ── Shape of editable content ─────────────────────────────────────────────────

export interface HeroSlideContent {
  eyebrow: string;
  title1: string;
  title2: string;
  sub: string;
  ctaLabel: string;
  ctaTo: string;
  altCtaLabel: string;
  altCtaTo: string;
  imageUrl: string | null; // null → generated rug art fallback
  productSlug: string;      // fallback seed product for generated art
}

export interface StatContent { value: string; label: string; }
export interface TileContent { title: string; blurb: string; to: string; imageUrl: string | null; }
export interface SplitBlockContent {
  eyebrow: string; title: string; body1: string; body2?: string;
  primaryLabel: string; primaryTo: string; secondaryLabel?: string; secondaryTo?: string;
  imageUrl: string | null; productSlug: string;
}
export interface RailContent { eyebrow: string; title: string; linkLabel: string; linkTo: string; }
export interface RoomTileContent extends TileContent { countSuffix: string; }

/** Editable intro copy for a curated collection page (keyed by category slug). */
export interface CollectionContent { title: string; description: string; imageUrl: string | null; }

/** Shared, customer-facing text rendered outside the homepage sections. */
export interface FooterColumnContent { heading: string; links: Array<{ label: string; to: string }>; }
export interface ContactContent { title: string; body: string; note: string; }

export interface SiteContent {
  topbar: string;
  heroSlides: HeroSlideContent[];
  stats: StatContent[];
  newArrivalsRail: RailContent;
  bestSellersRail: RailContent;
  techniqueHeading: { eyebrow: string; title: string };
  techniqueTiles: TileContent[];
  craftSplit: SplitBlockContent;
  roomsBand: { eyebrow: string; title: string };
  roomTiles: RoomTileContent[];
  inspirationSplit: SplitBlockContent;
  colourBand: { eyebrow: string; title: string; sub: string };
  newsletter: { eyebrow: string; title: string; note: string };
  footer: { about: string; phone: string };
  /** Per-collection intro copy, keyed by curated category slug. */
  collections: Record<string, CollectionContent>;
  /** Shared website content (announcement bar is `topbar`; footer columns; contact page). */
  footerColumns: FooterColumnContent[];
  contact: ContactContent;
}

// ── Defaults (current live copy) ──────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const DEFAULT_CONTENT: SiteContent = {
  topbar: 'Free shipping across India · Handwoven in Bhadohi since 1982',
  heroSlides: [
    {
      eyebrow: 'The Weaving Coast of Uttar Pradesh',
      title1: 'Before it was a rug,', title2: 'it was a language.',
      sub: 'For five centuries, the looms of Bhadohi have translated sketch-books kept by weaver families into wool, silk and shadow.',
      ctaLabel: 'Explore the Archive', ctaTo: '/rugs',
      altCtaLabel: 'The Craft Story', altCtaTo: '/story',
      imageUrl: null, productSlug: 'kashmiri-rose-medallion',
    },
    {
      eyebrow: 'Hand-Knotted Archive',
      title1: 'One knot per pixel.', title2: 'Eleven months per floor.',
      sub: 'The asymmetric Persian knot lets a karigar draw the curl of a vine — the reason our floral fields breathe.',
      ctaLabel: 'Explore the Archive', ctaTo: '/rugs',
      altCtaLabel: 'The Craft Story', altCtaTo: '/story',
      imageUrl: null, productSlug: 'mughal-garden-floral',
    },
    {
      eyebrow: 'Warm Minimalism',
      title1: 'Texture holds light', title2: 'the way colour cannot.',
      sub: 'In a pared-back room, a hand-loomed neutral anchors everything — start from your floor plan.',
      ctaLabel: 'Explore the Archive', ctaTo: '/rugs',
      altCtaLabel: 'The Craft Story', altCtaTo: '/story',
      imageUrl: null, productSlug: 'desert-line-geometric',
    },
  ],
  stats: [
    { value: '1982', label: 'Kilns lit since — four decades unbroken' },
    { value: '169', label: 'Knots per square inch, our finest archive piece' },
    { value: '11', label: 'Months on the loom for a single masterpiece' },
    { value: '100%', label: 'Hand-finished, natural fibres, no synthetic backing' },
  ],
  newArrivalsRail: { eyebrow: 'Fresh off the Loom', title: 'New this season', linkLabel: 'View all →', linkTo: '/rugs?sort=newest' },
  bestSellersRail: { eyebrow: 'Most Coveted', title: 'Chosen again and again', linkLabel: 'View all →', linkTo: '/rugs?sort=best-selling' },
  techniqueHeading: { eyebrow: 'By Technique & Material', title: 'Choose how it was made' },
  techniqueTiles: [
    { title: 'Hand-Knotted', blurb: 'A knot for every pixel', to: '/c/rugs/hand-knotted/wool', imageUrl: null },
    { title: 'Hand-Tufted', blurb: 'Carved relief, punched by hand', to: '/c/rugs/hand-tufted/wool', imageUrl: null },
    { title: 'Flat-Woven', blurb: 'Pattern as structure', to: '/c/rugs/flat-woven/cotton', imageUrl: null },
    { title: 'Loom-Woven', blurb: 'Sheen woven lengthwise', to: '/c/rugs/loom-woven/bamboo-silk', imageUrl: null },
  ],
  craftSplit: {
    eyebrow: 'The Persian Knot',
    title: 'Why curves need an asymmetric knot',
    body1: 'A symmetric Turkish knot locks the pattern into straight geometry. The asymmetric Senneh knot — half-wrapped around its warp — lets a Bhadohi karigar draw the curl of a vine or the eye of a medallion. It is slower, harder, and the reason our floral fields breathe.',
    body2: 'Read the full field guide in the Journal, then see the technique in the pieces themselves.',
    primaryLabel: 'Read the Field Guide', primaryTo: '/journal/persian-vs-turkish-knot',
    secondaryLabel: 'Hand-Knotted Rugs', secondaryTo: '/rugs?tech=hand-knotted',
    imageUrl: null, productSlug: 'mughal-garden-floral',
  },
  roomsBand: { eyebrow: 'By Room & Use', title: 'Start from your floor plan' },
  roomTiles: [
    { title: 'Living Room', blurb: 'designs', to: '/rugs?room=living-room', imageUrl: null, countSuffix: '' },
    { title: 'Bedroom', blurb: 'designs', to: '/rugs?room=bedroom', imageUrl: null, countSuffix: '' },
    { title: 'Dining Room', blurb: 'designs', to: '/rugs?room=dining-room', imageUrl: null, countSuffix: '' },
    { title: 'Kids Room', blurb: 'designs', to: '/rugs?room=kids-room', imageUrl: null, countSuffix: '' },
    { title: 'Hallway', blurb: 'designs', to: '/rugs?room=hallway', imageUrl: null, countSuffix: '' },
    { title: 'Office', blurb: 'designs', to: '/rugs?room=office', imageUrl: null, countSuffix: '' },
  ],
  inspirationSplit: {
    eyebrow: 'Interior Inspiration',
    title: 'Warm minimalism lives underfoot',
    body1: 'In a pared-back room, texture does what colour cannot: it holds light, softens sound, and makes restraint feel generous. Our sizing guide walks through the three front-leg rules that decide whether a rug anchors a room or floats in it.',
    primaryLabel: 'How to Choose the Right Size', primaryTo: '/journal/rug-size-guide',
    imageUrl: null, productSlug: 'desert-line-geometric',
  },
  colourBand: {
    eyebrow: 'Shop by Colour',
    title: 'Find your palette',
    sub: 'The house palette, drawn straight from our looms — choose a shade to see every design woven in it.',
  },
  newsletter: {
    eyebrow: 'The Loom Letter',
    title: 'One story, one new weave, monthly.',
    note: 'No noise. Unsubscribe anytime.',
  },
  footer: {
    about: 'Guardians of a weaving tradition older than any single family — each rug knotted, washed and finished by hand in Uttar Pradesh.',
    phone: CONTACT_PHONE_DISPLAY,
  },
  collections: {},
  footerColumns: [
    {
      heading: 'Collections',
      links: [
        { label: 'Hand-Knotted Rugs', to: '/rugs?tech=hand-knotted' },
        { label: 'Shaggy Carpets', to: '/collections/shaggy-carpets' },
        { label: 'Floral Carpets', to: '/collections/floral-carpets' },
        { label: 'Geometrical Carpets', to: '/collections/geometrical-carpets' },
        { label: 'All Rugs', to: '/rugs' },
      ],
    },
    {
      heading: 'The House',
      links: [
        { label: 'Craft Story', to: '/story' },
        { label: 'Journal', to: '/journal' },
        { label: 'Contact', to: '/contact' },
        { label: 'Wishlist', to: '/wishlist' },
      ],
    },
    {
      heading: 'Support',
      links: [
        { label: 'Shipping Policy', to: '/policies/shipping-policy' },
        { label: 'Returns & Exchange', to: '/policies/returns' },
        { label: 'Care Guide', to: '/journal/rug-size-guide' },
        { label: 'Privacy Policy', to: '/policies/privacy-policy' },
      ],
    },
  ],
  contact: {
    title: 'Speak with the atelier.',
    body: 'Tell us the room, the size and the shade you are chasing — a weaver or designer replies personally, usually within one working day.',
    note: 'Wholesale, hospitality and bespoke loom orders welcome.',
  },
};

// ── Deep merge (arrays replace wholesale; objects recurse) ───────────────────

type Rec = Record<string, unknown>;
const isPlainObject = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch)) return base;
  if (isPlainObject(base)) {
    const out: Rec = { ...(base as unknown as Rec) };
    for (const [k, v] of Object.entries(patch)) {
      // Arrays REPLACE wholesale — a saved heroSlides/roomTiles array must
      // never be element-merged into the defaults (that silently dropped
      // hydrated image URLs and other per-slide values).
      out[k] = Array.isArray(v) || !(k in out) ? v : deepMerge(out[k], v);
    }
    return out as unknown as T;
  }
  return (patch as unknown) as T;
}

// ── Persistence keys / helpers ────────────────────────────────────────────────

export const LS_KEY = 'rugbunai-site-content-v1';
export const LS_OVERRIDES = 'rugbunai-product-overrides-v1';

/** The `site_content.data` JSONB payload: the SiteContent object plus the
 *  homepage-only product photo/text overrides stored alongside it. */
export type StoredSitePayload = Partial<SiteContent> & { productOverrides?: ProductOverrideMap };

/** A site_content.data payload as stored: the SiteContent object, the
 *  homepage-only product overrides, and the optimistic-concurrency stamps. */
export type StoredSiteRecord = Record<string, unknown>;

/** Split a persisted payload into (content, overrides) merged over defaults.
 *  Shared by hydration and save-time reload so the two paths can never drift —
 *  notably, `productOverrides` must be restored on every read path, not just
 *  when saving from the Studio. */
export function splitStoredPayload(saved: StoredSiteRecord | null | undefined): [SiteContent, ProductOverrideMap] {
  if (!saved) return [DEFAULT_CONTENT, {}];
  const { productOverrides: ov, _rev: _r, _savedAt: _s, ...rest } = saved;
  return [deepMerge(DEFAULT_CONTENT, rest), (ov ?? {}) as ProductOverrideMap];
}

// ── Stale-write guard ─────────────────────────────────────────────────────────
// Every successful write to site_content.data stamps `_rev` (monotonic counter)
// and `_savedAt`. Writes are sent with `.eq('data->>_rev', <expected>)` so the
// update matches zero rows if another session changed the content after it was
// read (Postgres evaluates the WHERE clause against the current row). The
// client then re-reads and merges instead of clobbering the newer content.
const REV_KEY = '_rev';
const SAVED_AT_KEY = '_savedAt';

function revOf(payload: StoredSiteRecord): number {
  const v = payload[REV_KEY];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function withStamp(payload: StoredSiteRecord, baseRev: number): StoredSiteRecord {
  return { ...payload, [SAVED_AT_KEY]: new Date().toISOString(), [REV_KEY]: baseRev + 1 };
}

/**
 * Editable product text. `specs` patches only the copy fields inside the
 * specifications object (care instructions) — numeric business attributes
 * like pile height or knot density are never touched by content edits.
 */
export type TextOverride = Partial<Pick<Product, 'name' | 'tagline' | 'description' | 'craftStory' | 'colorSlugs' | 'colourOptions'>>
  & { specs?: { careInstructions?: string }; customRatePerSqFt?: number | null; /** Admin copy for the PDP Specifications table. */ specNotes?: string };
export type ProductOverrideMap = Record<string, { text?: TextOverride; imageUrl?: string | null; homeImageUrl?: string | null; hidden?: boolean }>;

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

export type SiteContentCtx = {
  content: SiteContent;
  /** Admin-only: full catalogue including hidden entries, with text/image overrides applied. */
  productOverrides: ProductOverrideMap;
  saveContent: (patch: Partial<SiteContent>) => Promise<void>;
  saveCollectionContent: (categorySlug: string, patch: Partial<CollectionContent>) => Promise<void>;
  saveProductText: (slugKey: string, text: TextOverride) => Promise<void>;
  /** Edit just the Care-instructions copy of a product. */
  saveProductCare: (slugKey: string, careInstructions: string) => Promise<void>;
  saveProductImage: (slugKey: string, url: string | null) => Promise<void>;
  /** Homepage-only photo override — does not change the catalogue/PDP image. */
  saveProductHomeImage: (slugKey: string, url: string | null) => Promise<void>;
  saveProductHidden: (slugKey: string, hidden: boolean) => Promise<void>;
  resetAll: () => Promise<void>;
  saving: boolean;
};

export const CtxForTest = createContext<SiteContentCtx | null>(null);
const Ctx = CtxForTest;

export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<SiteContent>(() =>
    deepMerge(DEFAULT_CONTENT, readLS<Partial<SiteContent>>(LS_KEY, {})));
  const [productOverrides, setProductOverrides] = useState<ProductOverrideMap>(() =>
    readLS<ProductOverrideMap>(LS_OVERRIDES, {}));
  const [saving, setSaving] = useState(false);
  // Optimistic-concurrency anchor for site_content.data. Seeded by hydration,
  // advanced by every successful write. `null` = nothing read yet this session.
  const revRef = useRef<number | null>(null);
  // True once a save completes in this session. Hydration may only take over
  // the UI state while this is false — a slow initial Supabase response must
  // never overwrite content the admin just saved successfully.
  const savedThisSessionRef = useRef(false);

  // Hydrate from Supabase once (row with id 1), fall back silently.
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    void (async () => {
      try {
        const { data } = await supabase.from('site_content').select('data').eq('id', 1).maybeSingle();
        const saved = (data as { data?: StoredSiteRecord } | null)?.data;
        if (cancelled || !saved) return;
        if (revRef.current === null) revRef.current = revOf(saved);
        // Never clobber a save that already succeeded this session.
        if (savedThisSessionRef.current) return;
        const [nextContent, nextOverrides] = splitStoredPayload(saved);
        setContent(nextContent);
        setProductOverrides(nextOverrides);
        localStorage.setItem(LS_KEY, JSON.stringify(nextContent));
        localStorage.setItem(LS_OVERRIDES, JSON.stringify(nextOverrides));
      } catch { /* keep local copy */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Read row 1 and return its payload + revision. Throws on read failure so a
   *  caller can never treat "could not read" as "no saved content". */
  const fetchRow = useCallback(async (): Promise<{ payload: StoredSiteRecord | null; rev: number }> => {
    if (!supabase) return { payload: null, rev: 0 };
    const { data, error } = await supabase.from('site_content').select('data').eq('id', 1).maybeSingle();
    if (error) throw new Error(`Could not read saved content: ${error.message}`);
    const payload = ((data as { data?: StoredSiteRecord } | null)?.data) ?? null;
    return { payload, rev: payload ? revOf(payload) : 0 };
  }, []);

  const persist = useCallback(async (next: SiteContent, overrides: ProductOverrideMap): Promise<void> => {
    setSaving(true);
    try {
      if (supabase) {
        // Shared persistence first — a failed write must NOT look like success.
        const baseRev = revRef.current ?? 0;
        const stamped: StoredSiteRecord = withStamp(
          { ...next, productOverrides: overrides } as unknown as StoredSiteRecord,
          baseRev,
        );
        const existing = await fetchRow();
        if (existing.payload && existing.rev > baseRev) {
          // Another session saved since our last read — merge OUR intended
          // change on top of their newer content instead of clobbering it.
          const [freshContent, freshOverrides] = splitStoredPayload(existing.payload);
          const merged = deepMerge(freshContent, next) as SiteContent;
          const mergedOverrides: ProductOverrideMap = { ...freshOverrides };
          for (const [k, v] of Object.entries(overrides)) mergedOverrides[k] = { ...mergedOverrides[k], ...v };
          await persist(merged, mergedOverrides); // re-stamps at currentRev+1
          return;
        }
        const { error } = existing.payload
          // CAS: only update while data->>_rev still equals what we read. If a
          // concurrent write landed between fetchRow and here, zero rows match
          // — PostgREST does not report that as an error, so verify below.
          ? await supabase.from('site_content')
              .update({ data: stamped, updated_at: new Date().toISOString() })
              .eq('id', 1).eq(`data->>${REV_KEY}`, String(existing.rev))
          : await supabase.from('site_content').insert({ id: 1, data: stamped });
        if (error) throw new Error(`Could not save content: ${error.message}`);
        // Confirm the write actually landed (a zero-match CAS surfaces here).
        const after = await fetchRow();
        if (!after.payload || revOf(after.payload) !== revOf(stamped)) {
          throw new Error('Could not save content: another edit changed the homepage while saving. Please retry.');
        }
        revRef.current = revOf(after.payload);
      }
      // Local mirror only after a successful remote write (or when Supabase is
      // not configured at all — then the browser is the only available store).
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      localStorage.setItem(LS_OVERRIDES, JSON.stringify(overrides));
      setContent(next);
      setProductOverrides(overrides);
      savedThisSessionRef.current = true;
    } finally {
      setSaving(false);
    }
  }, [fetchRow]);

  const loadPair = useCallback(async (): Promise<[SiteContent, ProductOverrideMap]> => {
    if (supabase) {
      // Authoritative reload for save-time merging. A read failure must
      // surface loudly — silently falling back to stale localStorage caused
      // saves to be built on outdated content.
      const { payload } = await fetchRow();
      if (payload) {
        revRef.current = revOf(payload);
        return splitStoredPayload(payload);
      }
      revRef.current = 0; // no row yet — the first write will create it
    }
    return [
      deepMerge(DEFAULT_CONTENT, readLS<Partial<SiteContent>>(LS_KEY, {})),
      readLS<ProductOverrideMap>(LS_OVERRIDES, {}),
    ];
  }, [fetchRow]);

  const saveContent = useCallback(async (patch: Partial<SiteContent>) => {
    const [cur, ov] = await loadPair();
    await persist(deepMerge(cur, patch) as SiteContent, ov);
  }, [loadPair, persist]);

  /** Edit one collection's intro copy without touching any other collection. */
  const saveCollectionContent = useCallback(async (categorySlug: string, patch: Partial<CollectionContent>) => {
    const [cur, ov] = await loadPair();
    const next: SiteContent = {
      ...cur,
      collections: { ...cur.collections, [categorySlug]: { ...cur.collections[categorySlug], ...patch } },
    };
    await persist(next, ov);
  }, [loadPair, persist]);

  const saveProductText = useCallback(async (productSlug: string, text: TextOverride) => {
    const [cur, ov] = await loadPair();
    // Merge specs patches so editing Care never wipes the rest of `specs`.
    const prevText = ov[productSlug]?.text;
    const mergedText: TextOverride = prevText && text.specs
      ? { ...prevText, ...text, specs: { ...(prevText.specs ?? {}), ...text.specs } }
      : { ...prevText, ...text };
    await persist(cur, { ...ov, [productSlug]: { ...ov[productSlug], text: mergedText } });
  }, [loadPair, persist]);

  /** Edit only the Care-instructions copy without touching colour options etc. */
  const saveProductCare = useCallback(async (productSlug: string, careInstructions: string) => {
    await saveProductText(productSlug, { specs: { careInstructions } });
  }, [saveProductText]);

  const saveProductImage = useCallback(async (productSlug: string, imageUrl: string | null) => {
    const [cur, ov] = await loadPair();
    await persist(cur, { ...ov, [productSlug]: { ...ov[productSlug], imageUrl } });
  }, [loadPair, persist]);

  /** Persist a homepage-specific photo for one product without touching its
      catalogue image (`imageUrl`) or any other field of the record. */
  const saveProductHomeImage = useCallback(async (productSlug: string, homeImageUrl: string | null) => {
    const [cur, ov] = await loadPair();
    await persist(cur, { ...ov, [productSlug]: { ...ov[productSlug], homeImageUrl } });
  }, [loadPair, persist]);

  const saveProductHidden = useCallback(async (productSlug: string, hidden: boolean) => {
    const [cur, ov] = await loadPair();
    await persist(cur, { ...ov, [productSlug]: { ...ov[productSlug], hidden } });
  }, [loadPair, persist]);

  const resetAll = useCallback(async () => {
    await persist(DEFAULT_CONTENT, {});
  }, [persist]);

  const value = useMemo<SiteContentCtx>(() => ({
    content, productOverrides, saveContent, saveCollectionContent, saveProductText, saveProductCare, saveProductImage, saveProductHomeImage, saveProductHidden, resetAll, saving,
  }), [content, productOverrides, saveContent, saveCollectionContent, saveProductText, saveProductCare, saveProductImage, saveProductHomeImage, saveProductHidden, resetAll, saving]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteContent(): SiteContentCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSiteContent must be used inside SiteContentProvider.');
  return ctx;
}

/** Convenience export used by tiles that derive their href from a title. */
export const tileSlug = slug;
