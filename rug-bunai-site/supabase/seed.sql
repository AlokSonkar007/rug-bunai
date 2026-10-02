-- ═══════════════════════════════════════════════════════════════════════════
-- RUG BUNAI — Catalogue seed (mirrors src/data/seedProducts.ts)
-- Run AFTER schema.sql. Idempotent: skips rows whose slug already exists.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.collections (slug, name, blurb, sort) values
  ('persian-archive', 'The Persian Archive', 'Court patterns preserved in weaver sketch-books.', 1),
  ('modern-weave', 'Modern Weave', 'Quiet statements engineered for minimalist interiors.', 2)
on conflict (slug) do nothing;

-- ── Kashmiri Rose Medallion ──────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count, best_seller_rank,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'kashmiri-rose-medallion','Kashmiri Rose Medallion','Silk-blend hand-knotted masterpiece',
    'A central rose medallion blooms across an ivory field, rendered in mulberry silk blend and fine Bhadohi wool. Each medallion curve is drawn from nineteenth-century court patterns preserved in weaver sketch-books.',
    'Knotted on vertical looms by third-generation karigars, the silk blend catches light differently at every hour — the pattern literally shifts as the sun crosses the room.',
    'silk-blend','hand-knotted','hand-knotted-silk-blend-rug','{traditional}','{living-room,bedroom}','{medallion,silk}',
    (select id from public.collections where slug='persian-archive'),
    '{"pileHeightMm":9,"weightKgPerSqm":3.4,"backing":"Hand-finished cotton warp & weft","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Rotate seasonally. Vacuum without beater bar; professional wash every 24 months. Blot spills immediately, never rub.","knotsPerSqIn":169,"warpMaterial":"Cotton","weaveMonthsApprox":11}'::jsonb,
    4.9, 41, 1, true, true, false, 1, 0, 1, 'kashmiri-rose', 12)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('KR-2316-IV','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'ivory',184000,2,1),
    ('KR-3002-IV','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'ivory',296000,1,2),
    ('KR-2316-SA','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'sand',184000,3,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/hand-knotted/silk-blend','rugs/living-room','rugs/traditional'])
from public.products where slug='kashmiri-rose-medallion' on conflict do nothing;

-- ── Mughal Garden Floral ─────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count, best_seller_rank,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'mughal-garden-floral','Mughal Garden Floral','Hand-knotted wool, Persian-knot field',
    'Inspired by the char-bagh gardens of the subcontinent, a scrolling vine carries seventeen distinct blossoms across a deep brown ground. Pure hand-spun Bhadohi wool, naturally lanolin-rich and stain-resistant.',
    'The vine is knotted using the asymmetric Persian (Senneh) knot, allowing the curved lines that symmetric Turkish knots cannot hold — a technique kept alive in Bhadohi workshops.',
    'wool','hand-knotted','hand-knotted-wool-rug','{traditional,botanical}','{living-room,dining-room}','{floral,persian}',
    (select id from public.collections where slug='persian-archive'),
    '{"pileHeightMm":11,"weightKgPerSqm":4.1,"backing":"Hand-woven cotton foundation","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum without beater bar. Professional wash every 18–24 months. Use a natural-fibre underlay.","knotsPerSqIn":100,"warpMaterial":"Cotton","weaveMonthsApprox":8}'::jsonb,
    4.8, 63, 2, true, true, false, 2, 0, 2, 'mughal-garden', 10)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('MG-3602-DB','360 × 240 cm (11''10" × 7''10")',240,360,94.5,141.7,'deep-brown',342000,1,1),
    ('MG-2316-DB','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'deep-brown',168000,2,2),
    ('MG-2316-SG','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'sage',168000,4,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/hand-knotted/wool','rugs/living-room','rugs/dining-room','rugs/traditional'])
from public.products where slug='mughal-garden-floral' on conflict do nothing;

