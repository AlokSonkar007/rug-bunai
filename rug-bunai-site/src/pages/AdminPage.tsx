import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCatalog, type CatalogProduct, type NewProductInput, type OfferInput } from '../lib/catalog';
import { COLORS, MATERIALS, ROOMS, STYLES, TECHNIQUES, CARPET_CATEGORIES } from '../data/vocabularies';
import { SIZE_OPTIONS } from '../lib/sizes';

const initialForm = {
  name: '',
  slug: '',
  description: '',
  price: '',
  techniqueSlug: TECHNIQUES[0].slug,
  materialSlug: MATERIALS[0].slug,
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

export default function AdminPage() {
  const { profile, configured } = useAuth();
  const { products, loading, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto } = useCatalog();
  const [form, setForm] = useState(initialForm);
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [sizeKeys, setSizeKeys] = useState<string[]>(['6x9']);
  const [colorSlugs, setColorSlugs] = useState<string[]>(['ivory']);
  const [roomSlugs, setRoomSlugs] = useState<string[]>(['living-room']);
  const [styleSlugs, setStyleSlugs] = useState<string[]>(['modern']);
  const [categorySlugs, setCategorySlugs] = useState<string[]>([]);
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
      const price = Number(form.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Enter a valid price in ₹.');
      if (!sizeKeys.length) throw new Error('Choose at least one size for this rug.');
      if (!colorSlugs.length) throw new Error('Choose at least one colour for this rug.');
      const imageUrl = newPhoto ? await uploadProductPhoto(newPhoto) : null;
      const offers: OfferInput[] = [];
      for (const key of sizeKeys) {
        const size = SIZE_OPTIONS.find((s) => s.key === key);
        if (!size || size.custom) continue;
        for (const colorSlug of colorSlugs) {
          offers.push({
            sizeKey: key,
            widthFt: size.ft[0],
            lengthFt: size.ft[1],
            colorSlug,
            priceInr: price,
            stock: 5,
          });
        }
      }
      const input: NewProductInput = {
        name: form.name,
        slug,
        description: form.description,
        imageUrl,
        techniqueSlug: form.techniqueSlug,
        materialSlug: form.materialSlug,
        roomSlugs,
        styleSlugs,
        categorySlugs,
        offers,
      };
      await createManagedProduct(input);
      setForm(initialForm);
      setNewPhoto(null);
      setSizeKeys(['6x9']);
      setColorSlugs(['ivory']);
      setRoomSlugs(['living-room']);
      setStyleSlugs(['modern']);
      setCategorySlugs([]);
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
        <div className="form-grid-2">
          <div className="field">
            <label htmlFor="product-technique">Technique</label>
            <select id="product-technique" value={form.techniqueSlug} onChange={(event) => setForm({ ...form, techniqueSlug: event.target.value })}>
              {TECHNIQUES.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="product-material">Material</label>
            <select id="product-material" value={form.materialSlug} onChange={(event) => setForm({ ...form, materialSlug: event.target.value })}>
              {MATERIALS.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label htmlFor="product-slug">URL name (optional)</label><input id="product-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} placeholder="generated-from-name" /></div>
        <div className="field"><label htmlFor="product-description">Description</label><textarea id="product-description" rows={4} required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="subhead" style={{ fontSize: '1rem', marginBottom: 8 }}>Sizes (ft)</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SIZE_OPTIONS.filter((s) => !s.custom).map((size) => (
              <label key={size.key} className="btn btn-ghost" style={{ cursor: 'pointer', borderColor: sizeKeys.includes(size.key) ? 'currentColor' : undefined, fontWeight: sizeKeys.includes(size.key) ? 700 : 400 }}>
                <input hidden type="checkbox" checked={sizeKeys.includes(size.key)} onChange={() => setSizeKeys((prev) => toggle(prev, size.key))} />
                {size.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="subhead" style={{ fontSize: '1rem', marginBottom: 8 }}>Colour</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {COLORS.map((color) => (
              <label key={color.slug} className="btn btn-ghost" style={{ cursor: 'pointer', borderColor: colorSlugs.includes(color.slug) ? 'currentColor' : undefined, fontWeight: colorSlugs.includes(color.slug) ? 700 : 400 }}>
                <input hidden type="checkbox" checked={colorSlugs.includes(color.slug)} onChange={() => setColorSlugs((prev) => toggle(prev, color.slug))} />
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color.hex, border: '1px solid rgba(0,0,0,.2)', marginRight: 6, verticalAlign: 'middle' }} />
                {color.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="subhead" style={{ fontSize: '1rem', marginBottom: 8 }}>Rooms</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ROOMS.map((room) => (
              <label key={room.slug} className="btn btn-ghost" style={{ cursor: 'pointer', fontWeight: roomSlugs.includes(room.slug) ? 700 : 400 }}>
                <input hidden type="checkbox" checked={roomSlugs.includes(room.slug)} onChange={() => setRoomSlugs((prev) => toggle(prev, room.slug))} />
                {room.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="subhead" style={{ fontSize: '1rem', marginBottom: 8 }}>Styles</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {STYLES.map((style) => (
              <label key={style.slug} className="btn btn-ghost" style={{ cursor: 'pointer', fontWeight: styleSlugs.includes(style.slug) ? 700 : 400 }}>
                <input hidden type="checkbox" checked={styleSlugs.includes(style.slug)} onChange={() => setStyleSlugs((prev) => toggle(prev, style.slug))} />
                {style.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
          <legend className="subhead" style={{ fontSize: '1rem', marginBottom: 8 }}>Carpet categories</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CARPET_CATEGORIES.map((category) => (
              <label key={category.slug} className="btn btn-ghost" style={{ cursor: 'pointer', fontWeight: categorySlugs.includes(category.slug) ? 700 : 400 }}>
                <input hidden type="checkbox" checked={categorySlugs.includes(category.slug)} onChange={() => setCategorySlugs((prev) => toggle(prev, category.slug))} />
                {category.label}
              </label>
            ))}
          </div>
        </fieldset>

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
