-- DDT dal prelievo di cantiere.
--
-- L'operaio, su un prelievo, può "richiedere il DDT". L'ufficio lo genera: nasce
-- un DDT bozza in documenti_fiscali (come create_ddt_from_uscita) coi materiali
-- del prelievo, intestato al cliente della commessa. Il numero DDT resta anche
-- sul prelievo, così l'operaio lo vede senza accedere ai documenti fiscali.

alter table public.prelievi_campo add column if not exists ddt_richiesto boolean not null default false;
alter table public.prelievi_campo add column if not exists documento_id uuid;
alter table public.prelievi_campo add column if not exists documento_numero text;

-- L'operaio (o l'ufficio) chiede il DDT per un prelievo.
create or replace function public.prelievo_campo_richiedi_ddt(p_prelievo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_n int;
begin
  if v_uid is null then raise exception 'Non autenticato'; end if;
  v_company := public.get_user_company_id(v_uid);
  if not public.has_permission(v_uid, 'can_view_warehouse') then
    raise exception 'Non hai l''accesso al magazzino';
  end if;
  update public.prelievi_campo
     set ddt_richiesto = true
   where id = p_prelievo_id and company_id = v_company
     and (operaio_id = v_uid or public.has_permission(v_uid, 'can_edit_warehouse'));
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Prelievo non trovato'; end if;
end $$;

-- L'ufficio genera il DDT dal prelievo.
create or replace function public.prelievo_campo_genera_ddt(p_prelievo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_p public.prelievi_campo;
  v_year int := extract(year from current_date)::int;
  v_numero text;
  v_prog int;
  v_doc uuid;
  v_cust uuid;
  v_ana record;
  v_snapshot jsonb;
  v_anagrafica uuid;
  v_righe jsonb;
begin
  if v_uid is null then raise exception 'Non autenticato'; end if;
  v_company := public.get_user_company_id(v_uid);
  if not public.has_permission(v_uid, 'can_edit_warehouse') then
    raise exception 'Non puoi generare il DDT';
  end if;
  select * into v_p from public.prelievi_campo where id = p_prelievo_id and company_id = v_company;
  if not found then raise exception 'Prelievo non trovato'; end if;
  if v_p.documento_id is not null then
    return jsonb_build_object('documento_id', v_p.documento_id, 'numero', v_p.documento_numero);
  end if;
  if v_p.stato <> 'consegnato' then raise exception 'Il DDT si genera su un prelievo consegnato'; end if;
  if coalesce(jsonb_array_length(v_p.righe), 0) = 0 then raise exception 'Prelievo senza righe'; end if;

  -- Cliente: dalla commessa, cercando l'anagrafica; altrimenti trasferimento interno.
  if v_p.order_id is not null then
    select customer_id into v_cust from public.orders where id = v_p.order_id and company_id = v_company;
  end if;
  if v_cust is not null then
    select id, ragione_sociale, nome, cognome, partita_iva, codice_fiscale,
           indirizzo_via, indirizzo_cap, indirizzo_comune, indirizzo_provincia
      into v_ana
      from public.anagrafiche_native where company_id = v_company and cliente_id = v_cust limit 1;
    if found then
      v_anagrafica := v_ana.id;
      v_snapshot := jsonb_strip_nulls(jsonb_build_object(
        'ragione_sociale', v_ana.ragione_sociale, 'nome', v_ana.nome, 'cognome', v_ana.cognome,
        'partita_iva', v_ana.partita_iva, 'codice_fiscale', v_ana.codice_fiscale,
        'indirizzo_via', v_ana.indirizzo_via, 'indirizzo_cap', v_ana.indirizzo_cap,
        'indirizzo_comune', v_ana.indirizzo_comune, 'indirizzo_provincia', v_ana.indirizzo_provincia));
    else
      declare v_fn text; v_ln text;
      begin
        select first_name, last_name into v_fn, v_ln from public.profiles where id = v_cust;
        v_snapshot := jsonb_strip_nulls(jsonb_build_object(
          'ragione_sociale', nullif(trim(concat_ws(' ', v_fn, v_ln)), ''),
          'nome', v_fn, 'cognome', v_ln));
      end;
    end if;
  end if;
  if v_snapshot is null or v_snapshot = '{}'::jsonb then
    v_snapshot := jsonb_build_object('ragione_sociale', 'Trasferimento a cantiere');
  end if;

  -- Righe in formato documento (DDT di trasferimento, senza valori).
  select jsonb_agg(jsonb_build_object(
           'numero_linea', ord,
           'descrizione', coalesce(r->>'name', 'Articolo'),
           'quantita', coalesce((r->>'quantita')::numeric, 0),
           'unita_misura', coalesce(nullif(r->>'unita',''), 'pz'),
           'prezzo_unitario', 0, 'imponibile', 0, 'aliquota_iva', '0', 'imposta', 0, 'totale_riga', 0))
    into v_righe
    from (select value r, row_number() over () ord from jsonb_array_elements(v_p.righe)) t;

  v_numero := public.genera_numero_documento_native(v_company, 'ddt'::text, v_year);
  v_prog := coalesce(nullif(split_part(v_numero, '-', array_length(string_to_array(v_numero, '-'), 1)), '')::int, 1);

  insert into public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno, data_emissione, stato,
    ordine_id, anagrafica_id, cliente_snapshot, righe, note_documento,
    ddt_causale_trasporto, ddt_porto
  ) values (
    v_company, 'ddt', v_numero, v_prog, v_year, current_date, 'bozza',
    v_p.order_id, v_anagrafica, v_snapshot, v_righe,
    nullif(concat_ws(' · ', 'Prelievo da cantiere', v_p.note), ''),
    'Trasferimento a cantiere', 'Franco'
  ) returning id into v_doc;

  update public.prelievi_campo set documento_id = v_doc, documento_numero = v_numero where id = p_prelievo_id;
  return jsonb_build_object('documento_id', v_doc, 'numero', v_numero);
end $$;

revoke all on function public.prelievo_campo_richiedi_ddt(uuid) from public, anon;
revoke all on function public.prelievo_campo_genera_ddt(uuid) from public, anon;
grant execute on function public.prelievo_campo_richiedi_ddt(uuid) to authenticated;
grant execute on function public.prelievo_campo_genera_ddt(uuid) to authenticated;
