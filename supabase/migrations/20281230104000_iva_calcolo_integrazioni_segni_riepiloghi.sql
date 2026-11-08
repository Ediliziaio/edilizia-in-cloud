-- Liquidazione IVA: quattro difetti del calcolo trovati il 07/11/2026 sui dati
-- veri di produzione (docs/piano-liquidazione-iva-lipe-f24.md, «Avanzamento»).
--
-- 1. Integrazioni e autofatture ricevute (TD16, TD17, TD18, TD19 dallo SDI;
--    «self_invoice» da Fatture in Cloud): la loro IVA entrava solo negli
--    acquisti, a credito. È anche IVA a debito: chi integra la fattura del
--    fornitore la deve e la detrae. Senza il debito il saldo da versare era più
--    basso del vero: nel 2026 Best Infissi 57.366,90 €, Renova 14.044,82 €,
--    Vulcano 10.612,30 €, Bonarrigo 3.221,61 €.
--    Una ricevuta-integrazione che è la copia di un'integrazione emessa da EiC
--    (stesso numero e data tra le vendite) non si conta due volte.
-- 2. Righe negative dentro una fattura (sconti, acconti scalati): il calcolo le
--    prendeva in valore assoluto e le sommava come positive. IVA a credito
--    gonfiata nel 2026 di 2.709,30 € per Vulcano e 646,80 € per Bonarrigo.
--    Ora la riga tiene il suo segno; la nota di credito salvata in positivo si
--    inverte, quella già salvata in negativo resta com'è.
-- 3. Riepilogo per aliquota mancante: le emesse importate (1.239 nel 2026) e le
--    ricevute da Fatture in Cloud (3.375) non lo avevano. Si ricostruisce dalle
--    righe del documento, solo quando le righe tornano con i totali (al
--    centesimo, tolleranza 5 centesimi). Altrimenti resta il totale, con
--    l'aliquota «da verificare». Nessun dato viene riscritto: lo fanno le viste.
-- 4. Reverse charge delle ricevute (N6.x) senza aliquota di integrazione: resta
--    il 22% come ipotesi, ma ora il prospetto dice quante sono. Il saldo non
--    cambia (debito e credito uguali), cambiano i righi VP4 e VP5 della LIPE.
--    L'imponibile del reverse charge non entra più tra le operazioni attive:
--    l'integrazione non è una vendita.
--
-- Prima di applicare, i numeri sopra si rifanno con le query in fondo al file.

set local lock_timeout = '3s';

-- C'è un riepilogo IVA utilizzabile? Mai null: con un riepilogo NULL,
-- «NOT (jsonb_typeof(x) = 'array' AND …)» è NULL e il documento spariva dal
-- conto invece di passare al totale (trovato dalle simulazioni, mai applicato).
create or replace function public.iva_ha_riepilogo(p jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0, false);
$$;

-- Aliquota come testo, senza zeri inutili: 10.00 → «10», 0.00 → «0», 5.50 → «5.5».
create or replace function public.iva_aliquota_testo(p numeric)
returns text language sql immutable set search_path = public as $$
  select case when p is null then null else trim_scale(p)::text end;
$$;

