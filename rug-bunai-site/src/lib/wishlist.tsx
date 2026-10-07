import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';

type WishlistContextValue = {
  productSlugs: ReadonlySet<string>;
  loading: boolean;
  has: (slug: string) => boolean;
  toggle: (slug: string) => Promise<void>;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase || !user) {
      setSlugs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void supabase.from('wishlist_items')
      .select('product_slug')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (!error) setSlugs((data ?? []).map((item) => item.product_slug));
        setLoading(false);
      });
  }, [user]);

  const toggle = useCallback(async (slug: string) => {
    if (!supabase || !user) throw new Error('Please sign in to save rugs to your wishlist.');
    if (slugs.includes(slug)) {
      const { error } = await supabase.from('wishlist_items').delete()
        .eq('user_id', user.id)
        .eq('product_slug', slug);
      if (error) throw error;
      setSlugs((current) => current.filter((item) => item !== slug));
    } else {
      const { error } = await supabase.from('wishlist_items').insert({
        user_id: user.id,
        product_slug: slug,
      });
      if (error) throw error;
      setSlugs((current) => [...current, slug]);
    }
  }, [slugs, user]);

  const value = useMemo(() => ({
    productSlugs: new Set(slugs),
    loading,
    has: (slug: string) => slugs.includes(slug),
    toggle,
  }), [loading, slugs, toggle]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider.');
  return context;
}
