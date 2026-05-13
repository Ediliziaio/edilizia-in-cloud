-- ════════════════════════════════════════════════════════════════════════════
-- SEED — Serramenti / COMPLEMENTI: Tapparelle, Zanzariere, Cassonetti
-- ────────────────────────────────────────────────────────────────────────────
-- Aggiunge 6 nuovi template a livello super_admin (galleria globale) per
-- la categoria "complementi serramenti", separata da "infissi" (vedi seed
-- 20270513150000). Le immagini sono servite come asset statici da
-- Cloudflare Pages: `/templates/serramenti/products/*`.
--
-- Categoria di destinazione (categoria_slug):
--   • 'tapparelle'    → tapparella PVC + tapparella alluminio
--   • 'zanzariere'    → zanzariera molla classica + zanzariera laterale
--   • 'cassonetti'    → cassonetto coibentato PVC + cassonetto effetto legno
--
-- Modalità prezzo di default:
--   • Tapparelle/Zanzariere → 'mq' (metodo più comune nel settore IT).
--     L'azienda può cambiare a 'griglia' (L×H) dopo l'import dal listino,
--     o usare 'pz' per dimensioni fisse standardizzate.
--   • Cassonetti → 'pz' (a pezzo: prezzo legato a dim/profondità prefissate).
--
-- L'import nel listino azienda è già supportato da
-- import_article_family_template() — nessun cambio API necessario.
-- ════════════════════════════════════════════════════════════════════════════

WITH base_axes_tapparella AS (
  -- Asse "Materiale" non serve (già nel campo `materiale` del template).
  -- Asse "Avvolgimento" per scelta motorizzato vs manuale → maggiorazione %.
  SELECT '[
    {"nome":"Avvolgimento","codice":"avvolgimento","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
      {"valore":"manuale","label":"Manuale con cintino","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"motorizzato","label":"Motorizzato (motore tubolare)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":35},
      {"valore":"motorizzato_radio","label":"Motorizzato radiocomando","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":55}
    ]},
    {"nome":"Colore","codice":"colore","tipo":"discrete","obbligatorio":false,"sort_order":1,"values":[
      {"valore":"bianco","label":"Bianco RAL 9010","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"grigio","label":"Grigio RAL 7016","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"antracite","label":"Antracite RAL 7021","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":8},
      {"valore":"effetto_legno","label":"Effetto legno (noce/rovere)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":18}
    ]}
  ]'::jsonb AS j
),
base_axes_zanzariera AS (
  -- Tipo di rete + colore profilo.
  SELECT '[
    {"nome":"Rete","codice":"rete","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
      {"valore":"standard","label":"Rete standard fibra di vetro","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"antipolline","label":"Rete antipolline","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":18},
      {"valore":"plus","label":"Rete Plus (anti-piccoli insetti)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":12},
      {"valore":"pet","label":"Rete pet-resistant (gatti)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":25}
    ]},
    {"nome":"Colore profilo","codice":"colore_profilo","tipo":"discrete","obbligatorio":false,"sort_order":1,"values":[
      {"valore":"bianco","label":"Bianco RAL 9010","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"argento","label":"Argento anodizzato","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"marrone","label":"Marrone RAL 8017","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"antracite","label":"Antracite RAL 7021","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":8}
    ]}
  ]'::jsonb AS j
),
base_axes_cassonetto AS (
  -- Coibentazione + accessibilità (ispezione interna).
  SELECT '[
    {"nome":"Coibentazione","codice":"coibentazione","tipo":"discrete","obbligatorio":true,"sort_order":0,"values":[
      {"valore":"standard","label":"Standard (PVC senza isolante)","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"termoisolato","label":"Termoisolato EPS λ=0,032","is_default":true,"maggiorazione_tipo":"percentuale","maggiorazione_valore":22},
      {"valore":"acustico","label":"Termo-acustico (con Rw +6dB)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":38}
    ]},
    {"nome":"Ispezione","codice":"ispezione","tipo":"discrete","obbligatorio":true,"sort_order":1,"values":[
      {"valore":"frontale","label":"Sportello ispezione frontale","is_default":true,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"inferiore","label":"Sportello inferiore","is_default":false,"maggiorazione_tipo":"none","maggiorazione_valore":0},
      {"valore":"no","label":"Senza ispezione (a vista)","is_default":false,"maggiorazione_tipo":"percentuale","maggiorazione_valore":-5}
    ]}
  ]'::jsonb AS j
),
-- ────────────────────────────────────────────────────────────────────────────
-- I 6 template effettivi
-- ────────────────────────────────────────────────────────────────────────────
new_templates(nome, descrizione, categoria_slug, tipologia, materiale, image_url, tags, modalita, asse_ref, sort_order) AS (
  VALUES
    -- ─── Tapparelle (sort 60-69) ─────────────────────────────────────────
    (
      'Tapparella PVC',
      'Tapparella in PVC ad alta densità, leggera e isolante. Disponibile con avvolgimento manuale o motorizzato. Prezzo al MQ — l''azienda può passare a L×H o pezzo dal listino.',
      'tapparelle', 'tapparella', 'pvc',
      '/templates/serramenti/products/tapparella-pvc.jpg',
      ARRAY['tapparella','pvc','avvolgibile'], 'mq', 'tapparella', 60
    ),
    (
      'Tapparella Alluminio Coibentata',
      'Tapparella in alluminio coibentato con schiuma poliuretanica. Resistenza meccanica superiore, ideale per esterni esposti. Disponibile manuale/motorizzato.',
      'tapparelle', 'tapparella', 'alluminio',
      '/templates/serramenti/products/tapparella-alluminio.jpg',
      ARRAY['tapparella','alluminio','coibentata'], 'mq', 'tapparella', 61
    ),
    -- ─── Zanzariere (sort 70-79) ─────────────────────────────────────────
    (
      'Zanzariera a Molla Classica',
      'Zanzariera avvolgibile verticale con sistema a molla — apertura/chiusura manuale dal basso. Ideale per finestre standard.',
      'zanzariere', 'zanzariera', 'alluminio',
      '/templates/serramenti/products/zanzariera-molla-classica.png',
      ARRAY['zanzariera','molla','verticale'], 'mq', 'zanzariera', 70
    ),
    (
      'Zanzariera Laterale Avvolgibile',
      'Zanzariera con scorrimento laterale a sinistra/destra. Indicata per porte-finestre e luci di grande larghezza. Apertura silenziosa con sistema frenato.',
      'zanzariere', 'zanzariera', 'alluminio',
      '/templates/serramenti/products/zanzariera-laterale.png',
      ARRAY['zanzariera','laterale','scorrevole'], 'mq', 'zanzariera', 71
    ),
    -- ─── Cassonetti (sort 80-89) ─────────────────────────────────────────
    (
      'Cassonetto Termoisolato PVC',
      'Cassonetto coibentato in PVC con isolamento EPS — riduce ponte termico e ottimizza Uw di sistema. Sportello d''ispezione frontale di serie.',
      'cassonetti', 'cassonetto', 'pvc',
      '/templates/serramenti/products/cassonetto-pvc-isolato.png',
      ARRAY['cassonetto','termoisolato','pvc'], 'pz', 'cassonetto', 80
    ),
    (
      'Cassonetto Effetto Legno',
      'Cassonetto in PVC con finitura effetto legno (rovere/noce) — abbinabile a serramento PVC effetto legno. Coibentazione termo-acustica disponibile.',
      'cassonetti', 'cassonetto', 'pvc',
      '/templates/serramenti/products/cassonetto-effetto-legno.png',
      ARRAY['cassonetto','effetto_legno','rivestito'], 'pz', 'cassonetto', 81
    )
)
INSERT INTO public.article_family_templates (
  nome, descrizione, vertical_slug, categoria_slug, tipologia, materiale,
  image_url, tags,
  modalita_prezzo_base, vat_rate, unit_of_measure,
  griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
  assi_default, sort_order
)
SELECT
  nt.nome, nt.descrizione, 'serramenti', nt.categoria_slug, nt.tipologia, nt.materiale,
  nt.image_url, nt.tags,
  nt.modalita, 22,
  CASE WHEN nt.modalita = 'pz' THEN 'pz' ELSE 'mq' END,
  'Larghezza (mm)', 'Altezza (mm)', 'mm',
  CASE nt.asse_ref
    WHEN 'tapparella'  THEN (SELECT j FROM base_axes_tapparella)
    WHEN 'zanzariera'  THEN (SELECT j FROM base_axes_zanzariera)
    WHEN 'cassonetto'  THEN (SELECT j FROM base_axes_cassonetto)
  END,
  nt.sort_order