-- Riepilogo IVA dalle righe di una ricevuta (formato di Fatture in Cloud:
-- aliquota_iva, imponibile, imposta, natura facoltativa). Null se le righe non
-- tornano con i totali del documento: meglio il totale con l'aliquota da
-- verificare che un dettaglio sbagliato.
create or replace function public.iva_riepilogo_da_righe(p_righe jsonb, p_imponibile numeric, p_iva numeric)
returns jsonb language sql immutable set search_path = public as $$
  with r as (
    -- num_da_json dà 0 a un valore assente: l'aliquota mancante deve restare nulla, non 0%.
    select case when btrim(x ->> 'aliquota_iva') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(x ->> 'aliquota_iva')::numeric end as aliquota,
           nullif(coalesce(x ->> 'natura', x ->> 'natura_iva'), '') as natura,
           coalesce(public.num_da_json(x ->> 'imponibile'), 0) as imponibile,
           coalesce(public.num_da_json(x ->> 'imposta'), 0) as imposta
      from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) x
  ), ok as (
    select count(*) > 0
           and bool_and(aliquota is not null)
           and abs(sum(imponibile) - coalesce(p_imponibile, 0)) < 0.05
           and abs(sum(imposta) - coalesce(p_iva, 0)) < 0.05 as torna
      from r
  )
  -- Vale il totale del documento: il resto degli arrotondamenti delle righe
  -- (al più 5 centesimi) va sull'aliquota con più IVA, così il riepilogo somma
  -- esattamente al totale.
  , g as (
    select aliquota, natura, sum(imponibile) imponibile, sum(imposta) imposta,
           row_number() over (order by abs(sum(imposta)) desc, abs(sum(imponibile)) desc, aliquota, natura) as n
      from r group by aliquota, natura
  ), resto as (
    select coalesce(p_imponibile, 0) - sum(imponibile) as imponibile, coalesce(p_iva, 0) - sum(imposta) as imposta from g
  )
  select case when (select torna from ok) then (
    select jsonb_agg(jsonb_build_object(
             'aliquota', public.iva_aliquota_testo(g.aliquota),
             'natura', g.natura,
             'imponibile', round(g.imponibile + case when g.n = 1 then resto.imponibile else 0 end, 2),
             'imposta', round(g.imposta + case when g.n = 1 then resto.imposta else 0 end, 2),
             'fonte', 'righe') order by g.aliquota, g.natura)
      from g cross join resto)
  end;
$$;

-- Lo stesso per le righe delle emesse importate (tabella invoice_lines).
create or replace function public.iva_riepilogo_da_invoice_lines(p_invoice uuid, p_imponibile numeric, p_iva numeric)
returns jsonb language sql stable set search_path = public as $$
  with r as (
    select l.tax_rate as aliquota, nullif(l.tax_nature, '') as natura,
           coalesce(l.line_net, 0) as imponibile, coalesce(l.line_tax, 0) as imposta
      from public.invoice_lines l where l.invoice_id = p_invoice
  ), ok as (
    select count(*) > 0
           and bool_and(aliquota is not null)
           and abs(sum(imponibile) - coalesce(p_imponibile, 0)) < 0.05
           and abs(sum(imposta) - coalesce(p_iva, 0)) < 0.05 as torna
      from r
  )
  -- Vale il totale del documento: il resto degli arrotondamenti delle righe
  -- (al più 5 centesimi) va sull'aliquota con più IVA, così il riepilogo somma
  -- esattamente al totale.
  , g as (
    select aliquota, natura, sum(imponibile) imponibile, sum(imposta) imposta,
           row_number() over (order by abs(sum(imposta)) desc, abs(sum(imponibile)) desc, aliquota, natura) as n
      from r group by aliquota, natura
  ), resto as (
    select coalesce(p_imponibile, 0) - sum(imponibile) as imponibile, coalesce(p_iva, 0) - sum(imposta) as imposta from g
  )
  select case when (select torna from ok) then (
    select jsonb_agg(jsonb_build_object(
             'aliquota', public.iva_aliquota_testo(g.aliquota),
             'natura', g.natura,
             'imponibile', round(g.imponibile + case when g.n = 1 then resto.imponibile else 0 end, 2),
             'imposta', round(g.imposta + case when g.n = 1 then resto.imposta else 0 end, 2),
             'fonte', 'righe') order by g.aliquota, g.natura)
      from g cross join resto)
  end;
$$;

-- Una ricevuta che è un'integrazione o un'autofattura: la sua IVA è a debito e a credito.
create or replace function public.iva_ricevuta_e_integrazione(p_tipo text)
returns boolean language sql immutable set search_path = public as $$
  select upper(coalesce(p_tipo, '')) in ('TD16', 'TD17', 'TD18', 'TD19', 'SELF_INVOICE');
$$;

-- Il riepilogo che vale: quello del documento se c'è, altrimenti dalle righe.
create or replace function public.iva_riepilogo_ricevuta(p_riepilogo jsonb, p_righe jsonb, p_imponibile numeric, p_iva numeric)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when public.iva_ha_riepilogo(p_riepilogo) then p_riepilogo
    else public.iva_riepilogo_da_righe(p_righe, p_imponibile, p_iva)
  end;
