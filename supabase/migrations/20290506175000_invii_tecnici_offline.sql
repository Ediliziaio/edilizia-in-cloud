set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.campo_verifica_autore_invio(p_autore uuid)
returns void language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_autore is null or p_autore is distinct from auth.uid() then
    raise exception using errcode = 'PT409', message = 'Accedi con l’autore della registrazione per sincronizzarla.';
  end if;
end;
$$;

-- Receipt and authorization check before any upload, including after a lost response.
create or replace function private.campo_stato_invio_tecnico(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_tipo text, p_fase uuid, p_sottofase uuid
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  aggiornamento private.campo_avanzamenti_scheda;
  visita public.surveys;
begin
  if p_operazione is null then
    raise exception using errcode = '22023', message = 'Identificativo di invio mancante.';
  end if;
  if p_tipo = 'avanzamento' then
    if not private.campo_puo_aggiornare_fasi(p_azienda, p_ordine) or not exists (
      select 1 from public.order_work_phases f
      where f.id = p_fase and f.order_id = p_ordine and f.company_id = p_azienda
        and (p_sottofase is null or exists (
          select 1 from public.order_work_subphases s where s.id = p_sottofase and s.phase_id = f.id
        ))
    ) then
      raise exception using errcode = '42501', message = 'Cantiere, fase o permesso di aggiornamento non disponibile.';
    end if;
    select * into aggiornamento from private.campo_avanzamenti_scheda a where a.id = p_operazione;
    if not found then return false; end if;
    if aggiornamento.order_id = p_ordine and aggiornamento.phase_id = p_fase
      and aggiornamento.subphase_id is not distinct from p_sottofase and aggiornamento.autore = auth.uid() then
      return true;
    end if;
  elsif p_tipo = 'rilievo' then
    if not private.campo_puo_registrare_rilievi(p_azienda, p_ordine) then
      raise exception using errcode = '42501', message = 'Permesso di registrare visite non disponibile per questo cantiere.';
    end if;
    select * into visita from public.surveys s where s.id = p_operazione;
    if not found then return false; end if;
    if visita.company_id = p_azienda and visita.order_id = p_ordine and visita.created_by = auth.uid()
      and visita.template_id = 'feca0825-6909-4208-9ed7-cd52070ea1d5' and visita.deleted_at is null then
      return true;
    end if;
  end if;
  raise exception using errcode = '42501', message = 'Operazione non disponibile in questo cantiere.';
end;
$$;

create or replace function public.campo_stato_invio_tecnico(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_autore uuid, p_tipo text, p_fase uuid, p_sottofase uuid
)
returns boolean language plpgsql stable security invoker set search_path = ''
as $$
begin
  perform private.campo_verifica_autore_invio(p_autore);
  return private.campo_stato_invio_tecnico(p_azienda, p_ordine, p_operazione, p_tipo, p_fase, p_sottofase);
end;
$$;

create or replace function public.campo_invia_avanzamento(
  p_azienda uuid, p_ordine uuid, p_fase uuid, p_sottofase uuid, p_operazione uuid, p_autore uuid,
  p_avanzamento numeric, p_precedente numeric, p_previsto numeric, p_note text, p_foto text[]
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
begin
  perform private.campo_verifica_autore_invio(p_autore);
  return private.campo_registra_avanzamento(p_azienda, p_ordine, p_fase, p_sottofase, p_operazione,
    p_avanzamento, p_precedente, p_previsto, p_note, p_foto);
end;
$$;

-- Survey media keep the same private bucket and storage_path used by the office.
-- The reserved path binds the upload to a single order, author and operation.
create or replace function private.campo_foto_visita(p_percorso text, p_scrittura boolean)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  parti text[] := string_to_array(p_percorso, '/');
  uuid_test constant text := '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$';
  azienda uuid;
  ordine uuid;
  visita public.surveys;
begin
  if auth.uid() is null or coalesce(array_length(parti, 1), 0) <> 6 or parti[3] <> 'visite-campo'
    or parti[1] !~ uuid_test or parti[2] !~ uuid_test or parti[4] !~ uuid_test or parti[5] !~ uuid_test
    or parti[6] !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  azienda := parti[1]::uuid;
  ordine := parti[4]::uuid;
  select * into visita from public.surveys s where s.id = parti[2]::uuid;
  if not found then
    return parti[5] = auth.uid()::text and private.campo_puo_registrare_rilievi(azienda, ordine);
  end if;
  if p_scrittura or visita.company_id is distinct from azienda or visita.order_id is distinct from ordine
    or visita.created_by::text is distinct from parti[5] or visita.deleted_at is not null
    or visita.template_id is distinct from 'feca0825-6909-4208-9ed7-cd52070ea1d5'::uuid
    or not exists (
      select 1 from public.survey_media m where m.survey_id = visita.id and m.type = 'photo' and m.storage_path = p_percorso
    ) then
    return false;
  end if;
  return (visita.created_by = auth.uid() and private.campo_puo_registrare_rilievi(azienda, ordine))
    or (
      azienda = public.get_effective_company_id()
      and not public.utente_bloccato() and not public.utente_e_cliente_esterno() and not public.e_solo_campo()
      and public.has_permission_for_company(auth.uid(), 'can_view_sopralluoghi', azienda)
      and private.office_visible_order(ordine)
      and exists (select 1 from public.orders o where o.id = ordine and o.company_id = azienda and o.deleted_at is null)
    );
end;
$$;

create or replace function survey_private.storage_allowed(path text, writing boolean) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare parts text[] := string_to_array(path,'/');
begin
  if parts[3] = 'visite-campo' then return private.campo_foto_visita(path, writing); end if;
  if auth.uid() is null or array_length(parts,1)<3
    or parts[1] is distinct from public.get_my_company_id()::text
    or parts[2] !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  return survey_private.field_allowed(parts[2]::uuid,writing);
end;
$$;

drop policy if exists campo_visita_foto_leggi on storage.objects;
create policy campo_visita_foto_leggi on storage.objects for select to authenticated
  using (bucket_id = 'surveys' and split_part(name, '/', 3) = 'visite-campo' and private.campo_foto_visita(name, false));
drop policy if exists campo_visita_foto_carica on storage.objects;
create policy campo_visita_foto_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'surveys' and split_part(name, '/', 3) = 'visite-campo'
    and owner_id = (select auth.uid()::text) and private.campo_foto_visita(name, true));
drop policy if exists campo_visita_foto_leggi_guard on storage.objects;
create policy campo_visita_foto_leggi_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo' or private.campo_foto_visita(name, false));
drop policy if exists campo_visita_foto_carica_guard on storage.objects;
create policy campo_visita_foto_carica_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo'
    or (owner_id = (select auth.uid()::text) and private.campo_foto_visita(name, true)));
