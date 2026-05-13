-- ════════════════════════════════════════════════════════════════════════════
-- SEED — Serramenti / Infissi : 23 template articoli con foto cliente
-- ────────────────────────────────────────────────────────────────────────────
-- Sostituisce i 4 placeholder Unsplash (seed iniziale di FASE 2) con il
-- catalogo completo di 23 tipologie infissi richiesto dal cliente.
--
-- Ordine richiesto (sort_order):
--   1) Finestre              (10-13)  — 1 anta, 2 ante, 3 ante, Wasistas
--   2) Porte Finestre        (20-24)  — 1/2/3 ante + varianti serratura passante
--   3) Fissi                 (30-31)  — nel telaio / nell'anta
--   4) Portoncini            (40-41)  — ingresso 1/2 ante
--   5) Traslanti e Alzanti   (50-59)  — traslante scorrevole, alzante, slide
--
-- Le immagini PNG sono servite come asset statici da Cloudflare Pages:
--   `/templates/serramenti/*.png` (cartella `public/templates/serramenti/`).
--
-- Tutti i template hanno:
--   • vertical_slug = 'serramenti'
--   • categoria_slug = 'infissi'
--   • modalita_prezzo_base = 'griglia' (L x H tipico infisso)
--   • vat_rate = 22 (default; il commerciale alza/riduce in preventivo)
--   • assi_default = [Vetro: doppio/triplo] (asse base condiviso)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Cleanup vecchio seed Unsplash (idempotente)
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM public.article_family_templates
WHERE vertical_slug = 'serramenti'
  AND image_url LIKE 'https://images.unsplash.com%';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Inserimento 23 template (idempotente per nome+vertical_slug)
