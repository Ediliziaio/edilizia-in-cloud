-- Riepilogo IVA dalle righe calcolato dentro le viste, in un solo passaggio.
--
-- Misurato il 07/11/2026 da utente vero di Innovasol, registri di un anno:
-- - vendite: 1.059 ms con la funzione per fattura (i permessi delle righe,
--   invoice_lines_lettura, si ricontrollavano a ogni chiamata), 69 ms senza
--   riepilogo;
-- - acquisti: 543 ms con la funzione, 107 ms senza.
-- Stesse regole di 20281230104000/105000 (aliquota mancante o righe che non
-- tornano = niente riepilogo; resto degli arrotondamenti sull'aliquota con più
-- IVA), verificate uguali sui documenti veri prima di applicare.
--
-- Il prospetto legge gli acquisti dalla stessa vista del Registro: periodo,
-- riepilogo e integrazioni hanno una regola sola. Le funzioni per riga non
-- servono più e si tolgono.

set local lock_timeout = '3s';

create or replace view public.fatture_vendite_iva with (security_invoker = true) as
 SELECT d.id,
    d.company_id,
    'nativa'::text AS origine,
    d.tipo,
    d.numero,
    d.data_emissione,
    d.anno,
    d.cliente_snapshot,
    d.imponibile_totale,
    d.iva_totale,
    d.totale_documento,
    d.riepilogo_iva,
    d.esigibilita_iva,
    d.stato,
    d.deleted_at
   FROM documenti_fiscali d
