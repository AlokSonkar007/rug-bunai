import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCatalog, type CatalogProduct } from '../lib/catalog';
import { CARPET_CATEGORIES, COLORS } from '../data/vocabularies';
import { getProduct, type Product } from '../data/products';
import { rugImage } from '../lib/rugArt';
import {
  dedupeColourOptions, isValidHex, normalizeHex, resolveColourOptions, validateColourOption,
  type ProductColourOption,
} from '../lib/colours';
import {
  useSiteContent, type CollectionContent, type SiteContent, type TextOverride,
} from '../lib/siteContent';

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

/**
 * Generic single-field text editor with Save/Reset. Used across the Website
 * Content tab (topbar, footer, contact, section headings…).
 */
function FieldEditor({
  id, label, value, onSave, multiline = false, hint, required = true,
}: {
  id: string;
  label: string;
  value: string;
  onSave: (next: string) => Promise<void>;
  multiline?: boolean;
  hint?: string;
  required?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Re-sync when the saved value changes elsewhere (e.g. after Reset all).
  useEffect(() => { setDraft(value); setMsg(null); }, [value]);

  const dirty = draft !== value;
  const invalid = required && draft.trim().length === 0;

  const save = async () => {
    if (invalid) { setMsg({ kind: 'err', text: 'This field cannot be empty.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await onSave(draft);
      setMsg({ kind: 'ok', text: 'Saved — live on the site now.' });
    } catch (reason) {
      setMsg({ kind: 'err', text: reason instanceof Error ? reason.message : 'Save failed. Your edits are kept here — try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field" style={{ marginBottom: 18 }}>
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea id={id} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} />
      )}
      {hint && <p className="muted" style={{ fontSize: '0.75rem', marginTop: 6 }}>{hint}</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-solid" disabled={!dirty || busy || invalid} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {dirty && (
          <button type="button" className="clear-all" disabled={busy} onClick={() => { setDraft(value); setMsg(null); }}>
            Discard changes
          </button>
        )}
        {msg && (
          <span className={msg.kind === 'err' ? 'field-error' : 'muted'} style={{ fontSize: '0.82rem' }}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

/** Image editor: current preview, file picker with validation, upload state, save/reset. */
function ImageEditor({
  idPrefix, label, currentUrl, fallbackSrc, onSave, note, onUpload,
}: {
  idPrefix: string;
  label: string;
  currentUrl: string | null;
  fallbackSrc?: string;
  onSave: (url: string | null) => Promise<void>;
  note?: string;
  /** Admin-validated Supabase storage upload (from the catalogue context). */
  onUpload: (file: File) => Promise<string>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Local blob preview only while a replacement is pending — never persisted.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | null) => {
    setMsg(null);
    if (!f) { setFile(null); return; }
    if (!/^image\/(jpeg|png|webp|avif)$/.test(f.type)) {
      setMsg({ kind: 'err', text: 'Please choose a JPG, PNG, WebP or AVIF image.' });
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setMsg({ kind: 'err', text: 'Image is larger than 4 MB — compress it first.' });
      return;
    }
    setFile(f);
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      // Reuse the existing admin-validated Supabase storage upload path.
      const url = await onUpload(file);
      await onSave(url);
      setFile(null);
      setMsg({ kind: 'ok', text: 'Image uploaded and saved.' });
    } catch (reason) {
      setMsg({ kind: 'err', text: reason instanceof Error ? `${reason.message} The previous image is still live.` : 'Upload failed. The previous image is still live.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await onSave(null);
      setFile(null);
      setMsg({ kind: 'ok', text: 'Custom image removed — original artwork restored.' });
    } catch (reason) {
      setMsg({ kind: 'err', text: reason instanceof Error ? reason.message : 'Could not remove the image.' });
    } finally {
      setBusy(false);
    }
  };

  const shown = preview ?? currentUrl ?? fallbackSrc ?? null;

  return (
    <div className="field" style={{ marginBottom: 18 }}>
      <label htmlFor={`${idPrefix}-img`}>{label}</label>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        {shown ? (
          <img src={shown} alt="" width={120} height={90}
            style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)', background: '#e9e1d6' }} />
        ) : (
          <span className="muted" style={{ fontSize: '0.8rem' }}>No image yet.</span>
        )}
        <input id={`${idPrefix}-img`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy}
          onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      </div>
      {note && <p className="muted" style={{ fontSize: '0.75rem', marginTop: 6 }}>{note}</p>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-solid" disabled={!file || busy} onClick={() => void save()}>
          {busy ? 'Uploading…' : 'Upload & save'}
        </button>
        {currentUrl && !file && (
          <button type="button" className="clear-all" disabled={busy} onClick={() => void remove()}>Remove custom image</button>
        )}
        {msg && <span className={msg.kind === 'err' ? 'field-error' : 'muted'} style={{ fontSize: '0.82rem' }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** Homepage hero slideshow editor — text per slide + optional uploaded image. */
function HeroSlidesEditor({ onUpload }: { onUpload: (file: File) => Promise<string> }) {
  const { content, saveContent } = useSiteContent();
  const [idx, setIdx] = useState(0);
  const slide = content.heroSlides[idx];
  if (!slide) return null;
  const patchSlide = (patch: Partial<typeof slide>) =>
    saveContent({ heroSlides: content.heroSlides.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <div className="axis-head" style={{ marginBottom: 14 }}>
        <h3 className="subhead">Hero slideshow</h3>
        <div role="tablist" aria-label="Choose hero slide" style={{ display: 'flex', gap: 8 }}>
          {content.heroSlides.map((s, i) => (
            <button key={i} role="tab" aria-selected={i === idx} className={`tab ${i === idx ? 'active' : ''}`} onClick={() => setIdx(i)}>
              Slide {i + 1}
            </button>
          ))}
        </div>
      </div>
      <FieldEditor id={`hero-${idx}-eyebrow`} label="Eyebrow" value={slide.eyebrow} onSave={(v) => patchSlide({ eyebrow: v })} />
      <FieldEditor id={`hero-${idx}-t1`} label="Headline — line 1" value={slide.title1} onSave={(v) => patchSlide({ title1: v })} />
      <FieldEditor id={`hero-${idx}-t2`} label="Headline — line 2" value={slide.title2} onSave={(v) => patchSlide({ title2: v })} />
      <FieldEditor id={`hero-${idx}-sub`} label="Sub-heading" multiline value={slide.sub} onSave={(v) => patchSlide({ sub: v })} />
      <FieldEditor id={`hero-${idx}-cta`} label="Primary button label" value={slide.ctaLabel} onSave={(v) => patchSlide({ ctaLabel: v })} />
      <FieldEditor id={`hero-${idx}-ctato`} label="Primary button link" value={slide.ctaTo} onSave={(v) => patchSlide({ ctaTo: v })} hint="Internal path, e.g. /rugs or /collections/shaggy-carpets" required={false} />
      <FieldEditor id={`hero-${idx}-altcta`} label="Secondary button label (optional)" value={slide.altCtaLabel} required={false} onSave={(v) => patchSlide({ altCtaLabel: v })} />
      <ImageEditor
        idPrefix={`hero-${idx}`}
        label="Hero image"
        currentUrl={slide.imageUrl}
        fallbackSrc={rugImage(getProduct(slide.productSlug) ?? ({} as never), 4, 320, 200)}
        note="Leave unset to keep the generated rug artwork for this design."
        onUpload={onUpload}
        onSave={async (url) => { await patchSlide({ imageUrl: url }); }}
      />
    </div>
  );
}

/** One editable rail (New arrivals / Best sellers) heading block. */
function RailEditor({ which, idPrefix }: { which: 'newArrivalsRail' | 'bestSellersRail'; idPrefix: string }) {
  const { content, saveContent } = useSiteContent();
  const rail = content[which];
  const patch = (p: Partial<typeof rail>) => saveContent({ [which]: { ...rail, ...p } } as Partial<SiteContent>);
  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <h3 className="subhead" style={{ marginBottom: 12 }}>{which === 'newArrivalsRail' ? 'Fresh off the Loom rail' : 'Best sellers rail'}</h3>
      <FieldEditor id={`${idPrefix}-eyebrow`} label="Eyebrow" value={rail.eyebrow} onSave={(v) => patch({ eyebrow: v })} />
      <FieldEditor id={`${idPrefix}-title`} label="Title" value={rail.title} onSave={(v) => patch({ title: v })} />
      <FieldEditor id={`${idPrefix}-link`} label="Link label" value={rail.linkLabel} onSave={(v) => patch({ linkLabel: v })} />
      <FieldEditor id={`${idPrefix}-linkto`} label="Link target" value={rail.linkTo} onSave={(v) => patch({ linkTo: v })} required={false} />
    </div>
  );
}

/** Technique/room tile grids — edit each tile's copy (destination & art seed stay structural). */
function TilesEditor({ which, idPrefix }: { which: 'techniqueTiles' | 'roomTiles'; idPrefix: string }) {
  const { content, saveContent } = useSiteContent();
  const tiles = content[which];
  const patchTile = (i: number, p: Partial<(typeof tiles)[number]>) =>
    saveContent({ [which]: tiles.map((t, ti) => (ti === i ? { ...t, ...p } : t)) } as Partial<SiteContent>);
  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <h3 className="subhead" style={{ marginBottom: 12 }}>{which === 'techniqueTiles' ? 'Technique tiles' : 'Room tiles'}</h3>
      {tiles.map((t, i) => (
        <details key={t.to} style={{ marginBottom: 8 }} open={i === 0}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t.title}</summary>
          <div style={{ paddingTop: 10 }}>
            <FieldEditor id={`${idPrefix}-${i}-title`} label="Title" value={t.title} onSave={(v) => patchTile(i, { title: v })} />
            <FieldEditor id={`${idPrefix}-${i}-blurb`} label="Blurb" value={t.blurb} onSave={(v) => patchTile(i, { blurb: v })} />
          </div>
        </details>
      ))}
    </div>
  );
}

/** Editorial split blocks (Craft story / Inspiration) — copy plus optional image. */
function SplitBlockEditor({ which, idPrefix, onUpload }: { which: 'craftSplit' | 'inspirationSplit'; idPrefix: string; onUpload: (f: File) => Promise<string> }) {
  const { content, saveContent } = useSiteContent();
  const block = content[which];
  const patch = (p: Partial<typeof block>) => saveContent({ [which]: { ...block, ...p } } as Partial<SiteContent>);
  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <h3 className="subhead" style={{ marginBottom: 12 }}>{which === 'craftSplit' ? 'Craft-story section' : 'Inspiration section'}</h3>
      <FieldEditor id={`${idPrefix}-eyebrow`} label="Eyebrow" value={block.eyebrow} onSave={(v) => patch({ eyebrow: v })} />
      <FieldEditor id={`${idPrefix}-title`} label="Title" value={block.title} onSave={(v) => patch({ title: v })} />
      <FieldEditor id={`${idPrefix}-body1`} label="Body" multiline value={block.body1} onSave={(v) => patch({ body1: v })} />
      {(which === 'craftSplit') && (
        <FieldEditor id={`${idPrefix}-body2`} label="Body (second paragraph)" multiline required={false} value={block.body2 ?? ''} onSave={(v) => patch({ body2: v || undefined })} />
      )}
      <FieldEditor id={`${idPrefix}-primary`} label="Primary button label" value={block.primaryLabel} onSave={(v) => patch({ primaryLabel: v })} />
      <ImageEditor
        idPrefix={`${idPrefix}-img`}
        label="Section image"
        currentUrl={block.imageUrl}
        fallbackSrc={rugImage(getProduct(block.productSlug) ?? ({} as never), 1, 320, 200)}
        note="Leave unset to keep the generated rug artwork for this design."
        onUpload={onUpload}
        onSave={async (url) => { await patch({ imageUrl: url }); }}
      />
    </div>
  );
}

/** Simple three-field band editor (Shop by Colour, newsletter, headings…). */
function BandEditor({
  path, labels, idPrefix,
}: {
  path: 'colourBand' | 'newsletter' | 'techniqueHeading' | 'roomsBand';
  labels: Record<string, string>;
  idPrefix: string;
}) {
  const { content, saveContent } = useSiteContent();
  const band = content[path] as Record<string, string>;
  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <h3 className="subhead" style={{ marginBottom: 12 }}>{labels.heading ?? 'Section'}</h3>
      {Object.entries(band).map(([key, value]) => (
        <FieldEditor
          key={key}
          id={`${idPrefix}-${key}`}
          label={labels[key] ?? key}
          value={value}
          multiline={String(value).length > 70}
          onSave={async (v) => { await saveContent({ [path]: { ...band, [key]: v } } as Partial<SiteContent>); }}
        />
      ))}
    </div>
  );
}

/** Collections tab — pick a curated category, edit its intro copy & banner. */
function CollectionsEditor({ onUpload }: { onUpload: (f: File) => Promise<string> }) {
  const { content, saveCollectionContent } = useSiteContent();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(CARPET_CATEGORIES[0]?.slug ?? '');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CARPET_CATEGORIES.filter((c) => !q || c.label.toLowerCase().includes(q));
  }, [query]);
  const cat = CARPET_CATEGORIES.find((c) => c.slug === selected);
  const copy: CollectionContent = content.collections[selected] ?? { title: '', description: '', imageUrl: null };
  const hasOverride = Boolean(content.collections[selected]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 22, alignItems: 'start' }}>
      <div className="summary-card" style={{ padding: 14 }}>
        <label htmlFor="collection-search" className="muted" style={{ fontSize: '0.78rem' }}>Search collections</label>
        <input id="collection-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. shaggy" style={{ marginTop: 6 }} />
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 4, maxHeight: 380, overflowY: 'auto' }}>
          {filtered.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                className={`clear-all ${selected === c.slug ? 'active' : ''}`}
                style={{ fontWeight: selected === c.slug ? 700 : 500, textAlign: 'left', width: '100%', padding: '8px 10px' }}
                aria-current={selected === c.slug ? 'true' : undefined}
                onClick={() => setSelected(c.slug)}
              >
                {c.label}{content.collections[c.slug] ? ' •' : ''}
              </button>
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: 10 }}>“•” marks collections with saved overrides.</p>
      </div>
      {cat && (
        <div className="summary-card" style={{ padding: 18 }}>
          <h3 className="subhead" style={{ marginBottom: 6 }}>{cat.label}</h3>
          <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 16 }}>
            Editing here changes only this collection page ({`/collections/${cat.slug}`}). Product assignments are untouched.
          </p>
          <FieldEditor
            id={`col-${cat.slug}-title`}
            label="Collection heading (blank = default name)"
            required={false}
            value={copy.title}
            onSave={async (v) => { await saveCollectionContent(cat.slug, { title: v }); }}
          />
          <FieldEditor
            id={`col-${cat.slug}-desc`}
            label="Collection description"
            required={false}
            multiline
            value={copy.description}
            onSave={async (v) => { await saveCollectionContent(cat.slug, { description: v }); }}
          />
          <ImageEditor
            idPrefix={`col-${cat.slug}`}
            label="Collection banner image"
            currentUrl={hasOverride ? copy.imageUrl : null}
            onUpload={onUpload}
            onSave={async (url) => { await saveCollectionContent(cat.slug, { imageUrl: url }); }}
          />
        </div>
      )}
    </div>
  );
}

