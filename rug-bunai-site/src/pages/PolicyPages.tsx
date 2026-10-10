import { Link, useParams } from 'react-router-dom';
import { CONTACT_PHONE_DISPLAY, WHATSAPP_TEL_HREF, whatsappLink } from '../lib/siteContent';

/**
 * Statutory storefront pages every Indian e-commerce site is expected to
 * publish: Privacy Policy, Terms of Sale, Shipping, Returns & Refunds and
 * FAQs. Routed at /policies/:slug and cross-linked from the footer.
 */

type Section = { heading: string; body: string[] };
type PolicyDoc = { eyebrow: string; title: string; updated: string; intro: string; sections: Section[] };

const UPDATED = 'Last updated: 10 October 2026';

const POLICIES: Record<string, PolicyDoc> = {
  privacy: {
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    updated: UPDATED,
    intro:
      'Rug Bunai ("we", "our", "us") respects your privacy. This policy explains what we collect when you browse or buy from rugbunai.com, why we collect it, and the choices you have.',
    sections: [
      {
        heading: '1. Information we collect',
        body: [
          'Account information: your name, email address and password (stored in hashed form via our authentication provider, Supabase) when you create an account.',
          'Order information: shipping address, contact number, items purchased and payment confirmation. We never store full card numbers — payments are processed by our payment gateway.',
          'Usage information: pages viewed, searches performed and device details, collected through standard cookies and local storage so your cart and wishlist survive page reloads.',
        ],
      },
      {
        heading: '2. How we use your information',
        body: [
          'To fulfil orders, send order confirmations and answer enquiries made through WhatsApp, phone or the contact page.',
          'To personalise your experience — cart sync, saved wishlist and recently viewed pieces.',
          'To improve our catalogue and website performance, and to send the monthly Loom Letter only if you subscribe. Every email includes an unsubscribe link.',
          'We do not sell your personal data to third parties.',
        ],
      },
      {
        heading: '3. Storage and security',
        body: [
          'Customer data is stored on Supabase (PostgreSQL) with Row Level Security enabled, so each signed-in customer can read only their own cart, wishlist and profile.',
          'Access to administrative functions requires an elevated role granted to studio staff only.',
          'We use industry-standard TLS encryption in transit and reasonable safeguards at rest, but no method of transmission is perfectly secure.',
        ],
      },
      {
        heading: '4. Cookies and local storage',
        body: [
          'We use browser local storage for cart contents, wishlist state and session tokens. These are essential for the shop to function.',
          'Any optional analytics cookies will only be set after you consent, where required by law.',
        ],
      },
      {
        heading: '5. Your rights',
        body: [
          'You may access, correct or request deletion of your personal data by writing to us or messaging the atelier on WhatsApp. Under India\u2019s Digital Personal Data Protection Act, 2023, you also have the right to withdraw consent and to nominate a person to exercise your data rights.',
          'You can delete your account and associated cart/wishlist data at any time by contacting the studio; lawful order records may be retained for accounting and tax compliance.',
        ],
      },
      {
        heading: '6. Children',
        body: ['Our site is intended for adults. We do not knowingly collect data from children under 18 without parental consent.'],
      },
      {
        heading: '7. Changes and contact',
        body: [
          'If we change this policy we will update the date above and, for material changes, notify registered customers by email.',
          `Questions about privacy? Call ${CONTACT_PHONE_DISPLAY} or write to the atelier — Bhadohi, Uttar Pradesh, India — 221401.`,
        ],
      },
    ],
  },
  terms: {
    eyebrow: 'Legal',
    title: 'Terms of Sale',
    updated: UPDATED,
    intro:
      'These terms govern purchases made through rugbunai.com. By placing an order you agree to them.',
    sections: [
      {
        heading: '1. Products and pricing',
        body: [
          'Every Rug Bunai piece is hand-knotted, hand-tufted or hand-woven; slight variations in colour, pile and dimension of up to ±3% are inherent to handmade goods and are not defects.',
          'All prices are in Indian Rupees (₹) and include applicable GST unless stated otherwise at checkout. International orders may attract import duties levied by the destination country, payable by the customer.',
        ],
      },
      {
        heading: '2. Orders and acceptance',
        body: [
          'An order becomes a binding contract only when we ship the item or issue a formal proforma for made-to-order pieces. We may decline an order (for example, if a piece sold concurrently in the showroom) with a full refund.',
          'Custom-size commissions require an advance and are subject to a written quote; production times quoted in months begin after design approval.',
        ],
      },
      {
        heading: '3. Payment',
        body: [
          'We accept major cards, UPI, net banking and other methods offered at checkout through PCI-compliant gateways. Card details never touch our servers.',
        ],
      },
      {
        heading: '4. Authenticity and care',
        body: [
          'Each hand-knotted piece ships with a certificate of authenticity naming the weaving cluster and knot density. Follow the Care tab on every product page to preserve the warranty of materials.',
        ],
      },
      {
        heading: '5. Liability',
        body: [
          'Our maximum liability for any claim is limited to the amount paid for the item in question. We are not liable for indirect losses arising from normal wear, misuse or failure to follow care instructions.',
        ],
      },
      {
        heading: '6. Governing law',
        body: ['These terms are governed by the laws of India. Courts at Ghaziabad / Lucknow, Uttar Pradesh, have exclusive jurisdiction.'],
      },
    ],
  },
  shipping: {
    eyebrow: 'Storefront policy',
    title: 'Shipping Policy',
    updated: UPDATED,
    intro: 'How your rug travels from the loom town of Bhadohi to your floor.',
    sections: [
      {
        heading: 'Dispatch times',
        body: [
          'In-stock pieces are dispatched within 3–5 working days after payment confirmation, following a final wash and finish check.',
          'Made-to-order and custom-size rugs ship per the production window quoted at the time of order (typically 6–14 weeks for hand-knotted commissions).',
        ],
      },
      {
        heading: 'Within India',
        body: [
          'Free insured shipping across India on all orders. Large rugs travel by surface freight with door-step delivery; smaller runners may travel by express courier.',
          'Delivery takes 5–10 working days from dispatch depending on pin code. Remote northeast and island locations can take longer.',
          'Every shipment is fully insured against loss and transit damage until it is signed for at your address.',
        ],
      },
      {
        heading: 'International shipping',
        body: [
          'We ship worldwide on request. Message the atelier on WhatsApp for a freight quote to your country.',
          'International orders ship DDU (duties and taxes payable by recipient) unless otherwise agreed in the proforma.',
        ],
      },
      {
        heading: 'Receiving your rug',
        body: [
          'Please inspect the package before signing the delivery challan. Note any visible damage on the challan and photograph the parcel before opening — claims filed without this evidence are difficult to honour.',
          'Roll (do not fold) the rug for storage, and unroll it flat on arrival; gentle creases settle within two weeks.',
        ],
      },
    ],
  },
  returns: {
    eyebrow: 'Storefront policy',
    title: 'Returns & Refunds',
    updated: UPDATED,
    intro: 'A rug must feel right underfoot. Here is exactly how returns work.',
    sections: [
      {
        heading: '30-day return window',
        body: [
          'Stock items may be returned within 30 days of delivery for a full refund of the item price, provided the rug is unused, unaltered, free of stains or pet damage, and returned with its certificate and original packing.',
          'Rugs must be returned rolled (not folded). The return freight cost for change-of-mind returns is borne by the customer; we arrange pickup at negotiated rates.',
        ],
      },
      {
        heading: 'Damaged or incorrect items',
        body: [
          'If your rug arrives damaged or we shipped the wrong piece, inform us within 7 days with photographs. We cover all return and replacement freight and issue a full refund or replacement at your choice.',
        ],
      },
      {
        heading: 'Non-returnable orders',
        body: [
          'Custom-size, custom-palette and made-to-order commissions cannot be returned for change of mind, as they were woven specifically for you. Manufacturing defects remain covered under the same defect process as stock items.',
        ],
      },
      {
        heading: 'Refund processing',
        body: [
          'Once the returned rug passes inspection at the studio, refunds are initiated within 3 working days to the original payment method. Bank/UPI settlement typically completes in 5–10 working days.',
          'To start a return, message the atelier on WhatsApp or call and quote your order number.',
        ],
      },
    ],
  },
  faqs: {
    eyebrow: 'Help',
    title: 'Frequently Asked Questions',
    updated: UPDATED,
    intro: 'Quick answers to the questions our studio hears most often.',
    sections: [
      {
        heading: 'Are your rugs truly handmade?',
        body: ['Yes. Every piece is knotted or woven by hand in Bhadohi, Uttar Pradesh. Machine-made goods are never sold under the Rug Bunai name, and hand-knotted pieces carry a certificate stating knots per square inch.'],
      },
      {
        heading: 'How do I choose the right size?',
        body: ['Use the sizing rules in our Journal article "How to Choose the Right Size" — the front-leg rule for sofas and full-door-clearance rule for dining rooms solve 90% of decisions. Share your floor plan on WhatsApp and the studio will advise.'],
      },
      {
        heading: 'Will the colour match my screen?',
        body: ['Photographs are taken in daylight and minimally edited, but woven piles read differently under warm and cool light. Order a silk/wool sample swatch if you are matching existing upholstery.'],
      },
      {
        heading: 'How do I clean and maintain a rug?',
        body: ['Vacuum without a beater bar, blot spills immediately with a dry cloth, rotate 180° every season, and get a professional wash once a year. Never steam-clean a silk blend at home. Each product page has a Care tab with full guidance.'],
      },
      {
        heading: 'Do you deliver outside India?',
        body: ['Yes, worldwide on request with a freight quote per destination. Duties and taxes at destination are payable by the recipient unless agreed otherwise.'],
      },
      {
        heading: 'Can I return a rug if it does not work in my room?',
        body: ['Stock pieces may be returned within 30 days of delivery in unused condition. Custom commissions are final sale. See the Returns & Refunds policy for details.'],
      },
      {
        heading: 'How do I reach a human?',
        body: [`Call ${CONTACT_PHONE_DISPLAY}, use the floating WhatsApp button at the bottom-right of every page, or visit the Contact page. Studio hours are 9 am – 7 pm IST, Monday to Saturday.`],
      },
    ],
  },
};

