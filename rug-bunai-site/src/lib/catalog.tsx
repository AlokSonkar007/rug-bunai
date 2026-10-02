// ─────────────────────────────────────────────────────────────────────────────
// CatalogueProvider — one DB-backed product pool shared by every page, kept in
// sync with the auth session (admins can opt into unpublished rows).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useCatalogue, type CatalogueState } from './products';
import { syncVariantRegistry } from './cart';

const Ctx = createContext<CatalogueState | null>(null);

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const catalogue = useCatalogue(auth.session, auth.isAdmin);

  // Keep the cart's variant registry pointed at live database products.
  useEffect(() => {
    if (!catalogue.loading && !catalogue.error) syncVariantRegistry(catalogue.products);
  }, [catalogue.products, catalogue.loading, catalogue.error]);

  return <Ctx.Provider value={catalogue}>{children}</Ctx.Provider>;
}

export function useProducts(): CatalogueState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useProducts must be used within CatalogueProvider');
  return c;
}
