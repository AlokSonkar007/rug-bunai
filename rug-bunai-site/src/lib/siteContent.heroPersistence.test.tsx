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
// ONE shared in-memory store behind every fake-client request.
const store = { row: null as Row | null };
const db = {
  // Small facade so tests can seed/inspect the single site_content row by id.
  rows: {
    get size() { return store.row ? 1 : 0; },
    clear: () => { store.row = null; },
    get(id: number) { return id === 1 && store.row ? store.row : undefined; },
    set(id: number, row: Row) { if (id === 1) store.row = structuredClone(row); },
  },
  failNextRead: false, failNextWrite: false, log: [] as string[],
};

/** Minimal in-memory PostgREST stand-in for the single-row `site_content`
 *  table. Every from() call returns a FRESH builder over ONE shared store;
 *  inserts and updates persist so subsequent independent reads see them.
 *  `delay`/gate support lets tests genuinely race a slow hydration read
 *  against a fast save. No CAS filters or RLS emulation — the production
 *  code under test deliberately uses plain `.eq('id', 1)` writes guarded by
 *  a pre-write re-read + post-write verification. */
interface FakeShared { mode: 'select' | 'update' | 'insert'; body?: Record<string, unknown>; filters: Array<[string, string]> }

/** Per-query execution rules consulted by the fake at EXECUTION time. A test
 *  pushes a rule (e.g. a gate that hangs the query until released) and the
 *  NEXT from() call attaches it — deterministic, no builder-capture races. */
interface FakeRule { delay?: number; gate?: Promise<void>; match?: (filters: Array<[string, string]>) => boolean }
const pendingRules: FakeRule[] = [];
let activeGate: { resolve: () => void; promise: Promise<void> } | null = null;
/** Hang the NEXT query whose filters contain `col=val` (e.g. the hydration
 *  SELECT on id=1) until releaseGate() is called. Deterministic: save-path
 *  queries are never captured by mistake. */
function armGateForQuery(col: string, val: string): void {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  activeGate = { resolve, promise };
  pendingRules.push({ gate: promise, match: (f) => f.some(([c, v]) => c === col && v === val) });
}
async function releaseGate(): Promise<void> {
  const g = activeGate!;
  g.resolve();
  await settle(2);
}

function makeQuery() {
  const shared: FakeShared = { mode: 'select', body: undefined, filters: [] };
  let rule: { delay?: number; gate?: Promise<void> } | null = null;
  let executed = false;
  const q: Record<string, any> = {};
  q.from = () => { return q; };
  q.select = () => { shared.mode = 'select'; return q; };
  q.insert = (row: Record<string, unknown>) => { shared.mode = 'insert'; shared.body = row; return q; };
  q.update = (patch: Record<string, unknown>) => { shared.mode = 'update'; shared.body = patch; return q; };
  q.insert = (row: Record<string, unknown>) => { shared.mode = 'insert'; shared.body = row; return q; };
  q.update = (patch: Record<string, unknown>) => { shared.mode = 'update'; shared.body = patch; return q; };
  q.eq = (col: string, val: unknown) => { shared.filters.push([col, String(val)]); return q; };
  q.maybeSingle = async () => {
    // Attach a matching armed rule at EXECUTION time (filters now complete),
    // then pay its latency/gate cost on the first execution only.
    if (!executed) {
      executed = true;
      for (let i = 0; i < pendingRules.length; i++) {
        const r = pendingRules[i]!;
        if (!r.match || r.match(shared.filters)) { rule = r; pendingRules.splice(i, 1); break; }
      }
      if (rule?.delay) await new Promise((r) => setTimeout(r, rule!.delay));
      if (rule?.gate) await rule.gate;
    }
    if (shared.mode === 'select') {
      // Flags & store read at EXECUTION time — never snapshotted at build time.
      if (db.failNextRead) { db.failNextRead = false; db.log.push('select FAIL'); return { data: null, error: { message: 'schema cache miss (simulated)' } }; }
      const row = store.row;
      db.log.push(`select -> ${row ? `rev=${(row.data as any)._rev}` : 'NULL'}`);
      // PostgREST returns ONLY the requested columns: select('data').
      return { data: row ? { data: structuredClone(row.data) } : null, error: null };
    }
    if (db.failNextWrite) { db.failNextWrite = false; db.log.push(`WRITE FAIL (${shared.mode})`); return { data: null, error: { message: 'write failed (simulated)' } }; }
    if (shared.mode === 'insert') {
      if (store.row) { db.log.push('insert DUP-ERR'); return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "site_content_pkey"' } }; }
      const b = shared.body as { id?: number; data?: Record<string, unknown> };
      store.row = { id: b.id ?? 1, data: structuredClone(b.data ?? {}) };
      db.log.push(`insert rev=${((b.data ?? {}) as any)._rev}`);
      return { data: null, error: null };
    }
    // update: WHERE filters evaluated against the CURRENT row.
    const row = store.row;
    const matches = !!row && shared.filters.every(([col, val]) => col === 'id' ? String(row.id) === val : false);
    const patch = shared.body as { data?: Record<string, unknown>; updated_at?: string };
    db.log.push(`update rev=${((patch.data ?? {}) as any)._rev} match=${matches}`);
    if (!matches) return { data: null, error: null }; // zero rows matched — NOT an error
    store.row = { id: 1, data: structuredClone(patch.data ?? {}), updated_at: patch.updated_at };
    return { data: null, error: null };
  };
  return q;
}

const fakeClient = {
  storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
} as Record<string, any>;
// Every from() call returns a FRESH builder over the ONE shared store.
fakeClient.from = () => makeQuery();
vi.mock('./supabase', () => ({ supabase: fakeClient, isSupabaseConfigured: true, requireSupabase: () => fakeClient }));

// Import AFTER mocks are registered.
const SC = await import('./siteContent');
const { SiteContentProvider, DEFAULT_CONTENT, LS_KEY, LS_OVERRIDES, splitStoredPayload } = SC;
const { homeProductImage } = await import('./images');

/** Flush pending microtasks AND macrotasks inside act() so async effects and
 *  state updates fully complete before assertions run. */
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
}

