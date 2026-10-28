-- Mantiene integralmente controlli, gestione NC, SAL/importi e privilegi della
-- funzione esistente. Cambia SOLO la risoluzione dell'anagrafica del fornitore.
-- Nessuna contabilizzazione o modifica di costi eseguita dalla migrazione.
set local lock_timeout='3s';
set local statement_timeout='60s';
do $migration$
declare definition text; old_lookup text; new_lookup text; a integer; b integer;
begin
  definition:=pg_get_functiondef('public.contabilizza_fattura_ricevuta(uuid)'::regprocedure);
  a:=strpos(definition,'  select s.id into v_supplier_id');
  b:=strpos(definition,'  if f.purchase_order_id is not null then');
  if a=0 or b<=a then raise exception 'La contabilizzazione è cambiata: occorre una revisione prima di integrare il collegamento';end if;
  old_lookup:=substr(definition,a,b-a);
  if length(old_lookup)>650 or old_lookup not like '%regexp_replace%' or old_lookup not like '%limit 1;%' then raise exception 'Risoluzione fornitore diversa dalla versione verificata';end if;
  new_lookup:=$lookup$  if f.fornitore_id is not null then
    select s.id into v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and s.id=f.fornitore_id
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    if not found then raise exception 'Il fornitore confermato non è più coerente con la fattura: verifica il collegamento';end if;
  else
    begin
      select s.id into strict v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and
        ((public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)=public.partner_tax_key(f.cedente_piva))
        or(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)=public.partner_tax_key(f.cedente_cf)))
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    exception when no_data_found then v_supplier_id:=null;
      when too_many_rows then raise exception 'Più fornitori hanno gli stessi identificativi: conferma il collegamento prima di contabilizzare';
    end;
  end if;

$lookup$;
  definition:=replace(definition,old_lookup,new_lookup);
  execute definition;
end $migration$;
