import { Link } from 'react-router-dom';
import { getProduct, PRODUCTS } from '../data/products';
import { rugImage } from '../lib/rugArt';
import { Reveal } from '../components/ProductCard';

/**
 * "Our Story" — the archival-luxury narrative page. The founder's name and the
 * 1982 date appear here (their designated supporting context), while the lead
 * is the tradition Rug Bunai custodies, per the content strategy directive.
 */
export default function StoryPage() {
  const hero = getProduct('anchal-heritage-border')!;
  return (
    <>
      <section className="hero">
        <div className="hero-art" aria-hidden="true">
          <img src={rugImage(hero, 0, 1600, 900)} alt="" />
        </div>
        <div className="hero-inner">
          <p className="eyebrow">Our Story</p>
          <h1 className="display">A house built<br />around a loom.</h1>
          <p className="hero-sub">
            Bhadohi has answered commissions for Mughal courts and Manhattan apartments with
            the same instrument: a vertical loom, a knot, and a sketch-book older than memory.
            We are one of its keeping houses.
          </p>
        </div>
      </section>

      <section className="wrap section">
        <div className="split">
          <div className="split-body">
            <p className="eyebrow">The Keeping House</p>
            <h2 className="headline">Guardians before merchants</h2>
            <p className="muted">
              In 1982, R. D. Kumar opened his first loom in Bhadohi at a time when machine-made
              floorcovering was sweeping India's carpet belt. The decision was quiet but total:
              every piece would be knotted by hand, washed by hand, finished by hand — or not made
              at all. Four decades on, that constraint has become our archive.
            </p>
            <p className="muted">
              But the brand belongs to the craft, not to one biography. The patterns travel through
              weaver families — cartoons drawn on graph paper at the turn of the last century,
              kept in steel almirahs beside the looms. Our work is translation: honouring the
              original geometry while sizing it for modern rooms.
            </p>
          </div>
          <div className="media">
            <img src={rugImage(getProduct('monsoon-reeds-runner')!, 3, 900, 680)} alt="Hand-knotted fringe detail, finished by hand" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap" style={{ paddingBlock: 'clamp(56px,8vw,100px)' }}>
          <div className="stats-row" style={{ borderColor: 'rgba(247,243,236,.18)', paddingBlock: 0 }}>
            <div className="stat"><b style={{ color: 'var(--paper)' }}>4th</b><span style={{ color: 'var(--sand)' }}>Generation of karigars at our looms</span></div>
            <div className="stat"><b style={{ color: 'var(--paper)' }}>27</b><span style={{ color: 'var(--sand)' }}>Cartoons restored from family archives</span></div>
            <div className="stat"><b style={{ color: 'var(--paper)' }}>0</b><span style={{ color: 'var(--sand)' }}>Synthetic backings, ever</span></div>
            <div className="stat"><b style={{ color: 'var(--paper)' }}>100%</b><span style={{ color: 'var(--sand)' }}>Wages paid above CRILIN floor rates</span></div>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <Reveal>
          <div className="axis-head">
            <div>
              <p className="eyebrow">From Sketch to Floor</p>
              <h2 className="headline">How a Rug Bunai piece is made</h2>
            </div>
          </div>
        </Reveal>
        <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 34, counterReset: 'steps' }}>
          {[
            ['Reading the cartoon', 'An archived pattern is photographed, redrawn at scale, and colour-graded against natural-dye lots. The family that keeps the cartoon is credited on the provenance card.'],
            ['Spinning & dyeing', 'Hand-spun wool retains lanolin; small-batch dips in madder, indigo and pomegranate rind create the tonal depth machines cannot duplicate.'],
            ['Knotting', 'At the vertical loom, each knot is hooked and cut by eye. A 230 × 160 cm field at 100 knots/in² is roughly 360,000 decisions.'],
            ['Washing & sunning', 'Cold river-water washes, then rooftop drying on Bhadohi concrete — the slow cure that sets colour and softens handle.'],
            ['Finishing', 'Carving, clipping, fringe braiding and binding are done by specialists whose signatures go into the archive ledger.'],
          ].map(([title, body], i) => (
            <li key={title} style={{ listStyle: 'none', borderTop: '1px solid var(--line)', paddingTop: 20 }}>
              <p className="eyebrow">Step {i + 1}</p>
              <h3 className="subhead" style={{ margin: '8px 0 10px' }}>{title}</h3>
              <p className="muted" style={{ fontSize: '0.9rem' }}>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="wrap" style={{ paddingBottom: 'clamp(64px,8vw,120px)' }}>
        <div className="split flip">
          <div className="media">
            <img src={rugImage(PRODUCTS[2], 1, 900, 680)} alt="Macro of graduated hand-dyed wool pile" loading="lazy" />
          </div>
          <div className="split-body">
            <p className="eyebrow">Continue</p>
            <h2 className="headline">Read the craft in your room</h2>
            <p className="muted">
              The Journal carries the longer essays — knot grammars, lanolin chemistry, the
              sketch-book families themselves. Or begin with the pieces and let the floor decide.
            </p>
            <div style={{ display: 'flex', gap: 14, marginTop: 24, flexWrap: 'wrap' }}>
              <Link to="/journal" className="btn">Visit the Journal</Link>
              <Link to="/rugs" className="btn btn-solid">Shop the Archive</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