-- ── Desert Line Geometric ────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count, best_seller_rank,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'desert-line-geometric','Desert Line Geometric','Modern hand-knotted wool',
    'Parallel tonal bands in taupe and sand evoke dune ridges at dusk. A quiet statement piece engineered for minimalist interiors — texture does the talking, colour stays restrained.',
    'The gradation is achieved by hand-dyeing small batches of wool in graduated dips, then blending fibre by hand before knotting — no two rows catch light identically.',
    'wool','hand-knotted','hand-knotted-wool-rug','{geometric,modern}','{living-room,office}','{tonal,stripes}',
    (select id from public.collections where slug='modern-weave'),
    '{"pileHeightMm":8,"weightKgPerSqm":3.6,"backing":"Cotton foundation, hand-carved fringe","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum without beater bar; rotate 180° every season; professional cleaning annually for heavy use.","knotsPerSqIn":81,"warpMaterial":"Cotton","weaveMonthsApprox":6}'::jsonb,
    4.7, 88, 3, true, true, true, 3, 2, 3, 'desert-line', 9)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('DL-3002-TA','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'taupe',224000,3,1),
    ('DL-2316-TA','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'taupe',138000,5,2),
    ('DL-1601-SA','160 × 120 cm (5''3" × 4'')',120,160,47,63,'sand',78000,6,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/hand-knotted/wool','rugs/living-room','rugs/geometric','rugs/modern'])
from public.products where slug='desert-line-geometric' on conflict do nothing;

-- ── Stone Shadow ─────────────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count, best_seller_rank,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'stone-shadow-tufted','Stone Shadow','Hand-tufted wool with carved relief',
    'Concentric charcoal rings, hand-carved into the pile so each ridge throws a soft shadow. Dense New Zealand wool blend underfoot, with a low profile suited to dining chairs.',
    'Tufting is a dialogue between needle and shears: after the yarn face is punched, the carver sculpts depth by hand — the reason no two Stone Shadows are identical.',
    'wool','hand-tufted','hand-tufted-wool-rug','{abstract,modern}','{bedroom,office}','{carved,rings}',
    (select id from public.collections where slug='modern-weave'),
    '{"pileHeightMm":14,"weightKgPerSqm":3.0,"backing":"Latex-treated primary cloth with cotton canvas secondary","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum on low suction. Spot-clean with cold water and mild detergent. Avoid prolonged direct sunlight."}'::jsonb,
    4.6, 134, 4, true, false, true, 0, 3, 4, 'stone-shadow', 8)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('SS-2316-CH','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'charcoal',74000,8,1),
    ('SS-1601-BK','160 × 120 cm (5''3" × 4'')',120,160,47,63,'black',46000,10,2),
    ('SS-3002-CH','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'charcoal',118000,4,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/hand-tufted/wool','rugs/bedroom','rugs/abstract','rugs/modern'])
from public.products where slug='stone-shadow-tufted' on conflict do nothing;

-- ── Riverstone Flatweave ─────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    specs, rating, reviews_count, is_published, is_featured, is_latest, sort_order,
    image_seed, thumbnail_count)
  select 'riverstone-flatweave','Riverstone Flatweave','Flat-woven cotton kilim',
    'A reversible dhurrie in ivory and sand whose pebble-like motifs were woven for riverbank courtyards generations ago. Lightweight, layerable, and machine-friendly on low spin.',
    'Flat-weaving interlocks weft over warp without a pile — the pattern is structural, visible identically from both sides, which is why kilims survive decades of daily use.',
    'cotton','flat-woven','flat-woven-cotton-rug','{geometric,traditional}','{dining-room,hallway}','{kilim,reversible}',
    '{"pileHeightMm":4,"weightKgPerSqm":2.2,"backing":"None — fully woven flat structure, reversible","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Shake or vacuum both faces. Gentle cold machine wash separately; dry flat in shade."}'::jsonb,
    4.5, 212, true, false, false, 5, 'riverstone', 7)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('RS-3002-IV','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'ivory',52000,7,1),
    ('RS-2316-TC','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'terracotta',38000,9,2),
    ('RS-1601-IV','160 × 120 cm (5''3" × 4'')',120,160,47,63,'ivory',24000,12,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/flat-woven/cotton','rugs/dining-room','rugs/hallway','rugs/geometric'])
from public.products where slug='riverstone-flatweave' on conflict do nothing;

-- ── Monsoon Reeds Runner ─────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    specs, rating, reviews_count, is_published, is_featured, is_latest, sort_order,
    image_seed, thumbnail_count)
  select 'monsoon-reeds-runner','Monsoon Reeds Runner','Flat-woven jute hallway runner',
    'Undyed jute with sage-dyed reed stripes, woven for long passages. Natural fibres, zero synthetic backing, quietly sound-dampening underfoot.',
    'Jute is spun from the stalk of the golden fibre plant harvested in the Gangetic belt; its tensile strength made it the working-class ancestor of every luxury floorcovering in the region.',
    'jute','flat-woven','flat-woven-jute-runner','{botanical,modern}','{hallway,bedroom}','{runner,jute}',
    '{"pileHeightMm":6,"weightKgPerSqm":2.6,"backing":"None — woven jute on jute warp","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum frequently; keep away from persistent damp. Dry-clean only for stains."}'::jsonb,
    4.4, 57, true, false, false, 6, 'monsoon-reeds', 6)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('MR-30008-SG','300 × 80 cm (9''10" × 2''7")',80,300,31.5,118,'sage',28000,11,1),
    ('MR-40008-SA','400 × 80 cm (13''1" × 2''7")',80,400,31.5,157.5,'sand',36000,6,2)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/flat-woven/jute','rugs/hallway','rugs/botanical'])
from public.products where slug='monsoon-reeds-runner' on conflict do nothing;

-- ── Lunar Drift ──────────────────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'lunar-drift-silk','Lunar Drift','Loom-woven bamboo silk abstract',
    'Charcoal drifting into ivory like cloud over moonwater. Bamboo silk is woven on a pit loom so the sheen runs lengthwise — the rug changes character as you walk across it.',
    'Bamboo viscose yarn is regenerated from fast-growing grass; woven at tension it reads as silk at a fraction of the environmental cost — heritage technique, contemporary conscience.',
    'bamboo-silk','loom-woven','loom-woven-bamboo-silk-rug','{abstract,modern}','{bedroom,living-room}','{sheen,gradient}',
    (select id from public.collections where slug='modern-weave'),
    '{"pileHeightMm":7,"weightKgPerSqm":2.8,"backing":"Cotton canvas secondary, hand-stitched edges","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum without beater bar. Blot spills; professional clean recommended. Rotate quarterly."}'::jsonb,
    4.8, 29, true, true, true, 4, 1, 7, 'lunar-drift', 11)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('LD-2316-CH','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'charcoal',96000,5,1),
    ('LD-3002-IV','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'ivory',148000,2,2)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/loom-woven/bamboo-silk','rugs/bedroom','rugs/abstract','rugs/modern'])
