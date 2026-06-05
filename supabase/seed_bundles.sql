-- Seed bundles + bundle_components from current stack pages (generated).
-- Bundle prices auto-compute from live component base prices; tune the
-- discount_pct per bundle in the admin Pricing tab afterward.
insert into public.bundles (slug, name, discount_pct, sort_order) values
  ('anti-ageing', 'Oxidative Pathway Research Bundle', 50.00, 1),
  ('cognitive-and-sleep', 'Neuropeptide & Sleep Research Bundle', 33.00, 2),
  ('cognitive', 'Neuropeptide Dual Research Bundle', 25.00, 3),
  ('gh-and-metabolic', 'Somatotropic & Incretin Research Bundle', 33.00, 4),
  ('gh-peptide', 'Somatotropic Research Bundle', 44.00, 5),
  ('metabolic', 'Incretin Receptor Research Bundle', 33.00, 6),
  ('repair-and-metabolic', 'Tissue & Receptor Research Bundle', 29.00, 7),
  ('skin-and-aesthetic', 'Dermal Research Bundle', 48.00, 8),
  ('ultimate-repair', 'Angiogenic Repair Research Bundle', 27.00, 9)
on conflict (slug) do update set name = excluded.name, discount_pct = excluded.discount_pct, sort_order = excluded.sort_order;

insert into public.bundle_components (bundle_slug, product_slug, size, qty, sort_order) values
  ('anti-ageing', 'ghk-cu', '100mg', 1, 0),
  ('anti-ageing', 'glutathione', '1500mg', 1, 1),
  ('anti-ageing', 'nad-plus', '1000mg', 1, 2),
  ('cognitive-and-sleep', 'semax', '10mg', 1, 0),
  ('cognitive-and-sleep', 'selank', '10mg', 1, 1),
  ('cognitive-and-sleep', 'dsip', '10mg', 1, 2),
  ('cognitive', 'semax', '10mg', 1, 0),
  ('cognitive', 'selank', '10mg', 1, 1),
  ('gh-and-metabolic', 'retatrutide', '20mg', 1, 0),
  ('gh-and-metabolic', 'tesamorelin', '15mg', 1, 1),
  ('gh-peptide', 'cjc-1295', '10mg', 1, 0),
  ('gh-peptide', 'tesamorelin', '15mg', 1, 1),
  ('metabolic', 'mots-c', '10mg', 1, 0),
  ('metabolic', 'nad-plus', '1000mg', 1, 1),
  ('metabolic', 'retatrutide', '20mg', 1, 2),
  ('repair-and-metabolic', 'retatrutide', '20mg', 1, 0),
  ('repair-and-metabolic', 'bpc-157', '10mg', 1, 1),
  ('repair-and-metabolic', 'tb-500', '10mg', 1, 2),
  ('skin-and-aesthetic', 'melanotan-ii', '10mg', 1, 0),
  ('skin-and-aesthetic', 'ghk-cu', '100mg', 1, 1),
  ('skin-and-aesthetic', 'glutathione', '1500mg', 1, 2),
  ('ultimate-repair', 'bpc-157', '10mg', 1, 0),
  ('ultimate-repair', 'tb-500', '10mg', 1, 1),
  ('ultimate-repair', 'ghk-cu', '100mg', 1, 2)
;
