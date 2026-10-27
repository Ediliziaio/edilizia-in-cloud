-- ITALA: original tax breakdown and atomic issued-invoice import.
set local lock_timeout = '3s';
alter table public.invoices add column if not exists external_tax_summary jsonb not null default '[]'::jsonb;
alter table public.invoices add column if not exists external_document_type text;
-- A shared original/SdI envelope can contain several bodies. Defaults preserve old imports.
alter table public.fatture_ricevute add column if not exists indice_corpo integer not null default 0 check (indice_corpo >= 0);
create unique index if not exists fatture_ricevute_sdi_corpo_unique on public.fatture_ricevute(company_id,sdi_id_trasmissione,indice_corpo) where sdi_id_trasmissione is not null;
create unique index if not exists fatture_ricevute_impronta_corpo_unique on public.fatture_ricevute(company_id,xml_sha256,indice_corpo) where xml_sha256 is not null;
drop index if exists public.idx_fatture_ricevute_sdi_unique;
drop index if exists public.ux_fatture_ricevute_impronta;
create unique index if not exists invoices_itala_external_unique on public.invoices(company_id,external_id) where external_provider='itala';

create or replace function public.billing_import_itala_issued(p_company_id uuid,p_external_id text,p_document jsonb,p_lines jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.invoices%rowtype; old public.invoices%rowtype; other public.invoices%rowtype; existing boolean; saved uuid; native_id uuid; fiscal_month date;
begin
  if p_company_id is null or coalesce(p_external_id,'') !~ '^[0-9]+(_[0-9]+)?$' or jsonb_typeof(p_document) is distinct from 'object' or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Documento ITALA incompleto'; end if;
  r:=jsonb_populate_record(null::public.invoices,p_document);
  if r.invoice_number is null or r.issue_date is null or r.total is null or coalesce(r.document_type,'') not in ('invoice','credit_note','TD16','TD17','TD18','TD19','TD20','TD21','TD22','TD23','TD26','TD27','TD28','TD29') then raise exception 'Dati fiscali incompleti'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||'|itala|'||p_external_id,0));
  select * into old from public.invoices where company_id=p_company_id and external_provider='itala' and external_id=p_external_id for update;
  existing:=found;
  if existing and old.deleted_at is not null then raise exception 'Fattura nel cestino: ripristinala prima di importare'; end if;
  if not existing then
    select * into other from public.invoices where company_id=p_company_id and invoice_number=r.invoice_number and issue_date=r.issue_date and document_type=r.document_type and external_provider is distinct from 'itala' limit 1;
    if found then
      if other.deleted_at is null and other.document_type=r.document_type and abs(other.total-r.total)<0.005 and abs(other.subtotal-r.subtotal)<0.005 and abs(other.tax_amount-r.tax_amount)<0.005 and coalesce(other.client_vat_number,'')=coalesce(r.client_vat_number,'') and coalesce(other.client_fiscal_code,'')=coalesce(r.client_fiscal_code,'') and (coalesce(r.client_vat_number,'')<>'' or coalesce(r.client_fiscal_code,'')<>'') then return jsonb_build_object('id',other.id,'duplicate',true); end if;
      raise exception 'Stesso numero e data già presenti con dati differenti: nessuna copia creata';
    end if;
    select d.id into native_id from public.documenti_fiscali d where d.company_id=p_company_id and d.numero=r.invoice_number and d.data_emissione=r.issue_date and d.deleted_at is null and d.stato not in ('bozza','annullata') and abs(d.imponibile_totale-r.subtotal)<0.005 and abs(d.iva_totale-r.tax_amount)<0.005 and abs(d.totale_documento-r.total)<0.005 and (d.tipo='nota_credito')=(r.document_type='credit_note') and coalesce(d.cliente_snapshot->>'partita_iva','')=coalesce(r.client_vat_number,'') and coalesce(d.cliente_snapshot->>'codice_fiscale','')=coalesce(r.client_fiscal_code,'') and (coalesce(r.client_vat_number,'')<>'' or coalesce(r.client_fiscal_code,'')<>'') limit 1;
    if found then return jsonb_build_object('id',native_id,'duplicate',true); end if;
  end if;
  if not existing or (old.issue_date,old.subtotal,old.tax_amount,old.total,old.document_type,old.external_tax_summary,old.status in ('draft','cancelled','canceled','void','deleted')) is distinct from (r.issue_date,r.subtotal,r.tax_amount,r.total,r.document_type,r.external_tax_summary,r.status in ('draft','cancelled','canceled','void','deleted')) then
    for fiscal_month in select distinct date_trunc('month',x)::date from unnest(array[r.issue_date,old.issue_date]) x where x is not null order by 1 loop
      perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||p_company_id||':'||fiscal_month,0));
      if exists(select 1 from public.fiscalita_periodi where company_id=p_company_id and mese=fiscal_month and stato='chiuso') then raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata'; end if;
    end loop;
  end if;
  if not existing then
    insert into public.invoices(company_id,external_provider,external_id,invoice_number,issue_date,document_type,status,client_company_name,subtotal,tax_amount,total,paid_amount)
      values(p_company_id,'itala',p_external_id,r.invoice_number,r.issue_date,r.document_type,r.status,r.client_company_name,r.subtotal,r.tax_amount,r.total,0) returning id into saved;
  else saved:=old.id; end if;
  delete from public.invoice_lines where invoice_id=saved;
  insert into public.invoice_lines(invoice_id,description,product_code,unit,quantity,unit_price,discount_percent,tax_rate,tax_nature,line_net,line_tax,line_gross,sort_order)
    select saved,l.description,l.product_code,coalesce(l.unit,'pz'),l.quantity,l.unit_price,coalesce(l.discount_percent,0),l.tax_rate,l.tax_nature,l.line_net,l.line_tax,l.line_gross,l.sort_order
    from jsonb_to_recordset(p_lines) as l(description text,product_code text,unit text,quantity numeric,unit_price numeric,discount_percent numeric,tax_rate numeric,tax_nature text,line_net numeric,line_tax numeric,line_gross numeric,sort_order integer);
  update public.invoices set invoice_number=r.invoice_number,document_type=r.document_type,
    status=case when existing and old.status in ('paid','partially_paid','credited') then old.status else r.status end,
    issue_date=r.issue_date,due_date=r.due_date,client_company_name=r.client_company_name,client_vat_number=r.client_vat_number,client_fiscal_code=r.client_fiscal_code,
    client_address=r.client_address,client_city=r.client_city,client_zip=r.client_zip,client_country=r.client_country,client_pec=r.client_pec,client_sdi_code=r.client_sdi_code,
    subtotal=r.subtotal,tax_amount=r.tax_amount,total=r.total,payment_method=r.payment_method,bank_iban=r.bank_iban,
    external_status=r.external_status,external_sdi_id=r.external_sdi_id,external_xml_url=r.external_xml_url,external_document_type=r.external_document_type,external_tax_summary=r.external_tax_summary,
    last_synced_at=now(),updated_at=now() where id=saved;
  return jsonb_build_object('id',saved,'updated',existing);
