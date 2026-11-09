-- Chi ha ricevuto una fattura emessa da qui è un cliente: deve comparire in Clienti.
--
-- La fattura vive nella rubrica fiscale (anagrafiche_native), l'elenco Clienti sui
-- profili: nessuno le collegava, e dei clienti fatturati da una nuova azienda nativa
-- 4 su 6 non si trovavano. Lo fa il giro già esistente clienti-da-fatture-importate.
-- Vale anche per le fatture già emesse: il timbro è vuoto, e il giro le smaltisce.

alter table public.documenti_fiscali
  add column if not exists cliente_collegato_at timestamptz,
  add column if not exists cliente_collegato_esito text;

comment on column public.documenti_fiscali.cliente_collegato_at is
  'Quando il giro clienti-da-fatture-importate ha riconosciuto o creato il cliente di questa fattura emessa.';

-- Il timbro è servizio, non contenuto fiscale: si scrive anche su una fattura emessa.
create or replace function public.documento_fiscale_campi_modificabili()
returns text[]
language sql
immutable
as $function$
  SELECT ARRAY[
    'stato', 'importo_pagato', 'pagato_at', 'deleted_at',
    'sdi_id_trasmissione', 'sdi_stato', 'sdi_data_consegna', 'sdi_file_xml_url',
    'sdi_ricevuta_url', 'sdi_errori', 'sdi_notifica_tipo', 'sdi_firmato',
    'sdi_file_p7m_url', 'sdi_identificativo', 'trasmissione',
    'pdf_url', 'note_interne', 'updated_at',
    'ddt_fatturato', 'ddt_fattura_id', 'documento_correlato_id',
    'anagrafica_id', 'ordine_id',
    'cliente_collegato_at', 'cliente_collegato_esito'
  ]::text[];
$function$;

