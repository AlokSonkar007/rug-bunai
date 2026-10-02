import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatINR } from '../data/products';
import { variantById, useCart } from '../lib/cart';
import { rugImage } from '../lib/rugArt';

export function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();
  // Stale localStorage lines (removed designs/variants) resolve to undefined;
  // drop them via a type guard so downstream rendering sees complete lines only.
  const lines = cart.lines.flatMap((l) => {
    const resolved = variantById(l.variantId);
    return resolved ? [{ ...resolved, qty: l.qty }] : [];
  });

  if (lines.length === 0) {
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Your cart</p>
        <h1 className="headline" style={{ marginTop: 10 }}>Nothing on the floor yet.</h1>
        <p className="muted">Every piece is one of a handful — when a design returns to the loom, it rarely returns identical.</p>
        <Link to="/rugs" className="btn btn-solid" style={{ marginTop: 24 }}>Explore the Archive</Link>
      </div>
    );
  }

  return (
    <div className="wrap section">
      <p className="eyebrow">Step 1 of 3</p>
      <h1 className="display" style={{ marginBlock: '10px 40px' }}>Your selection</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'clamp(30px,5vw,70px)', alignItems: 'start' }}>
        <div>
          {lines.map((l) => (
            <div className="cart-line" key={l.variant.id}>
              <img src={rugImage(l.product, 0, 220, 165)} alt={`${l.product.name} thumbnail`} loading="lazy" />
              <div>
                <h2 className="subhead"><Link to={`/rugs/${l.product.slug}`}>{l.product.name}</Link></h2>
                <p className="card-meta">{l.variant.sizeLabel} · colour {l.variant.colorSlug.replace(/-/g, ' ')}</p>
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>{formatINR(l.variant.priceInr)} each</p>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
                  <span className="qty-stepper" aria-label={`Quantity of ${l.product.name}`}>
                    <button aria-label="Decrease quantity" onClick={() => cart.setQty(l.variant.id, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => cart.setQty(l.variant.id, Math.min(l.qty + 1, l.variant.stock))}>+</button>
                  </span>
                  <button className="clear-all" onClick={() => cart.remove(l.variant.id)}>Remove</button>
                </div>
              </div>
              <p className="card-price" style={{ alignSelf: 'start', paddingTop: 6 }}>{formatINR(l.variant.priceInr * l.qty)}</p>
            </div>
          ))}
        </div>
        <aside className="summary-card">
          <h2 className="subhead" style={{ marginBottom: 18 }}>Summary</h2>
          <div className="summary-row"><span>Subtotal</span><span>{formatINR(cart.subtotalInr)}</span></div>
          <div className="summary-row"><span>Shipping &amp; insurance</span><span>Included — India</span></div>
          <div className="summary-row"><span>GST</span><span>At checkout</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{formatINR(cart.subtotalInr)}</span></div>
          <button className="btn btn-solid btn-block" style={{ marginTop: 22 }} onClick={() => navigate('/checkout')}>
            Continue to Checkout
          </button>
          <Link to="/rugs" className="clear-all" style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>Keep browsing</Link>
        </aside>
      </div>
    </div>
  );
}

// ── Frictionless three-step checkout (Apple-style: minimal steps, retained info) ──

type Errors = Partial<Record<'email' | 'name' | 'address' | 'city' | 'pin' | 'card', string>>;

