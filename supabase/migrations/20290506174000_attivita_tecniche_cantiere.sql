set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table private.campo_accessi_tecnici add column if not exists registra_rilievi boolean not null default false;

create table if not exists private.campo_avanzamenti_scheda (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  phase_id uuid not null references public.order_work_phases(id) on delete cascade,
  subphase_id uuid references public.order_work_subphases(id) on delete set null,
  sottofase text,
  autore uuid references public.profiles(id) on delete set null,
  registrato_il timestamptz not null default now(),
  percentuale integer not null check (percentuale between 0 and 100),
  note text check (char_length(note) <= 3000),
  foto text[] not null default '{}' check (cardinality(foto) <= 8)
);
alter table private.campo_avanzamenti_scheda enable row level security;
revoke all on private.campo_avanzamenti_scheda from public, anon, authenticated;
create index if not exists campo_avanzamenti_per_fase on private.campo_avanzamenti_scheda (phase_id, registrato_il desc, id);
create index if not exists campo_avanzamenti_per_commessa on private.campo_avanzamenti_scheda (order_id);

create or replace function private.campo_puo_aggiornare_fasi(p_azienda uuid, p_ordine uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.campo_scheda_visibile(p_azienda, p_ordine), false)
    and not public.utente_sola_lettura(p_azienda)
    and exists (
      select 1 from public.order_campo_assignments a
      where a.company_id = p_azienda and a.order_id = p_ordine and a.user_id = auth.uid()
        and a.role_type = 'employee' and a.is_capocantiere
    );
$$;

create or replace function private.campo_puo_registrare_rilievi(p_azienda uuid, p_ordine uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.campo_scheda_visibile(p_azienda, p_ordine), false)
    and not public.utente_sola_lettura(p_azienda)
    and exists (
      select 1 from private.campo_accessi_tecnici a
      where a.order_id = p_ordine and a.user_id = auth.uid() and a.registra_rilievi
    );
$$;

create or replace function private.campo_avanzamenti_leggibili(p_azienda uuid, p_ordine uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.campo_scheda_visibile(p_azienda, p_ordine), false)
    or (
      auth.uid() is not null and p_azienda = public.get_effective_company_id()
      and not public.utente_bloccato() and not public.utente_e_cliente_esterno() and not public.e_solo_campo()
      and public.has_permission_for_company(auth.uid(), 'can_view_orders', p_azienda)
      and private.office_visible_order(p_ordine)
      and exists (
        select 1 from public.orders o where o.id = p_ordine and o.company_id = p_azienda and o.deleted_at is null
      )
    );
$$;