end $$;
revoke all on function public.billing_import_itala_issued(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.billing_import_itala_issued(uuid,text,jsonb,jsonb) to service_role;

-- A single RLS-respecting source for native and imported VAT sales.
create or replace view public.fatture_vendite_iva with (security_invoker=true) as
select d.id,d.company_id,'nativa'::text as origine,d.tipo,d.numero,d.data_emissione,d.anno,d.cliente_snapshot,d.imponibile_totale,d.iva_totale,d.totale_documento,d.riepilogo_iva,d.esigibilita_iva,d.stato,d.deleted_at
from public.documenti_fiscali d
union all
select i.id,i.company_id,'importata'::text,
  case when i.document_type in ('credit_note','TD04','TD08') then 'nota_credito' when i.document_type='TD16' then 'reverse_charge_interno' when i.document_type='TD17' then 'integrazione_servizi_estero' when i.document_type='TD18' then 'integrazione_beni_ue' when i.document_type='TD19' then 'integrazione_beni_extra_ue' else 'fattura' end,
  i.invoice_number,i.issue_date,extract(year from i.issue_date)::integer,
  jsonb_build_object('ragione_sociale',i.client_company_name,'partita_iva',i.client_vat_number,'codice_fiscale',i.client_fiscal_code),
  i.subtotal,i.tax_amount,i.total,i.external_tax_summary,'I'::text,i.status,i.deleted_at
from public.invoices i where i.external_provider is not null and i.document_type in ('invoice','credit_note','TD01','TD02','TD03','TD04','TD05','TD06','TD08','TD24','TD25','TD16','TD17','TD18','TD19')
  and i.status not in ('draft','cancelled','canceled','void','deleted')
  and coalesce(i.external_status,'') not in ('ERRO','PREN')
  and not exists(select 1 from public.documenti_fiscali d where d.company_id=i.company_id and d.deleted_at is null and d.stato not in ('bozza','annullata')
    and d.numero=i.invoice_number and d.data_emissione=i.issue_date and (d.tipo='nota_credito')=(i.document_type in ('credit_note','TD04','TD08'))
    and coalesce(d.cliente_snapshot->>'partita_iva','')=coalesce(i.client_vat_number,'') and coalesce(d.cliente_snapshot->>'codice_fiscale','')=coalesce(i.client_fiscal_code,'') and (coalesce(i.client_vat_number,'')<>'' or coalesce(i.client_fiscal_code,'')<>'')
    and abs(d.imponibile_totale-i.subtotal)<0.005 and abs(d.iva_totale-i.tax_amount)<0.005 and abs(d.totale_documento-i.total)<0.005);
grant select on public.fatture_vendite_iva to authenticated,service_role;
revoke all on public.fatture_vendite_iva from anon;

-- Preserve the existing calculation and company access gate; include imported sales.
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
  -- Le integrazioni: la loro IVA è anche detraibile, quindi entrano pure negli acquisti.
  v_tipi_integrazione text[] := ARRAY[
    'reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  v_dal        date;
  v_al         date;
  v_etichetta  text;
  v_mesi       text[] := ARRAY['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  v_out        jsonb;
  v_n_vendite  int;
  v_n_acquisti int;
  v_senza_ricezione int;
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
    SELECT d.id,
           (d.tipo = 'nota_credito') AS nota_credito,
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
    SELECT v.id, v.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           upper(coalesce(nullif(r.value ->> 'esigibilita', ''), v.esig_doc)) AS esigibilita,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM vend_doc v
    CROSS JOIN LATERAL jsonb_array_elements(v.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT v.id, v.nota_credito, '—', upper(v.esig_doc),
           abs(coalesce(v.imponibile_totale, 0)), abs(coalesce(v.iva_totale, 0))
    FROM vend_doc v
    WHERE jsonb_array_length(coalesce(v.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  vend_segno AS (
    SELECT aliquota, esigibilita,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM vend_righe
  ),
  acq_doc AS (
    -- Nel periodo per data di detrazione (data_detrazione_iva), non per data
    -- della fattura. La data della fattura precede sempre quella di detrazione:
    -- il primo filtro serve solo a non calcolare la regola su tutto l'archivio.
    SELECT f.id,
           (upper(coalesce(f.tipo_documento, '')) = 'TD04'
            OR upper(coalesce(f.tipo_documento, '')) LIKE '%CREDIT%') AS nota_credito,
           f.imponibile_totale, f.iva_totale, f.riepilogo_iva,
           coalesce(f.aliquota_reverse_charge, 22) AS aliquota_rc,
           (f.data_ricezione_sdi IS NULL) AS senza_ricezione
    FROM public.fatture_ricevute f
    WHERE f.company_id = p_company_id
      AND f.stato IN ('non_letta', 'letta', 'contabilizzata')
      AND f.data_fattura <= v_al
      AND f.data_fattura >= (v_dal - interval '13 months')::date
      AND public.data_detrazione_iva(f.data_fattura, f.data_ricezione_sdi) BETWEEN v_dal AND v_al
  ),
  acq_righe AS (
    SELECT a.id, a.nota_credito,
           coalesce(nullif(r.value ->> 'aliquota', ''), '—') AS aliquota,
           abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           abs(public.num_da_json(r.value ->> 'imposta'))    AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(a.riepilogo_iva) r
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) > 0
    UNION ALL
    SELECT a.id, a.nota_credito, '—',
           abs(coalesce(a.imponibile_totale, 0)), abs(coalesce(a.iva_totale, 0))
    FROM acq_doc a
    WHERE jsonb_array_length(coalesce(a.riepilogo_iva, '[]'::jsonb)) = 0
  ),
  acq_segno AS (
    SELECT aliquota,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imponibile AS imponibile,
           CASE WHEN nota_credito THEN -1 ELSE 1 END * imposta    AS imposta
    FROM acq_righe
    UNION ALL
    -- Il riflesso delle integrazioni: stessa IVA delle vendite, nello stesso periodo.
    SELECT r.aliquota, r.imponibile, r.imposta
    FROM vend_righe r
    JOIN public.fatture_vendite_iva d ON d.id = r.id
    WHERE d.tipo = ANY(v_tipi_integrazione)
  ),
  -- Reverse charge delle ricevute (N6.x): l'IVA integrata, uguale nei due lati.
  rc AS (
    SELECT rtrim(rtrim(a.aliquota_rc::text, '0'), '.') AS aliquota,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END * abs(public.num_da_json(r.value ->> 'imponibile')) AS imponibile,
           CASE WHEN a.nota_credito THEN -1 ELSE 1 END
             * round(abs(public.num_da_json(r.value ->> 'imponibile')) * a.aliquota_rc / 100, 2) AS imposta
    FROM acq_doc a
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(a.riepilogo_iva, '[]'::jsonb)) r
    WHERE upper(coalesce(r.value ->> 'natura', '')) LIKE 'N6%'
  ),
  vend_tutte AS (
    SELECT aliquota, esigibilita, imponibile, imposta FROM vend_segno
    UNION ALL
    SELECT aliquota, 'I', imponibile, imposta FROM rc
  ),
  acq_tutte AS (
    SELECT aliquota, imponibile, imposta FROM acq_segno
    UNION ALL
    SELECT aliquota, 0::numeric, imposta FROM rc
  ),
  tot AS (
    SELECT
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS iva_vendite,
      (SELECT coalesce(sum(imponibile) FILTER (WHERE esigibilita <> 'S'), 0) FROM vend_tutte) AS imp_vendite,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'S'), 0) FROM vend_tutte) AS iva_split,
      (SELECT coalesce(sum(imposta)    FILTER (WHERE esigibilita =  'D'), 0) FROM vend_tutte) AS iva_differita,
      (SELECT coalesce(sum(imposta), 0)    FROM acq_tutte) AS iva_acquisti,
      (SELECT coalesce(sum(imponibile), 0) FROM acq_tutte) AS imp_acquisti,
      (SELECT count(*) FROM vend_doc) AS n_vendite,
      (SELECT count(*) FROM acq_doc)
        + (SELECT count(*) FROM vend_doc v JOIN public.fatture_vendite_iva d ON d.id = v.id
           WHERE d.tipo = ANY(v_tipi_integrazione)) AS n_acquisti,
      (SELECT count(*) FROM acq_doc WHERE senza_ricezione) AS n_senza_ricezione
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
                                    'acquisti_senza_data_ricezione', t.n_senza_ricezione),
    'escluso', jsonb_build_object(
      'split_payment', round(t.iva_split, 2),
      'nota', 'IVA in scissione dei pagamenti: la versa il committente'),
    'esigibilita_differita', round(t.iva_differita, 2),
    'dettaglio_aliquote', coalesce(a.righe, '[]'::jsonb)
  ), t.n_vendite, t.n_acquisti, t.n_senza_ricezione
  INTO v_out, v_n_vendite, v_n_acquisti, v_senza_ricezione
  FROM tot t CROSS JOIN aliquote a;

  IF v_n_vendite = 0 AND v_n_acquisti = 0 THEN
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
        || CASE WHEN v_senza_ricezione > 0
             THEN v_senza_ricezione || ' senza data di ricezione (caricati a mano o dai gestionali): collocati alla data della fattura'
             ELSE 'Tutti con data di ricezione' END
    )
  );
END;
$function$;
