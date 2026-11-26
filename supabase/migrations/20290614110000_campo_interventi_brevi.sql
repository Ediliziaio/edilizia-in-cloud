-- Interventi brevi dal telefono (26/11/2026, richiesta del founder): il tecnico che oggi ha due manutenzioni le vede
-- nell'app di cantiere, ci arriva, fa foto, note e ore, fa firmare il cliente se l'azienda lo vuole, e chiude.
-- Prima le richieste di assistenza con tecnico e data non comparivano per niente nell'app degli operai.
--
-- Le scelte sono dell'azienda (Impostazioni → Rapportini e presenze), come tutto il resto:
--   intervento_firma       'facoltativa' (di partenza) | 'obbligatoria'
--   intervento_stato_fine  'risolto' (di partenza: poi controlla l'ufficio) | 'da_fatturare' | 'chiuso'

alter table public.campo_avvisi_azienda
  add column if not exists intervento_firma text not null default 'facoltativa',
  add column if not exists intervento_stato_fine text not null default 'risolto';
alter table public.campo_avvisi_azienda drop constraint if exists campo_avvisi_intervento_firma_check;
alter table public.campo_avvisi_azienda add constraint campo_avvisi_intervento_firma_check
  check (intervento_firma in ('facoltativa', 'obbligatoria'));
alter table public.campo_avvisi_azienda drop constraint if exists campo_avvisi_intervento_stato_fine_check;
alter table public.campo_avvisi_azienda add constraint campo_avvisi_intervento_stato_fine_check
  check (intervento_stato_fine in ('risolto', 'da_fatturare', 'chiuso'));

create or replace function public.campo_avvisi_azienda_leggi(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.campo_avvisi_azienda;
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  select * into a from public.campo_avvisi_azienda where company_id = p_company_id;
  return jsonb_build_object(
    'avviso_domani', coalesce(a.avviso_domani, false),
    'sub_vede_pagamenti', coalesce(a.sub_vede_pagamenti, true),
    'timbratura_app', coalesce(a.timbratura_app, true),
    'intervento_firma', coalesce(a.intervento_firma, 'facoltativa'),
    'intervento_stato_fine', coalesce(a.intervento_stato_fine, 'risolto'));
end $$;

create or replace function public.campo_avvisi_azienda_salva_interventi(p_company_id uuid, p_firma text, p_stato_fine text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if coalesce(p_firma, '') not in ('facoltativa', 'obbligatoria') or coalesce(p_stato_fine, '') not in ('risolto', 'da_fatturare', 'chiuso') then
    raise exception using errcode = '22023', message = 'Scelta non valida.';
  end if;
  insert into public.campo_avvisi_azienda (company_id, intervento_firma, intervento_stato_fine, aggiornato_da, aggiornato_il)
  values (p_company_id, p_firma, p_stato_fine, auth.uid(), now())
  on conflict (company_id) do update
    set intervento_firma = excluded.intervento_firma, intervento_stato_fine = excluded.intervento_stato_fine,
        aggiornato_da = excluded.aggiornato_da, aggiornato_il = now();
  return jsonb_build_object('intervento_firma', p_firma, 'intervento_stato_fine', p_stato_fine);
end $$;
revoke all on function public.campo_avvisi_azienda_salva_interventi(uuid, text, text) from public, anon;
grant execute on function public.campo_avvisi_azienda_salva_interventi(uuid, text, text) to authenticated;

-- Quello che il tecnico ha fatto sul posto: una riga per intervento e tecnico.
create table if not exists public.campo_interventi_esiti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  iniziato_at timestamptz,
  finito_at timestamptz,
  note text,
  ore numeric(5,2),
  materiali text,
  foto text[] not null default '{}',
  firma_path text,
  firma_nome text,
  senza_firma_motivo text,
  created_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);
alter table public.campo_interventi_esiti enable row level security;
drop policy if exists campo_interventi_esiti_lettura on public.campo_interventi_esiti;
create policy campo_interventi_esiti_lettura on public.campo_interventi_esiti for select to authenticated
  using (user_id = auth.uid() or public.has_permission_for_company(auth.uid(), 'can_view_tickets', company_id));
revoke insert, update, delete on public.campo_interventi_esiti from authenticated, anon;

-- È un intervento mio? Assegnato a me, o alla mia squadra interna.
create or replace function private.campo_intervento_mio(p_ticket uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets t
                  where t.id = p_ticket and t.status <> 'annullato'
                    and (t.assigned_to = auth.uid() or t.squadra_id in (select public.campo_mie_squadre())));
$$;
revoke all on function private.campo_intervento_mio(uuid) from public, anon;
grant execute on function private.campo_intervento_mio(uuid) to authenticated;

-- Gli interventi del tecnico tra due giorni (ora di Roma), con quello che serve per farli.
create or replace function public.campo_miei_interventi(p_dal date, p_al date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Accesso richiesto.'; end if;
  if p_al < p_dal or p_al - p_dal > 62 then raise exception using errcode = '22023', message = 'Intervallo non valido.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'titolo', coalesce(nullif(btrim(t.titolo), ''), t.subject), 'descrizione', t.descrizione,
      'tipo', t.tipo, 'tipo_intervento', ti.nome, 'durata_stimata_h', coalesce(t.durata_ore, ti.durata_stimata_h),
      'stato', t.status, 'priorita', coalesce(t.priorita, t.priority::text), 'quando', t.data_intervento_prevista,
      'indirizzo', t.indirizzo_intervento, 'lat', t.lat_intervento, 'lng', t.lng_intervento,
      'order_id', t.order_id, 'order_code', o.order_code,
      'merce_richiesta', t.merce_richiesta, 'merce_stato', t.merce_stato,
      'cliente', case when c.id is null then null else jsonb_build_object(
        'nome', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'telefono', c.phone) end,
      'impianto', case when i.id is null then null else jsonb_build_object(
        'tipo', i.tipo_impianto, 'marca', i.marca, 'modello', i.modello, 'matricola', i.matricola,
        'installato', i.data_installazione, 'note', i.note_tecniche) end,
      'iniziato_at', e.iniziato_at, 'finito_at', e.finito_at
    ) order by t.data_intervento_prevista)
    from public.tickets t
    left join public.profiles c on c.id = t.customer_id
    left join public.impianti_cliente i on i.id = t.impianto_id
    left join public.tipi_intervento ti on ti.id = t.tipo_intervento_id
    left join public.orders o on o.id = t.order_id and o.deleted_at is null
    left join public.campo_interventi_esiti e on e.ticket_id = t.id and e.user_id = auth.uid()
    where (t.assigned_to = auth.uid() or t.squadra_id in (select public.campo_mie_squadre()))
      and t.status <> 'annullato'
      and t.data_intervento_prevista is not null
      and (t.data_intervento_prevista at time zone 'Europe/Rome')::date between p_dal and p_al
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_miei_interventi(date, date) from public, anon;
grant execute on function public.campo_miei_interventi(date, date) to authenticated;

-- «Inizio intervento»: la richiesta passa in lavorazione e resta l'ora di arrivo.
create or replace function public.campo_intervento_inizia(p_ticket uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets;
begin
  if auth.uid() is null or not private.campo_intervento_mio(p_ticket) then
    raise exception using errcode = '42501', message = 'Questo intervento non è assegnato a te.';
  end if;
  select * into t from public.tickets where id = p_ticket for update;
  if t.status in ('risolto', 'da_fatturare', 'chiuso', 'annullato', 'preventivo_rifiutato') then
    raise exception using errcode = '22023', message = 'Questo intervento è già chiuso.';
  end if;
  update public.tickets set status = 'in_lavorazione', data_intervento_effettiva = coalesce(data_intervento_effettiva, now())
   where id = p_ticket;
  insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at)
  values (t.company_id, p_ticket, auth.uid(), now())
  on conflict (ticket_id, user_id) do update set iniziato_at = coalesce(campo_interventi_esiti.iniziato_at, now());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.campo_intervento_inizia(uuid) from public, anon;
grant execute on function public.campo_intervento_inizia(uuid) to authenticated;

-- «Intervento finito»: note, ore, materiale, foto e firma; lo stato lo decide l'azienda; avvisa chi l'ha programmato.
create or replace function public.campo_intervento_chiudi(
  p_ticket uuid, p_note text, p_ore numeric, p_materiali text, p_foto text[],
  p_firma_path text, p_firma_nome text, p_senza_firma_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets; v_firma text; v_stato text; v_prefisso text; v_foto text; v_nome text;
begin
  if auth.uid() is null or not private.campo_intervento_mio(p_ticket) then
    raise exception using errcode = '42501', message = 'Questo intervento non è assegnato a te.';
  end if;
  select * into t from public.tickets where id = p_ticket for update;
  if t.status in ('chiuso', 'annullato', 'preventivo_rifiutato') then
    raise exception using errcode = '22023', message = 'Questo intervento è già chiuso.';
  end if;
  select coalesce(a.intervento_firma, 'facoltativa'), coalesce(a.intervento_stato_fine, 'risolto')
    into v_firma, v_stato from public.campo_avvisi_azienda a where a.company_id = t.company_id;
  v_firma := coalesce(v_firma, 'facoltativa'); v_stato := coalesce(v_stato, 'risolto');
  if v_firma = 'obbligatoria' and nullif(btrim(coalesce(p_firma_path, '')), '') is null then
    raise exception using errcode = '22023', message = 'La tua azienda chiede la firma del cliente per chiudere.';
  end if;
  if p_ore is not null and (p_ore < 0 or p_ore > 24) then
    raise exception using errcode = '22023', message = 'Ore non valide.';
  end if;
  -- Foto e firma solo dalla cartella del tecnico per questo intervento.
  v_prefisso := auth.uid()::text || '/interventi/' || p_ticket::text || '/';
  foreach v_foto in array coalesce(p_foto, '{}') || coalesce(array[nullif(p_firma_path, '')], '{}') loop
    if v_foto is not null and left(v_foto, length(v_prefisso)) <> v_prefisso then
      raise exception using errcode = '22023', message = 'File non valido.';
    end if;
  end loop;
  if cardinality(coalesce(p_foto, '{}')) > 20 then raise exception using errcode = '22023', message = 'Al massimo 20 foto.'; end if;

  insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at, finito_at, note, ore, materiali,
    foto, firma_path, firma_nome, senza_firma_motivo)
  values (t.company_id, p_ticket, auth.uid(), now(), now(), nullif(left(btrim(coalesce(p_note, '')), 4000), ''), p_ore,
    nullif(left(btrim(coalesce(p_materiali, '')), 2000), ''), coalesce(p_foto, '{}'), nullif(p_firma_path, ''),
    nullif(left(btrim(coalesce(p_firma_nome, '')), 200), ''), nullif(left(btrim(coalesce(p_senza_firma_motivo, '')), 500), ''))
  on conflict (ticket_id, user_id) do update set
    finito_at = now(), note = excluded.note, ore = excluded.ore, materiali = excluded.materiali, foto = excluded.foto,
    firma_path = excluded.firma_path, firma_nome = excluded.firma_nome, senza_firma_motivo = excluded.senza_firma_motivo,
    iniziato_at = coalesce(campo_interventi_esiti.iniziato_at, excluded.iniziato_at);

  update public.tickets set
    status = v_stato::ticket_status,
    data_intervento_effettiva = coalesce(data_intervento_effettiva, now()),
    ore_effettive = coalesce(p_ore, ore_effettive),
    note_tecnico = coalesce(nullif(btrim(coalesce(p_note, '')), ''), note_tecnico)
  where id = p_ticket;

  select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nome from public.profiles p where p.id = auth.uid();
  if t.created_by is not null and t.created_by <> auth.uid() then
    perform public.campo_notifica(t.company_id, t.created_by, 'intervento_finito', 'Intervento finito',
      concat_ws(' · ', coalesce(nullif(btrim(t.titolo), ''), t.subject), v_nome), 'ticket', p_ticket,
      '/azienda/assistenza/' || p_ticket::text);
  end if;
  return jsonb_build_object('ok', true, 'stato', v_stato);
end $$;
revoke all on function public.campo_intervento_chiudi(uuid, text, numeric, text, text[], text, text, text) from public, anon;
grant execute on function public.campo_intervento_chiudi(uuid, text, numeric, text, text[], text, text, text) to authenticated;

-- Foto e firma stanno nella cartella del tecnico (campo-foto, «<utente>/interventi/<richiesta>/…»): le carica e le
-- legge lui (regole già esistenti); qui le legge anche l'ufficio che vede le richieste di assistenza dell'azienda.
drop policy if exists campo_foto_interventi_ufficio on storage.objects;
create policy campo_foto_interventi_ufficio on storage.objects for select to authenticated
  using (bucket_id = 'campo-foto' and (storage.foldername(name))[2] = 'interventi'
         and exists (select 1 from public.tickets t
                      where t.id::text = (storage.foldername(name))[3]
                        and public.has_permission_for_company(auth.uid(), 'can_view_tickets', t.company_id)));