create or replace function private.campo_dati_operativi_scheda(p_azienda uuid, p_ordine uuid, p_sezione text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  puo_avanzare boolean := private.campo_puo_aggiornare_fasi(p_azienda, p_ordine);
  misure jsonb;
begin
  if puo_avanzare and p_sezione = 'piano' then
    select jsonb_object_agg(s.id, jsonb_build_object(
      'totale', v.quantita, 'unita', v.unita,
      'eseguita', round(coalesce(s.quantita_fatta, v.quantita * (case when s.fatta then 100 else s.percentuale end) / 100), 3)
    )) into misure
    from public.campo_quantita_sottofasi(p_ordine) v
    join public.order_work_subphases s on s.id = v.subphase_id
    join public.order_work_phases f on f.id = s.phase_id
    where f.order_id = p_ordine and f.company_id = p_azienda and v.quantita > 0;
  end if;
  return jsonb_build_object(
    'permessi', jsonb_build_object(
      'aggiorna_fasi', coalesce(puo_avanzare, false),
      'registra_rilievi', coalesce(private.campo_puo_registrare_rilievi(p_azienda, p_ordine), false)
    ),
    'misure', coalesce(misure, '{}'::jsonb)
  );
end;
$$;

create or replace function public.campo_scheda_cantiere(p_azienda uuid, p_ordine uuid, p_sezione text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select private.campo_scheda_cantiere(p_azienda, p_ordine, p_sezione)
    || private.campo_dati_operativi_scheda(p_azienda, p_ordine, p_sezione);
$$;

create or replace function private.commessa_accessi_tecnici(p_ordine uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  azienda uuid := public.get_effective_company_id();
  persone jsonb;
begin
  if not coalesce(private.campo_accessi_tecnici_gestibili(p_ordine), false) then
    raise exception using errcode = '42501', message = 'Gestione accessi non autorizzata.';
  end if;
  with utenti as (
    select id from public.profiles where company_id = azienda
    union
    select user_id from public.multi_company_access where company_id = azienda
      and status = 'active' and (expires_at is null or expires_at > now())
    union
    select user_id from private.campo_accessi_tecnici where order_id = p_ordine
  ), accessi as materialized (
    select p.id, coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Utente interno') as nome,
      a.user_id is not null as abilitato, private.campo_tecnico_interno(azienda, p.id) as ammissibile,
      coalesce(a.registra_rilievi, false) as registra_rilievi
    from utenti u join public.profiles p on p.id = u.id
    left join private.campo_accessi_tecnici a on a.order_id = p_ordine and a.user_id = p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'abilitato', a.abilitato,
    'ammissibile', a.ammissibile, 'registra_rilievi', a.registra_rilievi)
    order by lower(a.nome), a.id), '[]'::jsonb) into persone
  from accessi a where a.abilitato or a.ammissibile;
  return persone;
end;
$$;

create or replace function private.commessa_permesso_rilievi(p_ordine uuid, p_persona uuid, p_consentito boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(private.campo_accessi_tecnici_gestibili(p_ordine), false) then
    raise exception using errcode = '42501', message = 'Gestione accessi non autorizzata.';
  end if;
  if p_consentito is null or p_persona is null
    or (p_consentito and not private.campo_tecnico_interno(public.get_effective_company_id(), p_persona)) then
    raise exception using errcode = '22023', message = 'Scegli una persona interna attiva.';
  end if;
  update private.campo_accessi_tecnici set registra_rilievi = p_consentito
    where order_id = p_ordine and user_id = p_persona;
  if not found then
    raise exception using errcode = '22023', message = 'Abilita prima la consultazione per questa persona.';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campo-avanzamenti', 'campo-avanzamenti', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Percorso: azienda/commessa/autore/operazione/foto. I file temporanei sono visibili solo all’autore.
create or replace function private.campo_foto_avanzamento(p_percorso text, p_scrittura boolean)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  parti text[] := string_to_array(p_percorso, '/');
  uuid_test constant text := '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';
  azienda uuid;
  commessa uuid;
  operazione uuid;
  salvata private.campo_avanzamenti_scheda;
begin
  if auth.uid() is null or coalesce(array_length(parti, 1), 0) <> 5
    or parti[1] !~ uuid_test or parti[2] !~ uuid_test or parti[3] !~ uuid_test or parti[4] !~ uuid_test
    or parti[5] !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  azienda := parti[1]::uuid;
  commessa := parti[2]::uuid;
  operazione := parti[4]::uuid;
  select * into salvata from private.campo_avanzamenti_scheda a where a.id = operazione;
  if found then
    return not p_scrittura and salvata.order_id = commessa and p_percorso = any(salvata.foto)
      and private.campo_avanzamenti_leggibili(azienda, commessa);
  end if;
  return parti[3] = auth.uid()::text and private.campo_puo_aggiornare_fasi(azienda, commessa);
end;
$$;

drop policy if exists campo_avanzamento_foto_leggi on storage.objects;
create policy campo_avanzamento_foto_leggi on storage.objects for select to authenticated
  using (bucket_id = 'campo-avanzamenti' and private.campo_foto_avanzamento(name, false));
drop policy if exists campo_avanzamento_foto_carica on storage.objects;
create policy campo_avanzamento_foto_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'campo-avanzamenti' and owner_id = (select auth.uid()::text) and private.campo_foto_avanzamento(name, true));
drop policy if exists campo_avanzamento_foto_rimuovi on storage.objects;
create policy campo_avanzamento_foto_rimuovi on storage.objects for delete to authenticated
  using (bucket_id = 'campo-avanzamenti' and owner_id = (select auth.uid()::text) and private.campo_foto_avanzamento(name, true));
drop policy if exists campo_avanzamento_foto_leggi_guard on storage.objects;
create policy campo_avanzamento_foto_leggi_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'campo-avanzamenti' or private.campo_foto_avanzamento(name, false));
drop policy if exists campo_avanzamento_foto_carica_guard on storage.objects;
create policy campo_avanzamento_foto_carica_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'campo-avanzamenti' or (owner_id = (select auth.uid()::text) and private.campo_foto_avanzamento(name, true)));
drop policy if exists campo_avanzamento_foto_rimuovi_guard on storage.objects;
create policy campo_avanzamento_foto_rimuovi_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'campo-avanzamenti' or (owner_id = (select auth.uid()::text) and private.campo_foto_avanzamento(name, true)));
drop policy if exists campo_avanzamento_foto_immutabili on storage.objects;
create policy campo_avanzamento_foto_immutabili on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'campo-avanzamenti') with check (bucket_id <> 'campo-avanzamenti');
drop policy if exists campo_avanzamento_foto_private on storage.objects;
create policy campo_avanzamento_foto_private on storage.objects as restrictive for all to anon
  using (bucket_id <> 'campo-avanzamenti') with check (bucket_id <> 'campo-avanzamenti');

