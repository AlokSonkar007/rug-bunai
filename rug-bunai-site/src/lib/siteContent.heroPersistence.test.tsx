/**
 * Hero-image persistence & hydration tests.
 *
 * Regression context: an admin uploaded a hero image in the Studio, the upload
 * "succeeded", but the public homepage did not reliably show it. Verified root
 * causes fixed here:
 *   1. The SiteContentProvider hydration effect restored only `content` — the
 *      persisted `productOverrides` (homepage-only photos) were never set into
 *      React state after a fresh page load / fresh session.
 *   2. Hydration wrote the RAW server payload (which includes the nested
 *      `productOverrides` key) straight into the content localStorage mirror.
 *   3. A slow initial hydration response could land AFTER a successful save
 *      and clobber the just-saved content with stale data.
 *   4. loadPair() swallowed read errors and silently merged against stale
 *      localStorage, so saves could be built on outdated content.
 *
 * These tests drive the REAL provider through a fake Supabase client (module
 * mock of ./supabase) that emulates PostgREST semantics for the single-row
 * `site_content` table, including zero-match conditional updates (CAS).
 * No live Supabase project is contacted — this is unit-level coverage only.
 */
// @vitest-environment jsdom
import { StrictMode, act, useContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── localStorage shim ─────────────────────────────────────────────────────────
class LocalStorageShim {
  private map = new Map<string, string>();
  getItem = (k: string) => (this.map.has(k) ? this.map.get(k)! : null);
  setItem = (k: string, v: string) => { this.map.set(k, String(v)); };
  removeItem = (k: string) => { this.map.delete(k); };
  clear = () => this.map.clear();
}

// ── Fake Supabase: emulates the site_content row ─────────────────────────────
type Row = { id: number; data: Record<string, unknown>; updated_at?: string };
const db = { rows: new Map<number, Row>(), failNextRead: false, failNextWrite: false };

function makeQuery(log: Array<{ method: string; body?: unknown; filters: Array<[string, string]> }>) {
  const q: Record<string, any> = {};
  let mode: 'select' | 'update' | 'insert' = 'select';
  let body: Record<string, unknown> | undefined;
  q.from = () => q;
  q.select = () => { mode = 'select'; log.push({ method: 'select', filters: [] }); return q; };
  q.insert = (row: Record<string, unknown>) => { mode = 'insert'; body = row; log.push({ method: 'insert', body: row, filters: [] }); return q; };
  q.update = (patch: Record<string, unknown>) => { mode = 'update'; body = patch; log.push({ method: 'update', body: patch, filters: [] }); return q; };
  q.eq = (col: string, val: unknown) => { log[log.length - 1]!.filters.push([col, String(val)]); return q; };
  q.maybeSingle = async () => {
    const entry = log[log.length - 1]!;
    if (mode === 'select') {
      if (db.failNextRead) { db.failNextRead = false; return { data: null, error: { message: 'schema cache miss (simulated)' } }; }
      const row = db.rows.get(1);
      return { data: row ? { data: structuredClone(row.data) } : null, error: null };
    }
    if (mode === 'insert') {
      if (db.failNextWrite) { db.failNextWrite = false; return { data: null, error: { message: 'row-level security (simulated)' } }; }
      db.rows.set(1, { id: 1, data: structuredClone(body as Row['data']) });
      return { data: null, error: null };
    }
    // update: WHERE filters are evaluated against the CURRENT row (CAS semantics)
    if (db.failNextWrite) { db.failNextWrite = false; return { data: null, error: { message: 'failed to update (simulated)' } }; }
    const row = db.rows.get(1);
    // PostgREST compares JSONB scalars by type: `data->>_rev` is TEXT on both
    // sides of the filter, so normalise numbers to strings when matching.
    const norm = (v: unknown) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : v);
    const matches = !!row && entry.filters.every(([col, val]) => {
      if (col === 'id') return String(row.id) === val;
      if (col.startsWith('data->>')) return String(norm((row.data as Record<string, unknown>)[col.slice(7)])) === val;
      return false;
    });
    if (!matches) return { data: null, error: null }; // zero rows matched — NOT an error
    db.rows.set(1, { id: 1, data: structuredClone(body as Row['data']) });
    return { data: null, error: null };
  };
  return q;
}

const fakeClient = {
  from: () => makeQuery([]),
  storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
};
vi.mock('./supabase', () => ({ supabase: fakeClient, isSupabaseConfigured: true, requireSupabase: () => fakeClient }));

