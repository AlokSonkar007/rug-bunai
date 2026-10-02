// Minimal cart store — localStorage-backed, context-provided.
// In production this maps to Shopify Storefront API cart lines.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PRODUCTS } from '../data/products';

export interface CartLine {
  readonly variantId: string;
  readonly qty: number;
}

const KEY = 'rugbunai-cart-v1';

type CartCtx = {
  lines: CartLine[];
  add: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  count: number;
  subtotalInr: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines]);

  const value = useMemo<CartCtx>(() => {
    const findVariant = (id: string) => {
      for (const p of PRODUCTS) {
        const v = p.variants.find((x) => x.id === id);
        if (v) return v;
      }
      return undefined;
    };
    return {
      lines,
      add: (variantId) =>
        setLines((ls) => {
          const existing = ls.find((l) => l.variantId === variantId);
          return existing
            ? ls.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + 1 } : l))
            : [...ls, { variantId, qty: 1 }];
        }),
      setQty: (variantId, qty) =>
        setLines((ls) =>
          qty <= 0
            ? ls.filter((l) => l.variantId !== variantId)
            : ls.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
        ),
      remove: (variantId) => setLines((ls) => ls.filter((l) => l.variantId !== variantId)),
      clear: () => setLines([]),
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotalInr: lines.reduce((sum, l) => sum + (findVariant(l.variantId)?.priceInr ?? 0) * l.qty, 0),
    };
  }, [lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = (): CartCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
};

export function variantById(id: string) {
  for (const p of PRODUCTS) {
    const v = p.variants.find((x) => x.id === id);
    if (v) return { product: p, variant: v };
  }
  return undefined;
}
