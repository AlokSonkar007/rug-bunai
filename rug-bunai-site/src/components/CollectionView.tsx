import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { carpetCategoryPath, colorHex, findCarpetCategory, findTerm, MATERIALS, ROOMS, STYLES } from '../data/vocabularies';
import {
  appliedChips, categoryTitle, EMPTY_FACETS, facetsFromSearch, facetsToSearch, removeChip,
  runSearch, SORT_OPTIONS, type FacetGroup, type FacetState,
} from '../lib/search';
import { ProductCard, Reveal } from './ProductCard';
import { useCatalog } from '../lib/catalog';
import { useSiteContent } from '../lib/siteContent';
import { ROOM_SIZE_GUIDANCE, sizeByKey } from '../lib/sizes';

/** Longest side (ft → cm) bucket used by the size filter for a standard key. */
function bucketForSizeKey(key: string): 'small' | 'medium' | 'large' {
  const opt = sizeByKey(key);
  if (!opt || opt.custom) return 'medium';
  const longestCm = Math.max(opt.ft[0], opt.ft[1]) * 30.48;
  if (longestCm <= 160) return 'small';
  if (longestCm <= 250) return 'medium';
  return 'large';
}

/** One facet group: multi-select checkboxes, dynamic counts, progressive disclosure. */
function FacetBlock({
  group, state, onToggle, showAllThreshold = 6,
}: {
  group: FacetGroup;
  state: FacetState;
  onToggle: (groupId: string, slug: string) => void;
  showAllThreshold?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = (state[group.id as keyof FacetState] as readonly string[] | string | null) ?? [];
  const isSelected = (slug: string) => Array.isArray(selected) && selected.includes(slug);
  const visible = expanded ? group.options : group.options.slice(0, showAllThreshold);
  const hiddenActiveCount =
    Array.isArray(selected) ? selected.filter((s) => !visible.some((o) => o.slug === s)).length : 0;

  return (
    <div className="facet-group">
      <h3 className="facet-title">{group.label}</h3>
      {visible.map((opt) => (
        <label key={opt.slug} className={`facet-opt ${opt.count === 0 && !isSelected(opt.slug) ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={isSelected(opt.slug)}
            disabled={opt.count === 0 && !isSelected(opt.slug)}
            onChange={() => onToggle(group.id, opt.slug)}
          />
          {group.id === 'colors' && (
            <span className="facet-swatch" style={{ background: colorHex(opt.slug) }} aria-hidden="true" />
          )}
          <span>{opt.label}</span>
          <span className="count">{opt.count}</span>
        </label>
      ))}
      {hiddenActiveCount > 0 && (
        <button className="show-more" onClick={() => setExpanded(true)}>
          +{hiddenActiveCount} selected hidden — show all
        </button>
      )}
      {!expanded && group.options.length > showAllThreshold && hiddenActiveCount === 0 && (
        <button className="show-more" onClick={() => setExpanded(true)}>
          Show {group.options.length - showAllThreshold} more
        </button>
      )}
    </div>
  );
}

function PriceBlock({ state, onSet }: { state: FacetState; onSet: (min: number | null, max: number | null) => void }) {
  const [min, setMin] = useState(state.priceMin?.toString() ?? '');
  const [max, setMax] = useState(state.priceMax?.toString() ?? '');
  return (
    <div className="facet-group">
      <h3 className="facet-title">Price (₹)</h3>
      <div className="price-inputs">
        <input aria-label="Minimum price" inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
        <span aria-hidden="true">—</span>
        <input aria-label="Maximum price" inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} />
      </div>
      <button
        className="show-more"
        onClick={() => onSet(min ? Number(min) : null, max ? Number(max) : null)}
      >
        Apply
      </button>
    </div>
  );
}

export function FilterPanel({
  state, facets, setState,
}: {
  state: FacetState;
  facets: FacetGroup[];
  setState: (next: FacetState) => void;
}) {
  const toggle = (groupId: string, slug: string) => {
    if (groupId === 'sizeBucket') {
      setState({ ...state, sizeBucket: state.sizeBucket === slug ? null : slug });
      return;
    }
    if (groupId === 'categorySlug') {
      setState({ ...state, categorySlug: state.categorySlug === slug ? null : slug });
      return;
    }
    const key = groupId as 'techniques' | 'materials' | 'colors' | 'rooms' | 'styles';
    const cur = state[key];
    setState({ ...state, [key]: cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug] });
  };
  return (
    <>
      {facets.map((g) => (
        <FacetBlock key={g.id} group={g} state={state} onToggle={toggle} showAllThreshold={g.id === 'colors' ? 9 : 4} />
      ))}
      <PriceBlock state={state} onSet={(mn, mx) => setState({ ...state, priceMin: mn, priceMax: mx })} />
    </>
  );
}

/**
 * Collection / PLP body. Handles both a category path (taxonomy browse) and the
 * flat "all rugs" view; faceting, chips, sorting live in the URL query string.
 */
export default function CollectionView({ categoryPath }: { categoryPath?: string }) {
  const [sp, setSp] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();
  const { products } = useCatalog();
  const { content: siteContent } = useSiteContent();

  const baseState = useMemo<FacetState>(() => facetsFromSearch(sp), [sp]);
  // Category acts as an additional fixed technique/material/room constraint.
  const constrained = useMemo<FacetState>(() => {
    if (!categoryPath) return baseState;
    const parts = categoryPath.split('/').slice(1); // drop "rugs"
    const next = { ...baseState };
    if (parts[0] === 'category') {
      // Curated design category — filter on the product's categoryPaths.
      next.categorySlug = parts.slice(1).join('-');
    } else if (['hand-knotted', 'hand-tufted', 'flat-woven', 'loom-woven'].includes(parts[0])) {
      next.techniques = [...new Set([...baseState.techniques, parts[0]])];
      if (parts[1]) next.materials = [...new Set([...baseState.materials, parts[1]])];
    } else if (findTerm(ROOMS, parts[0])) {
      next.rooms = [...new Set([...baseState.rooms, parts[0]])];
    } else if (findTerm(STYLES, parts[0])) {
      next.styles = [...new Set([...baseState.styles, parts[0]])];
    } else if (findTerm(MATERIALS, parts[0])) {
      next.materials = [...new Set([...baseState.materials, parts[0]])];
    }
    return next;
  }, [baseState, categoryPath]);

  const { results, facets, total } = useMemo(() => runSearch(constrained, products), [constrained, products]);
  const chips = appliedChips(constrained);

  const update = (next: FacetState) => setSp(facetsToSearch(next), { replace: false });

  // Admin-editable collection intro (Studio > Collections). Keyed by the
  // curated category slug so editing one collection never touches another.
  const curatedSlug = categoryPath?.startsWith('rugs/category/') ? categoryPath.split('/').slice(2).join('-') : undefined;
  const collectionCopy = curatedSlug ? siteContent.collections[curatedSlug] : undefined;
  const title = (collectionCopy?.title || (categoryPath && categoryTitle(categoryPath))) || 'The Collection';
  const intro = collectionCopy?.description
    || (categoryPath
      ? 'Every piece below is knotted, tufted or woven by hand in our Bhadohi workshops — filter to narrow by what matters to your room.'
      : 'Browse the full archive of designs. Combine filters freely — counts update live so you never reach a dead end.');
  // On a dedicated collection route, "clearing" means leaving the category
  // constraint too — reset straight back to the full catalogue.
  const resetFilters = () => (categoryPath ? navigate('/rugs') : update(EMPTY_FACETS));

  return (
    <div className="wrap section">
      <header style={{ marginBottom: 44 }}>
        <p className="eyebrow">{categoryPath ? 'Collection' : 'All Rugs'}</p>
        <h1 className="display" style={{ marginTop: 10 }}>{title}</h1>
        <p className="muted" style={{ maxWidth: '58ch', marginTop: 14 }}>{intro}</p>
        {collectionCopy?.imageUrl && (
          <img
            src={collectionCopy.imageUrl}
            alt=""
            loading="lazy"
            style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 14, marginTop: 22 }}
          />
        )}
      </header>

      <div className="plp">
        <aside className="facet-panel" aria-label="Filters">
          <FilterPanel state={constrained} facets={facets} setState={update} />
        </aside>

        <section>
          <div className="plp-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <button className="filter-fab" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
                Filters {chips.length > 0 && `(${chips.length})`}
              </button>
              <p className="result-count" role="status" aria-live="polite">
                {total} {total === 1 ? 'design' : 'designs'}
              </p>
            </div>
            <label className="sort-select">
              Sort
              <select
                value={constrained.sort}
                onChange={(e) => update({ ...constrained, sort: e.target.value as FacetState['sort'] })}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="chips-bar" aria-label="Applied filters">
              {chips.map((c, i) => (
                <span key={`${c.group}-${c.value}-${i}`} className="chip">
                  {c.label}
                  <button aria-label={`Remove filter ${c.label}`} onClick={() => update(removeChip(constrained, c))}>×</button>
                </span>
              ))}
              <button className="clear-all" onClick={() => update(EMPTY_FACETS)}>Clear all</button>
            </div>
          )}

          {/* Room-specific size recommendations — driven by the selected room
              facet(s); reuses ROOM_SIZE_GUIDANCE + SIZE_OPTIONS as the single
              source of truth. Clicking a chip applies the matching size filter
              while preserving every other active facet (incl. the room). */}
          {(() => {
            const guidance = constrained.rooms
              .map((r) => ROOM_SIZE_GUIDANCE.find((g) => g.roomSlug === r))
              .filter((g): g is (typeof ROOM_SIZE_GUIDANCE)[number] => Boolean(g));
            if (guidance.length === 0) return null;
            const recommendedKeys = [...new Set(guidance.flatMap((g) => [...g.recommendedKeys]))];
            return (
              <div className="room-size-recs" aria-label="Recommended sizes for this room">
                <p className="eyebrow">Recommended for {constrained.rooms.length === 1
                  ? (findTerm(ROOMS, constrained.rooms[0])?.label ?? 'this room')
                  : 'your rooms'}</p>
                <div className="room-size-recs-chips">
                  {recommendedKeys.map((key) => {
                    const opt = sizeByKey(key);
                    if (!opt || opt.custom) return null;
                    const bucket = bucketForSizeKey(key);
                    const active = constrained.sizeBucket === bucket;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`size-rec${active ? ' active' : ''}`}
                        onClick={() => update({ ...constrained, sizeBucket: active ? null : bucket })}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="muted room-size-note">{guidance[0].note}</p>
              </div>
            );
          })()}

          {results.length === 0 ? (
            <div className="empty-state">
              <h2 className="headline">Nothing matches that combination.</h2>
              <p className="muted">Try removing a filter — rug names, fibres and rooms are all searchable.</p>
              <button className="btn" style={{ marginTop: 22 }} onClick={resetFilters}>Reset filters</button>
              {categoryPath && (
                <p className="muted" style={{ marginTop: 16 }}>
                  Or return to{' '}
                  <Link to="/rugs">all rugs</Link>{' '}
                  · <Link to="/">Collections home</Link>
                </p>
              )}
            </div>
          ) : (
            <div className="grid-products">
              {results.map((p, i) => (
                <Reveal key={p.id} delay={Math.min(i, 4) * 90}>
                  <ProductCard product={p} eager={i < 2} />
                </Reveal>
              ))}
            </div>
          )}
        </section>
      </div>

      {sheetOpen && (
        <>
          <div className="sheet-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div className="filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-head">
              <h2 className="subhead">Refine</h2>
              <button className="clear-all" onClick={() => { update(EMPTY_FACETS); setSheetOpen(false); }}>Done</button>
            </div>
            <FilterPanel state={constrained} facets={facets} setState={update} />
            <button className="btn btn-solid btn-block" style={{ marginTop: 26 }} onClick={() => setSheetOpen(false)}>
              Show {total} {total === 1 ? 'design' : 'designs'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Route wrapper for /collections/:categorySlug — turns the URL param into the
 * canonical curated-category path and reuses CollectionView's existing facet
 * pipeline unchanged. Unknown slugs degrade safely (CollectionView shows an
 * honest empty state with a reset path) rather than crashing.
 */
export function CategoryCollectionView() {
  const { categorySlug } = useParams();
  const term = categorySlug ? findCarpetCategory(categorySlug) : undefined;
  // Unknown slugs become a path no product can carry → CollectionView's honest
  // empty state with links back to all rugs / collections home.
  return <CollectionView categoryPath={carpetCategoryPath(term?.slug ?? 'unknown')} />;
}
