import { Link } from 'react-router-dom';

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
