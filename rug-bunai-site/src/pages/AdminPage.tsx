import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCatalog, type CatalogProduct } from '../lib/catalog';
import { useSiteContent, type TextOverride } from '../lib/siteContent';

const initialForm = { name: '', slug: '', description: '', price: '' };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function AdminPage() {
  const { profile, configured } = useAuth();
  const { products, loading, removeProduct, changeProductPhoto } = useCatalog();
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
      <p className="muted" style={{ marginTop: 12 }}>Add catalogue pieces, remove products, replace photography, and edit the Specifications / Craft Story / Care content shown on every rug page.</p>

      {message && <p className="muted" role="status" style={{ marginTop: 16, color: 'var(--green-deep, #1d7a3b)' }}>{message}</p>}
      {error && <p className="field-error" style={{ marginTop: 16 }}>{error}</p>}

      <TabLabelsSection />
      <TextEditingSection />

      <AddProductForm
        busy={busy} setBusy={setBusy}
        form={form} setForm={setForm}
        newPhoto={newPhoto} setNewPhoto={setNewPhoto}
        onDone={(msg) => { setMessage(msg); setError(null); }}
        onError={(msg) => { setError(msg); setMessage(null); }}
      />

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

/** Renames the three PDP detail-tab headings ("Specifications", "Craft Story", "Care"). */
function TabLabelsSection() {
  const { content, saveContent } = useSiteContent();
  const [labels, setLabels] = useState(content.productTabs);
  const [note, setNote] = useState<string | null>(null);

  const save = async () => {
    try {
      await saveContent({ productTabs: labels });
      setNote('Tab headings saved — applied to every rug page.');
    } catch {
      setNote('Could not save the tab headings.');
    }
  };

  return (
    <section className="summary-card" style={{ marginTop: 30, maxWidth: 760 }}>
      <h2 className="subhead" style={{ marginBottom: 6 }}>Detail-tab headings</h2>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 18 }}>
        Rename the &ldquo;Specifications&rdquo;, &ldquo;Craft Story&rdquo; and &ldquo;Care&rdquo; headings that appear on each rug page.
      </p>
      <div className="form-grid-2">
        {(['details', 'craft', 'care'] as const).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`tab-${k}`}>{k === 'details' ? 'Specifications tab' : k === 'craft' ? 'Craft Story tab' : 'Care tab'}</label>
            <input id={`tab-${k}`} value={labels[k]} onChange={(event) => setLabels({ ...labels, [k]: event.target.value })} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-solid" onClick={() => void save()}>Save headings</button>
        {note && <span className="muted">{note}</span>}
      </div>
    </section>
  );
}

/** Per-rug editor for the text inside the Specifications / Craft Story / Care tabs. */
function TextEditingSection() {
  const { products } = useCatalog();
  const { productOverrides, saveProductText } = useSiteContent();
  const [slugKey, setSlugKey] = useState(products[0]?.slug ?? '');
  const [text, setText] = useState<TextOverride>(() => productOverrides[products[0]?.slug ?? '']?.text ?? {});
  const [note, setNote] = useState<string | null>(null);

  // Re-seed the editor whenever a different rug is picked.
  useEffect(() => {
    setText(productOverrides[slugKey]?.text ?? {});
    setNote(null);
  }, [slugKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const field = (key: keyof TextOverride, label: string, rows = 3) => (
    <div className="field">
      <label htmlFor={`pt-${key}`}>{label}</label>
      <textarea
        id={`pt-${key}`}
        rows={rows}
        value={text[key] ?? ''}
        placeholder="Empty — using the default text for this rug"
        onChange={(event) => setText({ ...text, [key]: event.target.value })}
      />
    </div>
  );

  const save = async () => {
    if (!slugKey) return;
    try {
      await saveProductText(slugKey, text);
      setNote('Saved — live on the storefront immediately.');
    } catch {
      setNote('Could not save — please retry.');
    }
  };

  return (
    <section className="summary-card" style={{ marginTop: 24, maxWidth: 760 }}>
      <h2 className="subhead" style={{ marginBottom: 6 }}>Rug page content</h2>
      <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 18 }}>
        Choose a rug and edit what shoppers see when they open it — the description &amp; craft story behind the
        Craft Story tab, and the care guidance under the Care tab. Leave a field empty to keep its default.
      </p>
      <div className="field">
        <label htmlFor="pt-product">Rug</label>
        <select id="pt-product" value={slugKey} onChange={(event) => setSlugKey(event.target.value)}>
          {products.map((p) => <option key={p.id} value={p.slug}>{p.name}</option>)}
        </select>
      </div>
      {field('name', 'Name', 1)}
      {field('tagline', 'Tagline', 1)}
      {field('description', 'Description (Craft tab body)', 4)}
      {field('craftStory', 'Craft Story pull-quote (Craft tab)', 3)}
      {field('careInstructions', 'Care text (Care tab)', 3)}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-solid" onClick={() => void save()}>Save texts</button>
        <button className="clear-all" onClick={() => { setText({}); void saveProductText(slugKey, {}).catch(() => undefined); setNote('Overrides cleared — defaults restored.'); }}>Reset to defaults</button>
        {note && <span className="muted">{note}</span>}
      </div>
    </section>
  );
}

/** Add-a-product form (extracted so Studio stays readable). */
function AddProductForm(props: {
  busy: boolean;
  setBusy: (v: boolean) => void;
  form: typeof initialForm;
  setForm: React.Dispatch<React.SetStateAction<typeof initialForm>>;
  newPhoto: File | null;
  setNewPhoto: (f: File | null) => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { busy, setBusy, form, setForm, newPhoto, setNewPhoto, onDone, onError } = props;
  const { uploadProductPhoto, createManagedProduct } = useCatalog();

  const addProduct = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const slug = form.slug || slugify(form.name);
      if (!slug) throw new Error('Please enter a product name.');
      const imageUrl = newPhoto ? await uploadProductPhoto(newPhoto) : null;
      await createManagedProduct({
        name: form.name,
        slug,
        description: form.description,
        imageUrl,
        techniqueSlug: 'hand-knotted',
        materialSlug: 'wool',
        roomSlugs: ['living-room'],
        styleSlugs: ['modern'],
        categorySlugs: [],
        offers: [{ sizeKey: '6x9', widthFt: 6, lengthFt: 9, colorSlug: 'ivory', priceInr: Number(form.price), stock: 1 }],
      });
      setForm(initialForm);
      setNewPhoto(null);
      onDone('Product added to the collection.');
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Unable to add the product.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={addProduct} className="summary-card" style={{ marginTop: 24, maxWidth: 760 }}>
      <h2 className="subhead" style={{ marginBottom: 18 }}>Add a product</h2>
      <div className="form-grid-2">
        <div className="field"><label htmlFor="product-name">Name</label><input id="product-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="field"><label htmlFor="product-price">Price (₹)</label><input id="product-price" type="number" min="1" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="product-slug">URL name (optional)</label><input id="product-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} placeholder="generated-from-name" /></div>
      <div className="field"><label htmlFor="product-description">Description</label><textarea id="product-description" rows={4} required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div>
      <div className="field"><label htmlFor="product-photo">Photo</label><input id="product-photo" type="file" accept="image/*" onChange={(event) => setNewPhoto(event.target.files?.[0] ?? null)} /></div>
      <button className="btn btn-solid" disabled={busy} type="submit">{busy ? 'Saving…' : 'Add product'}</button>
    </form>
  );
}
