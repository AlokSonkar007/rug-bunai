import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import CollectionView from './components/CollectionView';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import { ArticlePage, JournalPage } from './pages/JournalPage';
import StoryPage from './pages/StoryPage';
import ContactPage, { NotFound } from './pages/InfoPages';
import { CartPage, CheckoutPage } from './pages/CartPages';
import { LoginPage } from './pages/AuthPages';
import WishlistPage from './pages/WishlistPage';
import AdminPage from './pages/AdminPage';
import { PolicyPage } from './pages/PolicyPages';
import { AuthProvider } from './lib/auth';
import { SiteContentProvider } from './lib/siteContent';
import { CatalogProvider } from './lib/catalog';
import { CartProvider } from './lib/cart';
import { WishlistProvider } from './lib/wishlist';
import './index.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'rugs', element: <CollectionView /> },
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
      { path: 'policies/:slug', element: <PolicyPage /> },
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