create or replace function private.campo_registra_avanzamento(
  p_azienda uuid, p_ordine uuid, p_fase uuid, p_sottofase uuid, p_operazione uuid,
  p_avanzamento numeric, p_precedente numeric, p_previsto numeric, p_note text, p_foto text[]
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  f public.order_work_phases;
  s public.order_work_subphases;
  evento private.campo_avanzamenti_scheda;
  note_pulite text := nullif(btrim(p_note, E' \t\n\r'), '');
  foto text[] := coalesce(p_foto, '{}');
  percorso text;
  presente numeric;
  percentuale_prima integer;
  percentuale_dopo integer;
  totale numeric;
  misura numeric;
begin
  if not coalesce(private.campo_puo_aggiornare_fasi(p_azienda, p_ordine), false) then
    raise exception using errcode = '42501', message = 'Aggiornamento riservato al capocantiere assegnato.';
  end if;
  perform 1 from public.order_campo_assignments a
    where a.company_id = p_azienda and a.order_id = p_ordine and a.user_id = auth.uid()
      and a.role_type = 'employee' and a.is_capocantiere for share;
  if not found then
    raise exception using errcode = '42501', message = 'Assegnazione del capocantiere non disponibile.';
  end if;
  if p_operazione is null or p_fase is null or char_length(note_pulite) > 3000 or cardinality(foto) > 8 then
    raise exception using errcode = '22023', message = 'Controlla le note e le foto dell’aggiornamento.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campo-avanzamento:' || p_operazione::text, 0));
  select * into evento from private.campo_avanzamenti_scheda a where a.id = p_operazione;
  if found then
    if evento.order_id = p_ordine and evento.phase_id = p_fase and evento.subphase_id is not distinct from p_sottofase
      and evento.autore = auth.uid() then return evento.id; end if;
    raise exception using errcode = '42501', message = 'Aggiornamento non autorizzato.';
  end if;

  foreach percorso in array foto loop
    if percorso is null or split_part(percorso, '/', 4) is distinct from p_operazione::text
      or split_part(percorso, '/', 1) is distinct from p_azienda::text
      or split_part(percorso, '/', 2) is distinct from p_ordine::text
      or not coalesce(private.campo_foto_avanzamento(percorso, true), false)
      or not exists (
        select 1 from storage.objects o where o.bucket_id = 'campo-avanzamenti' and o.name = percorso
          and o.owner_id = auth.uid()::text
      ) then
      raise exception using errcode = '22023', message = 'Una foto non è ancora disponibile. Riprova il caricamento.';
    end if;
  end loop;
  if (select count(distinct x) from unnest(foto) x) <> cardinality(foto) then
    raise exception using errcode = '22023', message = 'Hai allegato la stessa foto più volte.';
  end if;

  if p_sottofase is null then
    select * into f from public.order_work_phases q
      where q.id = p_fase and q.order_id = p_ordine and q.company_id = p_azienda for update;
    if not found then
      raise exception using errcode = '42501', message = 'Fase non disponibile in questo cantiere.';
    end if;
    percentuale_prima := case when f.status = 'completata' then 100
      else least(100, greatest(0, round(coalesce(f.percentuale, 0)))) end;
    if p_avanzamento is not null and exists (
      select 1 from public.order_work_subphases q where q.phase_id = p_fase
    ) then
      raise exception using errcode = '22023', message = 'Aggiorna le sottofasi per modificare l’avanzamento della fase.';
    end if;
  else
    select q.* into s from public.order_work_subphases q
    join public.order_work_phases a on a.id = q.phase_id
    where q.id = p_sottofase and a.id = p_fase and a.order_id = p_ordine and a.company_id = p_azienda
    for update of q;
    if not found then
      raise exception using errcode = '42501', message = 'Sottofase non disponibile in questa fase.';
    end if;
    percentuale_prima := case when s.fatta then 100 else s.percentuale end;
    totale := public.sottofase_quantita_totale(p_sottofase);
  end if;

  percentuale_dopo := percentuale_prima;
  if p_avanzamento is not null then
    presente := case when totale > 0
      then round(coalesce(s.quantita_fatta, totale * percentuale_prima / 100), 3) else percentuale_prima end;
    if presente is distinct from p_precedente or totale is distinct from p_previsto then
      raise exception using errcode = '40001', message = 'Il valore è cambiato. Rileggi l’avanzamento e riprova.';
    end if;
    if p_avanzamento < 0 or p_avanzamento >= 100000000000
      or (totale is null and (p_avanzamento > 100 or p_avanzamento <> trunc(p_avanzamento)))
      or (totale is not null and p_avanzamento <> round(p_avanzamento, 3)) then
      raise exception using errcode = '22023', message = 'Inserisci una percentuale o una quantità valida.';
    end if;
    if totale > 0 then
      misura := p_avanzamento;
      percentuale_dopo := case when misura >= totale then 100 when misura = 0 then 0
        else greatest(1, least(99, round(100 * misura / totale)))::integer end;
    else
      percentuale_dopo := p_avanzamento::integer;
    end if;
    if p_sottofase is null then
      update public.order_work_phases set
        percentuale = percentuale_dopo,
        status = case percentuale_dopo when 100 then 'completata' when 0 then 'da_iniziare' else 'in_corso' end,
        completata_il = case when percentuale_dopo = 100 then
          coalesce(case when f.status = 'completata' then f.completata_il end, now()) end,
        completata_da = case when percentuale_dopo = 100 then
          coalesce(case when f.status = 'completata' then f.completata_da end, auth.uid()) end,
        updated_at = now()
      where id = p_fase
      returning case when status = 'completata' then 100 else percentuale end into percentuale_dopo;
    else
      update public.order_work_subphases set percentuale = percentuale_dopo, fatta = percentuale_dopo = 100, quantita_fatta = misura
        where id = p_sottofase returning case when fatta then 100 else percentuale end into percentuale_dopo;
    end if;
  elsif note_pulite is null and cardinality(foto) = 0 then
    raise exception using errcode = '22023', message = 'Aggiungi un avanzamento, una nota o una foto.';
  end if;

  insert into private.campo_avanzamenti_scheda (id, order_id, phase_id, subphase_id, sottofase, autore, percentuale, note, foto)
  values (p_operazione, p_ordine, p_fase, p_sottofase, s.name, auth.uid(), percentuale_dopo, note_pulite, foto);
  return p_operazione;
