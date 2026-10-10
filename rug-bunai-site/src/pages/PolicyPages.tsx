import { Link, useParams } from 'react-router-dom';
import { CONTACT_PHONE_DISPLAY, WHATSAPP_TEL_HREF, whatsappLink } from '../lib/siteContent';

/**
 * Statutory storefront pages every Indian e-commerce site is expected to
 * publish: Privacy Policy, Terms of Sale, Shipping, Returns & Refunds and
 * FAQs. Routed at /policies/:slug and cross-linked from the footer.
 */

type Section = { heading: string; body: string[]; kind?: 'timelines' };
type PolicyDoc = { eyebrow: string; title: string; updated: string; intro: string; sections: Section[] };

const UPDATED = 'Last updated: 10 October 2026';

/** Business-supplied production & delivery windows. Production time is shown
 * separately from post-dispatch delivery time and never as a combined promise. */
const PRODUCTION_TIMELINES = [
  { label: 'Hand-Tufted Rugs', value: '10 to 12 working days for production' },
  { label: 'Hand-Knotted Rugs', value: '30 to 35 working days for production' },
  { label: 'Dhurrie', value: '15 to 20 working days for production' },
];
const DELIVERY_TIMELINES = [
  { label: 'Standard Delivery', value: '5 to 7 working days from dispatch' },
  { label: 'Express Delivery', value: '2 to 4 working days from dispatch' },
];

