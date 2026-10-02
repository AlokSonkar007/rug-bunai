import { Link, useParams } from 'react-router-dom';
import { productPhoto } from '../lib/products';
import { useProducts } from '../lib/catalog';
import { Reveal } from '../components/ProductCard';

// ── Journal content model (Sanity "post" documents in production) ────────────
interface Post {
  slug: string;
  pillar: 'Craft Storytelling' | 'Interior Inspiration' | 'Product-Centric Detailing';
  title: string;
  excerpt: string;
  minutes: number;
  body: readonly string[];
  pullQuote?: string;
  cta?: { label: string; to: string };
  linkedRugSlug?: string;
}

const POSTS: readonly Post[] = [
  {
    slug: 'persian-vs-turkish-knot',
    pillar: 'Craft Storytelling',
    title: 'Persian Knot or Turkish Knot? Reading a Rug Like a Weaver',
    excerpt:
      'Two knots, two grammars. The asymmetric Senneh knot lets a weaver draw curves; the symmetric Ghiordes knot holds geometry. Here is how to tell them apart from ten centimetres away.',
    minutes: 7,
    body: [
      'Every hand-knotted rug is a sentence written in one of two alphabets. The symmetric Turkish knot — called Ghiordes in the trade — passes its yarn over two warp threads and back under both. Locked and upright, it favours straight lines, bold geometry, and edges that survive generations of hallway traffic.',
      'The asymmetric Persian knot — the Senneh — hooks around a single warp and slips behind the second. That half-turn gives the weaver latitude: corners soften, vines curl, the eye of a medallion can look almost at you. It also lets knot density climb past 100 per square inch without the foundation buckling.',
      'You do not need a loupe to tell them apart. Turn the rug to its reverse and look at the knot heads. Turkish knots present as neat bricks standing shoulder to shoulder; Persian knots lean like rain on a window, offset by half a thread. Then run a finger along a curved border on the face — if the curve wobbles slightly where it changes direction, you are feeling the slower decision of an asymmetric knot.',
      'In Bhadohi, the Senneh tradition arrived along with Mughal draftsmen and never left. Our karigars still learn the half-hook before they learn a full pattern, the same way children learn letters before literature.',
    ],
    pullQuote: 'A rug is a sentence written in one of two alphabets — and the reverse side tells you which.',
    cta: { label: 'Shop hand-knotted designs', to: '/rugs?tech=hand-knotted' },
    linkedRugSlug: 'mughal-garden-floral',
  },
  {
    slug: 'rug-size-guide',
    pillar: 'Interior Inspiration',
    title: 'How to Choose the Right Rug Size for Your Space',
    excerpt:
      'Three front-leg rules, two bed clearances, and the one dining measurement that decides whether chairs still roll. A practical sizing guide with metric and imperial notes.',
    minutes: 6,
    body: [
      'The most common regret in rug buying is scale — a beautiful design stranded in too much floor. Solve it with three rules before you order.',
      'Living room: choose between the front-leg rule (all sofa and chair legs in front rest on the rug, backs off — 230 × 160 cm upward) and the full-anchor (every leg lands on the rug — 300 × 200 cm or larger). If your room is under 4 × 4 m, front-leg keeps the space breathing.',
      'Bedroom: measure from the footboard out. You want at least 50–60 cm of rug beyond each side and the foot, so bare feet meet wool, not tile, at dawn. For a king bed that means 300 × 200 cm minimum; runners flanking the sides work when a large piece would swallow the room.',
      'Dining room: add 60 cm to every side of the table — the clearance a chair needs when someone pushes back while seated. A 180 × 90 cm table wants a 300 × 210 cm rug, and pile height matters more than you expect: keep it under 12 mm so chair legs glide.',
      'When in doubt, go larger. A rug that is slightly too big reads as architecture; one that is slightly too small reads as an accident.',
    ],
    cta: { label: 'Browse by room', to: '/rugs?room=living-room' },
    linkedRugSlug: 'desert-line-geometric',
  },
  {
    slug: 'artisans-of-bhadohi',
    pillar: 'Craft Storytelling',
    title: 'The Sketch-Book Families of Bhadohi',
    excerpt:
      'Before software, there was paper. Several Bhadohi families guard century-old graph-paper cartoons — the only surviving library of patterns from the region\'s golden export era.',
    minutes: 8,
    body: [
      'Bhadohi does not archive its patterns in a database. It archives them in households. Faded graph-paper cartoons — each square a knot — pass from grandparent to grandchild alongside the loom itself. Some date to the first decade of the twentieth century, when the region earned its reputation as India\'s carpet belt.',
      'When we reproduce a design, we photograph these books with permission, redraw them at modern scale, and credit the family in the rug\'s provenance card. The Kashmiri Rose Medallion, for instance, follows a cartoon kept by a third-generation anchal-dyeing household near Ganges Crossing.',
      'This is what preservation looks like in practice: not a museum case, but working paper, handled daily, translated into wool. Every purchase funds another season of a young karigar learning to read it.',
    ],
    pullQuote: 'Preservation here is not a museum case. It is working paper, handled daily, translated into wool.',
    cta: { label: 'Meet the pieces they keep alive', to: '/rugs?style=traditional' },
    linkedRugSlug: 'kashmiri-rose-medallion',
  },
  {
    slug: 'wool-lanolin-care',
    pillar: 'Product-Centric Detailing',
    title: 'Why Lanolin Is the Reason Wool Outlives Everything Else',
    excerpt:
      'The natural wax in Bhadohi wool repels dirt at the fibre level. Here is exactly how to wash, rotate and store a hand-knotted rug so it outlives its owner.',
    minutes: 5,
    body: [
      'Hand-spun wool carries lanolin — a wax the fleece produces against monsoon damp. In a knotted pile it acts as a permanent soil release: grit sits on the fibre surface instead of bonding into it, which is why regular vacuuming (beater bar off) does ninety percent of your care.',
      'Rotate the rug 180 degrees each season. Sun fades evenly only if the rug gets to share the sun equally. Use a natural-fibre underlay — rubber pads trap moisture and oxidise the backing.',
      'Professional wet-washing every 18–24 months re-feeds the pile and rinses abraded grit from the foundation, where dry-rot begins. Blot spills with cold water and a cloth, working inward; never scrub, never heat.',
      'Storing long-term? Roll — do not fold — around a cardboard core, pile outward, wrapped in cotton muslin, never plastic.',
    ],
    cta: { label: 'Read care notes on any product page', to: '/rugs' },
    linkedRugSlug: 'anchal-heritage-border',
  },
];

