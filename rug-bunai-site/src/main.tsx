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
import { CartProvider } from './lib/cart';
import { AuthProvider } from './lib/auth';
import { CatalogueProvider } from './lib/catalog';
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
      { path: 'contact', element: <ContactPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CatalogueProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </CatalogueProvider>
    </AuthProvider>
  </StrictMode>,
);
