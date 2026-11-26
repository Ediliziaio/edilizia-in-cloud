-- Interventi brevi, secondo giro (26/11/2026, richieste del founder):
-- 1. «Non tutti devono avere il numero del cliente»: lo decide l'azienda (campo_avvisi_azienda.telefono_cliente)
--      'tutti' (come oggi) | 'autorizzati' (solo chi ha la spunta nella scheda del personale) | 'nessuno'.
--    L'ufficio lo vede sempre. Il server toglie il numero dalle liste degli interventi, non solo lo schermo.
-- 2. I rapporti dell'intervento: più visite (anche dello stesso tecnico) e il rapporto scritto dall'ufficio per chi
--    non usa l'app. Per questo un tecnico può avere più righe sulla stessa richiesta (niente più «una per tecnico»).
-- 3. Le due liste degli interventi (quella di settembre per la Home e quella nuova) vedono anche le squadre esterne
--    e prendono l'indirizzo del cliente se manca quello dell'intervento.

alter table public.campo_avvisi_azienda add column if not exists telefono_cliente text not null default 'tutti';
alter table public.campo_avvisi_azienda drop constraint if exists campo_avvisi_telefono_cliente_check;
alter table public.campo_avvisi_azienda add constraint campo_avvisi_telefono_cliente_check
  check (telefono_cliente in ('tutti', 'autorizzati', 'nessuno'));
alter table public.hr_profili add column if not exists vede_telefono_clienti boolean not null default false;

create or replace function private.campo_vedo_telefono_clienti(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case coalesce((select a.telefono_cliente from public.campo_avvisi_azienda a where a.company_id = p_company), 'tutti')
    when 'tutti' then true
    when 'nessuno' then coalesce(public.campo_e_ufficio(p_company), false)
    else coalesce(public.campo_e_ufficio(p_company), false)
      or exists (select 1 from public.hr_profili hp where hp.user_id = auth.uid() and hp.company_id = p_company and hp.vede_telefono_clienti)
  end;
$$;
revoke all on function private.campo_vedo_telefono_clienti(uuid) from public, anon;
grant execute on function private.campo_vedo_telefono_clienti(uuid) to authenticated;

-- Per lo schermo (pagina del cantiere): io, nella mia azienda, vedo il telefono dei clienti?
create or replace function public.campo_vedo_telefono_clienti()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(private.campo_vedo_telefono_clienti(public.get_my_company_id()), true);
$$;
revoke all on function public.campo_vedo_telefono_clienti() from public, anon;
grant execute on function public.campo_vedo_telefono_clienti() to authenticated;

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
    'intervento_stato_fine', coalesce(a.intervento_stato_fine, 'risolto'),
    'telefono_cliente', coalesce(a.telefono_cliente, 'tutti'));
end $$;

create or replace function public.campo_avvisi_azienda_salva_telefono(p_company_id uuid, p_valore text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if coalesce(p_valore, '') not in ('tutti', 'autorizzati', 'nessuno') then
    raise exception using errcode = '22023', message = 'Scelta non valida.';
  end if;
  insert into public.campo_avvisi_azienda (company_id, telefono_cliente, aggiornato_da, aggiornato_il)
  values (p_company_id, p_valore, auth.uid(), now())
  on conflict (company_id) do update set telefono_cliente = excluded.telefono_cliente, aggiornato_da = excluded.aggiornato_da, aggiornato_il = now();
  return jsonb_build_object('telefono_cliente', p_valore);
end $$;
revoke all on function public.campo_avvisi_azienda_salva_telefono(uuid, text) from public, anon;
grant execute on function public.campo_avvisi_azienda_salva_telefono(uuid, text) to authenticated;

-- Più rapporti per tecnico (più visite) e il rapporto inserito dall'ufficio.
alter table public.campo_interventi_esiti drop constraint if exists campo_interventi_esiti_ticket_id_user_id_key;
alter table public.campo_interventi_esiti add column if not exists inserito_da uuid references auth.users(id) on delete set null;
create index if not exists campo_interventi_esiti_ticket_idx on public.campo_interventi_esiti (ticket_id, created_at);

create or replace function private.campo_intervento_mio(p_ticket uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets t
                  where t.id = p_ticket and t.status <> 'annullato'
                    and (t.assigned_to = auth.uid()
                         or t.squadra_id in (select public.campo_mie_squadre())
                         or t.squadra_id in (select public.campo_mie_squadre_esterne())));
$$;

-- La lista di settembre (Home, prossimi 30 giorni): stessa forma, ma il telefono solo a chi può vederlo.
create or replace function public.campo_miei_interventi(p_dal date default null, p_giorni integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_dal date := coalesce(p_dal, (now() at time zone 'Europe/Rome')::date);
  v_al date := coalesce(p_dal, (now() at time zone 'Europe/Rome')::date) + least(greatest(coalesce(p_giorni, 30), 1), 120);
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id,
             'titolo', coalesce(nullif(trim(t.titolo), ''), nullif(trim(t.subject), ''), 'Intervento'),
             'tipo', t.tipo, 'stato', t.status, 'data', t.data_intervento_prevista,
             'indirizzo', coalesce(nullif(trim(t.indirizzo_intervento), ''), nullif(trim(concat_ws(', ', c.address, c.city)), '')),
             'lat', t.lat_intervento, 'lng', t.lng_intervento, 'note', t.note_tecnico,
             'cliente', nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''),
             'telefono_cliente', case when private.campo_vedo_telefono_clienti(t.company_id) then c.phone end,
             'order_id', t.order_id,
             'da_squadra', t.squadra_id is not null and (t.assigned_to is distinct from v_uid),
             'squadra', st.name)
           order by t.data_intervento_prevista nulls last, t.created_at)
      from public.tickets t
      left join public.profiles c on c.id = t.customer_id
      left join public.external_teams st on st.id = t.squadra_id
     where t.data_intervento_prevista is not null
       and (t.data_intervento_prevista at time zone 'Europe/Rome')::date between v_dal and v_al
       and coalesce(t.status::text, '') not in ('risolto', 'chiuso', 'annullato', 'preventivo_rifiutato')
       and (t.assigned_to = v_uid
            or (t.squadra_id is not null and t.squadra_id in (select public.campo_mie_squadre()))
            or (t.squadra_id is not null and t.squadra_id in (select public.campo_mie_squadre_esterne())))
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_miei_interventi(date, integer) from public, anon;
grant execute on function public.campo_miei_interventi(date, integer) to authenticated;