export function JournalPage() {
  const { products, bySlug } = useProducts();
  return (
    <div className="wrap section">
      <header style={{ marginBottom: 50 }}>
        <p className="eyebrow">The Journal</p>
        <h1 className="display" style={{ marginTop: 10 }}>A digital design journal</h1>
        <p className="muted" style={{ maxWidth: '58ch', marginTop: 14 }}>
          Three pillars: the craft itself, the detail that earns trust, and the rooms that give
          a weave its reason. Written with the karigars, not about them.
        </p>
      </header>
      <div className="journal-grid">
        {POSTS.map((post, i) => {
          const linked = (post.linkedRugSlug ? bySlug(post.linkedRugSlug) : undefined) ?? products[i % products.length];
          return (
            <Reveal key={post.slug} delay={i * 80}>
              <article className="post-card card">
                <Link to={`/journal/${post.slug}`}>
                  <img src={productPhoto(linked, 4, 640, 400)} alt="" loading="lazy" />
                </Link>
                <div className="card-body">
                  <p className="eyebrow">{post.pillar} · {post.minutes} min</p>
                  <h2 className="subhead" style={{ margin: '10px 0 4px' }}>
                    <Link to={`/journal/${post.slug}`}>{post.title}</Link>
                  </h2>
                  <p className="post-excerpt">{post.excerpt}</p>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </div>
  );
}

export function ArticlePage() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) {
    return (
      <div className="wrap empty-state">
        <h1 className="headline">That story hasn't been woven yet.</h1>
        <Link to="/journal" className="btn" style={{ marginTop: 20 }}>Back to the Journal</Link>
      </div>
    );
  }
  const linked = post.linkedRugSlug ? getProduct(post.linkedRugSlug) : undefined;
  return (
    <>
      <div className="wrap section" style={{ paddingBottom: 30 }}>
        <nav className="breadcrumb" aria-label="Breadcrumb" style={{ paddingTop: 0 }}>
          <Link to="/">Home</Link><span aria-hidden="true">/</span>
          <Link to="/journal">Journal</Link><span aria-hidden="true">/</span>
          <span aria-current="page">{post.title}</span>
        </nav>
        <p className="eyebrow">{post.pillar} · {post.minutes} minute read</p>
        <h1 className="display" style={{ marginTop: 14, maxWidth: '18ch' }}>{post.title}</h1>
      </div>
      {linked && (
        <div className="wrap" style={{ marginBottom: 44 }}>
          <img src={rugImage(linked, 4, 1400, 700)} alt={`Editorial staging related to ${post.title}`} style={{ width: '100%', aspectRatio: '2/1', objectFit: 'cover' }} />
        </div>
      )}
      <div className="wrap" style={{ paddingBottom: 80 }}>
        <article className="article">
          {post.body.map((para, i) => {
            const mid = Math.floor(post.body.length / 2);
            return (
              <div key={i}>
                <p>{para}</p>
                {i + 1 === mid && post.pullQuote && <blockquote className="pull-quote">{post.pullQuote}</blockquote>}
              </div>
            );
          })}
          {(post.cta || linked) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 40, alignItems: 'center' }}>
              {post.cta && <Link to={post.cta.to} className="btn btn-solid">{post.cta.label}</Link>}
              {linked && <Link to={`/rugs/${linked.slug}`} className="btn">View “{linked.name}”</Link>}
            </div>
          )}
        </article>
      </div>
    </>
  );
}