export function CheckoutPage() {
  const cart = useCart();
  const [placed, setPlaced] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState({ email: '', name: '', address: '', city: '', pin: '', card: '' });

  const lines = useMemo(
    () =>
      cart.lines.flatMap((l) => {
        const resolved = variantById(l.variantId);
        return resolved ? [{ ...resolved, qty: l.qty }] : [];
      }),
    [cart.lines],
  );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.name.trim().length < 3) errs.name = 'Full name required.';
    if (form.address.trim().length < 8) errs.address = 'Street address required.';
    if (form.city.trim().length < 2) errs.city = 'City required.';
    if (!/^\d{6}$/.test(form.pin)) errs.pin = 'PIN code must be 6 digits.';
    if (form.card.replace(/\s/g, '').length < 12) errs.card = 'Card number looks too short.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const orderId = 'RB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    setPlaced(orderId);
    cart.clear();
    window.scrollTo(0, 0);
  };

  if (placed) {
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Order {placed}</p>
        <h1 className="headline" style={{ margin: '12px 0' }}>The loom has your instruction.</h1>
        <p className="muted" style={{ maxWidth: '46ch', margin: '0 auto' }}>
          A confirmation is on its way to {form.email}. Your pieces will be washed, sunned and
          photographed before dispatch — expect provenance cards with every knot count.
        </p>
        <Link to="/rugs" className="btn btn-solid" style={{ marginTop: 26 }}>Back to the Archive</Link>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">Your cart emptied itself.</h1>
        <Link to="/rugs" className="btn" style={{ marginTop: 18 }}>Browse rugs</Link>
      </div>
    );
  }

  return (
    <div className="wrap section">
      <div className="steps" aria-hidden="true">
        <span className="step active">Cart</span>
        <span className="step active">Details &amp; Payment</span>
        <span className="step">Confirmation</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'clamp(30px,5vw,70px)', alignItems: 'start' }}>
        <form onSubmit={submit} noValidate>
          <h1 className="headline" style={{ marginBottom: 28 }}>Delivery details</h1>
          <div className="field">
            <label htmlFor="ck-email">Email</label>
            <input id="ck-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
          <div className="field">
            <label htmlFor="ck-name">Full name</label>
            <input id="ck-name" value={form.name} onChange={set('name')} autoComplete="name" />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="ck-addr">Address</label>
            <input id="ck-addr" value={form.address} onChange={set('address')} autoComplete="street-address" />
            {errors.address && <p className="field-error">{errors.address}</p>}
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="ck-city">City</label>
              <input id="ck-city" value={form.city} onChange={set('city')} autoComplete="address-level2" />
              {errors.city && <p className="field-error">{errors.city}</p>}
            </div>
            <div className="field">
              <label htmlFor="ck-pin">PIN code</label>
              <input id="ck-pin" inputMode="numeric" maxLength={6} value={form.pin} onChange={set('pin')} autoComplete="postal-code" />
              {errors.pin && <p className="field-error">{errors.pin}</p>}
            </div>
          </div>
          <hr className="rule" style={{ margin: '26px 0' }} />
          <h2 className="subhead" style={{ marginBottom: 18 }}>Payment</h2>
          <div className="field">
            <label htmlFor="ck-card">Card number</label>
            <input id="ck-card" inputMode="numeric" placeholder="•••• •••• •••• ••••" value={form.card} onChange={set('card')} autoComplete="cc-number" />
            {errors.card && <p className="field-error">{errors.card}</p>}
          </div>
          <p className="muted" style={{ fontSize: '0.75rem', marginBottom: 20 }}>
            Payments process through Shopify Pay in production; this demo validates locally and never stores card data.
          </p>
          <button className="btn btn-solid btn-block" type="submit">Place order — {formatINR(cart.subtotalInr)}</button>
        </form>

        <aside className="summary-card">
          <h2 className="subhead" style={{ marginBottom: 14 }}>Order summary</h2>
          {lines.map((l) => (
            <div key={l.variant.id} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
              <img src={rugImage(l.product, 0, 96, 72)} alt="" width={56} height={42} style={{ objectFit: 'cover' }} loading="lazy" />
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--serif)' }}>{l.product.name}</p>
                <p className="card-meta">{l.variant.sizeLabel} × {l.qty}</p>
              </div>
              <span style={{ fontSize: '0.82rem' }}>{formatINR(l.variant.priceInr * l.qty)}</span>
            </div>
          ))}
          <div className="summary-row" style={{ marginTop: 10 }}><span>Shipping</span><span>Included</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{formatINR(cart.subtotalInr)}</span></div>
        </aside>
      </div>
    </div>
  );
}
