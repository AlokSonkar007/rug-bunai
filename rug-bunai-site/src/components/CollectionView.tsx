import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { colorHex, findTerm, MATERIALS, ROOMS, STYLES } from '../data/vocabularies';
import {
  appliedChips, EMPTY_FACETS, facetsFromSearch, facetsToSearch, removeChip,
  runSearch, SORT_OPTIONS, type FacetGroup, type FacetState,
} from '../lib/search';
import { CATEGORY_TITLES, productsInCategory } from '../lib/search';
import { ProductCard, Reveal } from './ProductCard';

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
    const key = groupId as 'techniques' | 'materials' | 'colors' | 'rooms' | 'styles';
    if (groupId === 'sizeBucket') {
      setState({ ...state, sizeBucket: state.sizeBucket === slug ? null : slug });
      return;
    }
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

  const baseState = useMemo<FacetState>(() => facetsFromSearch(sp), [sp]);
  // Category acts as an additional fixed technique/material/room constraint.
  const constrained = useMemo<FacetState>(() => {
    if (!categoryPath) return baseState;
    const parts = categoryPath.split('/').slice(1); // drop "rugs"
    const next = { ...baseState };
    if (['hand-knotted', 'hand-tufted', 'flat-woven', 'loom-woven'].includes(parts[0])) {
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

  const { results, facets, total } = useMemo(() => runSearch(products, constrained), [products, constrained]);
  const chips = appliedChips(constrained);

  const update = (next: FacetState) => setSp(facetsToSearch(next), { replace: false });

  const title = categoryPath ? CATEGORY_TITLES[categoryPath] ?? 'The Collection' : 'The Collection';
  const intro = categoryPath
    ? 'Every piece below is knotted, tufted or woven by hand in our Bhadohi workshops — filter to narrow by what matters to your room.'
    : 'Browse the full archive of designs. Combine filters freely — counts update live so you never reach a dead end.';

  return (
    <div className="wrap section">
      <header style={{ marginBottom: 44 }}>
        <p className="eyebrow">{categoryPath ? 'Collection' : 'All Rugs'}</p>
        <h1 className="display" style={{ marginTop: 10 }}>{title}</h1>
        <p className="muted" style={{ maxWidth: '58ch', marginTop: 14 }}>{intro}</p>
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

          {results.length === 0 ? (
            <div className="empty-state">
              <h2 className="headline">Nothing matches that combination.</h2>
              <p className="muted">Try removing a filter — rug names, fibres and rooms are all searchable.</p>
              <button className="btn" style={{ marginTop: 22 }} onClick={() => update(EMPTY_FACETS)}>Reset filters</button>
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

export { productsInCategory };