-- ────────────────────────────────────────────────────────────────────────────
WITH base_axes AS (
  SELECT '[
    {"nome":"Vetro","codice":"vetro","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
      {"valore":"doppio","label":"Vetrocamera doppia 4/16/4","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"triplo","label":"Vetrocamera tripla 4/14/4/14/4","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":15}
    ]}
  ]'::jsonb AS j
),
new_templates(nome, descrizione, tipologia, materiale, image_url, tags, sort_order) AS (
  VALUES
    -- ─── Finestre ─────────────────────────────────────────────────────────
    ('Finestra 1 Anta',     'Finestra ad anta unica anta-ribalta.',                                  'infisso','pvc','/templates/serramenti/finestra-1-anta.png',     ARRAY['finestra','1anta'],          10),
    ('Finestra 2 Ante',     'Finestra a due ante con anta-ribalta principale.',                      'infisso','pvc','/templates/serramenti/finestra-2-ante.png',     ARRAY['finestra','2ante'],          11),
    ('Finestra 3 Ante',     'Finestra a tre ante con anta-ribalta centrale.',                        'infisso','pvc','/templates/serramenti/finestra-3-ante.png',     ARRAY['finestra','3ante'],          12),
    ('Finestra Wasistas',   'Finestra a Wasistas: apertura a vasistas dal basso.',                   'infisso','pvc','/templates/serramenti/finestra-wasistas.png',   ARRAY['finestra','wasistas'],       13),
    -- ─── Porte Finestre ───────────────────────────────────────────────────
    ('Porta Finestra 1 Anta',                                'Porta finestra ad anta unica anta-ribalta.',                                  'porta_finestra','pvc','/templates/serramenti/portafinestra-1-anta.png',                       ARRAY['portafinestra','1anta'],                       20),
    ('Porta Finestra 1 Anta con Serratura Passante',         'Porta finestra 1 anta con serratura passante (estraibile da fuori).',         'porta_finestra','pvc','/templates/serramenti/portafinestra-1-anta-serratura-passante.png',    ARRAY['portafinestra','1anta','serratura'],           21),
    ('Porta Finestra 2 Ante',                                'Porta finestra a due ante.',                                                  'porta_finestra','pvc','/templates/serramenti/portafinestra-2-ante.png',                       ARRAY['portafinestra','2ante'],                       22),
    ('Porta Finestra 2 Ante con Serratura Passante',         'Porta finestra 2 ante con serratura passante.',                               'porta_finestra','pvc','/templates/serramenti/portafinestra-2-ante-serratura-passante.png',    ARRAY['portafinestra','2ante','serratura'],           23),
    ('Porta Finestra 3 Ante',                                'Porta finestra a tre ante.',                                                  'porta_finestra','pvc','/templates/serramenti/portafinestra-3-ante.png',                       ARRAY['portafinestra','3ante'],                       24),
    -- ─── Fissi ────────────────────────────────────────────────────────────
    ('Fisso nel Telaio',    'Elemento fisso integrato nel telaio (no anta apribile).',               'fisso','pvc','/templates/serramenti/fisso-nel-telaio.png',  ARRAY['fisso','telaio'],            30),
    ('Fisso nell''Anta',    'Elemento fisso nell''anta (vetro fisso accoppiato ad anta apribile).',  'fisso','pvc','/templates/serramenti/fisso-nell-anta.png',  ARRAY['fisso','anta'],              31),
    -- ─── Portoncini d'ingresso ────────────────────────────────────────────
    ('Portoncino 1 Anta',   'Portoncino d''ingresso ad anta unica.',                                 'portoncino','pvc','/templates/serramenti/portoncino-1-anta.png',  ARRAY['portoncino','ingresso','1anta'],   40),
    ('Portoncino 2 Ante',   'Portoncino d''ingresso a due ante.',                                    'portoncino','pvc','/templates/serramenti/portoncino-2-ante.png',  ARRAY['portoncino','ingresso','2ante'],   41),
    -- ─── Traslanti e Alzanti ──────────────────────────────────────────────
    ('Porta Finestra Traslante Scorrevole 4 Ante',              'Porta finestra traslante scorrevole a 4 ante.',                            'traslante','pvc','/templates/serramenti/traslante-scorrevole-4-ante.png',        ARRAY['traslante','scorrevole','4ante'],            50),
    ('Porta Finestra Traslante Scorrevole con Fisso nel Telaio','Traslante scorrevole con elemento fisso integrato nel telaio.',            'traslante','pvc','/templates/serramenti/traslante-scorrevole-fisso-telaio.png', ARRAY['traslante','scorrevole','fisso'],            51),
    ('Porta Finestra Traslante Scorrevole con Fisso nell''Anta','Traslante scorrevole con vetro fisso accoppiato all''anta.',               'traslante','pvc','/templates/serramenti/traslante-scorrevole-fisso-anta.png',   ARRAY['traslante','scorrevole','fisso'],            52),
    ('Porta Finestra Traslante Scorrevole su Parete',           'Traslante scorrevole con scomparsa esterna su parete.',                    'traslante','pvc','/templates/serramenti/traslante-scorrevole-su-parete.png',    ARRAY['traslante','scorrevole','parete'],           53),
    ('Alzante Scorrevole a Scomparsa',                          'Alzante scorrevole che scompare a muro (tecnica HS).',                     'alzante','alluminio','/templates/serramenti/alzante-scorrevole-scomparsa.png',         ARRAY['alzante','scorrevole','scomparsa'],          54),
    ('Alzante Scorrevole AS + FA',                              'Alzante scorrevole AS + fisso aggiuntivo.',                                'alzante','alluminio','/templates/serramenti/alzante-scorrevole-as-fa.png',            ARRAY['alzante','scorrevole','as','fa'],            55),
    ('Alzante Scorrevole FA + AS + AS + FA',                    'Alzante scorrevole simmetrico FA+AS+AS+FA (4 elementi).',                  'alzante','alluminio','/templates/serramenti/alzante-scorrevole-fa-as-as-fa.png',       ARRAY['alzante','scorrevole','simmetrico'],         56),
    ('Slide',                                                   'Sistema scorrevole minimal "Slide" base.',                                 'traslante','alluminio','/templates/serramenti/slide.png',                              ARRAY['slide','scorrevole','minimal'],              57),
    ('Slide Plus',                                              'Sistema scorrevole minimal "Slide Plus" — performance termica superiore.', 'traslante','alluminio','/templates/serramenti/slide-plus.png',                         ARRAY['slide','plus','scorrevole','premium'],       58),
    ('Smart Slide',                                             'Sistema scorrevole motorizzabile "Smart Slide".',                          'traslante','alluminio','/templates/serramenti/smart-slide.png',                        ARRAY['slide','smart','scorrevole','motorizzato'],  59)
)
INSERT INTO public.article_family_templates (
  nome, descrizione, vertical_slug, categoria_slug, tipologia, materiale,
  image_url, tags,
  modalita_prezzo_base, vat_rate, unit_of_measure,
  griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
  assi_default, sort_order
)
SELECT
  nt.nome, nt.descrizione, 'serramenti', 'infissi', nt.tipologia, nt.materiale,
  nt.image_url, nt.tags,
  'griglia', 22, 'pz',
  'Larghezza (mm)', 'Altezza (mm)', 'mm',
  (SELECT j FROM base_axes), nt.sort_order