-- La lista per giorni (Home «oggi», calendario, pagina dell'intervento).
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
      'indirizzo', coalesce(nullif(btrim(t.indirizzo_intervento), ''), nullif(btrim(concat_ws(', ', c.address, c.city)), '')),
      'lat', t.lat_intervento, 'lng', t.lng_intervento,
      'order_id', t.order_id, 'order_code', o.order_code,
      'merce_richiesta', t.merce_richiesta, 'merce_stato', t.merce_stato,
      'cliente', case when c.id is null then null else jsonb_build_object(
        'nome', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
        'telefono', case when private.campo_vedo_telefono_clienti(t.company_id) then c.phone end) end,
      'impianto', case when i.id is null then null else jsonb_build_object(
        'tipo', i.tipo_impianto, 'marca', i.marca, 'modello', i.modello, 'matricola', i.matricola,
        'installato', i.data_installazione, 'note', i.note_tecniche) end,
      'iniziato_at', e.iniziato_at, 'finito_at', e.finito_at,
      'firma_obbligatoria', coalesce(av.intervento_firma, 'facoltativa') = 'obbligatoria'
    ) order by t.data_intervento_prevista)
    from public.tickets t
    left join public.profiles c on c.id = t.customer_id
    left join public.impianti_cliente i on i.id = t.impianto_id
    left join public.tipi_intervento ti on ti.id = t.tipo_intervento_id
    left join public.orders o on o.id = t.order_id and o.deleted_at is null
    left join lateral (select x.iniziato_at, x.finito_at from public.campo_interventi_esiti x
                        where x.ticket_id = t.id and x.user_id = auth.uid() order by x.created_at desc limit 1) e on true
    left join public.campo_avvisi_azienda av on av.company_id = t.company_id
    where (t.assigned_to = auth.uid()
           or t.squadra_id in (select public.campo_mie_squadre())
           or t.squadra_id in (select public.campo_mie_squadre_esterne()))
      and t.status <> 'annullato'
      and t.data_intervento_prevista is not null
      and (t.data_intervento_prevista at time zone 'Europe/Rome')::date between p_dal and p_al
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_miei_interventi(date, date) from public, anon;
grant execute on function public.campo_miei_interventi(date, date) to authenticated;