// ── Harness: mount the real provider in jsdom, capture its context ──────────
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

async function setup(opts: { strict?: boolean; slowHydration?: boolean } = {}) {
  vi.stubGlobal('localStorage', new LocalStorageShim());
  db.rows.clear(); db.failNextRead = false; db.failNextWrite = false;
  pendingRules.length = 0; activeGate = null; db.log = [];
  cleanup();
  if (opts.slowHydration) armGateForQuery('id', '1'); // the hydration SELECT hangs until releaseGate()
  container = document.createElement('div');
  document.body.appendChild(container);
  const tree = (
    <SiteContentProvider><Harness /></SiteContentProvider>
  );
  await act(async () => {
    root = createRoot(container as unknown as Element);
    root.render(opts.strict === false ? tree : <StrictMode>{tree}</StrictMode>);
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
    // Studio semantics: the editor edits the CURRENT slide array (hydrated
    // content), changing exactly one index — never re-derives from defaults.
    await act(async () => { await ctx.saveContent({ heroSlides: ctx.content.heroSlides.map((s, i) => (i === 2 ? { ...s, imageUrl: 'https://cdn/slide3.jpg' } : s)) }); });
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
    await settle(4); // let the hydration effect's Supabase round-trip complete
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
    // Pre-seed the server with OLD content whose read is held in flight by the
    // gate — the save below genuinely completes BEFORE the hydration response.
    db.rows.set(1, { id: 1, data: { ...structuredClone(DEFAULT_CONTENT) as any, productOverrides: {}, _rev: 5, _savedAt: 'old' } });
    const ctx = await setup({ slowHydration: true });
    await settle(3); // let the hung hydration SELECT get issued
    // Admin saves immediately (before the slow hydration promise settles).
    await act(async () => {
      await ctx.saveContent({ heroSlides: DEFAULT_CONTENT.heroSlides.map((s, i) => (i === 0 ? { ...s, imageUrl: 'https://cdn/new-save.jpg' } : s)) });
    });
    // Release the stale read; its continuation must NOT clobber the save…
    await act(async () => { await releaseGate(); });
    expect(ctx.content.heroSlides[0].imageUrl).toBe('https://cdn/new-save.jpg');
    // …and the NEXT save must not be poisoned by the late-landing rev either.
    await act(async () => {
      await ctx.saveContent({ topbar: 'AFTER SLOW READ' });
    });
    const stored = db.rows.get(1)!.data as any;
    expect(stored.topbar).toBe('AFTER SLOW READ');
    expect(stored.heroSlides[0].imageUrl).toBe('https://cdn/new-save.jpg');
  });

  it('a slow first-load hydration that lands after a save never rewinds the CAS revision', async () => {
    // Same race, asserted directly on the row: every write must keep landing.
    const ctx = await setup({ slowHydration: true });
    await settle(3);
    await act(async () => { await ctx.saveContent({ topbar: 'SAVE ONE' }); });
    await act(async () => { await releaseGate(); }); // stale empty/older read lands here
    await act(async () => { await ctx.saveContent({ topbar: 'SAVE TWO' }); });
    await act(async () => { await ctx.saveContent({ topbar: 'SAVE THREE' }); });
    const stored = db.rows.get(1)!.data as any;
    expect(stored.topbar).toBe('SAVE THREE');
    expect(ctx.content.topbar).toBe('SAVE THREE');
  });

  it('a concurrent server edit is merged, not clobbered', async () => {
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


