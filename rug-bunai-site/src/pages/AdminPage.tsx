import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCatalog, type CatalogProduct } from '../lib/catalog';

const initialForm = { name: '', slug: '', description: '', price: '' };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function AdminPage() {
  const { profile, configured } = useAuth();
  const { products, loading, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto } = useCatalog();
  const [form, setForm] = useState(initialForm);
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return <div className="wrap empty-state"><h1 className="headline">Connect Supabase first.</h1><p className="muted">Add the two values in <code>.env</code>, then run the SQL setup file.</p></div>;
  }
  if (profile?.role !== 'admin') {
    return <div className="wrap empty-state"><h1 className="headline">Administrator access only.</h1><p className="muted">Sign in with the account you promoted to administrator in Supabase.</p><Link to="/admin/login" className="btn btn-solid" style={{ marginTop: 20 }}>Admin sign in</Link></div>;
  }

  const addProduct = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const slug = form.slug || slugify(form.name);
      if (!slug) throw new Error('Please enter a product name.');
      const imageUrl = newPhoto ? await uploadProductPhoto(newPhoto) : null;
      await createManagedProduct({
        name: form.name,
        slug,
        description: form.description,
        imageUrl,
      
        // Default product classification
        techniqueSlug: 'hand-knotted',
        materialSlug: 'wool',
        roomSlugs: ['living-room'],
        styleSlugs: ['modern'],
        categorySlugs: [],
      
        // Default size, colour, price and stock
        offers: [
          {
            sizeKey: '6x9',
            widthFt: 6,
            lengthFt: 9,
            colorSlug: 'ivory',
            priceInr: Number(form.price),
            stock: 1,
          },
        ],
      });
      setForm(initialForm);
      setNewPhoto(null);
      setMessage('Product added to the collection.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add the product.');
    } finally {
      setBusy(false);
    }
  };

  const updatePhoto = async (product: CatalogProduct, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await changeProductPhoto(product, file);
      setMessage('Product photo updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the photo.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product: CatalogProduct) => {
    if (!window.confirm('Remove ' + product.name + ' from the collection?')) return;
    setBusy(true);
    setError(null);
    try {
      await removeProduct(product);
      setMessage('Product removed from the collection.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove the product.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap section">
      <p className="eyebrow">Rug Bunai studio</p>
      <h1 className="display" style={{ marginTop: 10 }}>Product management</h1>
      <p className="muted" style={{ marginTop: 12 }}>Add catalogue pieces, remove products, or replace product photography.</p>

      <form onSubmit={addProduct} className="summary-card" style={{ marginTop: 30, maxWidth: 760 }}>
        <h2 className="subhead" style={{ marginBottom: 18 }}>Add a product</h2>
        <div className="form-grid-2">
          <div className="field"><label htmlFor="product-name">Name</label><input id="product-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="field"><label htmlFor="product-price">Price (₹)</label><input id="product-price" type="number" min="1" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="product-slug">URL name (optional)</label><input id="product-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} placeholder="generated-from-name" /></div>
        <div className="field"><label htmlFor="product-description">Description</label><textarea id="product-description" rows={4} required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
        <div className="field"><label htmlFor="product-photo">Photo</label><input id="product-photo" type="file" accept="image/*" onChange={(event) => setNewPhoto(event.target.files?.[0] ?? null)} /></div>
        {error && <p className="field-error">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-solid" disabled={busy} type="submit">{busy ? 'Saving…' : 'Add product'}</button>
      </form>

      <section style={{ marginTop: 56 }}>
        <div className="axis-head"><div><p className="eyebrow">Current catalogue</p><h2 className="headline">Products</h2></div><p className="muted">{loading ? 'Loading…' : products.length + ' products'}</p></div>
        <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
          {products.map((product) => (
            <article key={product.id} className="summary-card" style={{ display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 18, alignItems: 'center', padding: 14 }}>
              <img src={product.imageUrl || 'https://placehold.co/176x132?text=Rug'} alt="" width={88} height={66} style={{ objectFit: 'cover', background: '#e9e1d6' }} />
              <div><h3 className="subhead">{product.name}</h3><p className="card-meta">/{product.slug}{product.isManaged ? ' · added product' : ''}</p></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>Change photo<input hidden type="file" accept="image/*" disabled={busy} onChange={(event) => void updatePhoto(product, event.target.files?.[0])} /></label>
                <button className="clear-all" disabled={busy} onClick={() => void remove(product)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
