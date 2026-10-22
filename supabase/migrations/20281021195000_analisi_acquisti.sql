-- ============================================================================
-- analisi_acquisti(p_dal, p_al, …) — i conti della pagina Analisi Acquisti
-- ----------------------------------------------------------------------------
-- Prima la pagina leggeva ordini, righe e fatture dal browser: PostgREST si
-- ferma a 1000 righe, e oltre quelle i totali erano semplicemente più bassi.
-- Qui tutto in una chiamata, con le stesse regole di
-- src/lib/procurement/spendAnalysis.ts (calcolaAnalisiAcquisti), che la pagina
-- usa finché questa funzione non c'è:
--   - Ordinato   = ordini d'acquisto né bozza né annullati, imponibile
--                  (subtotal, oppure total − vat_total se manca).
--   - Fatturato  = fatture ricevute non rifiutate, imponibile (o totale − IVA);
--                  le note di credito (TD04, TD08, passive_credit_note, lo stesso
--                  elenco di src/lib/fatturazione/noteDiCredito.ts) sottraggono.
--   - Fornitore della fattura: quello dell'ordine collegato, altrimenti la
--     partita IVA confrontata con suppliers.vat_number (senza «IT» e spazi).
--   - Ordinato non fatturato = per ogni ordine del periodo, imponibile meno le
--     fatture collegate (di qualunque data), mai sotto zero.
--   - Scaduto / in scadenza 30 giorni = rate «pagamento_fornitore» aperte, non
--     previsionali: quello che resta da pagare, IVA compresa. Stato di oggi.
--   - Mesi: al massimo gli ultimi 12 del periodo, con lo stesso mese dell'anno
--     prima.
--   - Categoria: suppliers.product_category.
--
-- Accesso: l'azienda è quella effettiva dell'utente, e serve il permesso di
-- vedere i costi (come la rotta /azienda/analisi-acquisti).
-- Solo lettura: nessun lock, nessuna scrittura.
-- ============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.analisi_acquisti(
  p_dal date,
  p_al date,
  p_fornitore uuid DEFAULT NULL,
  p_commessa uuid DEFAULT NULL,
  p_senza_commessa boolean DEFAULT false,
  p_categoria text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company   uuid := public.get_effective_company_id();
  v_oggi      date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_dal_prima date;
  v_al_prima  date;
  v_res       jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN
    RAISE EXCEPTION 'Accesso non autorizzato' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_company_access(v_company);
  IF NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company), false) THEN
    RAISE EXCEPTION 'Non puoi vedere i costi di questa azienda' USING ERRCODE = '42501';
  END IF;
  IF p_dal IS NULL OR p_al IS NULL OR p_dal > p_al THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;

  v_dal_prima := (p_dal - interval '1 year')::date;
  v_al_prima  := (p_al  - interval '1 year')::date;

  WITH
  forn AS (
    SELECT s.id, s.name, nullif(btrim(s.product_category), '') AS categoria,
           s.vat_number,
           CASE WHEN x.p ~ '^IT[0-9]{11}$' THEN substr(x.p, 3) ELSE x.p END AS piva
      FROM suppliers s
      CROSS JOIN LATERAL (SELECT regexp_replace(upper(coalesce(s.vat_number, '')), '[^A-Z0-9]', '', 'g') AS p) x
     WHERE s.company_id = v_company
  ),
  piva_map AS (
    SELECT DISTINCT ON (piva) piva, id FROM forn WHERE piva <> '' ORDER BY piva, id
  ),
  po_all AS (
    SELECT po.id, po.supplier_id, po.order_id, po.issue_date, po.status,
           CASE WHEN coalesce(po.subtotal, 0) <> 0 THEN po.subtotal
                ELSE coalesce(po.total, 0) - coalesce(po.vat_total, 0) END AS imp
      FROM purchase_orders po
     WHERE po.company_id = v_company
  ),
  ft AS (
    SELECT f.id, f.data_fattura, f.purchase_order_id,
           btrim(coalesce(f.cedente_ragione_sociale, '')) AS nome,
           nullif(y.piva, '') AS piva,
           coalesce(pa.supplier_id, pm.id) AS supplier_id,
           pa.order_id,
           CASE WHEN btrim(coalesce(f.tipo_documento, '')) IN ('TD04', 'TD08', 'passive_credit_note')
                THEN -abs(z.base) ELSE z.base END AS imp
      FROM fatture_ricevute f
      LEFT JOIN po_all pa ON pa.id = f.purchase_order_id
      CROSS JOIN LATERAL (SELECT regexp_replace(upper(coalesce(f.cedente_piva, '')), '[^A-Z0-9]', '', 'g') AS p) x
      CROSS JOIN LATERAL (SELECT CASE WHEN x.p ~ '^IT[0-9]{11}$' THEN substr(x.p, 3) ELSE x.p END AS piva) y
      CROSS JOIN LATERAL (SELECT coalesce(f.imponibile_totale, coalesce(f.totale_documento, 0) - coalesce(f.iva_totale, 0)) AS base) z
      LEFT JOIN piva_map pm ON pm.piva = y.piva AND y.piva <> ''
     WHERE f.company_id = v_company
       AND f.stato IS DISTINCT FROM 'rifiutata'
  ),
  fatt_per_po AS (
    SELECT purchase_order_id, sum(imp) AS fatt FROM ft WHERE purchase_order_id IS NOT NULL GROUP BY 1
  ),
  -- Ordini validi che passano i filtri, con categoria e «non fatturato».
  po AS (
    SELECT p.*, fo.categoria,
           greatest(0, p.imp - coalesce(fp.fatt, 0)) AS non_fatt
      FROM po_all p
      LEFT JOIN forn fo ON fo.id = p.supplier_id
      LEFT JOIN fatt_per_po fp ON fp.purchase_order_id = p.id
     WHERE p.status IS DISTINCT FROM 'annullato' AND p.status IS DISTINCT FROM 'bozza'
       AND (p_fornitore IS NULL OR p.supplier_id = p_fornitore)
       AND (NOT p_senza_commessa OR p.order_id IS NULL)
       AND (p_commessa IS NULL OR p.order_id = p_commessa)
       AND (p_categoria IS NULL OR fo.categoria = p_categoria)
  ),
  po_p  AS (SELECT * FROM po WHERE issue_date BETWEEN p_dal AND p_al),
  po_pp AS (SELECT * FROM po WHERE issue_date BETWEEN v_dal_prima AND v_al_prima),
  ftf AS (
    SELECT t.*, fo.categoria
      FROM ft t
      LEFT JOIN forn fo ON fo.id = t.supplier_id
     WHERE (p_fornitore IS NULL OR t.supplier_id = p_fornitore)
       AND (NOT p_senza_commessa OR t.order_id IS NULL)
       AND (p_commessa IS NULL OR t.order_id = p_commessa)
       AND (p_categoria IS NULL OR fo.categoria = p_categoria)
  ),
  ft_p  AS (SELECT * FROM ftf WHERE data_fattura BETWEEN p_dal AND p_al),
  ft_pp AS (SELECT * FROM ftf WHERE data_fattura BETWEEN v_dal_prima AND v_al_prima),
  sc AS (
    SELECT s.id, s.supplier_id, s.description, s.due_date,
           coalesce(s.amount, 0) - coalesce(s.paid_amount, 0) AS residuo,
           s.due_date < v_oggi AS scaduta,
           fo.name AS fornitore
      FROM scadenze s
      LEFT JOIN forn fo ON fo.id = s.supplier_id
     WHERE s.company_id = v_company
       AND s.tipo = 'pagamento_fornitore'
       AND s.status IN ('da_pagare', 'parziale')
       AND NOT coalesce(s.is_previsionale, false)
       AND s.due_date <= v_oggi + 30
       AND coalesce(s.amount, 0) - coalesce(s.paid_amount, 0) > 0.005
       AND (p_fornitore IS NULL OR s.supplier_id = p_fornitore)
       AND (NOT p_senza_commessa OR s.order_id IS NULL)
       AND (p_commessa IS NULL OR s.order_id = p_commessa)
       AND (p_categoria IS NULL OR fo.categoria = p_categoria)
  ),
  -- Movimenti per fornitore: ordini, fatture e rate sulla stessa chiave.
  mov AS (
    SELECT 's:' || supplier_id AS chiave, supplier_id, NULL::text AS piva, NULL::text AS nome,
           imp AS ordinato, 0::numeric AS fatturato, non_fatt, 0::numeric AS scaduto, 0::numeric AS in30,
           1 AS n_ord, 0 AS n_fatt, issue_date AS data
      FROM po_p
    UNION ALL
    SELECT CASE WHEN supplier_id IS NOT NULL THEN 's:' || supplier_id
                WHEN piva IS NOT NULL THEN 'piva:' || piva
                ELSE 'nome:' || lower(regexp_replace(nome, '\s+', ' ', 'g')) END,
           supplier_id, piva, nullif(nome, ''),
           0, imp, 0, 0, 0, 0, 1, data_fattura
      FROM ft_p
    UNION ALL
    SELECT 's:' || supplier_id, supplier_id, NULL, NULL,
           0, 0, 0,
           CASE WHEN scaduta THEN residuo ELSE 0 END,
           CASE WHEN scaduta THEN 0 ELSE residuo END,
           0, 0, NULL::date
      FROM sc WHERE supplier_id IS NOT NULL
  ),
  per_fornitore AS (
    SELECT m.chiave,
           (array_agg(m.supplier_id) FILTER (WHERE m.supplier_id IS NOT NULL))[1] AS supplier_id,
           max(m.piva) AS piva_f,
           max(m.nome) AS nome_f,
           sum(m.ordinato) AS ordinato, sum(m.fatturato) AS fatturato, sum(m.non_fatt) AS non_fatt,
           sum(m.scaduto) AS scaduto, sum(m.in30) AS in30,
           sum(m.n_ord) AS n_ord, sum(m.n_fatt) AS n_fatt, max(m.data) AS ultimo
      FROM mov m
     GROUP BY m.chiave
  ),
  commesse AS (
    SELECT order_id, sum(ordinato) AS ordinato, sum(fatturato) AS fatturato, sum(n_ord) AS n_ord
      FROM (
        SELECT order_id, imp AS ordinato, 0::numeric AS fatturato, 1 AS n_ord FROM po_p
        UNION ALL
        SELECT order_id, 0, imp, 0 FROM ft_p
      ) u
     GROUP BY order_id
  ),
  mesi AS (
    SELECT to_char(g, 'YYYY-MM') AS mese
      FROM generate_series(
             date_trunc('month', greatest(p_dal, (date_trunc('month', p_al) - interval '11 months')::date)),
             date_trunc('month', p_al),
             interval '1 month') g
  ),
  categorie AS (
    SELECT coalesce(categoria, 'Senza categoria') AS categoria, sum(ordinato) AS ordinato, sum(fatturato) AS fatturato
      FROM (
        SELECT categoria, imp AS ordinato, 0::numeric AS fatturato FROM po_p
        UNION ALL
        SELECT categoria, 0, imp FROM ft_p
      ) u
     GROUP BY 1
    HAVING sum(ordinato) <> 0 OR sum(fatturato) <> 0
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('dal', p_dal, 'al', p_al),
    'totali', jsonb_build_object(
      'ordinato',              (SELECT coalesce(sum(imp), 0) FROM po_p),
      'fatturato',             (SELECT coalesce(sum(imp), 0) FROM ft_p),
      'ordinatoNonFatturato',  (SELECT coalesce(sum(non_fatt), 0) FROM po_p),
      'scaduto',               (SELECT coalesce(sum(residuo) FILTER (WHERE scaduta), 0) FROM sc),
      'scadutoConteggio',      (SELECT count(*) FILTER (WHERE scaduta) FROM sc),
      'inScadenza30',          (SELECT coalesce(sum(residuo) FILTER (WHERE NOT scaduta), 0) FROM sc),
      'inScadenza30Conteggio', (SELECT count(*) FILTER (WHERE NOT scaduta) FROM sc),
      'numeroOrdini',          (SELECT count(*) FROM po_p),
      'numeroFatture',         (SELECT count(*) FROM ft_p),
      'senzaCommessa',         (SELECT coalesce(sum(imp) FILTER (WHERE order_id IS NULL), 0) FROM po_p),
      'annoPrima', jsonb_build_object(
        'ordinato',  (SELECT coalesce(sum(imp), 0) FROM po_pp),
        'fatturato', (SELECT coalesce(sum(imp), 0) FROM ft_pp)
      )
    ),
    'fornitori', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'chiave', pf.chiave,
               'supplierId', pf.supplier_id,
               'nome', coalesce(nullif(btrim(fo.name), ''), pf.nome_f, 'Fornitore senza nome'),
               'piva', coalesce(fo.vat_number, pf.piva_f),
               'categoria', fo.categoria,
               'ordinato', pf.ordinato,
               'fatturato', pf.fatturato,
               'ordinatoNonFatturato', pf.non_fatt,
               'scaduto', pf.scaduto,
               'inScadenza30', pf.in30,
               'numeroOrdini', pf.n_ord,
               'numeroFatture', pf.n_fatt,
               'ultimoAcquisto', pf.ultimo
             ) ORDER BY greatest(pf.ordinato, pf.fatturato) DESC, pf.chiave)
        FROM per_fornitore pf
        LEFT JOIN forn fo ON fo.id = pf.supplier_id
       WHERE pf.ordinato <> 0 OR pf.fatturato <> 0 OR pf.scaduto <> 0 OR pf.in30 <> 0
    ), '[]'::jsonb),
    'commesse', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'orderId', c.order_id,
               'codice', o.order_code,
               'cliente', o.client_name,
               'ordinato', c.ordinato,
               'fatturato', c.fatturato,
               'numeroOrdini', c.n_ord
             ) ORDER BY (c.order_id IS NULL) DESC, greatest(c.ordinato, c.fatturato) DESC)
        FROM commesse c
        LEFT JOIN orders o ON o.id = c.order_id AND o.company_id = v_company
       WHERE c.ordinato <> 0 OR c.fatturato <> 0
    ), '[]'::jsonb),
    'mesi', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'mese', m.mese,
               'ordinato',           (SELECT coalesce(sum(imp), 0) FROM po_p  WHERE to_char(issue_date, 'YYYY-MM') = m.mese),
               'fatturato',          (SELECT coalesce(sum(imp), 0) FROM ft_p  WHERE to_char(data_fattura, 'YYYY-MM') = m.mese),
               'ordinatoAnnoPrima',  (SELECT coalesce(sum(imp), 0) FROM po_pp WHERE to_char(issue_date + interval '1 year', 'YYYY-MM') = m.mese),
               'fatturatoAnnoPrima', (SELECT coalesce(sum(imp), 0) FROM ft_pp WHERE to_char(data_fattura + interval '1 year', 'YYYY-MM') = m.mese)
             ) ORDER BY m.mese)
        FROM mesi m
    ), '[]'::jsonb),
    'categorie', CASE WHEN EXISTS (SELECT 1 FROM forn WHERE categoria IS NOT NULL) THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object('categoria', c.categoria, 'ordinato', c.ordinato, 'fatturato', c.fatturato)
             ORDER BY c.ordinato + c.fatturato DESC)
        FROM categorie c
    ), '[]'::jsonb) ELSE '[]'::jsonb END,
    'scadenze', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id,
               'supplierId', s.supplier_id,
               'fornitore', coalesce(nullif(btrim(s.fornitore), ''), 'Fornitore non indicato'),
               'descrizione', s.description,
               'scadenza', s.due_date,
               'residuo', s.residuo,
               'scaduta', s.scaduta
             ) ORDER BY s.due_date, s.id)
        FROM (SELECT * FROM sc ORDER BY due_date, id LIMIT 500) s
    ), '[]'::jsonb)
  )
  INTO v_res;

  RETURN v_res;
END;
$$;

COMMENT ON FUNCTION public.analisi_acquisti(date, date, uuid, uuid, boolean, text) IS
  'Analisi Acquisti dell''azienda effettiva: ordinato e fatturato senza IVA, scaduto e in scadenza ai fornitori, per fornitore, commessa, mese e categoria. Richiede can_view_costs.';

REVOKE ALL ON FUNCTION public.analisi_acquisti(date, date, uuid, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analisi_acquisti(date, date, uuid, uuid, boolean, text) TO authenticated, service_role;
