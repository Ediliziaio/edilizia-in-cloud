-- Il computo, la testata e il piano pagamenti devono arrivare insieme alla commessa.
create or replace function public.prepara_commessa_computo_atomic(
  p_azienda uuid, p_computo uuid, p_testata jsonb, p_righe jsonb
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  attore uuid := auth.uid();
  fonte text := 'modulo:computo:' || p_computo::text;
  testata public.quotes;
  attuale public.quotes;
  salva_costi boolean;
begin
  if attore is null or public.utente_bloccato()
    or not coalesce(public.user_can_access_company(p_azienda), false)
    or not coalesce(public.has_permission_for_company(attore, 'can_edit_preventivi', p_azienda), false)
    or public.utente_sola_lettura(p_azienda) then
    raise exception 'Non hai il permesso di preparare questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_testata) is distinct from 'object'
    or jsonb_typeof(p_righe) is distinct from 'array'
    or jsonb_array_length(p_righe) not between 1 and 5000 then
    raise exception 'Allega almeno una lavorazione valida.' using errcode = '22023';
  end if;

  -- Bloccare la bozza anche al primo invio impedisce di creare due preventivi collegati.
  perform 1 from public.computo_preventivo_drafts d
    where d.company_id = p_azienda and d.id = p_computo for update;
  if not found then
    raise exception 'Computo non trovato o non modificabile.' using errcode = '42501';
  end if;

  select q.* into attuale from public.quotes q
   where q.company_id = p_azienda and q.source = fonte and q.deleted_at is null
   order by q.created_at, q.id limit 1 for update;
  if attuale.id is not null and (attuale.signed_at is not null
      or lower(trim(attuale.status)) in ('accettata','accettato','rifiutata','rifiutato','convertita','convertito','annullata','annullato')) then
    raise exception 'Il preventivo è già stato deciso. Riaprilo prima di continuare.' using errcode = '55000';
  end if;

  testata := pg_catalog.jsonb_populate_record(null::public.quotes, p_testata);
  salva_costi := coalesce(public.has_permission_for_company(attore, 'can_view_costs', p_azienda), false);
  if attuale.id is null then
    insert into public.quotes (company_id, created_by, quote_number, title, status, source, client_name)
      values (p_azienda, attore, testata.quote_number, testata.title, 'bozza', fonte, testata.client_name)
      returning id into attuale.id;
  end if;

  delete from public.quote_items where quote_id = attuale.id and company_id = p_azienda;
  insert into public.quote_items (
    quote_id, company_id, item_type, item_category, name, description, quantity, unit_price,
    unit_of_measure, vat_rate, discount_percent, sort_order, is_optional, mostra_nel_pdf,
    codice_prezzario, prezzo_acquisto, custom_field_values
  )
  select attuale.id, p_azienda, 'service', 'posa', riga.name, riga.description, riga.quantity, riga.unit_price,
    riga.unit_of_measure, riga.vat_rate, 0, riga.sort_order, false, true,
    riga.codice_prezzario, case when salva_costi then riga.prezzo_acquisto end, riga.custom_field_values
  from pg_catalog.jsonb_to_recordset(p_righe) as riga(
    name text, description text, quantity numeric, unit_price numeric, unit_of_measure text,
    vat_rate numeric, sort_order integer, codice_prezzario text, prezzo_acquisto numeric, custom_field_values jsonb
  );

  update public.quotes q set
    title = testata.title,
    client_name = testata.client_name,
    client_email = testata.client_email,
    client_phone = testata.client_phone,
    client_tipo = coalesce(testata.client_tipo, q.client_tipo),
    client_address = coalesce(testata.client_address, q.client_address),
    client_fiscal_code = coalesce(testata.client_fiscal_code, q.client_fiscal_code),
    client_company = case when p_testata ? 'client_company' then testata.client_company else q.client_company end,
    client_vat_number = case when p_testata ? 'client_vat_number' then testata.client_vat_number else q.client_vat_number end,
    contact_id = coalesce(testata.contact_id, q.contact_id),
    customer_id = coalesce(testata.customer_id, q.customer_id),
    opportunity_id = coalesce(testata.opportunity_id, q.opportunity_id),
    subtotal = testata.subtotal,
    vat_amount = testata.vat_amount,
    total = testata.total,
    prezzo_manuale = testata.prezzo_manuale,
    prezzo_manuale_iva_pct = testata.prezzo_manuale_iva_pct,
    discount_percent = testata.discount_percent,
    payment_phases = testata.payment_phases,
    ritenuta_garanzia = testata.ritenuta_garanzia,
    validity_days = testata.validity_days,
    expires_at = testata.expires_at,
    pdf_storage_path = testata.pdf_storage_path,
    pdf_generated_at = testata.pdf_generated_at,
    updated_at = clock_timestamp()
   where q.id = attuale.id and q.company_id = p_azienda;
  if not found then
    raise exception 'Non hai il permesso di aggiornare questo preventivo.' using errcode = '42501';
  end if;
  return attuale.id;
end;
$$;
revoke all on function public.prepara_commessa_computo_atomic(uuid,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.prepara_commessa_computo_atomic(uuid,uuid,jsonb,jsonb) to authenticated;