end;
$$;

create or replace function private.campo_avanzamenti_cantiere(p_azienda uuid, p_ordine uuid, p_fase uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  esito jsonb;
begin
  if not coalesce(private.campo_avanzamenti_leggibili(p_azienda, p_ordine), false) then
    raise exception using errcode = '42501', message = 'Aggiornamenti di cantiere non autorizzati.';
  end if;
  select jsonb_agg(jsonb_build_object(
    'id', a.id, 'sottofase', a.sottofase, 'percentuale', a.percentuale, 'note', a.note, 'foto', a.foto,
    'registrato_il', a.registrato_il, 'autore', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '')
  ) order by a.registrato_il desc, a.id) into esito
  from (
    select * from private.campo_avanzamenti_scheda a
    where a.order_id = p_ordine and a.phase_id = p_fase order by a.registrato_il desc, a.id limit 30
  ) a left join public.profiles p on p.id = a.autore;
  return coalesce(esito, '[]'::jsonb);
end;
$$;

-- Modello riservato alla registrazione rapida. Il sopralluogo resta nel normale archivio della commessa.
insert into public.survey_templates (id, category, name, is_system, is_active, schema)
values ('feca0825-6909-4208-9ed7-cd52070ea1d5', 'custom', 'Rilievo e sopralluogo di cantiere', true, false,
  '{"version":1,"header_schema":[{"key":"visita","label":"Visita in cantiere","default_open":true,"fields":[{"key":"tipo_visita_cantiere","label":"Tipo","type":"select","options":[{"value":"rilievo","label":"Rilievo"},{"value":"sopralluogo","label":"Sopralluogo"}]},{"key":"giorno_visita","label":"Data","type":"date"},{"key":"misure_rilevate","label":"Misure rilevate","type":"textarea"}]}],"element_types":[]}'::jsonb)
