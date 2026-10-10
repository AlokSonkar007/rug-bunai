import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import CollectionView, { CategoryCollectionView } from './components/CollectionView';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import { ArticlePage, JournalPage } from './pages/JournalPage';
import StoryPage from './pages/StoryPage';
import ContactPage, { NotFound } from './pages/InfoPages';
import { CartPage, CheckoutPage } from './pages/CartPages';
import { LoginPage } from './pages/AuthPages';
import WishlistPage from './pages/WishlistPage';
import AdminPage from './pages/AdminPage';
import { AuthProvider } from './lib/auth';
import { CatalogProvider } from './lib/catalog';
import { CartProvider } from './lib/cart';
import { WishlistProvider } from './lib/wishlist';
import { SiteContentProvider } from './lib/siteContent';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'rugs', element: <CollectionView /> },
      // Curated design-category collections (e.g. /collections/shaggy-carpets).
      // Declared before 'rugs/:slug' so product slugs keep priority elsewhere;
      // this is its own branch and never collides with product detail pages.
      { path: 'collections/:categorySlug', element: <CategoryCollectionView /> },
      { path: 'rugs/:slug', element: <ProductPage /> },
      { path: 'journal', element: <JournalPage /> },
      { path: 'journal/:slug', element: <ArticlePage /> },
      { path: 'story', element: <StoryPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'admin/login', element: <LoginPage adminOnly /> },
      { path: 'admin', element: <AdminPage /> },
      { path: 'contact', element: <ContactPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SiteContentProvider>
        <CatalogProvider>
          <CartProvider>
            <WishlistProvider>
              <RouterProvider router={router} />
            </WishlistProvider>
          </CartProvider>
        </CatalogProvider>
      </SiteContentProvider>
    </AuthProvider>
  </StrictMode>,
);
