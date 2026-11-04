-- Il super admin dentro un'azienda vede collegamenti, allegati e rettifiche di quell'azienda.
-- aziende_con_permesso non lo comprende, quindi dal supporto la scheda Fatture di un mezzo risultava vuota
-- anche con 28 fatture collegate. Vale solo per l'azienda in cui è entrato (get_my_company_id), come sulle
-- fatture: gli altri utenti non cambiano.
-- Solo policy e funzioni, nessuna riga scritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.e_super_admin_dentro(p_azienda uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_azienda is not null and public.has_role(auth.uid(), 'super_admin'::public.app_role) and p_azienda = public.get_my_company_id()
$$;
revoke all on function public.e_super_admin_dentro(uuid) from public, anon;
grant execute on function public.e_super_admin_dentro(uuid) to authenticated, service_role;

drop policy if exists fattura_ricevuta_mezzi_super_admin on public.fattura_ricevuta_mezzi;
create policy fattura_ricevuta_mezzi_super_admin on public.fattura_ricevuta_mezzi for all to authenticated
  using (public.e_super_admin_dentro(company_id)) with check (public.e_super_admin_dentro(company_id));
drop policy if exists fattura_ddt_super_admin on public.fattura_ddt;
create policy fattura_ddt_super_admin on public.fattura_ddt for all to authenticated
  using (public.e_super_admin_dentro(company_id)) with check (public.e_super_admin_dentro(company_id));
drop policy if exists fattura_allegati_super_admin on public.fattura_allegati;
create policy fattura_allegati_super_admin on public.fattura_allegati for all to authenticated
  using (public.e_super_admin_dentro(company_id)) with check (public.e_super_admin_dentro(company_id));

drop policy if exists fatture_allegati_file_super_admin on storage.objects;
create policy fatture_allegati_file_super_admin on storage.objects for all to authenticated
  -- Confronto come testo: la policy si valuta anche sui file di altri contenitori, dove la cartella non è un uuid.
  using (bucket_id = 'fatture-allegati' and (storage.foldername(name))[1] = (select public.get_my_company_id())::text and (select public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  with check (bucket_id = 'fatture-allegati' and (storage.foldername(name))[1] = (select public.get_my_company_id())::text and (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

create or replace function public.fattura_segna_verifica(p_fattura_id uuid, p_verificata boolean)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record;
begin
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (public.e_super_admin_dentro(f.company_id) or (f.company_id = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(f.company_id))) then
    raise exception 'Il tuo ruolo non permette di verificare le fatture.' using errcode = '42501';
  end if;
  update public.fatture_ricevute
     set verifica_manuale = case when p_verificata then 'verificata' else 'da_verificare' end,
         rettifica_motivo = null,
         verifica_da = auth.uid(), verifica_at = now()
   where id = p_fattura_id;
  return jsonb_build_object('fattura_id', p_fattura_id, 'verificata', p_verificata);
end $$;

create or replace function public.fattura_segna_rettifica(p_fattura_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record; v_motivo text := nullif(btrim(p_motivo), ''); v_riba integer;
begin
  if v_motivo is null then raise exception 'Scrivi cosa va rettificato.' using errcode = '22023'; end if;
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (public.e_super_admin_dentro(f.company_id) or (f.company_id = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(f.company_id))) then
    raise exception 'Il tuo ruolo non permette di verificare le fatture.' using errcode = '42501';
  end if;
  update public.fatture_ricevute
     set verifica_manuale = 'da_rettificare', rettifica_motivo = left(v_motivo, 1000),
         verifica_da = auth.uid(), verifica_at = now()
   where id = p_fattura_id;
  select count(*) into v_riba from public.rate_fornitori r
   where r.fattura_ricevuta_id = p_fattura_id and r.metodo = 'riba' and r.stato in ('da_pagare', 'avvisata');
  return jsonb_build_object('fattura_id', p_fattura_id, 'riba_aperte', v_riba);
end $$;

create or replace function public.mezzo_cerca_nelle_fatture(p_mezzo_id uuid)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '60s' as $$
declare v_azienda uuid; v_k text; n integer;
begin
  select company_id, upper(regexp_replace(coalesce(nullif(targa, ''), matricola, ''), '[^A-Za-z0-9]', '', 'g')) into v_azienda, v_k from public.mezzi where id = p_mezzo_id;
  if v_azienda is null then raise exception 'Mezzo non trovato.' using errcode = 'P0002'; end if;
  if not (public.e_super_admin_dentro(v_azienda) or (v_azienda = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(v_azienda))) then
    raise exception 'Il tuo ruolo non permette di collegare le fatture.' using errcode = '42501';
  end if;
  if length(coalesce(v_k, '')) < 6 then raise exception 'Serve una targa o una matricola di almeno 6 caratteri.' using errcode = '22023'; end if;
  with trovati as (
    select f.id, sum(abs(case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end)) as importo,
           public.e_nota_credito_ricevuta(f.tipo_documento) as nota
      from public.fatture_ricevute f, jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) r
     where f.company_id = v_azienda and not public.e_autofattura_ricevuta(f.tipo_documento)
       and upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) like '%' || v_k || '%'
     group by f.id, f.tipo_documento
  ), scritti as (
    insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
    select v_azienda, t.id, p_mezzo_id, case when t.nota then -t.importo else t.importo end, 'targa', auth.uid() from trovati t
    on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
  ) select count(*) into n from scritti;
  return n;
end $$;
