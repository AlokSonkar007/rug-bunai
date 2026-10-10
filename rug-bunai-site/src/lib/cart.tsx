import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product, Variant } from '../data/products';
import { useAuth } from './auth';
import { useCatalog, type CustomOffer } from './catalog';
import { supabase } from './supabase';
import { feetOf, lineSqft, lineTotalInr, stainCoatCost } from './sizes';

export interface CartLine {
  readonly variantId: string;
  readonly qty: number;
  /** Optional stain-resistant coating add-on (₹90/sq ft — see sizes.ts). */
  readonly coating?: boolean;
  /** Present only for Studio custom-size / custom-colour offers. */
  readonly custom?: CustomOffer;
}

export type ResolvedCartLine = {
  product: Product;
  variant: Variant;
  qty: number;
  coating: boolean;
  custom?: CustomOffer;
  /** Width & length in FEET — the canonical unit across cart/checkout/orders. */
  widthFt: number;
  lengthFt: number;
  sqft: number;
  /** Rug price for one unit (custom offers carry their own estimate). */
  unitPriceInr: number;
  /** Coating charge for ONE unit at ₹90/sq ft (0 when not selected). */
  coatPerUnitInr: number;
  /** Line total = (price + coating) × qty — computed once, never twice. */
  lineTotalInr: number;
};

const KEY = 'rugbunai-cart-v3';

type CartCtx = {
  lines: CartLine[];
  items: ResolvedCartLine[];
  /** Add a standard variant, optionally with the stain-resistant coating. */
  add: (variantId: string, options?: { coating?: boolean }) => void;
  /** Add a Studio custom-size / custom-colour offer as its own cart line. */
  addCustom: (product: Product, offer: CustomOffer) => void;
  setQty: (variantId: string, qty: number) => void;
  setCoating: (variantId: string, coating: boolean) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  count: number;
  subtotalInr: number;
  rugSubtotalInr: number;
  coatingTotalInr: number;
};

const Ctx = createContext<CartCtx | null>(null);

function savedGuestCart(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { products } = useCatalog();
  const [lines, setLines] = useState<CartLine[]>(savedGuestCart);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const userKey = user?.id ?? 'guest';

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user) {
      setLines(savedGuestCart());
      setHydratedFor('guest');
      return;
    }
    setHydratedFor(null);
    void supabase.from('cart_items')
      .select('variant_id, quantity')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) {
          // Server rows carry standard variants; local options (coating /
          // custom Studio offers) are merged back in by variant id.
          const local = savedGuestCart();
          const localById = new Map(local.map((line) => [line.variantId, line]));
          setLines((data ?? []).map((item) => {
            const prev = localById.get(item.variant_id);
            return {
              variantId: item.variant_id,
              qty: item.quantity,
              ...(prev?.coating ? { coating: true } : {}),
              ...(prev?.custom ? { custom: prev.custom } : {}),
            };
          }));
        }
        setHydratedFor(user.id);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (hydratedFor !== userKey) return;
    if (!supabase || !user) {
      localStorage.setItem(KEY, JSON.stringify(lines));
      return;
    }
    const persist = async () => {
      if (!supabase) return;
      const { error: clearError } = await supabase.from('cart_items').delete().eq('user_id', user.id);
      if (clearError) return;
      if (lines.length) {
        await supabase.from('cart_items').insert(
          lines.map((line) => ({ user_id: user.id, variant_id: line.variantId, quantity: line.qty })),
        );
      }
    };
    void persist();
  }, [hydratedFor, lines, user, userKey]);

  const items = useMemo<ResolvedCartLine[]>(() => lines.flatMap((line) => {
    let product: Product | undefined;
    let variant: Variant | undefined;
    for (const candidate of products) {
      const found = candidate.variants.find((item) => item.id === line.variantId);
      if (found) { product = candidate; variant = found; break; }
    }
    // Custom Studio offers are synthesised variants keyed `custom-…`.
    if (!variant && line.custom) {
      const offer = line.custom;
      product = products.find((candidate) => candidate.slug === offer.productSlug);
      if (product) {
        variant = {
          id: line.variantId,
          sku: `${product.slug.toUpperCase().slice(0, 6)}-CUSTOM`,
          sizeLabel: offer.sizeLabel,
          width: { cm: Math.round(offer.widthFt * 30.48), in: Math.round(offer.widthFt * 12) },
          length: { cm: Math.round(offer.lengthFt * 30.48), in: Math.round(offer.lengthFt * 12) },
          colorSlug: offer.colorHex ? 'custom' : offer.colorSlug,
          priceInr: offer.priceInr,
          stock: 1,
        };
      }
    }
    if (!product || !variant) return [];
    const widthFt = feetOf(variant.width);
    const lengthFt = feetOf(variant.length);
    // Round sq ft to 0.1 so stored-cm drift never changes the ₹ amount.
    const sqft = Math.round(widthFt * lengthFt * 10) / 10;
    void lineSqft; // canonical cm→sqft helper kept exported for tests/parity
    const coatPerUnitInr = line.coating ? stainCoatCost(sqft) : 0;
    return [{
      product,
      variant,
      qty: line.qty,
      coating: Boolean(line.coating),
      custom: line.custom,
      widthFt,
      lengthFt,
      sqft,
      unitPriceInr: variant.priceInr,
      coatPerUnitInr,
      lineTotalInr: lineTotalInr(variant.priceInr, coatPerUnitInr, line.qty),
    }];
  }), [lines, products]);

  const value = useMemo<CartCtx>(() => {
    const rugSubtotalInr = items.reduce((total, item) => total + item.unitPriceInr * item.qty, 0);
    const coatingTotalInr = items.reduce((total, item) => total + item.coatPerUnitInr * item.qty, 0);
    return {
      lines,
      items,
      add(variantId, options) {
        setLines((current) => {
          const existing = current.find((entry) => entry.variantId === variantId);
          if (existing) {
            return current.map((entry) => entry.variantId === variantId
              ? { ...entry, qty: entry.qty + 1, ...(options?.coating ? { coating: true } : {}) }
              : entry);
          }
          return [...current, { variantId, qty: 1, ...(options?.coating ? { coating: true } : {}) }];
        });
      },
      addCustom(product, offer) {
        // Each custom request is its own line — never merges with a standard
        // variant and never inherits an unrelated standard-size price.
        setLines((current) => [
          ...current,
          { variantId: offer.id, qty: 1, ...(offer.coating ? { coating: true } : {}), custom: { ...offer, productSlug: product.slug } },
        ]);
      },
      setQty(variantId, qty) {
        setLines((current) => qty <= 0
          ? current.filter((entry) => entry.variantId !== variantId)
          : current.map((entry) => entry.variantId === variantId ? { ...entry, qty } : entry));
      },
      setCoating(variantId, coating) {
        setLines((current) => current.map((entry) => entry.variantId === variantId
          ? { ...entry, ...(coating ? { coating: true } : { coating: false }) }
          : entry));
      },
      remove(variantId) {
        setLines((current) => current.filter((entry) => entry.variantId !== variantId));
      },
      clear() {
        setLines([]);
      },
      count: lines.reduce((total, entry) => total + entry.qty, 0),
      subtotalInr: rugSubtotalInr + coatingTotalInr,
      rugSubtotalInr,
      coatingTotalInr,
    };
  }, [items, lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = (): CartCtx => {
  const context = useContext(Ctx);
  if (!context) throw new Error('useCart must be used within CartProvider.');
  return context;
};
