import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatINR } from '../data/products';
import { useCart } from '../lib/cart';
import { STAIN_COAT_RATE_INR_PER_SQFT } from '../lib/sizes';
import { productImage } from '../lib/images';
import { useAuth } from '../lib/auth';
import { useCatalog } from '../lib/catalog';
import { normalizePhoneForWhatsapp } from '../lib/orders';
import {
  fetchMyOrder, fetchMyOrders, formatPaise, newIdempotencyKey, placeOrder,
  type OrderDetailRow, type OrderItemRow, type OrderSummaryRow,
} from '../lib/orders';

export function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();
  const lines = cart.items;

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
              <img src={productImage(l.product, 0, 220, 165)} alt={`${l.product.name} thumbnail`} loading="lazy" />
              <div>
                <h2 className="subhead"><Link to={`/rugs/${l.product.slug}`}>{l.product.name}</Link></h2>
                <p className="card-meta">
                  {l.variant.sizeLabel} ·{' '}
                  {l.custom?.colorHex ? (
                    <>
                      <span className="cart-custom-dot" style={{ background: l.custom.colorHex }} aria-hidden="true" />
                      {l.custom.colorName || 'Custom colour'} — request
                    </>
                  ) : (
                    <>colour {(l.custom?.colorName ?? l.variant.colorSlug).replace(/-/g, ' ')}</>
                  )}
                </p>
                {l.custom?.note && (
                  <p className="muted cart-custom-note">{l.custom.note}</p>
                )}
                <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>
                  {formatINR(l.unitPriceInr)} each{l.coating ? ` + ${formatINR(l.coatPerUnitInr)} coating` : ''}
                </p>
                <label className="coating-toggle cart-coating-toggle">
                  <input
                    type="checkbox"
                    checked={l.coating}
                    onChange={(e) => cart.setCoating(l.variant.id, e.target.checked)}
                  />
                  <span>Stain-resistant coating ({formatINR(l.coatPerUnitInr)}) — ₹{STAIN_COAT_RATE_INR_PER_SQFT}/sq ft × {l.sqft} sq ft</span>
                </label>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
                  <span className="qty-stepper" aria-label={`Quantity of ${l.product.name}`}>
                    <button aria-label="Decrease quantity" onClick={() => cart.setQty(l.variant.id, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => cart.setQty(l.variant.id, Math.min(l.qty + 1, l.variant.stock))}>+</button>
                  </span>
                  <button className="clear-all" onClick={() => cart.remove(l.variant.id)}>Remove</button>
                </div>
              </div>
              <p className="card-price" style={{ alignSelf: 'start', paddingTop: 6 }}>{formatINR(l.lineTotalInr)}</p>
            </div>
          ))}
        </div>
        <aside className="summary-card">
          <h2 className="subhead" style={{ marginBottom: 18 }}>Summary</h2>
          <div className="summary-row"><span>Rugs subtotal</span><span>{formatINR(cart.rugSubtotalInr)}</span></div>
          {cart.coatingTotalInr > 0 && (
            <div className="summary-row"><span>Stain-resistant coating</span><span>+{formatINR(cart.coatingTotalInr)}</span></div>
          )}
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

type Errors = Partial<Record<'email' | 'name' | 'phone' | 'address' | 'city' | 'pin', string>>;