from public.products where slug='lunar-drift-silk' on conflict do nothing;

-- ── Anchal Heritage Border ───────────────────────────────────────────────────
with p as (
  insert into public.products (slug, name, tagline, description, craft_story,
    material_slug, technique_slug, classification_slug, style_slugs, room_slugs, tags,
    collection_id, specs, rating, reviews_count, best_seller_rank,
    is_published, is_featured, is_latest, featured_order, latest_order, sort_order,
    image_seed, thumbnail_count)
  select 'anchal-heritage-border','Anchal Heritage Border','Hand-knotted wool, palace-border motif',
    'A navy field framed by an anchal (pallu) border adapted from temple textile traditions — the same motif language found on Banarasi saris, translated to the loom floor.',
    'Bhadohi sits sixty kilometres from Varanasi; saris and carpets grew up sharing draftsmen. This border is a direct quotation of a 1911 pallu sketch held in a weaver family archive.',
    'wool','hand-knotted','hand-knotted-wool-rug','{traditional}','{dining-room,office}','{border,banarasi}',
    (select id from public.collections where slug='persian-archive'),
    '{"pileHeightMm":10,"weightKgPerSqm":3.9,"backing":"Hand-woven cotton foundation","countryOfOrigin":"Bhadohi, Uttar Pradesh, India","careInstructions":"Vacuum without beater bar; pads recommended under dining chairs; professional wash biennially.","knotsPerSqIn":121,"warpMaterial":"Cotton","weaveMonthsApprox":9}'::jsonb,
    4.9, 36, 5, true, false, false, 0, 0, 8, 'anchal-heritage', 14)
  on conflict (slug) do nothing returning id
), v as (
  insert into public.variants (product_id, sku, size_label, width_cm, length_cm, width_in, length_in, color_slug, price_inr, stock, sort)
  select p.id, s.sku, s.size_label, s.w, s.l, s.wi, s.li, s.c, s.price, s.stock, s.n from p, (values
    ('AH-3602-NV','360 × 240 cm (11''10" × 7''10")',240,360,94.5,141.7,'navy',388000,1,1),
    ('AH-3002-NV','300 × 200 cm (9''10" × 6''7")',200,300,79,118,'navy',268000,2,2),
    ('AH-2316-SA','230 × 160 cm (7''6" × 5''3")',160,230,63,90.5,'sand',156000,3,3)) as s(sku,size_label,w,l,wi,li,c,price,stock,n)
  on conflict (sku) do nothing returning product_id
)
insert into public.product_images (product_id, storage_path, seed_angle, is_primary, sort, alt)
select v.product_id, null, g.angle, g.angle = 0, g.angle, null from v, (values (0),(1),(2),(3),(4)) as g(angle)
on conflict do nothing;