UNION ALL
 SELECT i.id,
    i.company_id,
    'importata'::text AS origine,
        CASE
            WHEN i.document_type = ANY (ARRAY['credit_note'::text, 'TD04'::text, 'TD08'::text]) THEN 'nota_credito'::text
            WHEN i.document_type = 'TD16'::text THEN 'reverse_charge_interno'::text
            WHEN i.document_type = 'TD17'::text THEN 'integrazione_servizi_estero'::text
            WHEN i.document_type = 'TD18'::text THEN 'integrazione_beni_ue'::text
            WHEN i.document_type = 'TD19'::text THEN 'integrazione_beni_extra_ue'::text
            ELSE 'fattura'::text
        END AS tipo,
    i.invoice_number AS numero,
    i.issue_date AS data_emissione,
    EXTRACT(year FROM i.issue_date)::integer AS anno,
    jsonb_build_object('ragione_sociale', i.client_company_name, 'partita_iva', i.client_vat_number, 'codice_fiscale', i.client_fiscal_code) AS cliente_snapshot,
    i.subtotal AS imponibile_totale,
    i.tax_amount AS iva_totale,
    i.total AS totale_documento,
    CASE
        WHEN public.iva_ha_riepilogo(i.external_tax_summary) THEN i.external_tax_summary
        ELSE rl.riepilogo
    END AS riepilogo_iva,
    'I'::text AS esigibilita_iva,
    i.status AS stato,
    i.deleted_at
   FROM invoices i
   -- Riepilogo dalle righe in un solo passaggio: con una funzione chiamata fattura per
   -- fattura i permessi delle righe si ricontrollavano 405 volte (1 s invece di 50 ms).
   LEFT JOIN LATERAL (
     WITH g AS (
       SELECT l.tax_rate AS aliq, nullif(l.tax_nature, '') AS nat,
              sum(coalesce(l.line_net, 0)) AS imp, sum(coalesce(l.line_tax, 0)) AS iva
         FROM invoice_lines l WHERE l.invoice_id = i.id
        GROUP BY l.tax_rate, nullif(l.tax_nature, '')
     ), t AS (
       SELECT count(*) AS n, count(*) FILTER (WHERE aliq IS NULL) AS nulle, sum(imp) AS s_imp, sum(iva) AS s_iva FROM g
     ), o AS (
       SELECT g.*, row_number() OVER (ORDER BY abs(g.iva) DESC, abs(g.imp) DESC,
              public.iva_aliquota_testo(g.aliq) || '|' || coalesce(g.nat, '')) AS rn FROM g
     )
     SELECT CASE WHEN t.n > 0 AND t.nulle = 0
                  AND abs(t.s_imp - coalesce(i.subtotal, 0)) < 0.05 AND abs(t.s_iva - coalesce(i.tax_amount, 0)) < 0.05
            THEN (SELECT jsonb_agg(jsonb_build_object(
                    'aliquota', public.iva_aliquota_testo(o.aliq), 'natura', o.nat,
                    'imponibile', round(o.imp + CASE WHEN o.rn = 1 THEN coalesce(i.subtotal, 0) - t.s_imp ELSE 0 END, 2),
                    'imposta', round(o.iva + CASE WHEN o.rn = 1 THEN coalesce(i.tax_amount, 0) - t.s_iva ELSE 0 END, 2),
                    'fonte', 'righe') ORDER BY o.aliq, coalesce(o.nat, '')) FROM o)
            END AS riepilogo
       FROM t
   ) rl ON true
  WHERE i.external_provider IS NOT NULL AND (i.document_type = ANY (ARRAY['invoice'::text, 'credit_note'::text, 'TD01'::text, 'TD02'::text, 'TD03'::text, 'TD04'::text, 'TD05'::text, 'TD06'::text, 'TD08'::text, 'TD24'::text, 'TD25'::text, 'TD16'::text, 'TD17'::text, 'TD18'::text, 'TD19'::text])) AND (i.status <> ALL (ARRAY['draft'::text, 'cancelled'::text, 'canceled'::text, 'void'::text, 'deleted'::text])) AND (COALESCE(i.external_status, ''::text) <> ALL (ARRAY['ERRO'::text, 'PREN'::text])) AND NOT (EXISTS ( SELECT 1
           FROM documenti_fiscali d
          WHERE d.company_id = i.company_id AND d.deleted_at IS NULL AND (d.stato <> ALL (ARRAY['bozza'::text, 'annullata'::text])) AND d.numero = i.invoice_number AND d.data_emissione = i.issue_date AND (d.tipo = ANY (
                CASE
                    WHEN i.document_type = ANY (ARRAY['credit_note'::text, 'TD04'::text, 'TD08'::text]) THEN ARRAY['nota_credito'::text]
                    WHEN i.document_type = 'TD16'::text THEN ARRAY['reverse_charge_interno'::text]
                    WHEN i.document_type = 'TD17'::text THEN ARRAY['integrazione_servizi_estero'::text]
                    WHEN i.document_type = 'TD18'::text THEN ARRAY['integrazione_beni_ue'::text]
                    WHEN i.document_type = 'TD19'::text THEN ARRAY['integrazione_beni_extra_ue'::text]
                    WHEN i.external_document_type = 'TD05'::text OR (i.document_type = ANY (ARRAY['debit_note'::text, 'TD05'::text])) THEN ARRAY['nota_debito'::text]
                    ELSE ARRAY['fattura'::text, 'fattura_pa'::text, 'fattura_riepilogativa'::text, 'parcella'::text, 'fattura_accompagnatoria'::text]
                END)) AND (NULLIF(i.client_vat_number, ''::text) IS NOT NULL AND regexp_replace(upper(btrim(COALESCE(d.cliente_snapshot ->> 'partita_iva'::text, ''::text))), '^IT'::text, ''::text) = regexp_replace(upper(btrim(i.client_vat_number)), '^IT'::text, ''::text) OR NULLIF(i.client_vat_number, ''::text) IS NULL AND NULLIF(i.client_fiscal_code, ''::text) IS NOT NULL AND upper(btrim(d.cliente_snapshot ->> 'codice_fiscale'::text)) = upper(btrim(i.client_fiscal_code))) AND abs(d.imponibile_totale - i.subtotal) < 0.005 AND abs(d.iva_totale - i.tax_amount) < 0.005 AND abs(d.totale_documento - i.total) < 0.005));

