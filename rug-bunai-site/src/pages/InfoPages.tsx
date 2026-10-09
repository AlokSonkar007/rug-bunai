import { Link, useParams } from 'react-router-dom';
import { CONTACT_PHONE_DISPLAY, WHATSAPP_NUMBER } from '../lib/siteContent';

const SHIPPING_POLICY = {
  title: 'Shipping Policy',
  sections: [
    {
      heading: 'Production & Delivery Timelines',
      items: [
        'Hand-Tufted Rugs: 10 to 12 working days production',
        'Hand-Knotted Rugs: 30 to 35 working days production',
        'Dhurrie: 15 to 20 working days production',
        'Standard Delivery: 5 to 7 working days from dispatch',
        'Express Delivery: 2 to 4 working days from dispatch',
      ],
    },
    {
      heading: 'Order Updates & Tracking',
      items: [
        'Order confirmation via email & WhatsApp',
        'Tracking ID sent via WhatsApp & Email once shipped',
        'Quality assured before dispatch',
        '7 days return policy',
      ],
    },
    {
      heading: 'Pricing & Support',
      items: [
        'Domestic Orders: All-inclusive pricing (taxes included)',
        'International Orders: Shipping fees + buyer covers import duties & customs',
        `Customer support: ${CONTACT_PHONE_DISPLAY}`,
        'Hours: 10AM-6PM, Mon-Sat (excl. national holidays)',
      ],
    },
  ],
};

const RETURNS_POLICY = {
  title: 'Returns Policy',
  sections: [
    {
      heading: '7-Day Return Window',
      items: [
        'Returns are accepted within 7 days of delivery.',
        'The rug must be unused, in its original condition and packaging.',
        'Initiate a return via WhatsApp or email with your order number.',
        'Pickup is arranged at no extra cost for defects or wrong shipments.',
      ],
    },
    {
      heading: 'Non-Returnable Items',
      items: [
        'Custom-size rugs made to your specified dimensions.',
        'Rugs altered or cleaned by a third party after delivery.',
      ],
    },
  ],
};

const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'What We Collect',
      items: [
        'Contact details (name, phone, email, address) needed to fulfil orders.',
        'Order history used only for support and re-orders.',
      ],
    },
    {
      heading: 'How We Use It',
      items: [
        'We never sell your data. Order updates are sent via email & WhatsApp.',
        'Payment is handled by our gateway — card details never touch our servers.',
        `For any privacy request, contact us on WhatsApp: +${WHATSAPP_NUMBER}`,
      ],
    },
  ],
};

const POLICIES: Record<string, typeof SHIPPING_POLICY> = {
  shipping: SHIPPING_POLICY,
  returns: RETURNS_POLICY,
  privacy: PRIVACY_POLICY,
};

/** Policy pages linked from the footer — /policies/shipping, /returns, /privacy. */
export function PoliciesPage() {
  const { slug } = useParams();
  const policy = (slug && POLICIES[slug]) || SHIPPING_POLICY;
  return (
    <div className="wrap section" style={{ maxWidth: '72ch' }}>
      <p className="eyebrow">Policies</p>
      <h1 className="display" style={{ margin: '10px 0 30px' }}>{policy.title}</h1>
      {policy.sections.map((section) => (
        <section key={section.heading} style={{ marginBottom: 34 }}>
          <h2 className="headline" style={{ fontSize: '1.5rem', marginBottom: 12 }}>{section.heading}</h2>
          <ul className="muted" style={{ paddingLeft: 20, display: 'grid', gap: 8, margin: 0 }}>
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
      <Link to="/contact" className="btn btn-solid" style={{ marginTop: 8 }}>Questions? Contact us</Link>
    </div>
  );
}

/** Minimal contact page — footer links to /contact; details per brand spec. */
export default function ContactPage() {
  return (
    <div className="wrap section" style={{ maxWidth: '60ch' }}>
      <p className="eyebrow">Contact</p>
      <h1 className="display" style={{ margin: '10px 0 24px' }}>Speak with the atelier.</h1>
      <p className="muted">
        For sizing counsel, trade enquiries or provenance questions, write to us or call the studio
        directly. We answer within one working day, Bhadohi time.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 28, display: 'grid', gap: 12 }}>
        <li><span className="subhead" style={{ fontSize: '1rem' }}>Telephone</span><br />+91 90441 69163</li>
        <li><span className="subhead" style={{ fontSize: '1rem' }}>Studio</span><br />Bhadohi, Uttar Pradesh, India — 221401</li>
      </ul>
      <Link to="/rugs" className="btn btn-solid" style={{ marginTop: 30 }}>Explore the Archive</Link>
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
