import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCatalog, type CatalogProduct } from '../lib/catalog';
import { COLORS } from '../data/vocabularies';
import {
  colourLabelFor, dedupeColourOptions, isValidHex, normalizeHex, resolveColourOptions, validateColourOption,
  type ProductColourOption,
} from '../lib/colours';

const initialForm = { name: '', slug: '', description: '', price: '' };

/** Draft row in the admin colour editor — empty until filled & validated. */
type ColourDraft = { label: string; hex: string };
const emptyDraft: ColourDraft = { label: '', hex: '#D9D0BC' };

function draftFromOption(option: ProductColourOption): ColourDraft {
  return { label: option.label, hex: option.hex };
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Quick-pick chips from the canonical vocabulary for a new colour row. */
function VocabularyQuickPick({ onPick }: { onPick: (label: string, hex: string) => void }) {
  return (
    <div className="colour-quickpick" role="group" aria-label="Suggest a house colour">
      {COLORS.slice(0, 8).map((c) => (
        <button
          key={c.slug}
          type="button"
          className="colour-quickpick-btn"
          title={`Use ${c.label}`}
          onClick={() => onPick(c.label, c.hex)}
        >
          <span className="facet-swatch" style={{ background: c.hex }} aria-hidden="true" />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Reusable admin colour list editor (add / edit / remove, validated). */
function ColourEditor({
  colours, onChange, idPrefix,
}: {
  colours: ProductColourOption[];
  onChange: (next: ProductColourOption[]) => void;
  idPrefix: string;
}) {
  const [draft, setDraft] = useState<ColourDraft>(emptyDraft);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const commit = () => {
    setRowError(null);
    const result = validateColourOption(draft);
    if ('error' in result) { setRowError(result.error); return; }
    if (colours.some((c) => c.slug === result.slug && c.slug !== editingSlug)) {
      setRowError(`"${result.label}" is already in the list.`);
      return;
    }
    const next = editingSlug
      ? colours.map((c) => (c.slug === editingSlug ? result : c))
      : [...colours, result];
    onChange(dedupeColourOptions(next));
    setDraft(emptyDraft);
    setEditingSlug(null);
  };

  const startEdit = (option: ProductColourOption) => {
    setEditingSlug(option.slug);
    setDraft(draftFromOption(option));
    setRowError(null);
  };

  const removeColour = (slug: string) => {
    // Only touches this product's colour list — variants are untouched.
    onChange(colours.filter((c) => c.slug !== slug));
    if (editingSlug === slug) { setEditingSlug(null); setDraft(emptyDraft); }
  };

  return (
    <div className="colour-editor">
      <ul className="colour-editor-list">
        {colours.length === 0 && <li className="muted" style={{ fontSize: '0.82rem' }}>No colour options yet.</li>}
        {colours.map((c) => (
          <li key={c.slug}>
            <span className="facet-swatch" style={{ background: c.hex }} aria-hidden="true" />
            <span className="colour-editor-name">{c.label}</span>
            <code className="colour-editor-hex">{c.hex}</code>
            <button type="button" className="clear-all" onClick={() => startEdit(c)}>Edit</button>
            <button type="button" className="clear-all" onClick={() => removeColour(c.slug)}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="colour-editor-form">
        <div className="field" style={{ marginBottom: 10 }}>
          <label htmlFor={idPrefix + '-colour-name'}>{editingSlug ? 'Colour name (editing)' : 'Colour name'}</label>
          <input
            id={idPrefix + '-colour-name'}
            value={draft.label}
            placeholder="e.g. Sage Green"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </div>
        <div className="form-grid-2" style={{ alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 10 }}>
            <label htmlFor={idPrefix + '-colour-hex'}>Hex value</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id={idPrefix + '-colour-hex'}
                value={draft.hex}
                maxLength={7}
                onChange={(e) => setDraft({ ...draft, hex: e.target.value })}
                onBlur={(e) => { const n = normalizeHex(e.target.value); if (n) setDraft((d) => ({ ...d, hex: n })); }}
              />
              <input
                type="color"
                aria-label="Pick colour visually"
                value={isValidHex(draft.hex) ? draft.hex : '#D9D0BC'}
                onChange={(e) => setDraft((d) => ({ ...d, hex: e.target.value }))}
                style={{ width: 42, height: 38, padding: 2, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--paper)' }}
              />
            </div>
          </div>
          <button type="button" className="btn" onClick={commit} disabled={draft.label.trim().length < 2 || !isValidHex(draft.hex)}>
            {editingSlug ? 'Update colour' : 'Add colour'}
          </button>
        </div>
        {rowError && <p className="field-error">{rowError}</p>}
        {!editingSlug && <VocabularyQuickPick onPick={(label, hex) => setDraft({ label, hex })} />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { profile, configured } = useAuth();
  const { products, loading, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto, saveProductColours } = useCatalog();
  const [form, setForm] = useState(initialForm);
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [newColours, setNewColours] = useState<ProductColourOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [colourEditorFor, setColourEditorFor] = useState<string | null>(null);
  const [editorColours, setEditorColours] = useState<ProductColourOption[]>([]);
  const [savingColoursFor, setSavingColoursFor] = useState<string | null>(null);

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
        // Admin-defined colour options for this rug (validated before submit).
        colourOptions: newColours,
      });
      setForm(initialForm);
      setNewPhoto(null);
      setNewColours([]);
      setMessage('Product added to the collection.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to add the product.');
    } finally {
      setBusy(false);
    }
  };

  const openColourEditor = (product: CatalogProduct) => {
    setColourEditorFor(product.slug);
    setEditorColours(resolveColourOptions(product));
    setError(null);
  };

  const saveColours = async (product: CatalogProduct) => {
    setSavingColoursFor(product.slug);
    setError(null);
    try {
      await saveProductColours(product, editorColours);
      setMessage(`Colours saved for ${product.name}.`);
      setColourEditorFor(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save colours.');
    } finally {
      setSavingColoursFor(null);
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
        <div className="field">
          <label id="new-colours-label">Available colours (optional)</label>
          <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 10 }}>Define the swatches customers can choose on this rug’s page. Add as many as needed before saving.</p>
          <ColourEditor colours={newColours} onChange={setNewColours} idPrefix="new-product" />
        </div>
        {error && <p className="field-error">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="btn btn-solid" disabled={busy} type="submit">{busy ? 'Saving…' : 'Add product'}</button>
      </form>

      <section style={{ marginTop: 56 }}>
        <div className="axis-head"><div><p className="eyebrow">Current catalogue</p><h2 className="headline">Products</h2></div><p className="muted">{loading ? 'Loading…' : products.length + ' products'}</p></div>
        <div style={{ display: 'grid', gap: 12, marginTop: 22 }}>
          {products.map((product) => (
            <article key={product.id} className="summary-card" style={{ display: 'block', padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 18, alignItems: 'center' }}>
                <img src={product.imageUrl || 'https://placehold.co/176x132?text=Rug'} alt="" width={88} height={66} style={{ objectFit: 'cover', background: '#e9e1d6' }} />
                <div>
                  <h3 className="subhead">{product.name}</h3>
                  <p className="card-meta">/{product.slug}{product.isManaged ? ' · added product' : ''}</p>
                  <div className="card-swatches" aria-label="Current colours">
                    {resolveColourOptions(product).map((c) => (
                      <span key={c.slug} className="facet-swatch" style={{ background: c.hex }} title={c.label} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>Change photo<input hidden type="file" accept="image/*" disabled={busy} onChange={(event) => void updatePhoto(product, event.target.files?.[0])} /></label>
                  <button
                    className="btn"
                    disabled={busy || savingColoursFor === product.slug}
                    onClick={() => (colourEditorFor === product.slug ? setColourEditorFor(null) : openColourEditor(product))}
                  >
                    {savingColoursFor === product.slug ? 'Saving colours…' : colourEditorFor === product.slug ? 'Close colours' : 'Manage colours'}
                  </button>
                  <button className="clear-all" disabled={busy} onClick={() => void remove(product)}>Remove</button>
                </div>
              </div>
              {colourEditorFor === product.slug && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <ColourEditor colours={editorColours} onChange={setEditorColours} idPrefix={'edit-' + product.slug} />
                  <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                    <button className="btn btn-solid" disabled={savingColoursFor === product.slug} onClick={() => void saveColours(product)}>
                      {savingColoursFor === product.slug ? 'Saving…' : 'Save colours'}
                    </button>
                    <button className="clear-all" onClick={() => setColourEditorFor(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