-- Inizio: apre una visita nuova solo se non ce n'è già una aperta.
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
  if not exists (select 1 from public.campo_interventi_esiti x where x.ticket_id = p_ticket and x.user_id = auth.uid() and x.finito_at is null) then
    insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at) values (t.company_id, p_ticket, auth.uid(), now());
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Fine: chiude la visita aperta (o ne scrive una nuova), con le stesse regole di prima.
create or replace function public.campo_intervento_chiudi(
  p_ticket uuid, p_note text, p_ore numeric, p_materiali text, p_foto text[],
  p_firma_path text, p_firma_nome text, p_senza_firma_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets; v_firma text; v_stato text; v_prefisso text; v_foto text; v_nome text; v_riga uuid;
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
  if p_ore is not null and (p_ore < 0 or p_ore > 24) then raise exception using errcode = '22023', message = 'Ore non valide.'; end if;
  v_prefisso := auth.uid()::text || '/interventi/' || p_ticket::text || '/';
  foreach v_foto in array coalesce(p_foto, '{}') || coalesce(array[nullif(p_firma_path, '')], '{}') loop
    if v_foto is not null and left(v_foto, length(v_prefisso)) <> v_prefisso then
      raise exception using errcode = '22023', message = 'File non valido.';
    end if;
  end loop;
  if cardinality(coalesce(p_foto, '{}')) > 20 then raise exception using errcode = '22023', message = 'Al massimo 20 foto.'; end if;

  select x.id into v_riga from public.campo_interventi_esiti x
   where x.ticket_id = p_ticket and x.user_id = auth.uid() and x.finito_at is null order by x.created_at desc limit 1;
  if v_riga is null then
    insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at) values (t.company_id, p_ticket, auth.uid(), now())
    returning id into v_riga;
  end if;
  update public.campo_interventi_esiti set finito_at = now(),
    note = nullif(left(btrim(coalesce(p_note, '')), 4000), ''), ore = p_ore,
    materiali = nullif(left(btrim(coalesce(p_materiali, '')), 2000), ''), foto = coalesce(p_foto, '{}'),
    firma_path = nullif(p_firma_path, ''), firma_nome = nullif(left(btrim(coalesce(p_firma_nome, '')), 200), ''),
    senza_firma_motivo = nullif(left(btrim(coalesce(p_senza_firma_motivo, '')), 500), '')
  where id = v_riga;

  update public.tickets set
    status = v_stato::ticket_status,
    data_intervento_effettiva = coalesce(data_intervento_effettiva, now()),
    ore_effettive = coalesce(ore_effettive, 0) + coalesce(p_ore, 0),
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

-- I rapporti dell'intervento, per il tecnico (tutti quelli della richiesta: suoi, dei colleghi, dell'ufficio).
create or replace function public.campo_intervento_rapporti(p_ticket uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not private.campo_intervento_mio(p_ticket) then
    raise exception using errcode = '42501', message = 'Questo intervento non è assegnato a te.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'chi', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'mio', x.user_id = auth.uid(),
      'dall_ufficio', x.inserito_da is not null, 'iniziato_at', x.iniziato_at, 'finito_at', x.finito_at,
      'note', x.note, 'ore', x.ore, 'materiali', x.materiali, 'foto', cardinality(x.foto),
      'firmato_da', case when x.firma_path is not null then coalesce(x.firma_nome, '') end
    ) order by coalesce(x.finito_at, x.iniziato_at, x.created_at) desc)
    from public.campo_interventi_esiti x left join public.profiles p on p.id = x.user_id
    where x.ticket_id = p_ticket
  ), '[]'::jsonb);
end $$;
revoke all on function public.campo_intervento_rapporti(uuid) from public, anon;
grant execute on function public.campo_intervento_rapporti(uuid) to authenticated;

-- Il rapporto scritto dall'ufficio (tecnico senza app, intervento raccontato al telefono o su carta).
create or replace function public.ufficio_intervento_rapporto_salva(
  p_ticket uuid, p_tecnico uuid, p_quando timestamptz, p_ore numeric, p_note text, p_materiali text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.tickets; v_id uuid;
begin
  select * into t from public.tickets where id = p_ticket;
  if auth.uid() is null or t.id is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_tickets', t.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi scrivere rapporti su questa richiesta.';
  end if;
  if p_tecnico is not null and not exists (select 1 from public.profiles p where p.id = p_tecnico and p.company_id = t.company_id) then
    raise exception using errcode = '22023', message = 'Il tecnico non è di questa azienda.';
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception using errcode = '22023', message = 'Scrivi cosa è stato fatto.'; end if;
  if p_ore is not null and (p_ore < 0 or p_ore > 24) then raise exception using errcode = '22023', message = 'Ore non valide.'; end if;
  insert into public.campo_interventi_esiti (company_id, ticket_id, user_id, iniziato_at, finito_at, note, ore, materiali, inserito_da)
  values (t.company_id, p_ticket, coalesce(p_tecnico, auth.uid()), coalesce(p_quando, now()), coalesce(p_quando, now()),
          left(btrim(p_note), 4000), p_ore, nullif(left(btrim(coalesce(p_materiali, '')), 2000), ''), auth.uid())
  returning id into v_id;
  update public.tickets set ore_effettive = coalesce(ore_effettive, 0) + coalesce(p_ore, 0),
    data_intervento_effettiva = coalesce(data_intervento_effettiva, coalesce(p_quando, now()))
  where id = p_ticket;
  return jsonb_build_object('id', v_id);
end $$;
revoke all on function public.ufficio_intervento_rapporto_salva(uuid, uuid, timestamptz, numeric, text, text) from public, anon;
grant execute on function public.ufficio_intervento_rapporto_salva(uuid, uuid, timestamptz, numeric, text, text) to authenticated;