FROM new_templates nt
WHERE NOT EXISTS (
  SELECT 1 FROM public.article_family_templates aft
  WHERE aft.vertical_slug = 'serramenti'
    AND aft.nome = nt.nome
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Aggiorna image_url + categoria_slug se template già esistente (re-run)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.article_family_templates aft
SET image_url      = src.image_url,
    categoria_slug = src.categoria_slug,
    sort_order     = src.sort_order
FROM (VALUES
  ('Tapparella PVC',                  '/templates/serramenti/products/tapparella-pvc.jpg',           'tapparelle', 60),
  ('Tapparella Alluminio Coibentata', '/templates/serramenti/products/tapparella-alluminio.jpg',     'tapparelle', 61),
  ('Zanzariera a Molla Classica',     '/templates/serramenti/products/zanzariera-molla-classica.png','zanzariere', 70),
  ('Zanzariera Laterale Avvolgibile', '/templates/serramenti/products/zanzariera-laterale.png',      'zanzariere', 71),
  ('Cassonetto Termoisolato PVC',     '/templates/serramenti/products/cassonetto-pvc-isolato.png',   'cassonetti', 80),
  ('Cassonetto Effetto Legno',        '/templates/serramenti/products/cassonetto-effetto-legno.png', 'cassonetti', 81)
) AS src(nome, image_url, categoria_slug, sort_order)
WHERE aft.vertical_slug = 'serramenti'
  AND aft.nome = src.nome;

NOTIFY pgrst, 'reload schema';