export function CheckoutPage() {
  const cart = useCart();
  const { user, profile } = useAuth();
  const catalog = useCatalog();
  const [placed, setPlaced] = useState<{ orderReference: string; orderId: string; totalInr: number; email: string; items: { name: string; size: string; qty: number }[] } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState({
    email: user?.email ?? profile?.email ?? '',
    name: profile?.display_name ?? '',
    phone: '',
    address: '', city: '', pin: '',
  });
  /** Explicit opt-in for WhatsApp order updates (Meta requires consent). */
  const [waConsent, setWaConsent] = useState(false);
  /** One key per checkout attempt — reused across retries so a network
   *  retry returns the original order instead of creating a duplicate. */
  const [attemptKey, setAttemptKey] = useState<string>(() => newIdempotencyKey());
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const lines = cart.items;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // guard against accidental double submission
    const errs: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (form.name.trim().length < 3) errs.name = 'Full name required.';
    if (form.address.trim().length < 8) errs.address = 'Street address required.';
    if (form.city.trim().length < 2) errs.city = 'City required.';
    if (!/^\d{6}$/.test(form.pin)) errs.pin = 'PIN code must be 6 digits.';
    if (!normalizePhoneForWhatsapp(form.phone)) errs.phone = 'Enter a valid mobile number (10 digits, or with country code).';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (!user) {
      setServerError('Please sign in before placing your order — it keeps your order history safe and private.');
      window.scrollTo(0, 0);
      return;
    }

    const totalInr = cart.subtotalInr;
    setSubmitting(true);
    setServerError(null);
    try {
      // Trusted persistence path: the Supabase security-definer RPC derives
      // the customer from auth.uid(), validates every item, and re-totals
      // server-side. The cart is cleared ONLY after this succeeds.
      const result = await placeOrder({
        email: form.email,
        fullName: form.name,
        phone: form.phone,
        whatsappConsent: waConsent,
        address: form.address,
        city: form.city,
        pin: form.pin,
        lines: cart.items,
        products: catalog.products,
        idempotencyKey: attemptKey,
      });
      setPlaced({
        orderId: result.orderId,
        orderReference: result.orderReference,
        totalInr,
        email: form.email,
        items: cart.items.map((l) => ({ name: l.product.name, size: l.variant.sizeLabel, qty: l.qty })),
      });
      cart.clear();
      window.scrollTo(0, 0);
    } catch (err) {
      // Keep the cart intact; let the admin retry with the SAME key so a
      // partially-failed first attempt can't create a duplicate order.
      setServerError(err instanceof Error ? err.message : 'Something went wrong saving your order. Your cart has been kept — please try again.');
      window.scrollTo(0, 0);
    } finally {
      setSubmitting(false);
    }
  };

  if (placed) {
    // COD success screen: reference, item summary, total and COD status —
    // exactly what the queued email/WhatsApp confirmations contain.
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Order {placed.orderReference}</p>
        <h1 className="headline" style={{ margin: '12px 0' }}>The loom has your instruction.</h1>
        <ul style={{ listStyle: 'none', padding: 0, margin: '18px auto', maxWidth: '34ch', textAlign: 'left' }}>
          {placed.items.map((it, i) => (
            <li key={i} className="card-meta" style={{ marginBottom: 6 }}>
              {it.name} · {it.size} · qty {it.qty}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ maxWidth: '46ch', margin: '0 auto' }}>
          Total <strong>{formatINR(placed.totalInr)}</strong> — <strong>Cash on Delivery</strong>,
          payable when your rug arrives. A confirmation is on its way to {placed.email}
          {waConsent ? ' and WhatsApp' : ''}. Your pieces will be washed, sunned and photographed
          before dispatch — expect provenance cards with every knot count.
        </p>
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: 12 }}>
          Payment status: pending (COD). No online payment is taken now and no card details are
          stored by this website. Keep your order reference {placed.orderReference} handy.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <Link to="/orders" className="btn btn-solid">View my orders</Link>
          <Link to="/rugs" className="btn">Back to the Archive</Link>
        </div>
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
          <div className="field">
            <label htmlFor="ck-phone">Mobile number</label>
            <input id="ck-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="9876543210 or +91 98765 43210" />
            {errors.phone && <p className="field-error">{errors.phone}</p>}
          </div>
          <hr className="rule" style={{ margin: '26px 0' }} />
          <h2 className="subhead" style={{ marginBottom: 18 }}>Payment — Cash on Delivery</h2>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 14 }}>
            Pay in cash when your rug is delivered. We do not take online payments and never store
            card details; the order is recorded as <strong>payment pending</strong>.
          </p>
          <label className="coating-toggle" style={{ marginBottom: 20 }}>
            <input type="checkbox" checked={waConsent} onChange={(e) => setWaConsent(e.target.checked)} />
            <span>Send my order updates on WhatsApp at this number (optional — confirmations always go by email).</span>
          </label>
          {serverError && (
            <div className="field-error" role="alert" style={{ marginBottom: 16 }}>
              {serverError}
              {' '}<button type="button" className="btn btn-linklike" onClick={() => setAttemptKey(newIdempotencyKey())}>Start a fresh attempt</button>
            </div>
          )}
          <button className="btn btn-solid btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Saving your order…' : `Place COD order — ${formatINR(cart.subtotalInr)}`}
          </button>
          {!user && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 14, textAlign: 'center' }}>
              <Link to="/login">Sign in</Link> first so your order is saved to your account history.
            </p>
          )}
        </form>

        <aside className="summary-card">
          <h2 className="subhead" style={{ marginBottom: 14 }}>Order summary</h2>
          {lines.map((l) => (
            <div key={l.variant.id} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
              <img src={productImage(l.product, 0, 96, 72)} alt="" width={56} height={42} style={{ objectFit: 'cover' }} loading="lazy" />
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--serif)' }}>{l.product.name}</p>
                <p className="card-meta">{l.variant.sizeLabel} × {l.qty}{l.coating ? ' · coated' : ''}</p>
              </div>
              <span style={{ fontSize: '0.82rem' }}>{formatINR(l.lineTotalInr)}</span>
            </div>
          ))}
          <div className="summary-row" style={{ marginTop: 10 }}><span>Shipping</span><span>Included</span></div>
          {cart.coatingTotalInr > 0 && (
            <div className="summary-row"><span>Stain-resistant coating</span><span>+{formatINR(cart.coatingTotalInr)}</span></div>
          )}
          <div className="summary-row summary-total"><span>Total</span><span>{formatINR(cart.subtotalInr)}</span></div>
        </aside>
      </div>
    </div>
  );
}

