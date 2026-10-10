import { Link } from 'react-router-dom';
import { CONTACT_PHONE_DISPLAY, WHATSAPP_TEL_HREF, useSiteContent, whatsappLink } from '../lib/siteContent';

/** Minimal contact page — footer links to /contact; details per brand spec. */
export default function ContactPage() {
  const { content } = useSiteContent();
  return (
    <div className="wrap section" style={{ maxWidth: '60ch' }}>
      <p className="eyebrow">Contact</p>
      <h1 className="display" style={{ margin: '10px 0 24px' }}>{content.contact.title}</h1>
      <p className="muted">{content.contact.body}</p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 28, display: 'grid', gap: 12 }}>
        <li>
          <span className="subhead" style={{ fontSize: '1rem' }}>Telephone</span><br />
          <a href={WHATSAPP_TEL_HREF} className="clear-all">{CONTACT_PHONE_DISPLAY}</a>
        </li>
        <li>
          <span className="subhead" style={{ fontSize: '1rem' }}>WhatsApp</span><br />
          <a href={whatsappLink('Hello Rug Bunai! I would like to speak with the atelier.')} target="_blank" rel="noopener noreferrer" className="clear-all">
            Chat with us on WhatsApp — {CONTACT_PHONE_DISPLAY}
          </a>
        </li>
        <li><span className="subhead" style={{ fontSize: '1rem' }}>Studio</span><br />Bhadohi, Uttar Pradesh, India — 221401</li>
      </ul>
      <p className="muted" style={{ marginTop: 18, fontSize: '0.85rem' }}>{content.contact.note}</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 30 }}>
        <Link to="/rugs" className="btn btn-solid">Explore the Archive</Link>
        <a className="btn" href={WHATSAPP_TEL_HREF}>Call the atelier</a>
      </div>
      <hr className="rule" style={{ margin: '44px 0 26px' }} />
      <p className="muted" style={{ fontSize: '0.8rem' }}>
        Before you buy, our storefront policies are published for your peace of mind:{' '}
        <Link to="/policies/privacy-policy" className="clear-all">Privacy Policy</Link>,{' '}
        <Link to="/policies/terms" className="clear-all">Terms of Sale</Link>,{' '}
        <Link to="/policies/shipping-policy" className="clear-all">Shipping Policy</Link>,{' '}
        <Link to="/policies/returns" className="clear-all">Returns &amp; Refunds</Link> and{' '}
        <Link to="/policies/faqs" className="clear-all">FAQs</Link>.
      </p>
    </div>
  );
}

/** Catch-all so unknown paths never render a blank shell. */
export function NotFound() {
  return (
    <div className="wrap empty-state">
      <p className="eyebrow">404</p>
      <h1 className="headline" style={{ margin: '12px 0' }}>This pattern is not in the archive.</h1>
      <p className="muted">The page you were looking for has moved or never existed.</p>
      <Link to="/" className="btn btn-solid" style={{ marginTop: 24 }}>Return home</Link>
    </div>
  );
}