on conflict (id) do nothing;

create or replace function private.campo_registra_rilievo(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_tipo text, p_giorno date, p_misure text, p_note text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  modello constant uuid := 'feca0825-6909-4208-9ed7-cd52070ea1d5';
  ordine public.orders;
  oggi date := (now() at time zone 'Europe/Rome')::date;
  misure text := nullif(btrim(p_misure, E' \t\n\r'), '');
  note_pulite text := nullif(btrim(p_note, E' \t\n\r'), '');
  esistente public.surveys;
begin
  if not coalesce(private.campo_puo_registrare_rilievi(p_azienda, p_ordine), false) then
    raise exception using errcode = '42501', message = 'Registrazione di rilievi non autorizzata per questo cantiere.';
  end if;
  perform 1 from private.campo_accessi_tecnici a
    where a.order_id = p_ordine and a.user_id = auth.uid() and a.registra_rilievi for share;
  if not found then
    raise exception using errcode = '42501', message = 'Il permesso per i rilievi è stato revocato.';
  end if;
  if p_operazione is null or p_tipo is null or p_tipo not in ('rilievo', 'sopralluogo')
    or p_giorno is null or not isfinite(p_giorno) or p_giorno > oggi
    or char_length(misure) > 3000 or char_length(note_pulite) > 3000
    or (p_tipo = 'rilievo' and misure is null) or (p_tipo = 'sopralluogo' and note_pulite is null) then
    raise exception using errcode = '22023', message = 'Controlla data, misure e note della visita.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campo-rilievo:' || p_operazione::text, 0));
  select * into esistente from public.surveys where id = p_operazione;
  if found then
    if esistente.order_id = p_ordine and esistente.company_id = p_azienda and esistente.created_by = auth.uid()
      and esistente.template_id = modello and esistente.deleted_at is null then return esistente.id; end if;
    raise exception using errcode = '42501', message = 'Visita non disponibile in questo cantiere.';
  end if;
  select * into ordine from public.orders where id = p_ordine and company_id = p_azienda and deleted_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'Cantiere non disponibile.';
  end if;
  insert into public.surveys (id, company_id, order_id, client_id, technician_id, created_by,
    template_id, mode, status, header_data, address, notes, completed_at)
  values (p_operazione, p_azienda, p_ordine, ordine.customer_id, auth.uid(), auth.uid(), modello, 'express', 'completed',
    jsonb_strip_nulls(jsonb_build_object('tipo_visita_cantiere', p_tipo, 'giorno_visita', p_giorno, 'misure_rilevate', misure)),
    coalesce(nullif(btrim(ordine.indirizzo_lavori), ''), ordine.work_address), note_pulite,
    case when p_giorno = oggi then now() else ((p_giorno + time '12:00') at time zone 'Europe/Rome') end);
  insert into public.survey_activity_log (survey_id, user_id, event_type, event_data)
  values (p_operazione, auth.uid(), 'registrato_dal_cantiere', jsonb_build_object('tipo', p_tipo));
  return p_operazione;
end;
$$;

