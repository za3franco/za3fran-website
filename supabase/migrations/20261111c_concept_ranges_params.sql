-- Concept Studio lot 0: ticket, seats and surface per format as Brain parameters (plan §9, D2 c).
-- Format-scoped (no market): Arnaud's Casablanca judgment, stored as estimates with a range; replaced by dated menus.
insert into public.brain_parameters (key, scope, grp, level, label_en, label_fr, unit, value_type, qualifier_kind, fav, refresh_months, regulatory, engine_path, notes)
values
 ('concept.ticket',     'format', 'benchmark', null, 'Typical ticket per service (incl. VAT, Casablanca)', 'Ticket moyen par service (TTC, Casablanca)', 'currency', 'number', 'service', null, 12, false, null, 'Studio sizing only: not read by the financial engine. Qualifier = breakfast | lunch | dinner.'),
 ('concept.seats',      'format', 'benchmark', null, 'Typical number of seats',                       'Nombre de places typique',                  'count',    'number', null,      null, 12, false, null, 'Studio sizing only: not read by the financial engine.'),
 ('concept.surface_m2', 'format', 'benchmark', null, 'Typical surface (m²)',                         'Surface typique (m²)',                      'm2',       'number', null,      null, 12, false, null, 'Studio sizing only: not read by the financial engine.')
on conflict (key) do nothing;
