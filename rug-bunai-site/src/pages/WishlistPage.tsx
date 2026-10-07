import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { useWishlist } from '../lib/wishlist';

export default function WishlistPage() {
  const { user } = useAuth();
  const { products } = useCatalog();
  const { productSlugs, loading } = useWishlist();
  const saved = products.filter((product) => productSlugs.has(product.slug));

  if (!user) {
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Your saved rugs</p>
        <h1 className="headline">Sign in to keep your wishlist.</h1>
        <p className="muted">Your saved pieces will follow you to any device.</p>
        <Link className="btn btn-solid" style={{ marginTop: 22 }} to="/login">Customer sign in</Link>
      </div>
    );
  }

  return (
    <div className="wrap section">
      <p className="eyebrow">Customer account</p>
      <h1 className="display" style={{ marginTop: 10 }}>Your wishlist</h1>
      {loading ? <p className="muted">Loading your saved pieces…</p> : saved.length ? (
        <div className="grid-products" style={{ marginTop: 30 }}>
          {saved.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="empty-state">
          <p className="muted">There are no saved pieces yet.</p>
          <Link to="/rugs" className="btn btn-solid" style={{ marginTop: 22 }}>Explore the collection</Link>
        </div>
      )}
    </div>
  );
}
