-- Le marche e le serie di profilo con cui si lavora in Italia.
--
-- Serve perché un serramentista che entra oggi non descrive il suo listino per
-- tipologie: dice «monto Aluplast Ideal 5000» e si aspetta che il sistema sappia
-- cosa vuol dire. Qui ci sono i nomi veri; profondità, camere e Uw restano
-- vuoti, perché si copiano dalla scheda del fornitore e non si tirano a indovinare.
--
-- `differenza_pct` è solo un punto di partenza legato alla fascia (basic −8%,
-- medium 0, top +18%): al momento dell'import l'azienda mette il suo numero.

insert into public.serramenti_marche (nome, slug, paese, materiali, sort_order)
values
  ('Salamander',  'salamander',  'DE', array['pvc'],                 10),
  ('Aluplast',    'aluplast',    'DE', array['pvc'],                 11),
  ('Gealan',      'gealan',      'DE', array['pvc'],                 12),
  ('Rehau',       'rehau',       'DE', array['pvc'],                 13),
  ('Deceuninck',  'deceuninck',  'BE', array['pvc'],                 14),
  ('Veka',        'veka',        'DE', array['pvc'],                 15),
  ('Kömmerling',  'kommerling',  'DE', array['pvc'],                 16),
  ('Schüco',      'schuco',      'DE', array['alluminio'],           30),
  ('Cortizo',     'cortizo',     'ES', array['alluminio'],           31),
  ('Aliplast',    'aliplast',    'IT', array['alluminio'],           32),
  ('Aluprof',     'aluprof',     'PL', array['alluminio'],           33),
  ('Reynaers',    'reynaers',    'BE', array['alluminio'],           34),
  ('Metra',       'metra',       'IT', array['alluminio'],           35),
  ('Generico',    'generico',    null, array['pvc','alluminio','legno','legno_alluminio'], 90)
on conflict (slug) do nothing;

insert into public.serramenti_serie (marca_id, nome, slug, materiale, fascia, differenza_pct, sort_order)
select m.id, s.nome, s.slug, s.materiale, s.fascia,
       case s.fascia when 'basic' then -8 when 'top' then 18 else 0 end,
       s.sort_order
  from (values
    -- PVC
    ('salamander', 'bluEvolution 73',  'bluevolution-73',  'pvc', 'basic',  10),
    ('salamander', 'bluEvolution 82',  'bluevolution-82',  'pvc', 'medium', 11),
    ('salamander', 'bluEvolution 92',  'bluevolution-92',  'pvc', 'top',    12),
    ('salamander', 'GreenEvolution 76','greenevolution-76','pvc', 'medium', 13),
    ('aluplast',   'Ideal 4000',       'ideal-4000',       'pvc', 'basic',  10),
    ('aluplast',   'Ideal 5000',       'ideal-5000',       'pvc', 'medium', 11),
    ('aluplast',   'Ideal 7000',       'ideal-7000',       'pvc', 'top',    12),
    ('aluplast',   'Ideal 8000',       'ideal-8000',       'pvc', 'top',    13),
    ('gealan',     'Linear',           'linear',           'pvc', 'medium', 10),
    ('gealan',     'S 9000',           's-9000',           'pvc', 'top',    11),
    ('gealan',     'Kubus',            'kubus',            'pvc', 'medium', 12),
    ('rehau',      'Euro-Design 70',   'euro-design-70',   'pvc', 'basic',  10),
    ('rehau',      'Synego',           'synego',           'pvc', 'top',    11),
    ('rehau',      'Geneo',            'geneo',            'pvc', 'top',    12),
    ('deceuninck', 'Zendow',           'zendow',           'pvc', 'medium', 10),
    ('deceuninck', 'Elegant',          'elegant',          'pvc', 'top',    11),
    ('deceuninck', 'Legend',           'legend',           'pvc', 'medium', 12),
    ('veka',       'Softline 70',      'softline-70',      'pvc', 'basic',  10),
    ('veka',       'Softline 82',      'softline-82',      'pvc', 'top',    11),
    ('kommerling', '76 AD',            '76-ad',            'pvc', 'medium', 10),
    ('kommerling', '88 MD',            '88-md',            'pvc', 'top',    11),
    -- Alluminio
    ('schuco',     'AWS 75.SI+',       'aws-75-si',        'alluminio', 'medium', 10),
    ('schuco',     'AWS 90.SI+',       'aws-90-si',        'alluminio', 'top',    11),
    ('cortizo',    'COR 70',           'cor-70',           'alluminio', 'medium', 10),
    ('cortizo',    'COR 80',           'cor-80',           'alluminio', 'top',    11),
    ('aliplast',   'Genesis 75',       'genesis-75',       'alluminio', 'medium', 10),
    ('aliplast',   'Ultra',            'ultra',            'alluminio', 'top',    11),
    ('aluprof',    'MB-70',            'mb-70',            'alluminio', 'basic',  10),
    ('aluprof',    'MB-86',            'mb-86',            'alluminio', 'top',    11),
    ('reynaers',   'SlimLine 38',      'slimline-38',      'alluminio', 'top',    10),
    ('reynaers',   'MasterLine 8',     'masterline-8',     'alluminio', 'top',    11),
    ('metra',      'NC 65 STH',        'nc-65-sth',        'alluminio', 'medium', 10),
    ('metra',      'NC 75 STH',        'nc-75-sth',        'alluminio', 'top',    11),
    -- Per chi non lavora su serie di marca
    ('generico',   'PVC standard',          'pvc-standard',      'pvc',             'medium', 10),
    ('generico',   'Alluminio taglio termico','alluminio-tt',    'alluminio',       'medium', 11),
    ('generico',   'Legno lamellare',       'legno-lamellare',   'legno',           'medium', 12),
    ('generico',   'Legno-alluminio',       'legno-alluminio',   'legno_alluminio', 'top',    13)
  ) as s(marca_slug, nome, slug, materiale, fascia, sort_order)
  join public.serramenti_marche m on m.slug = s.marca_slug
on conflict (marca_id, nome) do nothing;
