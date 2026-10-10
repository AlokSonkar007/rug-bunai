import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatINR } from '../data/products';
import { CLASSIFICATIONS, findTerm, MATERIALS, TECHNIQUES } from '../data/vocabularies';
import { productImage } from '../lib/images';
import { useCatalog } from '../lib/catalog';
import { useSiteContent } from '../lib/siteContent';
import { useWishlist } from '../lib/wishlist';
import { useCart } from '../lib/cart';
import { ProductCard, Reveal } from '../components/ProductCard';
import {
  colourLabelFor, isValidHex, normalizeHex, resolveColourOptions,
  type CustomColourRequest, type ProductColourOption,
} from '../lib/colours';
import {
  SIZE_OPTIONS, STANDARD_SIZE_KEYS, feetOf, validateSizeFeet, customSizeEstimate, formatFtLabel,
  stainCoatCostForFt, STAIN_COAT_RATE_INR_PER_SQFT,
  productRatePerSqft, resolveStandardSize, type ResolvedSize,
} from '../lib/sizes';

const CUSTOM_SENTINEL = '__custom__';
const CUSTOM_SIZE_KEY = 'custom';

/**
 * PDP — where conversion happens. Interactive gallery with macro angles,
 * admin-managed colour swatches (+ customer custom-colour request) and size
 * pills (variants), exhaustive dual-unit specs, craft storytelling tab, and
 * typed product relationships ("complete the look").
 */
