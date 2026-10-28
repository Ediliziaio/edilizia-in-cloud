-- A proforma or delivery note cannot hide a fiscal invoice. Conflicting fiscal numbers require review.
set local lock_timeout='3s';
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
    select d.id into native_id from public.documenti_fiscali d where d.company_id=p_company_id and d.numero=r.invoice_number and d.data_emissione=r.issue_date and d.deleted_at is null and d.stato not in ('bozza','annullata') and abs(d.imponibile_totale-r.subtotal)<0.005 and abs(d.iva_totale-r.tax_amount)<0.005 and abs(d.totale_documento-r.total)<0.005 and d.tipo=any(case when r.document_type in ('credit_note','TD04','TD08') then array['nota_credito'] when r.document_type='TD16' then array['reverse_charge_interno'] when r.document_type='TD17' then array['integrazione_servizi_estero'] when r.document_type='TD18' then array['integrazione_beni_ue'] when r.document_type='TD19' then array['integrazione_beni_extra_ue'] when r.external_document_type='TD05' or r.document_type in ('debit_note','TD05') then array['nota_debito'] else array['fattura','fattura_pa','fattura_riepilogativa','parcella','fattura_accompagnatoria'] end) and ((nullif(r.client_vat_number,'') is not null and regexp_replace(upper(btrim(coalesce(d.cliente_snapshot->>'partita_iva',''))),'^IT','')=regexp_replace(upper(btrim(r.client_vat_number)),'^IT','')) or (nullif(r.client_vat_number,'') is null and nullif(r.client_fiscal_code,'') is not null and upper(btrim(d.cliente_snapshot->>'codice_fiscale'))=upper(btrim(r.client_fiscal_code)))) limit 1;
    if found then return jsonb_build_object('id',native_id,'duplicate',true); end if;
    if exists(select 1 from public.documenti_fiscali d where d.company_id=p_company_id and d.numero=r.invoice_number and d.data_emissione=r.issue_date and d.deleted_at is null and d.stato not in ('bozza','annullata') and d.tipo=any(case when r.document_type in ('credit_note','TD04','TD08') then array['nota_credito'] when r.document_type='TD16' then array['reverse_charge_interno'] when r.document_type='TD17' then array['integrazione_servizi_estero'] when r.document_type='TD18' then array['integrazione_beni_ue'] when r.document_type='TD19' then array['integrazione_beni_extra_ue'] when r.external_document_type='TD05' or r.document_type in ('debit_note','TD05') then array['nota_debito'] else array['fattura','fattura_pa','fattura_riepilogativa','parcella','fattura_accompagnatoria'] end)) then raise exception 'Documento nativo con stesso numero e data ma dati diversi: verifica prima di importare'; end if;
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
    and d.numero=i.invoice_number and d.data_emissione=i.issue_date and d.tipo=any(case when i.document_type in ('credit_note','TD04','TD08') then array['nota_credito'] when i.document_type='TD16' then array['reverse_charge_interno'] when i.document_type='TD17' then array['integrazione_servizi_estero'] when i.document_type='TD18' then array['integrazione_beni_ue'] when i.document_type='TD19' then array['integrazione_beni_extra_ue'] when i.external_document_type='TD05' or i.document_type in ('debit_note','TD05') then array['nota_debito'] else array['fattura','fattura_pa','fattura_riepilogativa','parcella','fattura_accompagnatoria'] end)
    and ((nullif(i.client_vat_number,'') is not null and regexp_replace(upper(btrim(coalesce(d.cliente_snapshot->>'partita_iva',''))),'^IT','')=regexp_replace(upper(btrim(i.client_vat_number)),'^IT','')) or (nullif(i.client_vat_number,'') is null and nullif(i.client_fiscal_code,'') is not null and upper(btrim(d.cliente_snapshot->>'codice_fiscale'))=upper(btrim(i.client_fiscal_code))))
    and abs(d.imponibile_totale-i.subtotal)<0.005 and abs(d.iva_totale-i.tax_amount)<0.005 and abs(d.totale_documento-i.total)<0.005);
grant select on public.fatture_vendite_iva to authenticated,service_role;
revoke all on public.fatture_vendite_iva from anon;
