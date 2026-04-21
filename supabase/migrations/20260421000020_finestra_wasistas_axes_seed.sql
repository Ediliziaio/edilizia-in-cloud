-- ============================================================================
-- One-shot data migration · "Finestra a Wasistas" — assi di variazione
-- ============================================================================
-- Configurazione richiesta dall'utente (setup entry-level):
--
--   Colore (obbligatorio)
--     • Bianco (default)              +0%
--     • Antracite                     +8%
--     • Noce finto legno              +15%
--
--   Vetro (obbligatorio)
--     • Doppio standard (default)     +0 €
--     • Triplo basso-emissivo         +80 €/pz
--     • Antieffrazione                +150 €/pz
--
--   Apertura (obbligatorio)
--     • Wasistas classica (default)   +0%
--     • Doppia anta                   +22%
--
-- Note:
--   · Idempotente: ON CONFLICT DO NOTHING su (family_id, codice) e
--     (axis_id, valore). Ri-applicabile senza duplicati.
--   · Se la famiglia non esiste nel DB corrente (ambienti senza dati demo)
--     la migration è di fatto un no-op (la CTE ritorna 0 righe).
--   · Copre TUTTE le famiglie che hanno 'wasistas' nel nome, per robustezza
--     rispetto a varianti di casing/punteggiatura ("Finestra a Wasistas",
--     "Finestra Wasistas", ecc.).
-- ============================================================================

-- 1) Assi — inseriti per ogni famiglia Wasistas trovata
WITH target_families AS (
  SELECT id AS family_id, company_id
  FROM public.article_families
  WHERE nome ILIKE '%wasistas%'
    AND deleted_at IS NULL
),
axis_defs (codice, nome, descrizione, tipo, obbligatorio, sort_order) AS (
  VALUES
    ('colore',   'Colore',        'Finitura esterna del profilo.',                 'discrete', true, 10),
    ('vetro',    'Vetro',         'Tipologia di vetro montata nel telaio.',        'discrete', true, 20),
    ('apertura', 'Tipo apertura', 'Meccanismo di apertura del serramento.',        'discrete', true, 30)
),
inserted_axes AS (
  INSERT INTO public.article_family_axes
    (family_id, company_id, codice, nome, descrizione, tipo, obbligatorio, sort_order)
  SELECT tf.family_id, tf.company_id, ad.codice, ad.nome, ad.descrizione, ad.tipo, ad.obbligatorio, ad.sort_order
  FROM   target_families tf
  CROSS JOIN axis_defs ad
  ON CONFLICT (family_id, codice) DO NOTHING
  RETURNING id, family_id, codice
)
SELECT 'axes_inserted' AS step, COUNT(*) AS n FROM inserted_axes;

-- 2) Valori — inseriti per ogni asse (appena inserito o preesistente)
--    Join su article_family_axes per ottenere axis_id + company_id della
--    famiglia Wasistas. ON CONFLICT evita duplicati sui valori.

WITH target_axes AS (
  SELECT afa.id AS axis_id, afa.company_id, afa.codice
  FROM   public.article_family_axes afa
  JOIN   public.article_families af ON af.id = afa.family_id
  WHERE  af.nome ILIKE '%wasistas%'
    AND  af.deleted_at IS NULL
    AND  afa.codice IN ('colore', 'vetro', 'apertura')
),
value_defs (codice_asse, valore, label, is_default, mag_tipo, mag_valore, mag_acquisto, sort_order) AS (
  VALUES
    -- Colore
    ('colore',   'bianco',            'Bianco',                    true,  'none',        0::numeric,   0::numeric, 10),
    ('colore',   'antracite',         'Antracite',                 false, 'percentuale', 8::numeric,   5::numeric, 20),
    ('colore',   'noce_legno',        'Noce finto legno',          false, 'percentuale', 15::numeric, 10::numeric, 30),
    -- Vetro
    ('vetro',    'doppio_standard',   'Doppio standard',           true,  'none',        0::numeric,   0::numeric, 10),
    ('vetro',    'triplo_be',         'Triplo basso-emissivo',     false, 'fisso_pz',    80::numeric, 50::numeric, 20),
    ('vetro',    'antieffrazione',    'Antieffrazione',            false, 'fisso_pz',   150::numeric, 95::numeric, 30),
    -- Apertura
    ('apertura', 'wasistas_classica', 'Wasistas classica',         true,  'none',        0::numeric,   0::numeric, 10),
    ('apertura', 'doppia_anta',       'Doppia anta',               false, 'percentuale', 22::numeric, 15::numeric, 20)
),
inserted_values AS (
  INSERT INTO public.article_family_axis_values
    (axis_id, company_id, valore, label, is_default, maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo)
  SELECT ta.axis_id, ta.company_id,
         vd.valore, vd.label, vd.is_default,
         vd.mag_tipo, vd.mag_valore, vd.mag_acquisto,
         vd.sort_order, true
  FROM   target_axes ta
  JOIN   value_defs  vd ON vd.codice_asse = ta.codice
  ON CONFLICT (axis_id, valore) DO NOTHING
  RETURNING id, axis_id, valore
)
SELECT 'values_inserted' AS step, COUNT(*) AS n FROM inserted_values;

-- 3) Log diagnostico — quante righe risultanti per famiglia Wasistas
DO $$
DECLARE
  r RECORD;
  tot_axes  integer := 0;
  tot_vals  integer := 0;
BEGIN
  FOR r IN
    SELECT af.id AS fid, af.nome,
           (SELECT COUNT(*) FROM public.article_family_axes aa WHERE aa.family_id = af.id) AS n_ax,
           (SELECT COUNT(*) FROM public.article_family_axis_values av
              JOIN public.article_family_axes ax ON ax.id = av.axis_id
             WHERE ax.family_id = af.id) AS n_val
    FROM   public.article_families af
    WHERE  af.nome ILIKE '%wasistas%'
      AND  af.deleted_at IS NULL
  LOOP
    RAISE NOTICE 'Famiglia "%": % assi, % valori', r.nome, r.n_ax, r.n_val;
    tot_axes := tot_axes + r.n_ax;
    tot_vals := tot_vals + r.n_val;
  END LOOP;
  RAISE NOTICE 'TOTALE Wasistas: % assi, % valori', tot_axes, tot_vals;
END;
$$;

NOTIFY pgrst, 'reload schema';
