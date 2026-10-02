// Cart store — localStorage-backed, context-provided. Variant lookups go
// through a registry that the DB-backed catalogue keeps refreshed, so cart
// contents resolve against live (database) products, not hardcoded data.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product, Variant } from '../data/products';

// ── Live variant registry (populated by CatalogueProvider on every load) ─────
const variantRegistry = new Map<string, { product: Product; variant: Variant }>();

let registryNonce = 0;

export function syncVariantRegistry(products: readonly Product[]): void {
  variantRegistry.clear();
  for (const p of products) for (const v of p.variants) variantRegistry.set(v.id, { product: p, variant: v });
  registryNonce += 1;
  notifyRegistry();
}

const registryListeners = new Set<() => void>();
function notifyRegistry(): void {
  for (const l of registryListeners) l();
}

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
  const [nonce, setNonce] = useState(registryNonce);
  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    registryListeners.add(bump);
    return () => { registryListeners.delete(bump); };
  }, []);

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
    const findVariant = (id: string) => variantRegistry.get(id)?.variant;
    void nonce; // recompute totals whenever the live catalogue changes
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
  }, [lines, nonce]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = (): CartCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used within CartProvider');
  return c;
};

export function variantById(id: string) {
  return variantRegistry.get(id);
}
