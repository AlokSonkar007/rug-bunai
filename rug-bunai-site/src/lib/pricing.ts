// ─────────────────────────────────────────────────────────────────────────────
// TRUSTED PRICING — the single place that decides what a rug costs.
//
// The database (supabase/migrations/0007_cod_orders_trusted_pricing.sql) is
// the authoritative money source: public.create_order() recomputes every
// total from public.product_prices + the immutable ₹90/sq ft coating rule.
// This module mirrors those EXACT rules in TypeScript so the UI displays
// what the server will charge, and `buildOrderItems()` refuses to send any
// line whose browser-side numbers disagree with a fresh trusted calculation.
// Browser-supplied amounts are therefore never trusted anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import type { Product } from '../data/products';
import { feetOf, isValidCustomPair, STAIN_COAT_RATE_INR_PER_SQFT } from './sizes';

/** Coating cost for ONE unit, from validated feet dimensions (₹ rounded). */
export function coatInrForFt(widthFt: number, lengthFt: number): number {
  if (!isValidCustomPair(widthFt, lengthFt)) return 0;
  // Mirror the DB exactly: sqft rounded to 0.1, then × ₹90, rounded once.
  const sqft = Math.round(widthFt * lengthFt * 10) / 10;
  return Math.round(sqft * STAIN_COAT_RATE_INR_PER_SQFT);
}

/** Trusted unit price (INR) for a STANDARD catalogue variant. */
export function standardUnitPriceInr(variantPriceInr: number): number {
  if (!Number.isInteger(variantPriceInr) || variantPriceInr <= 0) {
    throw new Error('This item has no valid listed price — please contact the studio.');
  }
  return variantPriceInr;
}

/**
 * Trusted estimate for a CUSTOM Studio size, identical to the SQL rule in
 * create_order(): min(listed price for the product) × custom sq ft, rounded.
 * (The atelier confirms the final figure before dispatch.)
 */
export function customEstimateInr(minVariantPriceInr: number, widthFt: number, lengthFt: number): number {
  if (!Number.isInteger(minVariantPriceInr) || minVariantPriceInr <= 0) {
    throw new Error('This piece needs a studio quote for custom sizes — please contact us.');
  }
  if (!isValidCustomPair(widthFt, lengthFt)) {
    throw new Error('That custom size is outside our 2–150 sq ft range.');
  }
  return Math.round(minVariantPriceInr * widthFt * lengthFt);
}

/** Cheapest listed variant price for a product — mirrors `min(price_inr)` in SQL. */
export function minVariantPriceInr(product: Product): number {
  const prices = product.variants.map((v) => v.priceInr).filter((p) => Number.isInteger(p) && p > 0);
  if (prices.length === 0) throw new Error(`"${product.name}" has no listed price — please contact the studio.`);
  return Math.min(...prices);
}

/** Canonical feet for a stored dimension pair (shared with the cart). */
export const variantFeet = (variant: { width: { cm: number }; length: { cm: number } }) => ({
  widthFt: feetOf(variant.width),
  lengthFt: feetOf(variant.length),
});