// ── Persistent order history (Phase 5) — RLS restricts rows to the signed-in customer ──

const STATUS_LABELS: Record<string, string> = {
  placed: 'Placed', in_production: 'In production', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled', pending: 'Pending', paid: 'Paid', refunded: 'Refunded',
};

export function OrdersPage() {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<OrderSummaryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchMyOrders()
      .then((rows) => { if (!cancelled) setOrders(rows); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your orders.'); });
    return () => { cancelled = true; };
  }, [user]);

  if (loading) return <div className="wrap empty-state"><p className="muted">Checking your account…</p></div>;
  if (!user) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">Your orders live in your account.</h1>
        <p className="muted" style={{ maxWidth: '46ch', margin: '10px auto 0' }}>Sign in to see everything you have commissioned, with sizes, coating and totals exactly as purchased.</p>
        <Link to="/login" className="btn btn-solid" style={{ marginTop: 22 }}>Sign in</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">We couldn't open your orders.</h1>
        <p className="muted" role="alert" style={{ maxWidth: '46ch', margin: '10px auto 0' }}>{error}</p>
        <Link to="/rugs" className="btn" style={{ marginTop: 22 }}>Back to the Archive</Link>
      </div>
    );
  }
  if (orders === null) {
    return <div className="wrap empty-state"><p className="muted">Loading your orders…</p></div>;
  }
  if (orders.length === 0) {
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Order history</p>
        <h1 className="headline" style={{ marginTop: 10 }}>No commissions yet.</h1>
        <p className="muted">When you place an order it will appear here — saved exactly as purchased.</p>
        <Link to="/rugs" className="btn btn-solid" style={{ marginTop: 22 }}>Explore the Archive</Link>
      </div>
    );
  }
  return (
    <div className="wrap section">
      <p className="eyebrow">Account</p>
      <h1 className="display" style={{ marginBlock: '10px 30px' }}>Your orders</h1>
      <div className="orders-list">
        {orders.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="order-row">
            <div>
              <p className="subhead" style={{ fontSize: '1rem' }}>{o.order_reference ?? `#${o.id.slice(0, 8).toUpperCase()}`}</p>
              <p className="card-meta">{new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="order-row-mid">
              <span className={`order-status order-status-${o.status}`}>{STATUS_LABELS[o.status] ?? o.status}</span>
              <span className="card-meta">Payment: {STATUS_LABELS[o.payment_status] ?? o.payment_status}</span>
            </div>
            <strong>{formatPaise(o.total_paise)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [state, setState] = useState<{ order: OrderDetailRow; items: OrderItemRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    fetchMyOrder(id)
      .then((res) => { if (!cancelled) setState(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this order.'); });
    return () => { cancelled = true; };
  }, [user, id]);

  if (loading) return <div className="wrap empty-state"><p className="muted">Checking your account…</p></div>;
  if (!user) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">Sign in to view this order.</h1>
        <Link to="/login" className="btn btn-solid" style={{ marginTop: 20 }}>Sign in</Link>
      </div>
    );
  }
  if (error) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">That order isn't available.</h1>
        <p className="muted" role="alert" style={{ maxWidth: '46ch', margin: '10px auto 0' }}>{error}</p>
        <Link to="/orders" className="btn" style={{ marginTop: 20 }}>All my orders</Link>
      </div>
    );
  }
  if (!state) return <div className="wrap empty-state"><p className="muted">Loading the order…</p></div>;
  const { order, items } = state;
  return (
    <div className="wrap section">
      <p className="eyebrow">Order {order.order_reference ?? `#${order.id.slice(0, 8).toUpperCase()}`}</p>
      <h1 className="display" style={{ marginBlock: '10px 8px' }}>Commission details</h1>
      <p className="muted" style={{ marginBottom: 30 }}>
        Placed {new Date(order.created_at).toLocaleString('en-IN')} · Status:{' '}
        <span className={`order-status order-status-${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>{' '}
        · Payment: {STATUS_LABELS[order.payment_status] ?? order.payment_status}
        {(order.payment_method ?? 'cod') === 'cod' ? ' (Cash on Delivery — pay when your rug arrives)' : ''}
      </p>
      <div className="orders-detail-grid">
        <div>
          {items.map((it) => (
            <div className="order-item" key={it.id}>
              <div>
                <p className="subhead" style={{ fontSize: '1rem' }}>{it.product_name}</p>
                <p className="card-meta">
                  {it.size_label}{it.is_custom_size ? ' · custom size' : ''} · qty {it.quantity}
                  {it.colour_name ? ` · ${it.colour_name.replace(/-/g, ' ')}` : ''}
                </p>
                {it.note && <p className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>{it.note}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong>{formatPaise(it.line_total_paise)}</strong>
                <p className="card-meta">{formatPaise(it.unit_price_paise)} each</p>
                {it.coating && (
                  <p className="card-meta">+ coating {formatPaise(it.coating_charge_paise * it.quantity)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <aside className="summary-card">
          <h2 className="subhead" style={{ marginBottom: 14 }}>Summary</h2>
          <div className="summary-row"><span>Rugs subtotal</span><span>{formatPaise(order.items_subtotal_paise)}</span></div>
          {order.coating_subtotal_paise > 0 && (
            <div className="summary-row"><span>Stain-resistant coating</span><span>+{formatPaise(order.coating_subtotal_paise)}</span></div>
          )}
          <div className="summary-row"><span>Shipping</span><span>Included</span></div>
          <div className="summary-row summary-total"><span>Total</span><span>{formatPaise(order.total_paise)}</span></div>
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
            Cash on Delivery · payment {STATUS_LABELS[order.payment_status] ?? order.payment_status}
          </p>
          <h3 className="subhead" style={{ margin: '20px 0 8px', fontSize: '1rem' }}>Delivery to</h3>
          <p className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            {order.full_name}<br />{order.address}<br />{order.city} — {order.pin}<br />{order.email}
            {order.phone ? <><br />{order.phone}</> : null}
          </p>
        </aside>
      </div>
      <Link to="/orders" className="btn" style={{ marginTop: 24 }}>All my orders</Link>
    </div>
  );
}
