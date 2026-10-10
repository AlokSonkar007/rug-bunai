import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../data/products';
import { CARPET_CATEGORIES, carpetCategoryPath, COLORS, colorHex } from '../data/vocabularies';
import {
  allCategoryPaths,
  categoryTitle,
  colourPalette,
  EMPTY_FACETS,
  appliedChips,
  facetsFromSearch,
  facetsToSearch,
  productsInCategory,
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

describe('shop-by-colour palette integration', () => {
  it('colourPalette derives every entry from the canonical vocabulary with real counts', () => {
    const palette = colourPalette();
    expect(palette.map((c) => c.slug)).toEqual(COLORS.map((c) => c.slug));
    palette.forEach((entry) => {
      const dict = COLORS.find((c) => c.slug === entry.slug)!;
      expect(entry.hex).toBe(dict.hex);
      expect(entry.label).toBe(dict.label);
      expect(entry.count).toBe(PRODUCTS.filter((p) => p.colorSlugs.includes(entry.slug)).length);
    });
  });

  it('palette swatch hexes are valid CSS colours (missing/invalid values stay safe)', () => {
    for (const entry of colourPalette()) {
      expect(entry.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // Unknown slugs fall back to a defined neutral instead of crashing or rendering empty.
    expect(colorHex('not-a-real-colour')).toBe('#A89684');
  });

  it('homepage-style colour link (?color=slug) filters the collection correctly', () => {
    const stocked = colourPalette().find((c) => c.count > 0)!;
    const sp = new URLSearchParams(`color=${encodeURIComponent(stocked.slug)}`);
    const facets = facetsFromSearch(sp);
    expect(facets.colors).toEqual([stocked.slug]);
    const { results } = runSearch(facets);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.variants.some((v) => v.colorSlug === stocked.slug))).toBe(true);
  });

  it('colour selection composes with category, size and query filters', () => {
    const color = PRODUCTS[0].variants[0].colorSlug;
    const combined = { ...EMPTY_FACETS, colors: [color], sizeBucket: 'runner', query: 'zzz-no-match-zzz' };
    expect(runSearch(combined).total).toBe(0); // AND across groups — no contradiction crashes
    const ok = { ...EMPTY_FACETS, colors: [color] };
    expect(runSearch(ok).results.every((p) => p.variants.some((v) => v.colorSlug === color))).toBe(true);
  });

  it('clearing the colour chip restores the broader catalogue', () => {
    const stocked = colourPalette().find((c) => c.count > 0)!;
    const f = facetsFromSearch(new URLSearchParams(`color=${stocked.slug}`));
    const chip = appliedChips(f).find((c) => c.group === 'colors')!;
    const cleared = removeChip(f, chip);
    expect(cleared.colors).toEqual([]);
    expect(runSearch(cleared).total).toBe(PRODUCTS.length);
  });

  it('unknown colour slugs degrade to an empty result set without crashing', () => {
    const f = facetsFromSearch(new URLSearchParams('color=chartreuse-not-real'));
    const { total } = runSearch(f);
    expect(total).toBe(0);
  });
});

// ── Task 4: curated category collections (15 categories) ────────────────────

describe('curated carpet categories (Collections menu)', () => {
  const EXPECTED_LABELS = [
    'Irregular Shaped Carpets', 'Shaggy Carpets', 'Round Rugs', 'Round Shaggy Carpets',
    'Solid Carpets', 'Irani Carpets', 'Modern Abstract Carpets', 'Designer Carpets',
    'Persian Wool Rugs and Carpets', 'Dope Carpets', 'Artificial Grass Carpets',
    'Anime Carpets', 'Floral Carpets', 'Geometrical Carpets', 'Traditional Carpets',
  ];

  it('defines exactly the 15 requested categories with URL-safe slugs', () => {
    expect(CARPET_CATEGORIES.map((c) => c.label)).toEqual(EXPECTED_LABELS);
    CARPET_CATEGORIES.forEach((c) => expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    // Suggested slugs from the spec are honoured.
    expect(CARPET_CATEGORIES.map((c) => c.slug)).toContain('shaggy-carpets');
    expect(CARPET_CATEGORIES.map((c) => c.slug)).toContain('irregular-shaped-carpets');
    expect(CARPET_CATEGORIES.map((c) => c.slug)).toContain('persian-wool-rugs-and-carpets');
  });

  it('every category serialises & round-trips through the facet URL', () => {
    CARPET_CATEGORIES.forEach((c) => {
      const f = facetsFromSearch(new URLSearchParams(`category=${c.slug}`));
      expect(f.categorySlug).toBe(c.slug);
      expect(facetsToSearch(f).get('category')).toBe(c.slug);
    });
  });

  it('category filtering returns exactly the products assigned to each category', () => {
    CARPET_CATEGORIES.forEach((c) => {
      const path = carpetCategoryPath(c.slug);
      const expected = PRODUCTS.filter((p) => p.categoryPaths.includes(path));
      const { results } = runSearch({ ...EMPTY_FACETS, categorySlug: c.slug });
      expect(results.map((p) => p.id).sort()).toEqual(expected.map((p) => p.id).sort());
    });
  });

  it('category + colour combine with AND semantics across groups', () => {
    const slug = 'round-rugs';
    const inCat = PRODUCTS.filter((p) => p.categoryPaths.includes(carpetCategoryPath(slug)));
    if (inCat.length) {
      const color = inCat[0].variants[0].colorSlug;
      const f = facetsFromSearch(new URLSearchParams(`category=${slug}&color=${color}`));
      expect(f.categorySlug).toBe(slug);
      const { results } = runSearch(f);
      expect(results.every((p) => p.categoryPaths.includes(carpetCategoryPath(slug)))).toBe(true);
      expect(results.every((p) => p.variants.some((v) => v.colorSlug === color))).toBe(true);
    } else {
      // Empty category still composes without crashing.
      expect(runSearch({ ...EMPTY_FACETS, categorySlug: slug, colors: ['navy'] }).total).toBe(0);
    }
  });

  it('removing the category chip restores the broader result set', () => {
    // Curated categories currently have no assigned products, so this exercises
    // the full chip lifecycle on a real curated slug ('geometrical-carpets')
    // combined with a stocked size facet. Removing the category chip must
    // restore the broader (size-filtered) result set.
    const f = facetsFromSearch(new URLSearchParams('category=geometrical-carpets&size=medium'));
    expect(f.categorySlug).toBe('geometrical-carpets'); // validated against CARPET_CATEGORIES
    const chip = appliedChips(f).find((x) => x.group === 'categorySlug')!;
    expect(chip.label).toBe('Geometrical Carpets');
    const cleared = removeChip(f, chip);
    expect(cleared.categorySlug).toBeNull();
    expect(cleared.sizeBucket).toBe('medium'); // other facets preserved when clearing
    expect(runSearch(f).total).toBe(0);        // honest empty state for unstocked category
    expect(runSearch(cleared).total).toBeGreaterThan(0);
  });

  it('curated categories with no stock still clear correctly and restore the full catalogue', () => {
    const emptyCat = CARPET_CATEGORIES.find(
      (c) => !PRODUCTS.some((p) => p.categoryPaths.includes(carpetCategoryPath(c.slug))),
    )!;
    const f = facetsFromSearch(new URLSearchParams(`category=${emptyCat.slug}`));
    expect(f.categorySlug).toBe(emptyCat.slug);
    expect(runSearch(f).total).toBe(0);
    const chip = appliedChips(f).find((x) => x.group === 'categorySlug')!;
    expect(chip.label).toBe(emptyCat.label);
    const cleared = removeChip(f, chip);
    expect(cleared.categorySlug).toBeNull();
    expect(runSearch(cleared).total).toBeGreaterThan(0);
  });

  it('unknown category slugs never crash and yield an honest empty state', () => {
    const f = facetsFromSearch(new URLSearchParams('category=not-a-real-category'));
    expect(f.categorySlug).toBeNull(); // URL facet degrades to no filter
    const { total } = runSearch({ ...EMPTY_FACETS, categorySlug: 'not-a-real-category' });
    expect(total).toBe(0);
  });

  it('categories with no assigned products exist as valid empty collections', () => {
    // Curated axis is independent of current stock — empty categories must not break anything.
    CARPET_CATEGORIES.forEach((c) => {
      const path = carpetCategoryPath(c.slug);
      expect(() => productsInCategory(path)).not.toThrow();
    });
    expect(allCategoryPaths().length).toBeGreaterThanOrEqual(CARPET_CATEGORIES.length);
  });

  it('category route titles resolve for every curated category', () => {
    CARPET_CATEGORIES.forEach((c) => {
      expect(categoryTitle(carpetCategoryPath(c.slug))).toBe(c.label);
    });
  });
});
