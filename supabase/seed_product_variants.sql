-- Seed product_variants from current storefront prices (generated).
-- Review base_price values in the admin Pricing tab afterward — especially
-- where an earlier deal changed the strikethrough (e.g. Retatrutide RRP).
insert into public.product_variants
  (slug, name, size, base_price, sale_price, compare_at, discountable, deal_flag, sort_order) values
  ('bpc-157', 'BPC-157', '10mg', 29.99, null, 39.99, true, false, 0),
  ('bpc157-tb500-mix', 'BPC-157 & TB-500', '20mg (10mg BPC-157 + 10mg TB-500)', 49.99, null, 59.99, true, false, 0),
  ('cjc-1295', 'CJC-1295 wo DAC', '10mg', 24.99, null, 49.99, true, false, 0),
  ('dsip', 'DSIP', '5mg', 19.99, null, 34.99, true, false, 0),
  ('dsip', 'DSIP', '10mg', 29.99, null, 44.99, true, false, 1),
  ('ghk-cu', 'GHK-Cu', '100mg', 39.99, null, 44.99, true, false, 0),
  ('glutathione', 'Glutathione', '1500mg', 54.99, null, 119.99, true, false, 0),
  ('kpv', 'KPV', '10mg', 24.99, null, 34.99, true, false, 0),
  ('melanotan-ii', 'Melanotan II', '10mg', 24.99, null, null, true, false, 0),
  ('mots-c', 'Mots-C', '10mg', 29.99, null, null, true, false, 0),
  ('nad-plus', 'NAD+', '1000mg', 54.99, null, 82.30, true, false, 0),
  ('retatrutide', 'Retatrutide', '10mg', 59.99, 44.99, null, true, true, 0),
  ('retatrutide', 'Retatrutide', '15mg', 84.99, 63.99, null, true, true, 1),
  ('retatrutide', 'Retatrutide', '20mg', 99.99, 74.99, null, true, true, 2),
  ('retatrutide', 'Retatrutide', '40mg Pen', 159.99, null, 249.99, false, false, 3),
  ('selank', 'Selank', '10mg', 34.99, null, 39.99, true, false, 0),
  ('semax', 'Semax', '10mg', 34.99, null, null, true, false, 0),
  ('tb-500', 'TB-500', '10mg', 29.99, null, null, true, false, 0),
  ('tesamorelin', 'Tesamorelin', '15mg', 99.99, null, 129.99, true, false, 0),
  ('ipamorelin', 'Ipamorelin', '10mg', 30.00, null, null, true, false, 0),
  ('tirzepatide', 'Tirzepatide', '10mg', 40.00, null, null, true, false, 0),
  ('tirzepatide', 'Tirzepatide', '30mg', 90.00, null, null, true, false, 1),
  ('tirzepatide', 'Tirzepatide', '60mg', 160.00, null, null, true, false, 2)
on conflict (slug, size) do update set
  name = excluded.name, base_price = excluded.base_price, sale_price = excluded.sale_price,
  compare_at = excluded.compare_at, discountable = excluded.discountable,
  deal_flag = excluded.deal_flag, sort_order = excluded.sort_order;