create or replace view public.fatture_ricevute_periodo_iva with (security_invoker = true) as
  select f.id,
    f.company_id,
    f.numero_fattura,
    f.data_fattura,
    f.data_ricezione_sdi,
    public.data_detrazione_iva(f.data_fattura, public.ricezione_iva_il(f.data_ricezione_sdi, f.ricezione_dichiarata_il)) as data_detrazione,
    f.tipo_documento,
    f.cedente_ragione_sociale,
    f.imponibile_totale,
    f.iva_totale,
    f.totale_documento,
    case when public.iva_ha_riepilogo(f.riepilogo_iva) then f.riepilogo_iva else rr.riepilogo end as riepilogo_iva,
    f.stato,
    f.aliquota_reverse_charge,
    f.ricezione_dichiarata_il,
    public.ricezione_iva_origine(f.data_fattura, f.data_ricezione_sdi, f.ricezione_dichiarata_il) as ricezione_origine,
    public.iva_ricevuta_e_integrazione(f.tipo_documento) as integrazione,
    f.cedente_piva
  from public.fatture_ricevute f
  -- Riepilogo dalle righe (formato di Fatture in Cloud) in un solo passaggio.
  left join lateral (
    with r as (
      select case when btrim(x ->> 'aliquota_iva') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(x ->> 'aliquota_iva')::numeric end as aliq,
             nullif(coalesce(x ->> 'natura', x ->> 'natura_iva'), '') as nat,
             public.num_da_json(x ->> 'imponibile') as imp,
             public.num_da_json(x ->> 'imposta') as iva
        from jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) x
    ), g as (
      select aliq, nat, sum(imp) as imp, sum(iva) as iva from r group by aliq, nat
    ), t as (
      select count(*) as n, count(*) filter (where aliq is null) as nulle, sum(imp) as s_imp, sum(iva) as s_iva from g
    ), o as (
      select g.*, row_number() over (order by abs(g.iva) desc, abs(g.imp) desc,
             public.iva_aliquota_testo(g.aliq) || '|' || coalesce(g.nat, '')) as rn from g
    )
    select case when t.n > 0 and t.nulle = 0
                 and abs(t.s_imp - coalesce(f.imponibile_totale, 0)) < 0.05 and abs(t.s_iva - coalesce(f.iva_totale, 0)) < 0.05
           then (select jsonb_agg(jsonb_build_object(
                   'aliquota', public.iva_aliquota_testo(o.aliq), 'natura', o.nat,
                   'imponibile', round(o.imp + case when o.rn = 1 then coalesce(f.imponibile_totale, 0) - t.s_imp else 0 end, 2),
                   'imposta', round(o.iva + case when o.rn = 1 then coalesce(f.iva_totale, 0) - t.s_iva else 0 end, 2),
                   'fonte', 'righe') order by o.aliq, coalesce(o.nat, '')) from o)
           end as riepilogo
      from t
  ) rr on true;

