import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product, Variant } from '../data/products';
import { useAuth } from './auth';
import { useCatalog } from './catalog';
import { supabase } from './supabase';

export interface CartLine {
  readonly variantId: string;
  readonly qty: number;
}

export type ResolvedCartLine = { product: Product; variant: Variant; qty: number };

const KEY = 'rugbunai-cart-v2';

type CartCtx = {
  lines: CartLine[];
  items: ResolvedCartLine[];
  add: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  count: number;
  subtotalInr: number;
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
          setLines((data ?? []).map((item) => ({ variantId: item.variant_id, qty: item.quantity })));
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
    for (const product of products) {
      const variant = product.variants.find((item) => item.id === line.variantId);
      if (variant) return [{ product, variant, qty: line.qty }];
    }
    return [];
  }), [lines, products]);

  const value = useMemo<CartCtx>(() => ({
    lines,
    items,
    add(variantId) {
      setLines((current) => {
        const existing = current.find((line) => line.variantId === variantId);
        return existing
          ? current.map((line) => line.variantId === variantId ? { ...line, qty: line.qty + 1 } : line)
          : [...current, { variantId, qty: 1 }];
      });
    },
    setQty(variantId, qty) {
      setLines((current) => qty <= 0
        ? current.filter((line) => line.variantId !== variantId)
        : current.map((line) => line.variantId === variantId ? { ...line, qty } : line));
    },
    remove(variantId) {
      setLines((current) => current.filter((line) => line.variantId !== variantId));
    },
    clear() {
      setLines([]);
    },
    count: lines.reduce((total, line) => total + line.qty, 0),
    subtotalInr: items.reduce((total, line) => total + line.variant.priceInr * line.qty, 0),
  }), [items, lines]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = (): CartCtx => {
  const context = useContext(Ctx);
  if (!context) throw new Error('useCart must be used within CartProvider.');
  return context;
};