export default function PolicyPage() {
  const { slug } = useParams();
  const doc = slug ? POLICIES[slug] : undefined;

  if (!doc) {
    return (
      <div className="wrap empty-state">
        <p className="eyebrow">Not found</p>
        <h1 className="headline" style={{ margin: '12px 0' }}>This policy is not published.</h1>
        <p className="muted">Choose one of our storefront policies below.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 }}>
          {Object.entries(POLICIES).map(([key, value]) => (
            <Link key={key} to={`/policies/${key}`} className="btn">{value.title}</Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <article className="wrap section" style={{ maxWidth: '74ch' }}>
      <p className="eyebrow">{doc.eyebrow}</p>
      <h1 className="display" style={{ margin: '10px 0 6px' }}>{doc.title}</h1>
      <p className="muted" style={{ fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{doc.updated}</p>
      <p className="muted" style={{ marginTop: 22 }}>{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.heading} style={{ marginTop: 36 }}>
          <h2 className="subhead" style={{ fontSize: '1.15rem', marginBottom: 10 }}>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="muted" style={{ marginBottom: 10 }}>{paragraph}</p>
          ))}
        </section>
      ))}

      <hr className="rule" style={{ margin: '48px 0 26px' }} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <a className="btn btn-solid" href={whatsappLink(`Hello Rug Bunai! I have a question about your ${doc.title.toLowerCase()}.`)} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
        <a className="btn" href={WHATSAPP_TEL_HREF}>Call {CONTACT_PHONE_DISPLAY}</a>
        <Link className="btn" to="/rugs">Browse the archive</Link>
      </div>
      <p className="muted" style={{ marginTop: 26, fontSize: '0.8rem' }}>
        Other policies:{' '}
        {Object.entries(POLICIES).filter(([key]) => key !== slug).map(([key, value], i, arr) => (
          <span key={key}>
            <Link to={`/policies/${key}`} className="clear-all">{value.title}</Link>
            {i < arr.length - 1 ? ' · ' : ''}
          </span>
        ))}
      </p>
    </article>
  );
}