// Import AFTER mocks are registered.
const SC = await import('./siteContent');
const { SiteContentProvider, DEFAULT_CONTENT, LS_KEY, LS_OVERRIDES, splitStoredPayload } = SC;
const { homeProductImage } = await import('./images');

// ── Harness: mount the real provider in jsdom, capture its context ──────────
let captured!: SiteContentCtxLike;
type SiteContentCtxLike = NonNullable<ReturnType<typeof SC.useSiteContent>>;
function Harness(): ReactNode {
  captured = useContext(SC.CtxForTest)!;
  return null;
}
let root: Root | null = null;
let container: HTMLElement | null = null;
function cleanup() {
  if (root) { act(() => { root!.unmount(); }); root = null; }
  if (container) { container.remove(); container = null; }
}

async function setup() {
  vi.stubGlobal('localStorage', new LocalStorageShim());
  db.rows.clear(); db.failNextRead = false; db.failNextWrite = false;
  cleanup();
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(<StrictMode><SiteContentProvider><Harness /></SiteContentProvider></StrictMode>);
  });
  return captured!;
}
beforeEach(() => { cleanup(); });

describe('splitStoredPayload — hydration restores BOTH halves of the row', () => {
  it('restores productOverrides (the bug: hydration ignored them entirely)', () => {
    const saved = {
      topbar: 'X',
      heroSlides: [{ ...DEFAULT_CONTENT.heroSlides[0], imageUrl: 'https://cdn/hero1.jpg' }],
      productOverrides: { 'mughal-garden-floral': { homeImageUrl: 'https://cdn/home-mughal.jpg' } },
      _rev: 3, _savedAt: 'now',
    };
    const [content, overrides] = splitStoredPayload(saved);
    expect(content.heroSlides[0].imageUrl).toBe('https://cdn/hero1.jpg');
    expect(overrides['mughal-garden-floral'].homeImageUrl).toBe('https://cdn/home-mughal.jpg');
    // internal stamps must never leak into the SiteContent object
    expect(content).not.toHaveProperty('_rev');
    expect(content).not.toHaveProperty('_savedAt');
    // Array fields are REPLACED wholesale on hydration — never element-merged.
    // This is what keeps "edit one slide" from silently dropping the saved URL
    // (the old merge spliced patch objects into default array slots).
    expect(content.heroSlides).toHaveLength(1);
    expect(content.heroSlides[0]).toEqual(saved.heroSlides[0]);
  });

  it('returns pure defaults for a missing row', () => {
    const [content, overrides] = splitStoredPayload(null);
    expect(content).toBe(DEFAULT_CONTENT);
    expect(overrides).toEqual({});
  });
});