create or replace function private.campo_rilievi_cantiere(p_azienda uuid, p_ordine uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  esito jsonb;
begin
  if not coalesce(private.campo_puo_registrare_rilievi(p_azienda, p_ordine), false) then
    raise exception using errcode = '42501', message = 'Rilievi di cantiere non autorizzati.';
  end if;
  select jsonb_agg(jsonb_build_object(
    'id', s.id, 'codice', s.code, 'tipo', s.header_data ->> 'tipo_visita_cantiere',
    'giorno', coalesce(s.header_data ->> 'giorno_visita', (s.completed_at at time zone 'Europe/Rome')::date::text),
    'misure', s.header_data ->> 'misure_rilevate', 'note', s.notes
  ) order by s.completed_at desc nulls last, s.id) into esito
  from (
    select id, code, header_data, notes, completed_at from public.surveys
    where company_id = p_azienda and order_id = p_ordine and created_by = auth.uid() and deleted_at is null
      and template_id = 'feca0825-6909-4208-9ed7-cd52070ea1d5'
    order by completed_at desc nulls last, id limit 30
  ) s;
  return coalesce(esito, '[]'::jsonb);
end;
$$;

create or replace trigger campo_avanzamento_scheda_sync after insert on private.campo_avanzamenti_scheda
for each row execute function public.commessa_campo_segnala_modifica();
create or replace trigger campo_accesso_scheda_sync after insert or update or delete on private.campo_accessi_tecnici
for each row execute function public.commessa_campo_segnala_modifica();
create or replace trigger campo_rilievo_scheda_sync after insert on public.surveys
for each row when (new.order_id is not null and new.template_id = 'feca0825-6909-4208-9ed7-cd52070ea1d5')
execute function public.commessa_campo_segnala_modifica();

create or replace function public.commessa_permesso_rilievi(p_ordine uuid, p_persona uuid, p_consentito boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.commessa_permesso_rilievi(p_ordine, p_persona, p_consentito); $$;

create or replace function public.campo_registra_avanzamento(
  p_azienda uuid, p_ordine uuid, p_fase uuid, p_sottofase uuid, p_operazione uuid,
  p_avanzamento numeric, p_precedente numeric, p_previsto numeric, p_note text, p_foto text[]
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.campo_registra_avanzamento(p_azienda, p_ordine, p_fase, p_sottofase, p_operazione,
  p_avanzamento, p_precedente, p_previsto, p_note, p_foto); $$;

create or replace function public.campo_avanzamenti_cantiere(p_azienda uuid, p_ordine uuid, p_fase uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.campo_avanzamenti_cantiere(p_azienda, p_ordine, p_fase); $$;

create or replace function public.campo_registra_rilievo(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_tipo text, p_giorno date, p_misure text, p_note text
)
returns uuid language sql security invoker set search_path = ''
as $$ select private.campo_registra_rilievo(p_azienda, p_ordine, p_operazione, p_tipo, p_giorno, p_misure, p_note); $$;

create or replace function public.campo_rilievi_cantiere(p_azienda uuid, p_ordine uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.campo_rilievi_cantiere(p_azienda, p_ordine); $$;

revoke all on function private.campo_puo_aggiornare_fasi(uuid, uuid), private.campo_puo_registrare_rilievi(uuid, uuid),
  private.campo_avanzamenti_leggibili(uuid, uuid)
from public, anon, authenticated;

revoke all on function
  private.campo_dati_operativi_scheda(uuid, uuid, text), private.campo_foto_avanzamento(text, boolean),
  private.commessa_permesso_rilievi(uuid, uuid, boolean), public.commessa_permesso_rilievi(uuid, uuid, boolean),
  private.campo_registra_avanzamento(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  public.campo_registra_avanzamento(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  private.campo_avanzamenti_cantiere(uuid, uuid, uuid), public.campo_avanzamenti_cantiere(uuid, uuid, uuid),
  private.campo_registra_rilievo(uuid, uuid, uuid, text, date, text, text),
  public.campo_registra_rilievo(uuid, uuid, uuid, text, date, text, text),
  private.campo_rilievi_cantiere(uuid, uuid), public.campo_rilievi_cantiere(uuid, uuid)
from public, anon;

grant execute on function
  private.campo_dati_operativi_scheda(uuid, uuid, text), private.campo_foto_avanzamento(text, boolean),
  private.commessa_permesso_rilievi(uuid, uuid, boolean), public.commessa_permesso_rilievi(uuid, uuid, boolean),
  private.campo_registra_avanzamento(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  public.campo_registra_avanzamento(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  private.campo_avanzamenti_cantiere(uuid, uuid, uuid), public.campo_avanzamenti_cantiere(uuid, uuid, uuid),
  private.campo_registra_rilievo(uuid, uuid, uuid, text, date, text, text),
  public.campo_registra_rilievo(uuid, uuid, uuid, text, date, text, text),
  private.campo_rilievi_cantiere(uuid, uuid), public.campo_rilievi_cantiere(uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';