$$;

revoke all on function public.iva_ha_riepilogo(jsonb), public.iva_aliquota_testo(numeric), public.iva_riepilogo_da_righe(jsonb, numeric, numeric),
  public.iva_riepilogo_da_invoice_lines(uuid, numeric, numeric), public.iva_ricevuta_e_integrazione(text),
  public.iva_riepilogo_ricevuta(jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function public.iva_ha_riepilogo(jsonb), public.iva_aliquota_testo(numeric), public.iva_riepilogo_da_righe(jsonb, numeric, numeric),
  public.iva_riepilogo_da_invoice_lines(uuid, numeric, numeric), public.iva_ricevuta_e_integrazione(text),
  public.iva_riepilogo_ricevuta(jsonb, jsonb, numeric, numeric) to authenticated, service_role;

-- Vista delle vendite: invariata salvo il riepilogo delle importate.
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
        ELSE public.iva_riepilogo_da_invoice_lines(i.id, i.subtotal, i.tax_amount)
    END AS riepilogo_iva,
    'I'::text AS esigibilita_iva,
    i.status AS stato,
    i.deleted_at
   FROM invoices i
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

-- Vista degli acquisti: riepilogo dalle righe se manca, e due colonne in fondo.
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
    public.iva_riepilogo_ricevuta(f.riepilogo_iva, f.righe, f.imponibile_totale, f.iva_totale) as riepilogo_iva,
    f.stato,
    f.aliquota_reverse_charge,
    f.ricezione_dichiarata_il,
    public.ricezione_iva_origine(f.data_fattura, f.data_ricezione_sdi, f.ricezione_dichiarata_il) as ricezione_origine,
    public.iva_ricevuta_e_integrazione(f.tipo_documento) as integrazione,
    f.cedente_piva
  from public.fatture_ricevute f;

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
    -- Nel periodo per data di detrazione (data_detrazione_iva), non per data
    -- della fattura. La data della fattura precede sempre quella di detrazione:
    -- il primo filtro serve solo a non calcolare la regola su tutto l'archivio.
    SELECT f.id, f.data_fattura, f.imponibile_totale,
           regexp_replace(upper(coalesce(f.cedente_piva, '')), '^IT', '') AS piva,
           public.iva_ricevuta_e_integrazione(f.tipo_documento) AS integrazione,
           CASE WHEN (upper(coalesce(f.tipo_documento, '')) = 'TD04'
                      OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%')
                 AND coalesce(f.totale_documento, coalesce(f.imponibile_totale, 0) + coalesce(f.iva_totale, 0)) > 0
                THEN -1 ELSE 1 END AS fattore,
           f.iva_totale,
           public.iva_riepilogo_ricevuta(f.riepilogo_iva, f.righe, f.imponibile_totale, f.iva_totale) AS riepilogo,
           f.aliquota_reverse_charge,
           (f.data_ricezione_sdi IS NULL AND f.ricezione_dichiarata_il IS NULL) AS senza_ricezione,
           (public.ricezione_iva_origine(f.data_fattura, f.data_ricezione_sdi, f.ricezione_dichiarata_il) = 'da_verificare') AS da_verificare
    FROM public.fatture_ricevute f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura <= v_al
      AND f.data_fattura >= (v_dal - interval '13 months')::date
      AND public.data_detrazione_iva(f.data_fattura, public.ricezione_iva_il(f.data_ricezione_sdi, f.ricezione_dichiarata_il)) BETWEEN v_dal AND v_al
      -- La copia ricevuta di un'integrazione emessa da EiC: c'è già tra le vendite (e il suo riflesso negli acquisti).
      AND NOT (public.iva_ricevuta_e_integrazione(f.tipo_documento) AND EXISTS (
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

-- Verifica, da rifare a mano prima e dopo:
--   select c.name, f.tipo_documento, count(*), sum(f.iva_totale) from fatture_ricevute f join companies c on c.id=f.company_id
--    where f.data_fattura >= '2026-01-01' and public.iva_ricevuta_e_integrazione(f.tipo_documento) group by 1,2;
