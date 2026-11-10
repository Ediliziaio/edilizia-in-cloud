-- Costi: una fattura divisa su più categorie si conta per categoria anche nei costi (10/11/2026).
--
-- Con 20290212120000 ogni riga di una fattura ricevuta ha il suo conto (conti_righe), e la
-- contabilità generale divide la scrittura. Costi e Controllo di gestione leggevano ancora
-- company_costs.category: tutta la fattura su una voce (calcestruzzo e pompaggio insieme).
--
--   - company_costs.ripartizione_categorie: [{categoria, importo}], la divisione del costo per
--     categoria, calcolata dalla sua fattura; vuota = tutto sulla categoria del costo. La tengono
--     aggiornata due trigger (conti delle righe cambiati; categoria o importo del costo cambiati);
--   - costo_parti_categoria(categoria, importo, ripartizione): le parti, una riga per categoria,
--     che sommano sempre all'importo. La leggono v_cg_costi_classificati (conto economico,
--     mensile, marginalità, pareggio, salute del Controllo di gestione) e il dettaglio di una voce.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.company_costs ADD COLUMN IF NOT EXISTS ripartizione_categorie jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$ BEGIN
  ALTER TABLE public.company_costs ADD CONSTRAINT company_costs_ripartizione_categorie_array CHECK (jsonb_typeof(ripartizione_categorie) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.company_costs.ripartizione_categorie IS 'Divisione del costo per categoria dalla sua fattura (conti per riga): [{categoria, importo}]. Vuota = tutto su category. La scrive un trigger.';

-- Le parti di un costo per categoria: sommano sempre all'importo.
CREATE OR REPLACE FUNCTION public.costo_parti_categoria(p_categoria text, p_importo numeric, p_ripartizione jsonb)
RETURNS TABLE (categoria text, importo numeric) LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT x->>'categoria', (x->>'importo')::numeric
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_ripartizione) = 'array' THEN p_ripartizione ELSE '[]'::jsonb END) x
  UNION ALL
  SELECT p_categoria, p_importo
   WHERE jsonb_typeof(p_ripartizione) IS DISTINCT FROM 'array' OR jsonb_array_length(p_ripartizione) = 0;
$$;
GRANT EXECUTE ON FUNCTION public.costo_parti_categoria(text, numeric, jsonb) TO authenticated, service_role;

-- La divisione dalle righe della fattura: per categoria la somma delle righe; quelle senza conto e
-- quello che le righe non spiegano sulla categoria del costo; riportata all'importo del costo.
CREATE OR REPLACE FUNCTION public.costo_ripartizione_da_righe(p_righe jsonb, p_conti jsonb, p_categoria text, p_importo numeric)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE v_per jsonb := '{}'::jsonb; x record; v_somma numeric := 0; v_cat text; v_out jsonb := '[]'::jsonb; v_fattore numeric;
  v_resto numeric; v_ultima text;
BEGIN
  IF p_conti IS NULL OR jsonb_typeof(p_conti) <> 'object' OR p_conti = '{}'::jsonb
     OR p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' OR coalesce(p_importo, 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR x IN
    SELECT coalesce(nullif(r->>'numero_linea', ''), n::text) AS chiave,
           coalesce(nullif(r->>'imponibile', '')::numeric, nullif(r->>'prezzo_totale', '')::numeric, 0) AS imp
      FROM jsonb_array_elements(p_righe) WITH ORDINALITY t(r, n)
  LOOP
    v_cat := CASE WHEN p_conti ? x.chiave AND btrim(p_conti->>x.chiave) <> '' THEN p_conti->>x.chiave ELSE coalesce(p_categoria, '') END;
    v_per := jsonb_set(v_per, ARRAY[v_cat], to_jsonb(coalesce((v_per->>v_cat)::numeric, 0) + x.imp));
    v_somma := v_somma + x.imp;
  END LOOP;
  IF v_somma = 0 THEN RETURN '[]'::jsonb; END IF;
  -- Le righe danno le proporzioni; l'importo è quello del costo (sconti in testata, arrotondamenti).
  v_fattore := p_importo / v_somma;
  IF (SELECT count(*) FROM jsonb_object_keys(v_per)) = 1 AND v_per ? coalesce(p_categoria, '') THEN RETURN '[]'::jsonb; END IF;
  v_resto := p_importo;
  FOR x IN SELECT key, value::numeric AS v FROM jsonb_each_text(v_per) ORDER BY value::numeric DESC, key LOOP
    v_ultima := x.key;
    v_out := v_out || jsonb_build_array(jsonb_build_object('categoria', nullif(x.key, ''), 'importo', round(x.v * v_fattore, 2)));
    v_resto := v_resto - round(x.v * v_fattore, 2);
  END LOOP;
  -- I centesimi dell'arrotondamento sulla parte più grande: la somma torna all'importo.
  IF v_resto <> 0 THEN
    v_out := jsonb_set(v_out, '{0,importo}', to_jsonb(((v_out->0->>'importo')::numeric + v_resto)));
  END IF;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION public.costo_ripartizione_da_righe(jsonb, jsonb, text, numeric) TO authenticated, service_role;