insert into public.product_categories (product_id, category_path)
select id, unnest(array['rugs/hand-knotted/wool','rugs/dining-room','rugs/office','rugs/traditional'])
from public.products where slug='anchal-heritage-border' on conflict do nothing;

-- ── Typed relationships (after all products exist) ───────────────────────────
insert into public.product_relationships (source_id, target_id, type, sort) values
  ((select id from public.products where slug='kashmiri-rose-medallion'),(select id from public.products where slug='mughal-garden-floral'),'same-collection',1),
  ((select id from public.products where slug='kashmiri-rose-medallion'),(select id from public.products where slug='desert-line-geometric'),'alternative',2),
  ((select id from public.products where slug='mughal-garden-floral'),(select id from public.products where slug='kashmiri-rose-medallion'),'same-collection',1),
  ((select id from public.products where slug='desert-line-geometric'),(select id from public.products where slug='stone-shadow-tufted'),'completes-the-look',1),
  ((select id from public.products where slug='desert-line-geometric'),(select id from public.products where slug='kashmiri-rose-medallion'),'alternative',2),
  ((select id from public.products where slug='stone-shadow-tufted'),(select id from public.products where slug='desert-line-geometric'),'completes-the-look',1),
  ((select id from public.products where slug='riverstone-flatweave'),(select id from public.products where slug='monsoon-reeds-runner'),'completes-the-look',1),
  ((select id from public.products where slug='monsoon-reeds-runner'),(select id from public.products where slug='riverstone-flatweave'),'completes-the-look',1),
  ((select id from public.products where slug='lunar-drift-silk'),(select id from public.products where slug='stone-shadow-tufted'),'alternative',1),
  ((select id from public.products where slug='anchal-heritage-border'),(select id from public.products where slug='mughal-garden-floral'),'same-collection',1)
on conflict do nothing;
