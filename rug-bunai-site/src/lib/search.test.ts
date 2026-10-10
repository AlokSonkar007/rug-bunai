import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../data/products';
import { CARPET_CATEGORIES, carpetCategoryPath } from '../data/vocabularies';
import {
  EMPTY_FACETS,
  appliedChips,
  facetsFromSearch,
  facetsToSearch,
  removeChip,
  runSearch,
} from './search';

const firstCat = CARPET_CATEGORIES[0];
const catPath = carpetCategoryPath(firstCat.slug);
const catProducts = PRODUCTS.filter((p) => p.categoryPaths.includes(catPath));

describe('category facet', () => {
  it('filters products by curated category slug', () => {
    const { results, total } = runSearch({ ...EMPTY_FACETS, categorySlug: firstCat.slug });
    expect(total).toBe(results.length);
    // Sanity: every returned product actually carries the category path.
    expect(results.every((p) => p.categoryPaths.includes(catPath))).toBe(true);
    if (catProducts.length > 0) {
      expect(results.map((p) => p.id).sort()).toEqual(catProducts.map((p) => p.id).sort());
    }
  });

  it('combines with colour filters (AND across groups)', () => {
    const color = catProducts[0]?.variants[0]?.colorSlug;
    if (!color) return; // catalogue has no categorised product yet — nothing to assert
    const { results } = runSearch({ ...EMPTY_FACETS, categorySlug: firstCat.slug, colors: [color] });
    expect(
      results.every(
        (p) => p.categoryPaths.includes(catPath) && p.variants.some((v) => v.colorSlug === color),
      ),
    ).toBe(true);
  });

  it('removing the category chip restores the unfiltered result set', () => {
    const withCat = { ...EMPTY_FACETS, categorySlug: firstCat.slug };
    const chips = appliedChips(withCat);
    const catChip = chips.find((c) => c.group === 'categorySlug');
    expect(catChip).toBeDefined();
    const restored = removeChip(withCat, catChip!);
    expect(restored.categorySlug).toBeNull();
    expect(runSearch(restored).total).toBe(PRODUCTS.length);
  });

  it('serialises to the URL and deserialises back correctly', () => {
    const state = { ...EMPTY_FACETS, categorySlug: firstCat.slug, query: 'wool' };
    const sp = facetsToSearch(state);
    expect(sp.get('category')).toBe(firstCat.slug);
    const round = facetsFromSearch(sp);
    expect(round.categorySlug).toBe(firstCat.slug);
    expect(round.query).toBe('wool');
  });

  it('ignores unknown category slugs from the URL', () => {
    const sp = new URLSearchParams('category=not-a-real-category');
    expect(facetsFromSearch(sp).categorySlug).toBeNull();
  });

  it('older saved filter state without categorySlug does not crash', () => {
    const legacy = { ...EMPTY_FACETS } as Record<string, unknown>;
    delete legacy.categorySlug; // simulate persisted state predating the field
    // matchesExceptColor treats a missing/undefined slug as "no category filter".
    const { total } = runSearch(legacy as never);
    expect(total).toBe(PRODUCTS.length);
  });

  it('text search still works alongside other facets', () => {
    const { results } = runSearch({ ...EMPTY_FACETS, query: 'kashmiri' });
    expect(results.every((p) => `${p.name} ${p.tagline} ${p.description} ${p.craftStory}`.toLowerCase().includes('kashmiri'))).toBe(true);
  });
});