-- Costo cambiato (categoria o importo): la divisione si rifà dalla sua fattura.
CREATE OR REPLACE FUNCTION public.costo_ripartizione_categorie_su_costo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record;
BEGIN
  SELECT righe, conti_righe INTO f FROM public.fatture_ricevute WHERE company_cost_id = NEW.id ORDER BY created_at LIMIT 1;
  NEW.ripartizione_categorie := CASE WHEN f IS NULL THEN '[]'::jsonb
    ELSE public.costo_ripartizione_da_righe(f.righe, f.conti_righe, NEW.category, NEW.amount) END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.costo_ripartizione_categorie_su_costo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_costo_ripartizione_categorie ON public.company_costs;
CREATE TRIGGER trg_costo_ripartizione_categorie BEFORE UPDATE OF category, amount ON public.company_costs
  FOR EACH ROW WHEN (NEW.category IS DISTINCT FROM OLD.category OR NEW.amount IS DISTINCT FROM OLD.amount)
  EXECUTE FUNCTION public.costo_ripartizione_categorie_su_costo();

-- Conti delle righe cambiati, o fattura contabilizzata: la divisione del suo costo si rifà.
CREATE OR REPLACE FUNCTION public.costo_ripartizione_categorie_da_fattura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_cost_id IS NOT NULL THEN
    UPDATE public.company_costs c
       SET ripartizione_categorie = public.costo_ripartizione_da_righe(NEW.righe, NEW.conti_righe, c.category, c.amount)
     WHERE c.id = NEW.company_cost_id AND c.company_id = NEW.company_id
       AND c.ripartizione_categorie IS DISTINCT FROM public.costo_ripartizione_da_righe(NEW.righe, NEW.conti_righe, c.category, c.amount);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.costo_ripartizione_categorie_da_fattura() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fattura_ripartizione_categorie ON public.fatture_ricevute;
CREATE TRIGGER trg_fattura_ripartizione_categorie AFTER UPDATE OF conti_righe, company_cost_id, righe ON public.fatture_ricevute
  FOR EACH ROW WHEN (NEW.conti_righe IS DISTINCT FROM OLD.conti_righe OR NEW.company_cost_id IS DISTINCT FROM OLD.company_cost_id OR NEW.righe IS DISTINCT FROM OLD.righe)
  EXECUTE FUNCTION public.costo_ripartizione_categorie_da_fattura();

-- Le fatture che hanno già i conti per riga.
UPDATE public.company_costs c
   SET ripartizione_categorie = public.costo_ripartizione_da_righe(f.righe, f.conti_righe, c.category, c.amount)
  FROM public.fatture_ricevute f
 WHERE f.company_cost_id = c.id AND f.conti_righe <> '{}'::jsonb;

