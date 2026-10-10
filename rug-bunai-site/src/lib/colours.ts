// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT COLOUR MANAGEMENT — shared logic for admin-defined colour options
// and customer custom-colour requests.
//
// One canonical model used by BOTH the Studio (admin) forms and the PDP:
//  • A ProductColourOption is one swatch an admin offers for a specific rug.
//    Standard options reference the controlled COLORS vocabulary (slug + hex);
//    extended options carry a name/hex that isn't in the vocabulary yet.
//  • Admin edits persist into the product JSON stored in Supabase
//    (managed_products.product / product_overrides.text via catalog.tsx) —
//    never only in component state.
//  • Customer custom colours are REQUESTS (CustomColourRequest): production
//    feasibility and the final shade must be confirmed by Rug Bunai. They
//    ride along with the cart line's CustomOffer so they reach checkout.
// ─────────────────────────────────────────────────────────────────────────────

import { COLORS, colorHex } from '../data/vocabularies';

/** One admin-managed colour offered for a specific rug. */
export interface ProductColourOption {
  readonly slug: string;      // controlled-vocabulary slug when available
  readonly label: string;     // display name, e.g. "Ivory", "Sage Green"
  readonly hex: string;       // validated #rrggbb
}

/** A customer-requested colour outside the admin's predefined options. */
export interface CustomColourRequest {
  readonly hex: string;
  readonly name?: string;     // optional descriptive name ("Dusty teal")
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** True only for a full 6-digit hex value like `#D9D0BC`. */
export function isValidHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Normalise to lowercase `#rrggbb`; null when invalid. */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  const expanded = /^#[0-9a-fA-F]{3}$/.test(trimmed)
    ? '#' + [...trimmed.slice(1)].map((c) => c + c).join('')
    : trimmed;
  return isValidHex(expanded) ? expanded.toLowerCase() : null;
}

/** URL-safe slug for free-text colour names ("Sage Green" → "sage-green"). */
export function colourSlugFor(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Human-readable name from any slug ("sage-green" → "Sage green"). */
export function colourLabelFor(slug: string): string {
  const words = slug.replace(/-/g, ' ').trim();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Validate one admin colour row; returns a normalised copy or an error message. */
export function validateColourOption(input: {
  label: string;
  hex: string;
  slug?: string;
}): ProductColourOption | { error: string } {
  const label = input.label.trim();
  if (label.length < 2) return { error: 'Colour name required (e.g. Ivory).' };
  const hex = normalizeHex(input.hex);
  if (!hex) return { error: `"${input.hex.trim()}" is not a valid hex colour — use #RRGGBB.` };
  const slug = (input.slug ?? colourSlugFor(label)).trim() || colourSlugFor(label);
  return { slug, label, hex };
}

/** De-duplicate by slug or case-insensitive name; keeps first occurrence. */
export function dedupeColourOptions(options: readonly ProductColourOption[]): ProductColourOption[] {
  const seen = new Set<string>();
  const out: ProductColourOption[] = [];
  for (const option of options) {
    const key = option.slug.toLowerCase() + '|' + option.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

/**
 * Merge admin colour options into a product record WITHOUT touching variants.
 * Removing a colour here never deletes unrelated size/colour variant rows —
 * the PDP simply stops offering it.
 */
export function applyColourOptions<T extends { colorSlugs: readonly string[] }>(
  product: T,
  options: readonly ProductColourOption[],
): T & { colourOptions: ProductColourOption[] } {
  const clean = dedupeColourOptions(options);
  return { ...product, colorSlugs: clean.map((o) => o.slug), colourOptions: clean };
}

/**
 * Resolve the colour options shown on the PDP for a product:
 * admin-managed `colourOptions` when present, otherwise the standard
 * vocabulary colours derived from `colorSlugs`. Never crashes on unknown
 * slugs (falls back to the neutral palette hex).
 */
export function resolveColourOptions(product: {
  colorSlugs: readonly string[];
  colourOptions?: readonly ProductColourOption[];
}): ProductColourOption[] {
  const managed = product.colourOptions;
  if (managed && managed.length > 0) {
    return dedupeColourOptions(
      managed.filter(
        (o) => typeof o?.slug === 'string' && typeof o?.label === 'string' && isValidHex(o?.hex ?? ''),
      ),
    );
  }
  return product.colorSlugs.map((slug) => ({
    slug,
    label: colourLabelFor(findTermLabel(slug) ?? slug),
    hex: colorHex(slug),
  }));
}

function findTermLabel(slug: string): string | undefined {
  return COLORS.find((c) => c.slug === slug)?.label;
}

/** Compare a request against the predefined list (case/format tolerant). */
export function isCustomSelection(request: CustomColourRequest, options: readonly ProductColourOption[]): boolean {
  const hex = normalizeHex(request.hex);
  if (!hex) return false;
  return !options.some((o) => normalizeHex(o.hex) === hex);
}