const POLICIES: Record<string, PolicyDoc> = {
  /**
   * Privacy Policy content mirrors the business-approved draft exactly.
   * It deliberately avoids claiming payment gateways, analytics, cookie
   * consent or notification workflows that are not actually implemented
   * in this application.
   */
  'privacy-policy': {
    eyebrow: 'Legal',
    title: 'Privacy Policy',
    updated: UPDATED,
    intro:
      'Rug Bunai respects your privacy and aims to handle your personal information responsibly when you visit our website, contact us, create an account, or purchase our rugs, carpets and related products.',
    sections: [
      {
        heading: '1. Introduction',
        body: [
          'This Privacy Policy explains the types of personal information that may be collected through our website, how that information may be used and shared, how it may be retained, and how you can contact us about privacy-related concerns.',
          'Rug Bunai operates from Bhadohi, Uttar Pradesh, India. The precise legal identity and registered business details of the website operator must be confirmed by the business owner and displayed wherever required.',
        ],
      },
      {
        heading: '2. Information We May Collect',
        body: [
          'Depending on the features you use and the information you provide, the following categories of information may be processed:',
          'Account and contact information: Your name, email address, telephone number and account-related information when you register, sign in or contact us.',
          'Order and delivery information: Information needed to process and fulfil an order, which may include your billing and delivery address, purchased products, selected product options, order status and delivery details.',
          'Customer communications: Information you include in enquiries, support requests, product customisation requests or other communications with Rug Bunai.',
          'Transaction-related information: Order totals, payment status, transaction references and related records necessary to manage purchases. Payment-card or banking credentials should not be collected or stored by Rug Bunai unless the actual payment system requires and securely supports that processing.',
          'Technical information: Limited information about your browser, device, website interactions, security events or similar technical details, where the website\u2019s actual infrastructure collects it.',
          'The information processed depends on the functionality you use. We aim to collect information relevant to the purpose for which it is needed.',
        ],
      },
      {
        heading: '3. How We Use Information',
        body: [
          'Where applicable to the services you use, personal information may be used to: create and manage customer accounts; process orders and provide customer support; arrange production, delivery and order tracking; respond to questions about products, rug sizes, colours and customisation requests; communicate order confirmations, dispatch updates and delivery information through available communication channels; handle returns, refunds, cancellations and complaints; maintain website functionality, account security and fraud prevention; maintain business records and comply with applicable legal obligations; and improve the website and customer experience where appropriate and supported by the actual data practices.',
          'We should not use personal information for unrelated purposes without an appropriate basis and any notice, permission or consent required by applicable law.',
          'Marketing communications, where offered, should be handled separately from essential order-related messages where appropriate.',
        ],
      },
      {
        heading: '4. How Information May Be Shared',
        body: [
          'Personal information may be shared with service providers when necessary to operate the website and fulfil the purposes described in this policy. Depending on the services actually used, these providers may include website hosting and infrastructure providers; authentication, database and file-storage providers; payment-processing providers; delivery and logistics partners; and customer-support and communication providers.',
          'Information may also be disclosed when required by applicable law or when reasonably necessary to protect the security of the website, investigate suspected fraud, or establish or defend legal claims.',
          'The actual providers and information shared must be limited to those relevant to Rug Bunai\u2019s operating arrangements. We do not claim that any particular provider receives information unless that integration is actually in use.',
        ],
      },
      {
        heading: '5. Data Retention',
        body: [
          'We retain personal information for as long as it is reasonably necessary for the relevant purpose, including account administration, order fulfilment, customer support, business records, security and applicable legal obligations.',
          'Retention periods may differ depending on the type of information and the reason it is held.',
          'Where information is no longer required and there is no applicable legal or operational reason to retain it, appropriate deletion or anonymisation should be undertaken, subject to the capabilities of the systems used. A specific deletion timeframe should not be assumed unless it has been established by the business and implemented in its data-retention procedures.',
        ],
      },
      {
        heading: '6. Data Security',
        body: [
          'Rug Bunai aims to protect personal information through appropriate technical and organisational safeguards.',
          'The website operator should maintain suitable access controls, protect administrative credentials, restrict access to customer information, and use secure configurations for the systems handling personal data.',
          'No website or electronic transmission can be guaranteed to be completely secure. Any statements about specific security certifications, encryption configurations, audits or guarantees must reflect verified practices rather than assumptions.',
        ],
      },
      {
        heading: '7. Cookies and Similar Technologies',
        body: [
          'The website may use essential browser storage, cookies or similar technologies to support functionality such as account sessions, cart behaviour, security and user preferences.',
          'Additional analytics or tracking technologies should be described here only if they are actually used. The specific technologies, their purposes and any available controls must reflect the website\u2019s real implementation. Where applicable, users should be provided with the notices, choices or consent mechanisms required by law.',
          'This section does not claim that Rug Bunai uses advertising cookies, analytics trackers or a cookie-consent platform unless those features are verified.',
        ],
      },
      {
        heading: '8. Customer Privacy Requests',
        body: [
          'If you have a question about your personal information, believe information associated with your account is inaccurate, or wish to request access, correction, deletion or another privacy-related action, contact Rug Bunai using the customer-support channel below.',
          'We will review requests and respond in accordance with applicable law, the nature of the request, and any relevant legal or operational retention requirements. Requests may require reasonable verification of identity to prevent unauthorised access or changes to personal information.',
          'The rights available, the applicable procedures and any statutory response periods depend on the provisions of law in force at the relevant time. The business should ensure that its actual procedures are updated as applicable legal requirements commence.',
        ],
      },
      {
        heading: '9. Children\u2019s Privacy',
        body: [
          'The website is intended to facilitate the purchase of rugs, carpets and related products. It is not intended to encourage children to provide personal information unnecessarily.',
          'If the business becomes aware that personal information has been collected in circumstances requiring additional safeguards, it should assess the situation and take appropriate action in accordance with applicable law. Any claims concerning parental consent, age verification or specific children\u2019s-data safeguards must reflect procedures that are actually implemented.',
        ],
      },
      {
        heading: '10. Third-Party Websites and Services',
        body: [
          'The website may link to third-party websites or services, for example when a customer chooses to communicate through an external messaging service or uses a payment or delivery service.',
          'Those third parties may process information under their own privacy policies and terms. Rug Bunai\u2019s policy does not replace the privacy policies of third-party services. Customers should review the relevant third party\u2019s terms when using its services. Only describe third-party integrations that are actually present on the website.',
        ],
      },
      {
        heading: '11. Changes to This Policy',
        body: [
          'This Privacy Policy may be updated when the website\u2019s practices, services or applicable legal requirements change. The revised version will be published on this page with an updated date. Where required by applicable law or appropriate to the nature of a material change, additional notice or action may be necessary.',
          'Customers should review this page periodically for relevant updates.',
        ],
      },
      {
        heading: '12. Contact Us',
        body: [
          'For privacy-related questions, requests or concerns, contact Rug Bunai:',
          'Business name: Rug Bunai. Business location: Bhadohi, Uttar Pradesh, India. Customer support: +91 9555036025. Support hours: 10:00 AM\u20136:00 PM, Monday\u2013Saturday, excluding national holidays.',
          'The business owner must confirm the operator\u2019s complete legal name, full postal address and an appropriate support or privacy email address. Any designated privacy or grievance contact required by applicable law must also be confirmed and displayed where necessary.',
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
  /**
   * Shipping Policy content mirrors the business-approved draft exactly.
   * Production timelines are deliberately kept separate from post-dispatch
   * delivery windows — they must never read as a combined guaranteed date.
   */
  'shipping-policy': {
    eyebrow: 'Storefront policy',
    title: 'Shipping Policy',
    updated: UPDATED,
    intro: 'How your Rug Bunai order moves from our workshop in Bhadohi to your floor — production timelines, tracking updates, pricing and support.',
    sections: [
      {
        heading: '1. Production & Delivery Timelines',
        body: [
          'Production time and delivery time are separate stages. Your rug is first handmade to order; only after it passes quality checks and is dispatched does the delivery window begin. The durations below are working-day estimates, not guaranteed combined delivery dates.',
        ],
        kind: 'timelines',
      },
      {
        heading: '2. Order Updates & Tracking',
        body: [
          'Order Confirmation: an order confirmation is sent via email and WhatsApp.',
          'Tracking Information: the tracking ID is sent via WhatsApp and email once the order has shipped.',
          'Quality Assurance: each order undergoes quality assurance before dispatch.',
          'Returns: a 7-day return policy applies.',
        ],
      },
      {
        heading: '3. Pricing & Support',
        body: [
          'Domestic Orders: all-inclusive pricing; applicable taxes are included.',
          'International Orders: shipping fees apply, and the buyer is responsible for import duties and customs charges.',
          `Customer Support: ${CONTACT_PHONE_DISPLAY}.`,
          'Support Hours: 10:00 AM–6:00 PM, Monday–Saturday, excluding national holidays.',
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

/** Renders "Label: rest" copy with a semantically bolded lead-in label. */
function PolicyParagraph({ text }: { text: string }) {
  const m = text.match(/^([A-Z][^:.]{1,42}):\s(.+)$/s);
  if (!m) return <p className="muted">{text}</p>;
  return (
    <p className="muted">
      <strong>{m[1]}:</strong> {m[2]}
    </p>
  );
}

function TimelineTable() {
  return (
    <div className="policy-timeline">
      <table>
        <caption className="sr-only">Production and delivery timelines in working days</caption>
        <thead>
          <tr>
            <th scope="col">Product or delivery method</th>
            <th scope="col">Timeline</th>
          </tr>
        </thead>
        <tbody>
          {[...PRODUCTION_TIMELINES, ...DELIVERY_TIMELINES].map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted policy-timeline-note">
        Production time applies before dispatch; delivery time begins only after the order ships. These are working-day
        estimates, not a guaranteed combined delivery date.
      </p>
    </div>
  );
}

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
    <article className="wrap section policy-page">
      <header className="policy-head">
        <p className="eyebrow">{doc.eyebrow}</p>
        <h1 className="display">{doc.title}</h1>
        <p className="policy-updated">{doc.updated}</p>
        <p className="muted policy-intro">{doc.intro}</p>
      </header>

      {doc.sections.map((section) => (
        <section key={section.heading} className="policy-section" aria-labelledby={`sec-${section.heading.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
          <h2 id={`sec-${section.heading.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`} className="subhead">{section.heading}</h2>
          {section.kind === 'timelines' && <TimelineTable />}
          {section.body.map((paragraph) => (
            <PolicyParagraph key={paragraph} text={paragraph} />
          ))}
        </section>
      ))}

      <hr className="rule" />
      <div className="policy-actions">
        <a className="btn btn-solid" href={whatsappLink(`Hello Rug Bunai! I have a question about your ${doc.title.toLowerCase()}.`)} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
        <a className="btn" href={WHATSAPP_TEL_HREF}>Call {CONTACT_PHONE_DISPLAY}</a>
        <Link className="btn" to="/rugs">Browse the archive</Link>
      </div>
      <p className="policy-crosslinks muted">
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