-- ─── Controllo di gestione: una riga per categoria del costo ─────────────────
CREATE OR REPLACE VIEW public.v_cg_costi_classificati AS
 WITH costi_company AS (
         SELECT cc.company_id,
            COALESCE(cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date) AS data,
            pc.importo AS importo,
            pc.categoria AS source_value,
            'company_costs'::text AS source_table
           FROM (company_costs cc
             LEFT JOIN fatture_ricevute fr ON ((fr.company_cost_id = cc.id)))
             CROSS JOIN LATERAL public.costo_parti_categoria(cc.category, cc.amount, cc.ripartizione_categorie) pc
          WHERE (cc.amount IS NOT NULL)
        ), movimenti_bancari AS (
         SELECT bt.company_id,
            COALESCE(bt.value_date, bt.booking_date) AS data,
            abs(bt.amount) AS importo,
            bt.category AS source_value,
            'bank_transactions'::text AS source_table
           FROM bank_transactions bt
          WHERE ((bt.amount < (0)::numeric) AND (bt.linked_scadenza_id IS NULL) AND (bt.linked_cost_id IS NULL) AND (NOT (bt.id IN ( SELECT br.transaction_id
                   FROM bank_reconciliations br
                  WHERE ((br.invoice_id IS NOT NULL) OR (br.scadenza_id IS NOT NULL))))) AND (COALESCE(lower(bt.category), ''::text) !~~ 'girocont%'::text))
        )
 SELECT u.company_id,
    u.data,
    u.importo,
    u.source_table,
    u.source_value,
    cl.voce_chiave,
    cl.macro_voce,
    cl.tipo,
    (EXTRACT(year FROM u.data))::integer AS anno,
    (EXTRACT(month FROM u.data))::integer AS mese
   FROM (( SELECT costi_company.company_id,
            costi_company.data,
            costi_company.importo,
            costi_company.source_value,
            costi_company.source_table
           FROM costi_company
        UNION ALL
         SELECT movimenti_bancari.company_id,
            movimenti_bancari.data,
            movimenti_bancari.importo,
            movimenti_bancari.source_value,
            movimenti_bancari.source_table
           FROM movimenti_bancari) u
     LEFT JOIN LATERAL ( SELECT c.voce_chiave,
            c.macro_voce,
            c.tipo
           FROM cg_classificazione_voci c
          WHERE ((c.company_id = u.company_id) AND (c.source_table = u.source_table) AND c.is_active AND (cg_norm_voce(c.source_value) = cg_norm_voce(u.source_value)))
          ORDER BY (c.source_value = u.source_value) DESC, c.voce_chiave
         LIMIT 1) cl ON (true));

-- Il dettaglio di una voce del Controllo di gestione: le stesse parti.
DO $do$
DECLARE d text; vecchio text; nuovo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cg_get_dettaglio_voce_mese';
  IF d IS NULL THEN RAISE EXCEPTION 'cg_get_dettaglio_voce_mese non trovata'; END IF;
  IF position('costo_parti_categoria' in d) > 0 THEN RETURN; END IF;
  vecchio := $v$               cc.category AS source_value, cl.voce_chiave,
               COALESCE(cc.paid_date, cc.due_date)::date AS data,
               cc.amount AS importo, cc.name AS descrizione, s.name AS controparte
        FROM public.company_costs cc
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = cc.company_id AND cl.source_table = 'company_costs'
         AND cl.source_value = cc.category AND cl.is_active = true$v$;
  nuovo := $v$               pc.categoria AS source_value, cl.voce_chiave,
               COALESCE(cc.paid_date, cc.due_date)::date AS data,
               pc.importo AS importo, cc.name AS descrizione, s.name AS controparte
        FROM public.company_costs cc
        CROSS JOIN LATERAL public.costo_parti_categoria(cc.category, cc.amount, cc.ripartizione_categorie) pc
        LEFT JOIN public.cg_classificazione_voci cl
          ON cl.company_id = cc.company_id AND cl.source_table = 'company_costs'
         AND cl.source_value = pc.categoria AND cl.is_active = true$v$;
  IF position(vecchio in d) = 0 THEN RAISE EXCEPTION 'cg_get_dettaglio_voce_mese: il testo da sostituire non c''è più'; END IF;
  EXECUTE replace(d, vecchio, nuovo);
END $do$;