/** Products tab content card — full editorial fields for one catalogue product. */
function ProductContentEditor({ product, onUpload }: { product: CatalogProduct; onUpload: (f: File) => Promise<string> }) {
  const { content, productOverrides, saveProductText, saveProductImage } = useSiteContent();
  void content; // catalogue base data comes from the product record itself
  const ov = productOverrides[product.slug]?.text ?? {};
  const base = getProduct(product.slug);
  const careDefault = product.specs?.careInstructions ?? base?.specs.careInstructions ?? '';
  const draftInitial = {
    name: ov.name ?? product.name,
    tagline: ov.tagline ?? product.tagline ?? '',
    description: ov.description ?? product.description ?? '',
    craftStory: ov.craftStory ?? product.craftStory ?? base?.craftStory ?? '',
    care: ov.specs?.careInstructions ?? careDefault,
  };
  const [draft, setDraft] = useState(draftInitial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { setDraft(draftInitial); setMsg(null); }, [product.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftInitial);
  const saveAll = async () => {
    if (!draft.name.trim()) { setMsg({ kind: 'err', text: 'Product name cannot be empty.' }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const text: TextOverride = {
        name: draft.name.trim(),
        tagline: draft.tagline,
        description: draft.description,
        craftStory: draft.craftStory,
        specs: { careInstructions: draft.care },
      };
      await saveProductText(product.slug, text);
      setMsg({ kind: 'ok', text: 'Product content saved.' });
    } catch (reason) {
      setMsg({ kind: 'err', text: reason instanceof Error ? `${reason.message} Nothing was lost.` : 'Save failed. Nothing was lost.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="summary-card" style={{ padding: 18 }}>
      <h3 className="subhead" style={{ marginBottom: 4 }}>{product.name}</h3>
      <p className="card-meta" style={{ marginBottom: 14 }}>/{product.slug} — edits apply only to this product.</p>
      <div className="field"><label htmlFor={`pc-${product.slug}-name`}>Name</label>
        <input id={`pc-${product.slug}-name`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
      <div className="field"><label htmlFor={`pc-${product.slug}-tagline`}>Tagline</label>
        <input id={`pc-${product.slug}-tagline`} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} /></div>
      <div className="field"><label htmlFor={`pc-${product.slug}-desc`}>Description</label>
        <textarea id={`pc-${product.slug}-desc`} rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
      <div className="field"><label htmlFor={`pc-${product.slug}-craft`}>Craft Story</label>
        <textarea id={`pc-${product.slug}-craft`} rows={4} value={draft.craftStory} onChange={(e) => setDraft({ ...draft, craftStory: e.target.value })} /></div>
      <div className="field"><label htmlFor={`pc-${product.slug}-care`}>Care instructions</label>
        <textarea id={`pc-${product.slug}-care`} rows={3} value={draft.care} onChange={(e) => setDraft({ ...draft, care: e.target.value })} /></div>
      <ImageEditor
        idPrefix={`pc-${product.slug}`}
        label="Main product photo"
        currentUrl={product.imageUrl ?? null}
        fallbackSrc={rugImage(product as unknown as Product, 0, 320, 240)}
        onUpload={onUpload}
        onSave={async (url) => { await saveProductImage(product.slug, url); }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-solid" disabled={!dirty || busy} onClick={() => void saveAll()}>{busy ? 'Saving…' : 'Save content'}</button>
        {dirty && <button type="button" className="clear-all" disabled={busy} onClick={() => { setDraft(draftInitial); setMsg(null); }}>Discard changes</button>}
        {msg && <span className={msg.kind === 'err' ? 'field-error' : 'muted'} style={{ fontSize: '0.82rem' }}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** Shared website content — announcement bar, footer, contact page. */
function SharedContentEditor() {
  const { content, saveContent } = useSiteContent();
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="summary-card" style={{ padding: 18 }}>
        <h3 className="subhead" style={{ marginBottom: 12 }}>Announcement bar</h3>
        <FieldEditor id="shared-topbar" label="Top bar text" value={content.topbar} onSave={(v) => saveContent({ topbar: v })} />
      </div>
      <div className="summary-card" style={{ padding: 18 }}>
        <h3 className="subhead" style={{ marginBottom: 12 }}>Footer</h3>
        <FieldEditor id="shared-footer-about" label="About paragraph" multiline value={content.footer.about} onSave={(v) => saveContent({ footer: { ...content.footer, about: v } })} />
        <FieldEditor id="shared-footer-phone" label="Phone (display)" value={content.footer.phone} onSave={(v) => saveContent({ footer: { ...content.footer, phone: v } })} />
      </div>
      <div className="summary-card" style={{ padding: 18 }}>
        <h3 className="subhead" style={{ marginBottom: 12 }}>Contact page</h3>
        <FieldEditor id="shared-contact-title" label="Heading" value={content.contact.title} onSave={(v) => saveContent({ contact: { ...content.contact, title: v } })} />
        <FieldEditor id="shared-contact-body" label="Intro copy" multiline value={content.contact.body} onSave={(v) => saveContent({ contact: { ...content.contact, body: v } })} />
        <FieldEditor id="shared-contact-note" label="Note below details" multiline required={false} value={content.contact.note} onSave={(v) => saveContent({ contact: { ...content.contact, note: v } })} />
      </div>
    </div>
  );
}

/** Admin Studio — product management + full website content management. */
export default function AdminPage() {
  const [tab, setTab] = useState<'products' | 'content'>('products');
  const { profile, configured } = useAuth();
  const { products, loading, uploadProductPhoto, createManagedProduct, removeProduct, changeProductPhoto, saveProductColours } = useCatalog();
  const site = useSiteContent();
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