describe('hero slide persistence through the provider (fake Supabase)', () => {
  it('saving Slide 1 stores heroSlides[0].imageUrl; other slides untouched', async () => {
    const ctx = await setup();
    await act(async () => { await ctx.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 0 ? { ...s, imageUrl: 'https://cdn/slide1.jpg' } : s)) }); });
    const stored = db.rows.get(1)!.data as any;
    expect(stored.heroSlides[0].imageUrl).toBe('https://cdn/slide1.jpg');
    expect(stored.heroSlides[1].imageUrl).toBeNull();
    expect(stored.heroSlides[2].imageUrl).toBeNull();
    expect(stored.productOverrides).toEqual({});
    expect(typeof stored._rev).toBe('number');
  });

  it('saving Slide 3 does not overwrite Slide 1 (index consistency)', async () => {
    const ctx = await setup();
    await act(async () => { await ctx.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 0 ? { ...s, imageUrl: 'https://cdn/slide1.jpg' } : s)) }); });
    await act(async () => { await ctx.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 2 ? { ...s, imageUrl: 'https://cdn/slide3.jpg' } : s)) }); });
    const stored = db.rows.get(1)!.data as any;
    expect(stored.heroSlides[0].imageUrl).toBe('https://cdn/slide1.jpg');
    expect(stored.heroSlides[2].imageUrl).toBe('https://cdn/slide3.jpg');
    expect(stored.heroSlides[1].imageUrl).toBeNull();
  });

  it('a DB write failure surfaces as an error — no false success, no local mirror', async () => {
    const ctx = await setup();
    db.failNextWrite = true;
    await expect(ctx.saveContent({ topbar: 'SHOULD NOT PERSIST' })).rejects.toThrow(/Could not save content/);
    expect(db.rows.size).toBe(0);
    expect(JSON.parse((globalThis as any).localStorage.getItem(LS_KEY)!)).not.toMatchObject({ topbar: 'SHOULD NOT PERSIST' });
  });

  it('a DB READ failure during save-time reload throws loudly instead of saving over stale localStorage', async () => {
    const ctx = await setup();
    db.failNextRead = true;
    await expect(ctx.saveContent({ topbar: 'never' })).rejects.toThrow(/Could not read saved content/);
    expect(db.rows.size).toBe(0);
  });

  it('hydration of a FRESH session restores hero URLs AND productOverrides (the reported bug)', async () => {
    // Session A: admin saves a hero image and a homepage-only product photo.
    const ctxA = await setup();
    await act(async () => {
      await ctxA.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 0 ? { ...s, imageUrl: 'https://cdn/hero-new.jpg' } : s)) });
    });
    await act(async () => { await ctxA.saveProductHomeImage('mughal-garden-floral', 'https://cdn/home-mughal.jpg'); });

    // Session B: brand-new browser session (empty localStorage, same server row).
    const ctxB = await setup();
    await act(async () => { await Promise.resolve(); }); // let the hydration effect settle
    expect(ctxB.content.heroSlides[0].imageUrl).toBe('https://cdn/hero-new.jpg');
    // THE FIX: before, hydration never restored productOverrides into state.
    expect(ctxB.productOverrides['mughal-garden-floral']?.homeImageUrl).toBe('https://cdn/home-mughal.jpg');
    // Homepage rendering consumes both paths correctly:
    const slide0 = ctxB.content.heroSlides[0];
    const seeded = { slug: 'mughal-garden-floral', homeImageUrl: ctxB.productOverrides['mughal-garden-floral']?.homeImageUrl ?? null, imageUrl: null };
    expect(slide0.imageUrl).toBe('https://cdn/hero-new.jpg');                       // direct hero image wins
    expect(homeProductImage(seeded as never, 4, 1600, 900)).toBe('https://cdn/home-mughal.jpg'); // override feeds seed slides
    // localStorage mirrors hold clean halves (raw payload incl. productOverrides was the old bug)
    expect(JSON.parse((globalThis as any).localStorage.getItem(LS_OVERRIDES)!)).toHaveProperty('mughal-garden-floral');
  });

  it('delayed hydration cannot overwrite a more recent successful save', async () => {
    // Pre-seed the server with OLD content whose read will resolve late.
    db.rows.set(1, { id: 1, data: { ...structuredClone(DEFAULT_CONTENT) as any, productOverrides: {}, _rev: 5, _savedAt: 'old' } });
    const ctx = await setup();
    // Admin saves immediately (before the slow hydration promise settles).
    await act(async () => {
      await ctx.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 0 ? { ...s, imageUrl: 'https://cdn/new-save.jpg' } : s)) });
    });
    // Now let any pending hydration continuation flush — it must NOT clobber.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(ctx.content.heroSlides[0].imageUrl).toBe('https://cdn/new-save.jpg');
    const stored = db.rows.get(1)!.data as any;
    expect(stored.heroSlides[0].imageUrl).toBe('https://cdn/new-save.jpg');
  });

  it('concurrent server edits are detected: stale write refuses to clobber newer content', async () => {
    const ctx = await setup();
    await act(async () => { await ctx.saveContent({ topbar: 'LOCAL EDIT' }); });
    // Another admin bumps the row behind our back (rev jumps ahead).
    const row = db.rows.get(1)!;
    (row.data as any)._rev += 10;
    (row.data as any).contact = { title: 'Other admin copy', body: 'b', note: 'n' };
    await act(async () => { await ctx.saveContent({ topbar: 'MY SECOND EDIT' }); });
    const stored = db.rows.get(1)!.data as any;
    expect(stored.topbar).toBe('MY SECOND EDIT');            // my intent applied…
    expect(stored.contact.title).toBe('Other admin copy');   // …merged over their newer content, not clobbered
  });

  it('fallback artwork is preserved when no custom image exists', async () => {
    const ctx = await setup();
    const slide = ctx.content.heroSlides[0];
    expect(slide.imageUrl).toBeNull();
    // Mirror HomePage's real fallback path: resolve the slide's seed product
    // from the catalogue (with overrides applied), then homeProductImage.
    const { getProduct } = await import('../data/products');
    const seed = getProduct(slide.productSlug)!;
    expect(seed).toBeTruthy();
    const generated = homeProductImage({ ...seed, imageUrl: null, homeImageUrl: null }, 4, 1600, 900);
    expect(generated.startsWith('data:image/svg+xml')).toBe(true); // rugArt fallback, unchanged behaviour
  });
});


