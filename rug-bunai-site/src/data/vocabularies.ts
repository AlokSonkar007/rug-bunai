// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLED VOCABULARIES (PIM dictionaries)
// Attribute values MUST be normalized to these terms. Free-text entries like
// "Navy Blue" / "Dark Blue" are collapsed to a single dictionary term ("Navy")
// so faceted search stays accurate and products never fragment.
// ─────────────────────────────────────────────────────────────────────────────

export type Term = { readonly label: string; readonly slug: string };

const t = (label: string): Term => ({
  label,
  slug: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
});

/** How the rug is made — primary navigation axis, level 2. */
export const TECHNIQUES = [
  t('Hand-Knotted'),
  t('Hand-Tufted'),
  t('Flat-Woven'),
  t('Loom-Woven'),
] as const;

/** Primary fibre content — primary navigation axis, level 3. */
export const MATERIALS = [
  t('Wool'),
  t('Silk Blend'),
  t('Cotton'),
  t('Jute'),
  t('Bamboo Silk'),
] as const;

/** Aesthetic classification — secondary navigation axis. */
export const STYLES = [
  t('Geometric'),
  t('Abstract'),
  t('Traditional'),
  t('Modern'),
  t('Botanical'),
] as const;

/** Intended application — secondary navigation axis. */
export const ROOMS = [
  t('Living Room'),
  t('Bedroom'),
  t('Dining Room'),
  t('Hallway'),
  t('Office'),
] as const;

/** Normalized colour dictionary with swatch hex for PLP/PDP swatches. */
export const COLORS: ReadonlyArray<Term & { readonly hex: string }> = [
  { ...t('Ivory'), hex: '#F3EDE2' },
  { ...t('Sand'), hex: '#D8C7A9' },
  { ...t('Taupe'), hex: '#A89684' },
  { ...t('Charcoal'), hex: '#3B3A38' },
  { ...t('Deep Brown'), hex: '#5A4232' },
  { ...t('Navy'), hex: '#2C3A4D' },
  { ...t('Sage'), hex: '#9AA88F' },
  { ...t('Terracotta'), hex: '#B0714F' },
  { ...t('Black'), hex: '#191919' },
] as const;

/** Product classifications — determine which attribute set applies. */
export const CLASSIFICATIONS = [
  t('Hand-Knotted Wool Rug'),
  t('Hand-Knotted Silk Blend Rug'),
  t('Hand-Tufted Wool Rug'),
  t('Flat-Woven Cotton Rug'),
  t('Flat-Woven Jute Runner'),
  t('Loom-Woven Bamboo Silk Rug'),
] as const;

export const colorHex = (slug: string): string =>
  COLORS.find((c) => c.slug === slug)?.hex ?? '#A89684';

export const findTerm = (list: readonly Term[], slug: string): Term | undefined =>
  list.find((x) => x.slug === slug);