drop policy if exists campo_visita_foto_rimuovi_guard on storage.objects;
create policy campo_visita_foto_rimuovi_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo'
    or (owner_id = (select auth.uid()::text) and private.campo_foto_visita(name, true)));
drop policy if exists campo_visita_foto_immutabili on storage.objects;
create policy campo_visita_foto_immutabili on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo')
  with check (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo');
drop policy if exists campo_visita_foto_private on storage.objects;
create policy campo_visita_foto_private on storage.objects as restrictive for all to anon
  using (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo')
  with check (bucket_id <> 'surveys' or split_part(name, '/', 3) <> 'visite-campo');

-- Field users' ordinary media policy still applies to direct table writes.
-- This branch lets the scoped RPC attach uploaded photos to its completed visit.
create or replace function survey_private.guard_child() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid:=coalesce(new.survey_id,old.survey_id); parent_status text; signature_at timestamptz; begin
  if not survey_private.field_actor() then return coalesce(new,old); end if;
  if tg_table_name = 'survey_media' and tg_op = 'INSERT' then
    if new.type = 'photo' and new.area_id is null and new.element_id is null and exists (
      select 1 from public.surveys s join storage.objects o on o.bucket_id = 'surveys' and o.name = new.storage_path
      where s.id = sid and s.created_by = auth.uid() and s.deleted_at is null and s.status = 'completed'
        and s.template_id = 'feca0825-6909-4208-9ed7-cd52070ea1d5'
        and private.campo_puo_registrare_rilievi(s.company_id, s.order_id)
        and o.owner_id = auth.uid()::text
        and regexp_replace(o.name, '/[^/]*$', '') = concat_ws('/', s.company_id, s.id, 'visite-campo', s.order_id, s.created_by)
    ) then
      new.created_by := auth.uid();
      return new;
    end if;
  end if;
  -- Parent lock serializes uploads/edits and hand-off: no write can race past submission.
  select status,client_signature_at into parent_status,signature_at from public.surveys where id=sid for update;
  if parent_status not in ('draft','in_progress') or signature_at is not null or not survey_private.field_allowed(sid,true) then raise exception 'Rilievo in revisione o non autorizzato'; end if;
  if tg_op='UPDATE' and new.survey_id<>old.survey_id then raise exception 'Sopralluogo immutabile'; end if;
  if tg_op<>'DELETE' and tg_table_name in ('survey_elements','survey_media') then
    if (to_jsonb(new)->>'area_id') is not null and not exists(select 1 from public.survey_areas a where a.id=(to_jsonb(new)->>'area_id')::uuid and a.survey_id=sid) then raise exception 'Area estranea al rilievo'; end if;
    if tg_table_name='survey_media' and (to_jsonb(new)->>'element_id') is not null and not exists(select 1 from public.survey_elements e where e.id=(to_jsonb(new)->>'element_id')::uuid and e.survey_id=sid and e.area_id is not distinct from (to_jsonb(new)->>'area_id')::uuid) then raise exception 'Elemento estraneo al rilievo'; end if;
    if tg_table_name='survey_media' then
      if new.type='signature' then raise exception 'Firma riservata all’ufficio'; end if;
      if new.storage_path is null or not survey_private.storage_allowed(new.storage_path,true) then raise exception 'Percorso foto non autorizzato'; end if;
      new.created_by=auth.uid();
    end if;
  end if;
  return coalesce(new,old);
end $$;

create or replace function private.campo_registra_visita_con_foto(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_tipo text, p_giorno date, p_misure text, p_note text, p_foto text[]
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  foto text[] := coalesce(p_foto, '{}');
  percorso text;
begin
  if p_operazione is null then
    raise exception using errcode = '22023', message = 'Identificativo di invio mancante.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('campo-rilievo:' || p_operazione::text, 0));
  if private.campo_stato_invio_tecnico(p_azienda, p_ordine, p_operazione, 'rilievo', null, null) then
    return p_operazione;
  end if;
  if cardinality(foto) > 8 or (select count(distinct p) from unnest(foto) p) <> cardinality(foto) then
    raise exception using errcode = '22023', message = 'Allega al massimo otto foto diverse.';
  end if;
  foreach percorso in array foto loop
    if split_part(percorso, '/', 1) is distinct from p_azienda::text
      or split_part(percorso, '/', 2) is distinct from p_operazione::text
      or split_part(percorso, '/', 4) is distinct from p_ordine::text
      or not coalesce(private.campo_foto_visita(percorso, true), false) then
      raise exception using errcode = '42501', message = 'Foto estranea al cantiere o all’invio.';
    end if;
    perform 1 from storage.objects o where o.bucket_id = 'surveys' and o.name = percorso
      and o.owner_id = auth.uid()::text for share;
    if not found then
      raise exception using errcode = '22023', message = 'Una foto non è ancora disponibile. Riprova il caricamento.';
    end if;
  end loop;

  perform private.campo_registra_rilievo(p_azienda, p_ordine, p_operazione, p_tipo, p_giorno, p_misure, p_note);
  insert into public.survey_media(survey_id, type, storage_path, url, position, filename, mime_type, created_by)
  select p_operazione, 'photo', p, '', (n - 1)::int, split_part(p, '/', 6),
    case when p like '%.png' then 'image/png' when p like '%.webp' then 'image/webp' else 'image/jpeg' end, auth.uid()
  from unnest(foto) with ordinality as allegati(p, n);
  return p_operazione;
end;
$$;

create or replace function public.campo_registra_visita_con_foto(
  p_azienda uuid, p_ordine uuid, p_operazione uuid, p_autore uuid, p_tipo text, p_giorno date, p_misure text, p_note text, p_foto text[]
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
begin
  perform private.campo_verifica_autore_invio(p_autore);
  return private.campo_registra_visita_con_foto(p_azienda, p_ordine, p_operazione, p_tipo, p_giorno, p_misure, p_note, p_foto);
end;
$$;

create or replace function private.campo_rilievi_cantiere(p_azienda uuid, p_ordine uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  esito jsonb;
begin
  if not private.campo_puo_registrare_rilievi(p_azienda, p_ordine) then
    raise exception using errcode = '42501', message = 'Rilievi di cantiere non autorizzati.';
  end if;
  select jsonb_agg(jsonb_build_object(
    'id', s.id, 'codice', s.code, 'tipo', s.header_data ->> 'tipo_visita_cantiere',
    'giorno', coalesce(s.header_data ->> 'giorno_visita', (s.completed_at at time zone 'Europe/Rome')::date::text),
    'misure', s.header_data ->> 'misure_rilevate', 'note', s.notes,
    'foto', coalesce((select jsonb_agg(m.storage_path order by m.position, m.id) from public.survey_media m
      where m.survey_id = s.id and m.type = 'photo' and split_part(m.storage_path, '/', 3) = 'visite-campo'), '[]'::jsonb)
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

revoke all on function private.campo_foto_visita(text, boolean),
  private.campo_verifica_autore_invio(uuid),
  private.campo_stato_invio_tecnico(uuid, uuid, uuid, text, uuid, uuid),
  public.campo_stato_invio_tecnico(uuid, uuid, uuid, uuid, text, uuid, uuid),
  public.campo_invia_avanzamento(uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  private.campo_registra_visita_con_foto(uuid, uuid, uuid, text, date, text, text, text[]),
  public.campo_registra_visita_con_foto(uuid, uuid, uuid, uuid, text, date, text, text, text[])
from public, anon, authenticated;
grant execute on function private.campo_foto_visita(text, boolean),
  private.campo_verifica_autore_invio(uuid),
  private.campo_stato_invio_tecnico(uuid, uuid, uuid, text, uuid, uuid),
  public.campo_stato_invio_tecnico(uuid, uuid, uuid, uuid, text, uuid, uuid),
  public.campo_invia_avanzamento(uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, text, text[]),
  private.campo_registra_visita_con_foto(uuid, uuid, uuid, text, date, text, text, text[]),
  public.campo_registra_visita_con_foto(uuid, uuid, uuid, uuid, text, date, text, text, text[])
to authenticated;