export default function ProductPage() {
  const { slug } = useParams();
  const { products } = useCatalog();
  const { has, toggle } = useWishlist();
  const product = products.find((candidate) => candidate.slug === (slug ?? ''));
  const [angle, setAngle] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [color, setColor] = useState(product?.colorSlugs[0] ?? '');
  const [variantId, setVariantId] = useState<string | null>(null);
  const [tab, setTab] = useState<'details' | 'craft' | 'care'>('details');
  const [toast, setToast] = useState<string | null>(null);
  // Customer custom-colour request state (revealed by "Customise your colour").
  const [customOpen, setCustomOpen] = useState(false);
  const [customHex, setCustomHex] = useState('#B0714F');
  const [customName, setCustomName] = useState('');
  // Custom-SIZE request state (revealed by the sixth size option). Dimensions
  // are numeric feet; nothing is priced or added until validation passes.
  const [sizeChoice, setSizeChoice] = useState<string | null>(null); // variant id | 'custom'
  const [custW, setCustW] = useState('');
  const [custL, setCustL] = useState('');
  // Optional stain-resistant coating add-on (₹90/sq ft — shared rate in sizes.ts).
  const [coating, setCoating] = useState(false);
  const cart = useCart();

  useEffect(() => {
    if (!product) return;
    setColor(product.colorSlugs[0]);
    setVariantId(null);
    setSizeChoice(null);
    setCustW('');
    setCustL('');
    setCoating(false);
    setAngle(0);
    // Switching rugs must never carry a previous rug's colour selection over.
    setCustomOpen(false);
    setCustomHex('#B0714F');
    setCustomName('');
    window.scrollTo(0, 0);
  }, [slug, product]);

  const colourOptions = useMemo<ProductColourOption[]>(
    () => (product ? resolveColourOptions(product) : []),
    [product],
  );
  const usingCustom = color === CUSTOM_SENTINEL;
  const customValid = isValidHex(customHex);
  const selectedCustom: CustomColourRequest | null = usingCustom && customValid
    ? { hex: normalizeHex(customHex) ?? customHex.toLowerCase(), ...(customName.trim() ? { name: customName.trim() } : {}) }
    : null;

  const variantsInColor = useMemo(() => {
    if (!product) return [];
    // Custom-colour requests reuse the rug's size/price structure — the shade
    // itself is a request pending atelier confirmation, never a fake variant.
    if (color === CUSTOM_SENTINEL) return product.variants;
    return product.variants.filter((v) => v.colorSlug === color);
  }, [product, color]);

  // Trusted ₹/sq-ft rate for this rug: admin-configured customRatePerSqFt when
  // present, otherwise derived from its own priced offers. Never invented.
  const ratePerSqFt = useMemo(
    () => (product ? productRatePerSqft(product.variants, product.customRatePerSqFt ?? null) : null),
    [product],
  );

  // Every design resolves all five standard sizes against real offer data:
  // exact configured price first, then made-to-order at the trusted rate.
  const resolvedSizes = useMemo<Record<string, ResolvedSize>>(() => {
    const map: Record<string, ResolvedSize> = {};
    if (!product) return map;
    const colorSlug = usingCustom ? (product.colorSlugs[0] ?? 'ivory') : color;
    for (const option of SIZE_OPTIONS) {
      if (option.custom) continue;
      map[option.key] = resolveStandardSize(option, variantsInColor, ratePerSqFt, { slug: product.slug, colorSlug });
    }
    return map;
  }, [product, variantsInColor, ratePerSqFt, usingCustom, color]);

  // ── Custom-size request logic (sixth selector option) ──────────────────
  const choosingCustomSize = sizeChoice === CUSTOM_SIZE_KEY;

  const selectedKey = choosingCustomSize ? null : (sizeChoice ?? variantId ? String(sizeChoice ?? variantId) : null);
  const selectedResolved: ResolvedSize | undefined = (() => {
    if (!product || choosingCustomSize) return undefined;
    // An explicit pill selection wins.
    if (selectedKey) {
      const direct = Object.values(resolvedSizes).find((r) => r.variant?.id === selectedKey);
      if (direct) return direct;
    }
    // Default: in-stock offer, else first priceable size (made-to-order ok).
    const ordered = STANDARD_SIZE_KEYS.map((k) => resolvedSizes[k]).filter(Boolean);
    return ordered.find((r) => r.availability === 'stock') ?? ordered.find((r) => r.priceable) ?? ordered[0];
  })();
  const selected = selectedResolved?.variant;

  // Admin-authored Specifications notes for this product (Studio > Product
  // Pages). Read from the same persisted override document the editors write.
  const { productOverrides } = useSiteContent();
  const ovText = product ? productOverrides[product.slug]?.text : undefined;
  const ovSpecNotes = (ovText?.specNotes ?? '').trim();
  // Admin-saved Craft Story / Care override the seed content; unedited
  // products keep displaying their original catalogue text.
  const craftStoryText = (ovText?.craftStory ?? '').trim() || (product?.craftStory ?? '');
  const careText = (ovText?.specs?.careInstructions ?? '').trim() || (product?.specs.careInstructions ?? '');

  const customDims = useMemo(() => {
    const w = custW.trim() === '' ? NaN : Number(custW);
    const l = custL.trim() === '' ? NaN : Number(custL);
    const error = custW.trim() === '' || custL.trim() === ''
      ? 'Enter both width and length in feet.'
      : validateSizeFeet(w, l);
    return { w, l, valid: error === null, error };
  }, [custW, custL]);
  /** Estimate derived from this rug's own rate card (base price ÷ base area).
   *  The studio confirms before production — no invented markup, no silent
   *  fallback to a standard-size price. */
  const customEstimate = useMemo(() => {
    if (!product || !customDims.valid) return null;
    const base = product.variants.find((v) => v.priceInr > 0) ?? product.variants[0];
    if (!base || base.priceInr <= 0) return null;
    return customSizeEstimate(
      base.priceInr, feetOf(base.width), feetOf(base.length), customDims.w, customDims.l,
    );
  }, [product, customDims]);

  // ── Stain-resistant coating (optional add-on, ₹90/sq ft — sizes.ts rate) ──
  // Charge is ALWAYS derived from the actual selected numeric dimensions —
  // standard pill or entered custom feet — never from a label and never a
  // browser-submitted amount. cart/checkout recompute the same way.
  const coatDims = choosingCustomSize
    ? (customDims.valid ? { w: customDims.w, l: customDims.l } : null)
    : (selected ? { w: feetOf(selected.width), l: feetOf(selected.length) } : null);
  const coatSqft = coatDims ? Math.round(coatDims.w * coatDims.l * 10) / 10 : 0;
  const coatChargeInr = coating && coatDims ? stainCoatCostForFt(coatDims.w, coatDims.l) : 0;
  const unitBaseInr = choosingCustomSize ? (customEstimate ?? 0) : (selected?.priceInr ?? 0);
  const withCoatTotalInr = unitBaseInr + coatChargeInr;

  if (!product) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">This design has left the archive.</h1>
        <p className="muted">It may have sold out permanently — browse what remains on the loom.</p>
        <Link to="/rugs" className="btn" style={{ marginTop: 22 }}>All Rugs</Link>
      </div>
    );
  }

  const tech = findTerm(TECHNIQUES, product.techniqueSlug)?.label ?? '';
  const mat = findTerm(MATERIALS, product.materialSlug)?.label ?? '';
  const classification = findTerm(CLASSIFICATIONS, product.classificationSlug)?.label ?? '';
  const related = product.relationships
    .map((r) => products.find((candidate) => candidate.id === r.targetId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const sqftPrice = selected
    ? Math.round(selected.priceInr / ((selected.width.cm * selected.length.cm) / 929.03))
    : null;

  const currentColourLabel = usingCustom
    ? (customName.trim() || 'Custom colour')
    : (colourOptions.find((c) => c.slug === color)?.label ?? colourLabelFor(color));

  const addToCart = () => {
    if (choosingCustomSize) {
      // Custom-size request: validated numeric feet only — never a silently
      // mispriced purchase. The studio confirms the estimate before weaving.
      if (!customDims.valid) { notify(customDims.error ?? 'Enter valid dimensions in feet.'); return; }
      if (customEstimate === null) { notify('This piece needs a studio quote for custom sizes — please contact us on WhatsApp.'); return; }
      cart.addCustom(product, {
        id: 'custom-' + crypto.randomUUID(),
        productSlug: product.slug,
        sizeLabel: formatFtLabel(customDims.w, customDims.l),
        widthFt: customDims.w,
        lengthFt: customDims.l,
        colorSlug: usingCustom ? 'custom' : color,
        colorName: currentColourLabel,
        ...(usingCustom && selectedCustom ? { colorHex: selectedCustom.hex } : {}),
        priceInr: customEstimate,
        ...(coating ? { coating: true } : {}),
        note: `Custom size request: ${formatFtLabel(customDims.w, customDims.l)} (≈ ${Math.round(customDims.w * customDims.l)} sq ft). Estimate ${formatINR(customEstimate)} at this rug's derived ₹/sq ft rate — production feasibility and final pricing to be confirmed by Rug Bunai before weaving.${coating ? ` Stain-resistant coating requested: +${formatINR(stainCoatCostForFt(customDims.w, customDims.l))} (${Math.round(customDims.w * customDims.l * 10) / 10} sq ft × ₹${STAIN_COAT_RATE_INR_PER_SQFT}/sq ft).` : ''}${usingCustom ? ` Custom colour: ${currentColourLabel}.` : ''}`,
      });
      notify(`Custom-size request added — ${formatFtLabel(customDims.w, customDims.l)}`);
      return;
    }
    if (usingCustom) {
      if (!selectedCustom) { notify('Choose a valid custom colour first.'); return; }
      if (!selected) { notify('Select a size for your custom-colour piece.'); return; }
      // Custom colour → its own cart line via the existing CustomOffer model,
      // presented as a REQUEST pending atelier confirmation.
      cart.addCustom(product, {
        id: 'custom-' + crypto.randomUUID(),
        productSlug: product.slug,
        sizeLabel: selected.sizeLabel,
        widthFt: feetOf(selected.width),
        lengthFt: feetOf(selected.length),
        colorSlug: 'custom',
        colorName: currentColourLabel,
        colorHex: selectedCustom.hex,
        priceInr: selected.priceInr,
        ...(coating ? { coating: true } : {}),
        note: `Custom colour request: ${currentColourLabel} (${selectedCustom.hex}). Feasibility and final shade to be confirmed by Rug Bunai before weaving.${coating ? ` Stain-resistant coating requested: +${formatINR(stainCoatCostForFt(feetOf(selected.width), feetOf(selected.length)))} (${Math.round(feetOf(selected.width) * feetOf(selected.length) * 10) / 10} sq ft × ₹${STAIN_COAT_RATE_INR_PER_SQFT}/sq ft).` : ''}`,
      });
      notify(`Custom-colour request added — ${currentColourLabel}, ${selected.sizeLabel}`);
      return;
    }
    if (!selected) return;
    // Made-to-order standard size (no configured offer record): the rug is
    // genuinely woven on request at the trusted rate — persisted as a custom
    // offer so the exact dimensions and price survive into the order.
    const resolved = Object.values(resolvedSizes).find((r) => r.variant?.id === selected.id);
    if (resolved && !product.variants.some((v) => v.id === selected.id)) {
      cart.addCustom(product, {
        id: selected.id,
        productSlug: product.slug,
        sizeLabel: selected.sizeLabel,
        widthFt: feetOf(selected.width),
        lengthFt: feetOf(selected.length),
        colorSlug: usingCustom ? 'custom' : color,
        colorName: currentColourLabel,
        ...(usingCustom && selectedCustom ? { colorHex: selectedCustom.hex } : {}),
        priceInr: selected.priceInr,
        ...(coating ? { coating: true } : {}),
        note: `Made-to-order: ${selected.sizeLabel} in ${currentColourLabel}. Woven on request at this design's ₹/sq ft rate — atelier confirms dispatch window after order review.${coating ? ` Stain-resistant coating requested: +${formatINR(stainCoatCostForFt(feetOf(selected.width), feetOf(selected.length)))} (${Math.round(feetOf(selected.width) * feetOf(selected.length) * 10) / 10} sq ft × ₹${STAIN_COAT_RATE_INR_PER_SQFT}/sq ft).` : ''}`,
      });
      notify(`Added ${product.name} — ${selected.sizeLabel} (made to order)`);
      return;
    }
    cart.add(selected.id, { coating });
    notify(`Added ${product.name} — ${selected.sizeLabel} to your cart`);
  };

  return (
    <div className="wrap" style={{ paddingBottom: 'clamp(64px,8vw,120px)' }}>
      {/* Breadcrumb mirrors the primary taxonomy path */}
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link><span aria-hidden="true">/</span>
        <Link to="/rugs">Rugs</Link><span aria-hidden="true">/</span>
        <Link to={`/rugs?tech=${product.techniqueSlug}`}>{tech}</Link><span aria-hidden="true">/</span>
        <Link to={`/rugs?material=${product.materialSlug}`}>{mat}</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="pdp">
        {/* Gallery — thumbnail strip exposes every angle (5–15 per spec) */}
        <section aria-label={`Photography of ${product.name}`}>
          <div className={`gallery-main ${zoom ? 'zoomed' : ''}`} onClick={() => setZoom((z) => !z)} title={zoom ? 'Click to zoom out' : 'Click to zoom into weave detail'}>
            <img src={productImage(product, angle, 1200, 900)} alt={`${product.name} — view ${angle + 1} of ${product.thumbnailCount}`} />
          </div>
          <div className="gallery-thumbs" role="tablist" aria-label="Product views">
            {Array.from({ length: product.thumbnailCount }, (_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === angle}
                aria-current={i === angle}
                aria-label={`View ${i + 1}: ${['full rug', 'weave macro', 'corner detail', 'fringe finish', 'styled in room'][i % 5]}`}
                onClick={() => { setAngle(i); setZoom(false); }}
              >
                <img src={productImage(product, i, 184, 184)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </section>

        {/* Buy column */}
        <aside>
          <p className="eyebrow">{classification}</p>
          <h1 className="headline" style={{ marginBlock: '10px 6px' }}>{product.name}</h1>
          <p className="serif-italic muted">{product.tagline}</p>
          <p className="card-rating" style={{ marginTop: 12 }}>★ {product.rating.toFixed(1)} · {product.reviewsCount} verified reviews</p>

          <p style={{ margin: '22px 0 8px' }} className="subhead">
            {selected ? formatINR(selected.priceInr) : formatINR(Math.min(...product.variants.map((v) => v.priceInr)))}
            {sqftPrice != null && (
              <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 300 }}> &nbsp;≈ ₹{sqftPrice.toLocaleString('en-IN')} / sq ft</span>
            )}
          </p>

          {/* Colour — admin-managed options + customer custom-colour request */}
          <div style={{ marginTop: 24 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Colour — {currentColourLabel}</p>
            <div className="card-swatches" role="group" aria-label="Choose colour">
              {colourOptions.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  className={`swatch ${!usingCustom && c.slug === color ? 'active' : ''}`}
                  style={{ background: c.hex }}
                  aria-pressed={!usingCustom && c.slug === color}
                  aria-label={`Colour ${c.label}`}
                  title={c.label}
                  onClick={() => { setColor(c.slug); setVariantId(null); }}
                />
              ))}
              <button
                type="button"
                className={`swatch swatch-custom ${usingCustom ? 'active' : ''}`}
                aria-pressed={usingCustom}
                aria-label="Customise your colour"
                title="Customise your colour"
                aria-expanded={customOpen}
                onClick={() => {
                  if (usingCustom) {
                    // Second click returns to the predefined palette.
                    setCustomOpen(false);
                    setColor(colourOptions[0]?.slug ?? product.colorSlugs[0] ?? '');
                    setVariantId(null);
                  } else {
                    setCustomOpen(true);
                    setColor(CUSTOM_SENTINEL);
                    setVariantId(null);
                  }
                }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>

            {customOpen && (
              <div className="pdp-custom">
                <label htmlFor="pdp-custom-picker" className="subhead" style={{ fontSize: '0.9rem', display: 'block', marginBottom: 8 }}>
                  Pick any shade you like
                </label>
                <div className="pdp-custom-row">
                  <input
                    id="pdp-custom-picker"
                    type="color"
                    value={isValidHex(customHex) ? customHex : '#B0714F'}
                    onChange={(e) => {
                      const n = normalizeHex(e.target.value);
                      if (n) setCustomHex(n);
                    }}
                  />
                  <span
                    className="pdp-custom-preview"
                    style={{ background: isValidHex(customHex) ? customHex : undefined }}
                    aria-hidden="true"
                  />
                  <code className="colour-editor-hex">{customValid ? customHex : 'invalid'}</code>
                </div>
                <input
                  className="pdp-custom-name"
                  aria-label="Optional name for your custom colour"
                  placeholder="Optional name, e.g. Dusty teal"
                  value={customName}
                  maxLength={40}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <p className="muted pdp-custom-note">
                  This is a <strong>custom-colour request</strong>, not a guarantee. Rug Bunai will confirm
                  production feasibility and the final shade before weaving begins.
                </p>
              </div>
            )}
          </div>

          {/* Size selector — five standard sizes + custom-size request.
              Every design is woven in all five standard sizes; a missing
              offer record means made-to-order, never "not offered". */}
          <div style={{ marginTop: 24 }}>
            <p className="eyebrow" style={{ marginBottom: 4 }}>Size — feet</p>
            <div className="variant-row" role="group" aria-label="Choose a size">
              {SIZE_OPTIONS.map((s) => {
                if (s.custom) {
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`size-pill ${choosingCustomSize ? 'active' : ''}`}
                      aria-pressed={choosingCustomSize}
                      onClick={() => setSizeChoice(CUSTOM_SIZE_KEY)}
                    >
                      <span>{s.label}</span>
                      <small>Weave to your own dimensions</small>
                    </button>
                  );
                }
                const r = resolvedSizes[s.key];
                const isActive = !choosingCustomSize && selectedResolved?.option.key === s.key;
                const priceText = r?.variant && r.priceable ? formatINR(r.variant.priceInr) : null;
                const availabilityText = !r || !r.priceable
                  ? 'Studio quote'
                  : r.availability === 'stock'
                  ? `${r.variant!.stock} in atelier`
                  : 'Made to order';
                return (
                  <button
                    key={s.key}
                    type="button"
                    className={`size-pill ${isActive ? 'active' : ''} ${r && r.availability === 'stock' ? '' : 'mto'}`}
                    aria-pressed={isActive}
                    disabled={!r}
                    title={r?.priceable ? undefined : `${s.label} needs a studio quote for this design`}
                    onClick={() => {
                      if (!r?.variant) return;
                      setSizeChoice(r.variant.id);
                      setVariantId(r.variant.id);
                    }}
                  >
                    <span>{s.label}</span>
                    <small>{priceText ? `${priceText} · ${availabilityText}` : availabilityText}</small>
                  </button>
                );
              })}
            </div>

            {choosingCustomSize && (
              <div className="pdp-custom" style={{ marginTop: 14 }}>
                <p className="subhead" style={{ fontSize: '0.9rem', marginBottom: 8 }}>Enter your size (ft)</p>
                <div className="pdp-custom-row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Width (ft)</span>
                    <input
                      className="pdp-custom-name"
                      type="number" inputMode="decimal" min={1} max={15} step={0.1}
                      aria-label="Custom width in feet" placeholder="e.g. 7.5"
                      value={custW} onChange={(e) => setCustW(e.target.value)}
                    />
                  </label>
                  <span aria-hidden="true" className="subhead">×</span>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Length (ft)</span>
                    <input
                      className="pdp-custom-name"
                      type="number" inputMode="decimal" min={1} max={15} step={0.1}
                      aria-label="Custom length in feet" placeholder="e.g. 9.5"
                      value={custL} onChange={(e) => setCustL(e.target.value)}
                    />
                  </label>
                  <code className="colour-editor-hex" aria-live="polite">
                    {customDims.valid ? formatFtLabel(customDims.w, customDims.l) : '___ × ___ ft'}
                  </code>
                </div>
                {customDims.error && custW.trim() !== '' && custL.trim() !== '' && (
                  <p className="field-error" style={{ fontSize: '0.8rem', marginTop: 6 }}>{customDims.error}</p>
                )}
                {customDims.valid && customEstimate !== null && (
                  <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
                    Estimate: <strong>{formatINR(customEstimate)}</strong> ≈ {Math.round(customDims.w * customDims.l)} sq ft at this rug's derived ₹/sq ft rate.
                  </p>
                )}
                {customDims.valid && customEstimate === null && (
                  <p className="field-error" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                    No online estimate is available for this piece — please request a studio quote via WhatsApp before ordering.
                  </p>
                )}
                <p className="muted pdp-custom-note">
                  This is a <strong>custom-size request</strong>, not a guaranteed delivery. Rug Bunai will confirm
                  production feasibility and final pricing before weaving begins.
                </p>
              </div>
            )}
          </div>

          {/* Optional stain-resistant coating — ₹90 per sq ft, charged on the
              ACTUAL selected dimensions. Off by default; fully reversible. */}
          <div className="coating-row" style={{ marginTop: 20 }}>
            <label className="coating-toggle">
              <input
                type="checkbox"
                checked={coating}
                disabled={!coatDims}
                onChange={(e) => setCoating(e.target.checked)}
              />
              <span>Add stain-resistant protection for {formatINR(STAIN_COAT_RATE_INR_PER_SQFT)} per sq ft</span>
            </label>
            {coating && coatDims ? (
              <p className="muted" aria-live="polite" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                Coating charge: <strong>{formatINR(coatChargeInr)}</strong> = {coatSqft} sq ft × {formatINR(STAIN_COAT_RATE_INR_PER_SQFT)}/sq ft.
                Adds to the rug price above.
              </p>
            ) : coating && !coatDims ? (
              <p className="field-error" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                Enter valid width and length in feet to calculate the coating charge.
              </p>
            ) : null}
          </div>

          <button
            className="btn btn-solid btn-block"
            style={{ marginTop: 30 }}
            disabled={choosingCustomSize ? !customDims.valid || customEstimate === null : usingCustom ? !selectedCustom || !selected : !selected}
            onClick={addToCart}
          >
            {choosingCustomSize
              ? 'Add Custom-Size Request'
              : usingCustom
              ? 'Add Custom-Colour Request'
              : selectedResolved?.availability === 'made-to-order' ? 'Add Made-to-Order Piece' : 'Add to Cart'}
          </button>
          <button
            className="btn btn-block"
            style={{ marginTop: 12 }}
            onClick={() => void toggle(product.slug).catch((reason) => notify(reason instanceof Error ? reason.message : 'Unable to update your wishlist.'))}
          >
            {has(product.slug) ? 'Remove from wishlist' : 'Save to wishlist'}
          </button>
          <p className="muted" style={{ fontSize: '0.75rem', marginTop: 14, letterSpacing: '0.06em' }}>
            Free insured shipping across India · 30-day returns · Each piece one-of-a-kind
          </p>

          <hr className="rule" style={{ margin: '34px 0' }} />

          {/* Tabs: Specifications / Craft story / Care */}
          <div className="tabs" role="tablist">
            {([['details', 'Specifications'], ['craft', 'Craft Story'], ['care', 'Care']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <table className="spec-table">
              <tbody>
                <tr><th scope="row">Classification</th><td>{classification}</td></tr>
                <tr><th scope="row">Technique</th><td>{tech}, placed by hand in Bhadohi</td></tr>
                <tr><th scope="row">Pile height</th><td>{product.specs.pileHeightMm} mm ({(product.specs.pileHeightMm / 25.4).toFixed(1)} in)</td></tr>
                <tr><th scope="row">Weight</th><td>{product.specs.weightKgPerSqm} kg/m² ({(product.specs.weightKgPerSqm * 0.2048).toFixed(2)} lb/sq ft)</td></tr>
                {product.specs.knotsPerSqIn !== undefined && (
                  <tr><th scope="row">Knot density</th><td>{product.specs.knotsPerSqIn} knots per square inch</td></tr>
                )}
                {product.specs.warpMaterial && (
                  <tr><th scope="row">Foundation</th><td>{product.specs.warpMaterial} warp &amp; weft</td></tr>
                )}
                {product.specs.weaveMonthsApprox !== undefined && (
                  <tr><th scope="row">Time on loom</th><td>≈ {product.specs.weaveMonthsApprox} months per piece</td></tr>
                )}
                <tr><th scope="row">Backing</th><td>{product.specs.backing}</td></tr>
                <tr><th scope="row">Origin</th><td>{product.specs.countryOfOrigin}</td></tr>
                <tr><th scope="row">Current size</th><td>{choosingCustomSize ? (customDims.valid ? `${formatFtLabel(customDims.w, customDims.l)} — custom request` : 'Enter your custom dimensions') : selected ? `${selected.sizeLabel} (${selected.width.cm} × ${selected.length.cm} cm)` : 'Select a size'}</td></tr>
                {product.customRatePerSqFt != null && product.customRatePerSqFt > 0 && (
                  <tr><th scope="row">Bespoke rate</th><td>₹{Math.round(product.customRatePerSqFt).toLocaleString('en-IN')} per sq ft (studio-configured)</td></tr>
                )}
                {ovSpecNotes && (
                  <tr><th scope="row">Atelier notes</th><td>{ovSpecNotes}</td></tr>
                )}
              </tbody>
            </table>
          )}
          {tab === 'craft' && (
            <div>
              <p className="muted">{product.description}</p>
              <blockquote className="pull-quote" style={{ marginBlock: 26 }}>{craftStoryText}</blockquote>
              <Link to="/journal/persian-vs-turkish-knot" className="clear-all">Learn the knot languages →</Link>
            </div>
          )}
          {tab === 'care' && (
            <div>
              <p className="muted">{careText}</p>
              <ul style={{ marginTop: 16 }}>
                {[
                  'Use a natural-fibre underlay to prevent slippage and pile crush.',
                  'Rotate 180° every season for even light exposure.',
                  'Never steam-clean a silk blend at home.',
                  'Professional washing restores lanolin and prevents dry-rot.',
                ].map((li) => (
                  <li key={li} className="muted" style={{ fontSize: '0.9rem', marginBottom: 8, paddingLeft: 18, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--umber)' }}>—</span>{li}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Typed relationships from the PIM graph */}
      {related.length > 0 && (
        <section className="section" style={{ paddingTop: 40 }}>
          <Reveal>
            <div className="axis-head">
              <div>
                <p className="eyebrow">From the Same Loom</p>
                <h2 className="headline">Complete the look</h2>
              </div>
            </div>
          </Reveal>
          <div className="related-grid">
            {related.map((p, i) => (
              <Reveal key={p.id} delay={i * 90}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
