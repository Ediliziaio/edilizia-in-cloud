-- Ottimizzazione trigger recalculate_quote_totals
--
-- Problemi risolti:
--   1. line_total diventa GENERATED ALWAYS → elimina l'UPDATE ricorsivo su quote_items
--   2. Trigger STATEMENT-level (FOR EACH STATEMENT) → una sola esecuzione per batch insert
--   3. Aggregazione in unica CTE → una query invece di tre
--
-- Architettura finale:
--   do_recalculate_quote_totals(UUID)    — logica core, nessun trigger
--   trg_recalc_quote_totals_ins_upd()   — wrapper AFTER INSERT/UPDATE, legge NEW TABLE
--   trg_recalc_quote_totals_del()       — wrapper AFTER DELETE, legge OLD TABLE


-- ── 1. Rimuovi trigger e funzioni obsolete ────────────────────────────────────

DROP TRIGGER IF EXISTS trg_recalculate_quote_totals    ON public.quote_items;
DROP TRIGGER IF EXISTS trg_recalc_quote_totals_ins     ON public.quote_items;
DROP TRIGGER IF EXISTS trg_recalc_quote_totals_upd     ON public.quote_items;
DROP TRIGGER IF EXISTS trg_recalc_quote_totals_del     ON public.quote_items;

DROP FUNCTION IF EXISTS public.recalculate_quote_totals();
DROP FUNCTION IF EXISTS public.do_recalculate_quote_totals(UUID);
DROP FUNCTION IF EXISTS public.trg_recalc_quote_totals_ins_upd();
DROP FUNCTION IF EXISTS public.trg_recalc_quote_totals_del();


-- ── 2. line_total come GENERATED ALWAYS (auto-calcolato dal DB) ───────────────
--
-- v_preventivo_analisi dipende da line_total → va droppata e ricreata.

DROP VIEW IF EXISTS public.v_preventivo_analisi CASCADE;

ALTER TABLE public.quote_items
  DROP COLUMN IF EXISTS line_total;

ALTER TABLE public.quote_items
  ADD COLUMN line_total NUMERIC(12,2) GENERATED ALWAYS AS (
    ROUND(
      quantity * unit_price * (1 - COALESCE(discount_percent, 0) / 100),
      2
    )
  ) STORED;

-- Ricrea la view (identica alla definizione in 20260324200031)
CREATE OR REPLACE VIEW public.v_preventivo_analisi
  WITH (security_invoker = true) AS
SELECT
  q.id                            AS quote_id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.total                         AS ricavo_totale,
  q.totale_costo_interno          AS costo_totale,
  q.totale_overhead               AS overhead,
  q.margine_totale_percentuale    AS margine_pct,
  q.created_at,
  q.signed_at,
  SUM(CASE WHEN qi.item_category = 'prodotto' THEN qi.line_total ELSE 0 END) AS ricavo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'     THEN qi.line_total ELSE 0 END) AS ricavo_posa,
  SUM(CASE WHEN qi.item_category = 'prodotto'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_posa,
  COUNT(DISTINCT qi.article_template_id)
    FILTER (WHERE qi.article_template_id IS NOT NULL) AS num_prodotti_distinti
FROM public.quotes q
LEFT JOIN public.quote_items qi ON qi.quote_id = q.id
WHERE q.company_id = public.get_my_company_id()
GROUP BY
  q.id, q.company_id, q.quote_number, q.status, q.tipo_lavoro,
  q.total, q.totale_costo_interno, q.totale_overhead,
  q.margine_totale_percentuale, q.created_at, q.signed_at;


-- ── 3. Funzione core: ricalcola totali per un singolo preventivo ──────────────
--
-- Unica CTE: una sola scan di quote_items per subtotale + IVA lorda.
-- Sconto globale applicato dopo l'aggregazione (fiscalmente corretto).

CREATE OR REPLACE FUNCTION public.do_recalculate_quote_totals(p_quote_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  WITH agg AS (
    SELECT
      COALESCE(SUM(line_total), 0)                              AS subtotale,
      COALESCE(SUM(ROUND(line_total * vat_rate / 100, 2)), 0)   AS iva_lorda
    FROM public.quote_items
    WHERE quote_id = p_quote_id
  )
  UPDATE public.quotes q
  SET
    subtotal        = a.subtotale,
    discount_amount = ROUND(a.subtotale * COALESCE(q.discount_percent, 0) / 100, 2),
    vat_amount      = ROUND(a.iva_lorda  * (1 - COALESCE(q.discount_percent, 0) / 100), 2),
    total           = a.subtotale
                      - ROUND(a.subtotale * COALESCE(q.discount_percent, 0) / 100, 2)
                      + ROUND(a.iva_lorda  * (1 - COALESCE(q.discount_percent, 0) / 100), 2),
    updated_at      = now()
  FROM agg a
  WHERE q.id = p_quote_id;
END;
$$;


-- ── 4. Wrapper trigger AFTER INSERT / UPDATE ─────────────────────────────────
--
-- Legge la transition table "new_rows" (una sola volta per statement).
-- DISTINCT perché un batch insert con N righe sullo stesso preventivo
-- deve chiamare do_recalculate_quote_totals() una sola volta.

CREATE OR REPLACE FUNCTION public.trg_recalc_quote_totals_ins_upd()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qid UUID;
BEGIN
  FOR v_qid IN SELECT DISTINCT quote_id FROM new_rows WHERE quote_id IS NOT NULL
  LOOP
    PERFORM public.do_recalculate_quote_totals(v_qid);
  END LOOP;
  RETURN NULL;  -- statement-level trigger deve restituire NULL
END;
$$;


-- ── 5. Wrapper trigger AFTER DELETE ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_recalc_quote_totals_del()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qid UUID;
BEGIN
  FOR v_qid IN SELECT DISTINCT quote_id FROM old_rows WHERE quote_id IS NOT NULL
  LOOP
    PERFORM public.do_recalculate_quote_totals(v_qid);
  END LOOP;
  RETURN NULL;
END;
$$;


-- ── 6. Trigger statement-level (tre eventi separati per transition tables) ────
--
-- PostgreSQL non ammette REFERENCING NEW TABLE + OLD TABLE su un trigger
-- che gestisce INSERT+DELETE contemporaneamente → due funzioni, tre trigger.

CREATE TRIGGER trg_recalc_quote_totals_ins
  AFTER INSERT ON public.quote_items
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recalc_quote_totals_ins_upd();

CREATE TRIGGER trg_recalc_quote_totals_upd
  AFTER UPDATE ON public.quote_items
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recalc_quote_totals_ins_upd();

CREATE TRIGGER trg_recalc_quote_totals_del
  AFTER DELETE ON public.quote_items
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recalc_quote_totals_del();