-- Stesse regole di riconcilia_cliente_emessa_importata: si contano tutte le
-- corrispondenze, un'identità dubbia si ferma e non crea doppioni.
create or replace function public.riconcilia_cliente_documento_emesso(p_company_id uuid, p_documento_id uuid, p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
set lock_timeout to '3s'
set statement_timeout to '15s'
as $function$
declare
  d public.documenti_fiscali%rowtype;
  a public.anagrafiche_native%rowtype;
  s jsonb;
  cf text; iva text; cliente uuid; anagrafica uuid; candidati uuid[]; nome text; nazione text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo il giro automatico collega i clienti delle fatture emesse' using errcode = '42501';
  end if;
  if p_apply then
    perform pg_advisory_xact_lock(hashtextextended('emesse-clienti:' || p_company_id::text, 0));
  end if;
  select * into d from public.documenti_fiscali
   where id = p_documento_id and company_id = p_company_id and deleted_at is null
     and stato not in ('bozza', 'annullata') for update;
  if not found then
    return jsonb_build_object('status', 'da_verificare', 'motivo', 'Fattura non trovata o non emessa.');
  end if;

  s := coalesce(d.cliente_snapshot, '{}'::jsonb);
  cf := public.norm_id_fiscale(s->>'codice_fiscale');
  iva := public.norm_id_fiscale(s->>'partita_iva');
  nome := coalesce(nullif(btrim(s->>'ragione_sociale'), ''), nullif(btrim(concat_ws(' ', s->>'nome', s->>'cognome')), ''));
  nazione := upper(coalesce(nullif(btrim(s->>'indirizzo_nazione'), ''), 'IT'));

  if (cf is null and iva is null) or (cf is not null and not public.codice_fiscale_valido(cf))
     or (iva is not null and not public.piva_valida(iva)) then
    return jsonb_build_object('status', 'da_verificare', 'motivo', 'CF/P.IVA assenti o non validi: nessun cliente creato.');
  end if;

  select array_agg(p.id) into candidati from public.profiles p
   where p.company_id = p_company_id and p.deleted_at is null
     and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'customer')
     and ((cf is not null and public.norm_id_fiscale(p.fiscal_code) = cf)
       or (iva is not null and public.norm_id_fiscale(p.vat_number) = iva));
  if coalesce(cardinality(candidati), 0) > 1 then
    return jsonb_build_object('status', 'da_verificare', 'motivo', 'Più clienti hanno lo stesso CF/P.IVA.');
  end if;
  cliente := candidati[1];

  if d.anagrafica_id is not null then
    anagrafica := d.anagrafica_id;
  else
    select array_agg(n.id) into candidati from public.anagrafiche_native n
     where n.company_id = p_company_id
       and ((cf is not null and public.norm_id_fiscale(n.codice_fiscale) = cf)
         or (iva is not null and public.norm_id_fiscale(n.partita_iva) = iva));
    if coalesce(cardinality(candidati), 0) > 1 then
      return jsonb_build_object('status', 'da_verificare', 'motivo', 'Più anagrafiche fiscali corrispondono: evita un duplicato.', 'customer_id', cliente);
    end if;
    anagrafica := candidati[1];
  end if;

  if anagrafica is not null then
    select * into a from public.anagrafiche_native where id = anagrafica and company_id = p_company_id;
    if found and a.cliente_id is not null then
      if cliente is not null and cliente is distinct from a.cliente_id then
        return jsonb_build_object('status', 'da_verificare', 'motivo', 'Anagrafica collegata a un altro cliente.', 'customer_id', cliente);
      end if;
      -- Il cliente già collegato vale, se esiste ancora.
      if cliente is null and exists (select 1 from public.profiles p where p.id = a.cliente_id and p.deleted_at is null) then
        cliente := a.cliente_id;
      end if;
    end if;
    if found and a.tipo = 'fornitore' then
      return jsonb_build_object('status', 'da_verificare', 'motivo', 'L''anagrafica è di un fornitore.', 'customer_id', cliente);
    end if;
  end if;

  if p_apply then
    if anagrafica is null then
      if nome is null then
        return jsonb_build_object('status', 'da_verificare', 'motivo', 'Intestatario assente.');
      end if;
      insert into public.anagrafiche_native(company_id, tipo, tipo_soggetto, tipo_cliente, ragione_sociale, nome, cognome,
        partita_iva, codice_fiscale, indirizzo_via, indirizzo_comune, indirizzo_cap, indirizzo_provincia, indirizzo_nazione,
        codice_sdi, pec, cliente_id, sync_from_cliente, note)
      values (p_company_id, 'cliente',
        case when nazione <> 'IT' then 'estero' when iva is null or length(cf) = 16 then 'fisico' else 'giuridico' end,
        coalesce(nullif(s->>'tipo_cliente', ''), case when nazione <> 'IT' then 'Estero' when iva is null then 'B2C' else 'B2B' end),
        nome, nullif(s->>'nome', ''), nullif(s->>'cognome', ''), iva, cf,
        nullif(s->>'indirizzo_via', ''), nullif(s->>'indirizzo_comune', ''), nullif(s->>'indirizzo_cap', ''), nullif(s->>'indirizzo_provincia', ''), nazione,
        nullif(s->>'codice_sdi', ''), nullif(s->>'pec', ''), cliente, false,
        'Anagrafica nata dalla fattura ' || d.numero || '.')
      returning id into anagrafica;
    elsif cliente is not null then
      update public.anagrafiche_native
         set cliente_id = cliente, sync_from_cliente = false
       where id = anagrafica and company_id = p_company_id and cliente_id is null;
    end if;
    if d.anagrafica_id is null then
      update public.documenti_fiscali set anagrafica_id = anagrafica, updated_at = now() where id = d.id;
    end if;
  end if;

  return jsonb_build_object('status', 'ok', 'anagrafica_id', anagrafica, 'customer_id', cliente,
    'cliente_operativo_mancante', cliente is null, 'applicato', p_apply);
end;
$function$;

revoke all on function public.riconcilia_cliente_documento_emesso(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.riconcilia_cliente_documento_emesso(uuid, uuid, boolean) to service_role;