CREATE OR REPLACE FUNCTION public.liquidazione_iva_periodo(p_company_id uuid, p_periodo text, p_anno integer, p_mese integer DEFAULT NULL::integer, p_trimestre integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipi_vendite text[] := ARRAY[
    'fattura','fattura_pa','nota_credito','nota_debito','autofattura',
    'fattura_riepilogativa','parcella','fattura_accompagnatoria',
    'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue',
    'reverse_charge_interno'];
  -- Le integrazioni emesse: la loro IVA è anche detraibile, quindi entrano pure negli acquisti.
  v_tipi_integrazione text[] := ARRAY[
    'reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  v_dal        date;
  v_al         date;
  v_etichetta  text;
  v_mesi       text[] := ARRAY['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  v_out        jsonb;
  v_doc        jsonb;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_anno IS NULL OR p_anno < 2000 OR p_anno > 2100 THEN
    RAISE EXCEPTION 'anno non valido: %', p_anno USING ERRCODE = '22023';
  END IF;

  IF p_periodo = 'mensile' THEN
    IF p_mese IS NULL OR p_mese < 1 OR p_mese > 12 THEN
      RAISE EXCEPTION 'mese non valido: %', p_mese USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, p_mese, 1);
    v_al  := (v_dal + interval '1 month' - interval '1 day')::date;
    v_etichetta := v_mesi[p_mese] || ' ' || p_anno;
  ELSIF p_periodo = 'trimestrale' THEN
    IF p_trimestre IS NULL OR p_trimestre < 1 OR p_trimestre > 4 THEN
      RAISE EXCEPTION 'trimestre non valido: %', p_trimestre USING ERRCODE = '22023';
    END IF;
    v_dal := make_date(p_anno, (p_trimestre - 1) * 3 + 1, 1);
    v_al  := (v_dal + interval '3 months' - interval '1 day')::date;
    v_etichetta := p_trimestre || '° Trimestre ' || p_anno;
  ELSE
    RAISE EXCEPTION 'periodo non valido: % (attesi "mensile" o "trimestrale")', p_periodo
      USING ERRCODE = '22023';
  END IF;

  WITH
  vend_doc AS (
    SELECT d.id, d.numero, d.data_emissione,
           (d.tipo = ANY(v_tipi_integrazione)) AS integrazione,
           -- Nota di credito salvata in positivo: si inverte. Salvata già in negativo: resta.
           CASE WHEN d.tipo = 'nota_credito'
                 AND coalesce(d.totale_documento, coalesce(d.imponibile_totale, 0) + coalesce(d.iva_totale, 0)) > 0
                THEN -1 ELSE 1 END AS fattore,
           coalesce(nullif(d.esigibilita_iva, ''), 'I') AS esig_doc,
           d.imponibile_totale, d.iva_totale, d.riepilogo_iva
    FROM public.fatture_vendite_iva d
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND d.tipo = ANY(v_tipi_vendite)
      AND d.stato NOT IN ('bozza', 'annullata')
      AND d.data_emissione BETWEEN v_dal AND v_al
  ),
  vend_righe AS (
    SELECT v.id, v.integrazione,
           coalesce(nullif(r.value ->> 'aliquota', ''), nullif(r.value ->> 'aliquota_iva', ''), '—') AS aliquota,
           upper(coalesce(nullif(r.value ->> 'esigibilita', ''), v.esig_doc)) AS esigibilita,
           v.fattore * coalesce(public.num_da_json(r.value ->> 'imponibile'), 0) AS imponibile,
           v.fattore * coalesce(public.num_da_json(r.value ->> 'imposta'), 0)    AS imposta
    FROM vend_doc v
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN public.iva_ha_riepilogo(v.riepilogo_iva) THEN v.riepilogo_iva ELSE '[]'::jsonb END) r
    WHERE public.iva_ha_riepilogo(v.riepilogo_iva)
    UNION ALL
    SELECT v.id, v.integrazione, '—', upper(v.esig_doc),
           v.fattore * coalesce(v.imponibile_totale, 0), v.fattore * coalesce(v.iva_totale, 0)
    FROM vend_doc v
    WHERE NOT (public.iva_ha_riepilogo(v.riepilogo_iva))
  ),
  acq_doc AS (
    -- Dalla stessa vista del Registro acquisti: periodo di detrazione, riepilogo
    -- (anche ricostruito dalle righe) e integrazioni con una regola sola.
    SELECT f.id, f.data_fattura, f.imponibile_totale,
           regexp_replace(upper(coalesce(f.cedente_piva, '')), '^IT', '') AS piva,
           f.integrazione,
           CASE WHEN (upper(coalesce(f.tipo_documento, '')) = 'TD04'
                      OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%')
                 AND coalesce(f.totale_documento, coalesce(f.imponibile_totale, 0) + coalesce(f.iva_totale, 0)) > 0
                THEN -1 ELSE 1 END AS fattore,
           f.iva_totale,
           f.riepilogo_iva AS riepilogo,
           f.aliquota_reverse_charge,
           (f.data_ricezione_sdi IS NULL AND f.ricezione_dichiarata_il IS NULL) AS senza_ricezione,
           (f.ricezione_origine = 'da_verificare') AS da_verificare
    FROM public.fatture_ricevute_periodo_iva f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura <= v_al
      AND f.data_fattura >= (v_dal - interval '13 months')::date
      AND f.data_detrazione BETWEEN v_dal AND v_al
      -- La copia ricevuta di un'integrazione emessa da EiC: c'è già tra le vendite (e il suo riflesso negli acquisti).
      AND NOT (f.integrazione AND EXISTS (
            SELECT 1 FROM public.fatture_vendite_iva v
             WHERE v.company_id = f.company_id AND v.deleted_at IS NULL
               AND v.tipo = ANY(v_tipi_integrazione)
               AND v.numero = f.numero_fattura AND v.data_emissione = f.data_fattura))
  ),
  acq_righe AS (
    SELECT a.id, a.integrazione,
           coalesce(nullif(r.value ->> 'aliquota', ''), nullif(r.value ->> 'aliquota_iva', ''), '—') AS aliquota,
           upper(coalesce(r.value ->> 'natura', '')) AS natura,
           a.fattore * coalesce(public.num_da_json(r.value ->> 'imponibile'), 0) AS imponibile,
           a.fattore * coalesce(public.num_da_json(r.value ->> 'imposta'), 0)    AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN public.iva_ha_riepilogo(a.riepilogo) THEN a.riepilogo ELSE '[]'::jsonb END) r
    WHERE public.iva_ha_riepilogo(a.riepilogo)
    UNION ALL
    SELECT a.id, a.integrazione, '—', '',
           a.fattore * coalesce(a.imponibile_totale, 0), a.fattore * coalesce(a.iva_totale, 0)
    FROM acq_doc a
    WHERE NOT (public.iva_ha_riepilogo(a.riepilogo))
  ),
  -- Reverse charge delle ricevute (N6.x) non ancora integrate: l'IVA, uguale nei due lati.
  -- Integrata = c'è una ricevuta-integrazione dello stesso fornitore con lo stesso imponibile.
  rc AS (
    SELECT public.iva_aliquota_testo(coalesce(a.aliquota_reverse_charge, 22)) AS aliquota,
           (a.aliquota_reverse_charge IS NULL) AS presunta,
           a.id,
           r.imponibile,
           round(r.imponibile * coalesce(a.aliquota_reverse_charge, 22) / 100, 2) AS imposta
    FROM acq_doc a
    JOIN acq_righe r ON r.id = a.id AND r.natura LIKE 'N6%'
    WHERE NOT a.integrazione
      AND NOT EXISTS (
        SELECT 1 FROM public.fatture_ricevute g
         WHERE g.company_id = p_company_id
           AND public.iva_ricevuta_e_integrazione(g.tipo_documento)
           AND regexp_replace(upper(coalesce(g.cedente_piva, '')), '^IT', '') = a.piva AND a.piva <> ''
           AND abs(abs(coalesce(g.imponibile_totale, 0)) - abs(coalesce(a.imponibile_totale, 0))) < 0.01
           AND g.data_fattura BETWEEN a.data_fattura AND a.data_fattura + 180)
  ),
  vend_tutte AS (
    SELECT aliquota, esigibilita, imponibile, imposta, 'documento' AS fonte FROM vend_righe
    UNION ALL
    -- Integrazioni e autofatture ricevute: la stessa IVA è anche a debito.
    SELECT aliquota, 'I', 0::numeric, imposta, 'integrazione_ricevuta' FROM acq_righe WHERE integrazione
    UNION ALL
    SELECT aliquota, 'I', 0::numeric, imposta, 'reverse_charge' FROM rc
  ),
  acq_tutte AS (
    SELECT aliquota, imponibile, imposta FROM acq_righe
    UNION ALL
    -- Il riflesso delle integrazioni emesse: stessa IVA delle vendite, nello stesso periodo.
    SELECT aliquota, 0::numeric, imposta FROM vend_righe WHERE integrazione
    UNION ALL
    SELECT aliquota, 0::numeric, imposta FROM rc
  ),
  tot AS (
    SELECT
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS iva_vendite,
      (SELECT coalesce(sum(imponibile) FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS imp_vendite,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'S'), 0) FROM vend_tutte) AS iva_split,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'D'), 0) FROM vend_tutte) AS iva_differita,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE fonte = 'integrazione_ricevuta'), 0) FROM vend_tutte) AS iva_integrazioni,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE fonte = 'reverse_charge'), 0) FROM vend_tutte) AS iva_rc,
      (SELECT coalesce(sum(imposta), 0)    FROM acq_tutte) AS iva_acquisti,
      (SELECT coalesce(sum(imponibile), 0) FROM acq_tutte) AS imp_acquisti,
      (SELECT count(*) FROM vend_doc) AS n_vendite,
      (SELECT count(*) FROM acq_doc) + (SELECT count(*) FROM vend_doc WHERE integrazione) AS n_acquisti,
      (SELECT count(*) FROM acq_doc WHERE senza_ricezione) AS n_senza_ricezione,
      (SELECT count(*) FROM acq_doc WHERE da_verificare) AS n_da_verificare,
      (SELECT count(*) FROM acq_doc WHERE integrazione) AS n_integrazioni,
      (SELECT count(DISTINCT id) FROM rc) AS n_rc,
      (SELECT count(DISTINCT id) FROM rc WHERE presunta) AS n_rc_presunta,
      (SELECT count(*) FROM acq_doc WHERE NOT (public.iva_ha_riepilogo(riepilogo))) AS n_acq_senza_riepilogo,
      (SELECT count(*) FROM vend_doc WHERE NOT (public.iva_ha_riepilogo(riepilogo_iva))) AS n_vend_senza_riepilogo
  ),
  aliquote AS (
    SELECT jsonb_agg(x ORDER BY x ->> 'lato', x ->> 'aliquota') AS righe FROM (
      SELECT jsonb_build_object('lato','vendite','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2)) AS x
      FROM vend_tutte GROUP BY aliquota
      UNION ALL
      SELECT jsonb_build_object('lato','acquisti','aliquota',aliquota,
               'imponibile', round(sum(imponibile), 2), 'imposta', round(sum(imposta), 2))
      FROM acq_tutte GROUP BY aliquota
    ) s
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'tipo', p_periodo, 'anno', p_anno, 'mese', p_mese, 'trimestre', p_trimestre,
      'dal', v_dal, 'al', v_al, 'etichetta', v_etichetta),
    'iva_vendite',        round(t.iva_vendite, 2),
    'iva_acquisti',       round(t.iva_acquisti, 2),
    'imponibile_vendite', round(t.imp_vendite, 2),
    'imponibile_acquisti',round(t.imp_acquisti, 2),
    'saldo',              round(t.iva_vendite - t.iva_acquisti, 2),
    'documenti', jsonb_build_object('vendite', t.n_vendite, 'acquisti', t.n_acquisti,
                                    'acquisti_senza_data_ricezione', t.n_senza_ricezione,
                                    'acquisti_ricezione_da_verificare', t.n_da_verificare,
                                    'integrazioni_ricevute', t.n_integrazioni,
                                    'reverse_charge', t.n_rc,
                                    'reverse_charge_aliquota_presunta', t.n_rc_presunta,
                                    'acquisti_senza_riepilogo', t.n_acq_senza_riepilogo,
                                    'vendite_senza_riepilogo', t.n_vend_senza_riepilogo),
    'escluso', jsonb_build_object(
      'split_payment', round(t.iva_split, 2),
      'nota', 'IVA in scissione dei pagamenti: la versa il committente'),
    'integrazioni', jsonb_build_object(
      'iva_integrazioni_ricevute', round(t.iva_integrazioni, 2),
      'iva_reverse_charge', round(t.iva_rc, 2),
      'nota', 'IVA di integrazioni, autofatture e reverse charge: a debito e a credito per lo stesso importo'),
    'esigibilita_differita', round(t.iva_differita, 2),
    'dettaglio_aliquote', coalesce(a.righe, '[]'::jsonb)
  ), to_jsonb(t)
  INTO v_out, v_doc
  FROM tot t CROSS JOIN aliquote a;

  IF (v_doc ->> 'n_vendite')::int = 0 AND (v_doc ->> 'n_acquisti')::int = 0 THEN
    RETURN v_out || jsonb_build_object(
      'calcolabile', false,
      'motivo', format(
        'Nessun documento fiscale nel periodo %s: non c''è nulla da liquidare e non è possibile confermare un saldo. Verifica che le fatture emesse e il cassetto SdI siano aggiornati.',
        v_etichetta)
    );
  END IF;

  RETURN v_out || jsonb_build_object(
    'calcolabile', true,
    'ipotesi', jsonb_build_array(
      'IVA sugli acquisti considerata interamente detraibile: la quota di indetraibilità non è tracciata a sistema',
      'Esigibilità differita (IVA per cassa) conteggiata alla data del documento, non a quella dell''incasso',
      'Acquisti nel periodo in cui sono stati ricevuti dallo SDI (o nel mese della fattura se ricevuti entro il 15 del mese dopo). '
        || CASE WHEN (v_doc ->> 'n_senza_ricezione')::int > 0
             THEN (v_doc ->> 'n_senza_ricezione') || ' senza data di ricezione (importati da gestionali o caricati a mano): collocati alla data della fattura'
                  || CASE WHEN (v_doc ->> 'n_da_verificare')::int > 0
                       THEN ', di cui ' || (v_doc ->> 'n_da_verificare') || ' di fine dicembre da verificare: se arrivati a gennaio vanno nell''anno dopo'
                       ELSE '' END
             ELSE 'Tutti con data di ricezione (dallo SDI o dichiarata)' END
    )
    || CASE WHEN (v_doc ->> 'n_rc_presunta')::int > 0 THEN jsonb_build_array(
         (v_doc ->> 'n_rc_presunta') || ' fatture in reverse charge senza aliquota di integrazione: calcolate al 22%. Il saldo non cambia (stessa IVA a debito e a credito), cambiano i righi dell''IVA esigibile e detratta')
       ELSE '[]'::jsonb END
    || CASE WHEN (v_doc ->> 'n_acq_senza_riepilogo')::int + (v_doc ->> 'n_vend_senza_riepilogo')::int > 0 THEN jsonb_build_array(
         ((v_doc ->> 'n_acq_senza_riepilogo')::int + (v_doc ->> 'n_vend_senza_riepilogo')::int) || ' documenti senza dettaglio per aliquota (righe assenti o che non tornano col totale): contati sul totale IVA')
       ELSE '[]'::jsonb END
  );
END;
$function$;

drop function if exists public.iva_riepilogo_ricevuta(jsonb, jsonb, numeric, numeric);
drop function if exists public.iva_riepilogo_da_righe(jsonb, numeric, numeric);
drop function if exists public.iva_riepilogo_da_invoice_lines(uuid, numeric, numeric);
drop function if exists public.iva_riepilogo_chiudi(jsonb, numeric, numeric);