FROM new_templates nt
WHERE NOT EXISTS (
  SELECT 1 FROM public.article_family_templates aft
  WHERE aft.vertical_slug = 'serramenti'
    AND aft.nome = nt.nome
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Aggiorna sort_order anche su eventuali template pre-esistenti con
--    questi nomi (es. se l'utente ha già importato il vecchio seed da DB).
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.article_family_templates aft
SET sort_order = src.sort_order,
    image_url  = COALESCE(src.image_url, aft.image_url),
    tipologia  = COALESCE(aft.tipologia, src.tipologia),
    materiale  = COALESCE(aft.materiale, src.materiale)
FROM (VALUES
  ('Finestra 1 Anta',                                            '/templates/serramenti/finestra-1-anta.png',                       'infisso',         'pvc',       10),
  ('Finestra 2 Ante',                                            '/templates/serramenti/finestra-2-ante.png',                       'infisso',         'pvc',       11),
  ('Finestra 3 Ante',                                            '/templates/serramenti/finestra-3-ante.png',                       'infisso',         'pvc',       12),
  ('Finestra Wasistas',                                          '/templates/serramenti/finestra-wasistas.png',                     'infisso',         'pvc',       13),
  ('Porta Finestra 1 Anta',                                      '/templates/serramenti/portafinestra-1-anta.png',                  'porta_finestra',  'pvc',       20),
  ('Porta Finestra 1 Anta con Serratura Passante',               '/templates/serramenti/portafinestra-1-anta-serratura-passante.png','porta_finestra', 'pvc',       21),
  ('Porta Finestra 2 Ante',                                      '/templates/serramenti/portafinestra-2-ante.png',                  'porta_finestra',  'pvc',       22),
  ('Porta Finestra 2 Ante con Serratura Passante',               '/templates/serramenti/portafinestra-2-ante-serratura-passante.png','porta_finestra', 'pvc',       23),
  ('Porta Finestra 3 Ante',                                      '/templates/serramenti/portafinestra-3-ante.png',                  'porta_finestra',  'pvc',       24),
  ('Fisso nel Telaio',                                           '/templates/serramenti/fisso-nel-telaio.png',                      'fisso',           'pvc',       30),
  ('Fisso nell''Anta',                                           '/templates/serramenti/fisso-nell-anta.png',                       'fisso',           'pvc',       31),
  ('Portoncino 1 Anta',                                          '/templates/serramenti/portoncino-1-anta.png',                     'portoncino',      'pvc',       40),
  ('Portoncino 2 Ante',                                          '/templates/serramenti/portoncino-2-ante.png',                     'portoncino',      'pvc',       41),
  ('Porta Finestra Traslante Scorrevole 4 Ante',                 '/templates/serramenti/traslante-scorrevole-4-ante.png',           'traslante',       'pvc',       50),
  ('Porta Finestra Traslante Scorrevole con Fisso nel Telaio',   '/templates/serramenti/traslante-scorrevole-fisso-telaio.png',     'traslante',       'pvc',       51),
  ('Porta Finestra Traslante Scorrevole con Fisso nell''Anta',   '/templates/serramenti/traslante-scorrevole-fisso-anta.png',       'traslante',       'pvc',       52),
  ('Porta Finestra Traslante Scorrevole su Parete',              '/templates/serramenti/traslante-scorrevole-su-parete.png',        'traslante',       'pvc',       53),
  ('Alzante Scorrevole a Scomparsa',                             '/templates/serramenti/alzante-scorrevole-scomparsa.png',          'alzante',         'alluminio', 54),
  ('Alzante Scorrevole AS + FA',                                 '/templates/serramenti/alzante-scorrevole-as-fa.png',              'alzante',         'alluminio', 55),
  ('Alzante Scorrevole FA + AS + AS + FA',                       '/templates/serramenti/alzante-scorrevole-fa-as-as-fa.png',        'alzante',         'alluminio', 56),
  ('Slide',                                                      '/templates/serramenti/slide.png',                                 'traslante',       'alluminio', 57),
  ('Slide Plus',                                                 '/templates/serramenti/slide-plus.png',                            'traslante',       'alluminio', 58),
  ('Smart Slide',                                                '/templates/serramenti/smart-slide.png',                           'traslante',       'alluminio', 59)
) AS src(nome, image_url, tipologia, materiale, sort_order)
WHERE aft.vertical_slug = 'serramenti'
  AND aft.nome = src.nome;
