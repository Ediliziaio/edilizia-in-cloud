-- Importazioni programmate di contatti e opportunità (23/11/2026).
--
-- Chi importa un file può farlo entrare a scaglioni: per esempio 10 righe ogni 10
-- minuti, a partire da un'ora scelta, solo in una fascia oraria e in certi giorni.
-- Le righe del file, già lette e ripulite dal browser, aspettano qui; un giro ogni
-- minuto (pg_cron) le fa entrare: crea o aggiorna il contatto (e per le opportunità
-- anche l'opportunità), aggiunge le etichette e fa entrare i contatti nelle
-- automazioni scelte. Gli orari si leggono sull'ora italiana.

create table if not exists public.importazioni_programmate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  creata_da uuid default auth.uid(),
  oggetto text not null check (oggetto in ('contatti', 'opportunita')),
  nome_file text,
  modalita text not null default 'create' check (modalita in ('create', 'update', 'upsert')),
  pipeline_id uuid,
  fase_id uuid,
  automazioni jsonb not null default '[]'::jsonb,
  per_giro int not null check (per_giro between 1 and 500),
  ogni_minuti int not null check (ogni_minuti between 1 and 1440),
  inizio timestamptz not null default now(),
  fascia_da time,
  fascia_a time,
  giorni smallint[] not null default '{1,2,3,4,5,6,7}',
  stato text not null default 'attiva' check (stato in ('attiva', 'in_pausa', 'completata', 'annullata')),
  prossimo_giro timestamptz not null default now(),
  totale int not null default 0,
  fatte int not null default 0,
  creati int not null default 0,
  aggiornati int not null default 0,
  saltati int not null default 0,
  errori int not null default 0,
  ultimo_errore text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (oggetto = 'contatti' or (pipeline_id is not null and fase_id is not null))
);

create index if not exists importazioni_programmate_da_fare
  on public.importazioni_programmate (prossimo_giro) where stato = 'attiva';
create index if not exists importazioni_programmate_azienda
  on public.importazioni_programmate (company_id, created_at desc);

create table if not exists public.importazioni_programmate_righe (
  id bigint generated always as identity primary key,
  importazione_id uuid not null references public.importazioni_programmate(id) on delete cascade,
  ordine int not null,
  dati jsonb not null,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'fatta', 'saltata', 'errore')),
  esito text,
  contatto_id uuid,
  elaborata_at timestamptz
);

create index if not exists importazioni_programmate_righe_coda
  on public.importazioni_programmate_righe (importazione_id, ordine) where stato = 'in_attesa';

-- Chi può importare contatti (o opportunità) nell'azienda vede e gestisce le sue programmazioni.
create or replace function public.puo_gestire_importazione(p_company_id uuid, p_oggetto text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select has_role(auth.uid(), 'super_admin'::app_role))
    or ((select has_role(auth.uid(), 'company_admin'::app_role)) and p_company_id = (select get_user_company_id(auth.uid())))
    or p_company_id in (select unnest(aziende_con_permesso(
         case when p_oggetto = 'contatti' then 'can_edit_marketing_contacts' else 'can_edit_marketing_opportunities' end))),
    false)
  and not coalesce((select utente_bloccato()), false);
$$;
revoke all on function public.puo_gestire_importazione(uuid, text) from public, anon;
grant execute on function public.puo_gestire_importazione(uuid, text) to authenticated;

alter table public.importazioni_programmate enable row level security;
alter table public.importazioni_programmate_righe enable row level security;

drop policy if exists importazioni_programmate_gestione on public.importazioni_programmate;
create policy importazioni_programmate_gestione on public.importazioni_programmate
  for all to authenticated
  using (public.puo_gestire_importazione(company_id, oggetto))
  with check (public.puo_gestire_importazione(company_id, oggetto));

drop policy if exists importazioni_programmate_righe_gestione on public.importazioni_programmate_righe;
create policy importazioni_programmate_righe_gestione on public.importazioni_programmate_righe
  for all to authenticated
  using (exists (select 1 from public.importazioni_programmate i
                 where i.id = importazione_id and public.puo_gestire_importazione(i.company_id, i.oggetto)))
  with check (exists (select 1 from public.importazioni_programmate i
                      where i.id = importazione_id and public.puo_gestire_importazione(i.company_id, i.oggetto)));

grant select, insert, update, delete on public.importazioni_programmate to authenticated;
grant select, insert, update on public.importazioni_programmate_righe to authenticated;

-- Fa entrare dei contatti in un flusso pubblicato dell'azienda. È la stessa cosa di
-- enroll_entities_in_flow, senza il controllo sull'utente collegato: qui non c'è un
-- utente, c'è il giro programmato, e il controllo è che il flusso sia della stessa azienda.
create or replace function public._iscrivi_al_flusso_azienda(
  p_company_id uuid, p_flow_id uuid, p_entity_ids uuid[], p_entity_type text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_company_id uuid;
  v_version int;
  v_trigger_id uuid;
  v_entity uuid;
  v_entity_txt text;
  v_enrollment_id uuid;
  v_conn record;
  v_enrolled int := 0;
  v_skipped int := 0;
  v_queued int := 0;
BEGIN
  SELECT company_id, version INTO v_company_id, v_version
  FROM automation_flows WHERE id = p_flow_id AND status = 'published';

  IF v_company_id IS NULL OR v_company_id <> p_company_id THEN
    RAISE EXCEPTION 'Flusso non trovato o non pubblicato';
  END IF;

  SELECT id INTO v_trigger_id
  FROM automation_nodes
  WHERE flow_id = p_flow_id AND node_type = 'trigger'
  ORDER BY created_at LIMIT 1;

  IF v_trigger_id IS NULL THEN
    RAISE EXCEPTION 'Il flusso non ha un nodo trigger: non puo essere avviato';
  END IF;

  FOREACH v_entity IN ARRAY p_entity_ids LOOP
    v_entity_txt := v_entity::text;

    IF EXISTS (
      SELECT 1 FROM automation_enrollments
      WHERE flow_id = p_flow_id AND entity_id = v_entity_txt
        AND status IN ('active','waiting')
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF p_entity_type = 'contact' AND NOT EXISTS (
      SELECT 1 FROM marketing_contacts
      WHERE id = v_entity AND company_id = v_company_id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO automation_enrollments (company_id, flow_id, entity_id, entity_type, flow_version, status)
    VALUES (v_company_id, p_flow_id, v_entity_txt, p_entity_type, v_version, 'active')
    RETURNING id INTO v_enrollment_id;
    v_enrolled := v_enrolled + 1;

    FOR v_conn IN
      SELECT to_node_id, label FROM automation_connections
      WHERE flow_id = p_flow_id AND from_node_id = v_trigger_id
    LOOP
      INSERT INTO automation_queue (
        enrollment_id, flow_id, company_id, current_node_id,
        entity_id, entity_type, status, execute_at, context_json
      ) VALUES (
        v_enrollment_id, p_flow_id, v_company_id, v_conn.to_node_id,
        v_entity_txt, p_entity_type, 'pending', now(),
        jsonb_build_object('payload', jsonb_build_object('manual', true), 'branch', v_conn.label)
      );
      v_queued := v_queued + 1;
    END LOOP;

    INSERT INTO flow_execution_runs (flow_id, company_id, enrollment_id, trigger_type, trigger_data, status)
    VALUES (p_flow_id, v_company_id, v_enrollment_id, 'manual_bulk',
            jsonb_build_object('manual', true, 'entity_id', v_entity_txt, 'importazione_programmata', true), 'running');
  END LOOP;

  RETURN jsonb_build_object('enrolled', v_enrolled, 'skipped', v_skipped, 'queued', v_queued);
END;
$$;
revoke all on function public._iscrivi_al_flusso_azienda(uuid, uuid, uuid[], text) from public, anon, authenticated;

-- Un contatto: lo ritrova (email, altrimenti telefono in una delle sue forme), lo
-- aggiorna senza cancellare quello che c'è, oppure lo crea. Esito: creato, aggiornato, saltato.
create or replace function public._importa_contatto_programmato(
  p_company_id uuid, p_creata_da uuid, p_modalita text, p_contatto jsonb, p_forme text[], p_custom jsonb,
  out esito text, out contatto uuid
)
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(nullif(trim(p_contatto->>'email'), ''));
  v_tags text[] := array(select jsonb_array_elements_text(coalesce(p_contatto->'tags', '[]'::jsonb)));
  v_id uuid;
begin
  if p_modalita <> 'create' then
    if v_email is not null then
      select id into v_id from marketing_contacts
       where company_id = p_company_id and deleted_at is null and lower(email) = v_email
       order by created_at limit 1;
    elsif cardinality(p_forme) > 0 then
      select id into v_id from marketing_contacts
       where company_id = p_company_id and deleted_at is null and phone = any(p_forme)
       order by created_at limit 1;
    end if;
  end if;

  if v_id is not null then
    update marketing_contacts set
      first_name = coalesce(nullif(trim(p_contatto->>'first_name'), ''), first_name),
      last_name = coalesce(nullif(trim(p_contatto->>'last_name'), ''), last_name),
      phone = coalesce(nullif(trim(p_contatto->>'phone'), ''), phone),
      email = coalesce(v_email, email),
      company_name = coalesce(nullif(trim(p_contatto->>'company_name'), ''), company_name),
      city = coalesce(nullif(trim(p_contatto->>'city'), ''), city),
      province = coalesce(nullif(trim(p_contatto->>'province'), ''), province),
      notes = coalesce(nullif(trim(p_contatto->>'notes'), ''), notes),
      tags = case when cardinality(v_tags) > 0
                  then array(select distinct t from unnest(coalesce(tags, '{}') || v_tags) t)
                  else tags end,
      updated_at = now()
    where id = v_id;
    esito := 'aggiornato';
  elsif p_modalita = 'update' then
    esito := 'saltato';
    return;
  else
    insert into marketing_contacts (company_id, first_name, last_name, phone, email, company_name,
                                    city, province, notes, source, tags, created_by)
    values (p_company_id,
            coalesce(nullif(trim(p_contatto->>'first_name'), ''), 'Senza nome'),
            nullif(trim(p_contatto->>'last_name'), ''),
            nullif(trim(p_contatto->>'phone'), ''),
            v_email,
            nullif(trim(p_contatto->>'company_name'), ''),
            nullif(trim(p_contatto->>'city'), ''),
            nullif(trim(p_contatto->>'province'), ''),
            nullif(trim(p_contatto->>'notes'), ''),
            coalesce(nullif(trim(p_contatto->>'source'), ''), 'importazione'),
            v_tags,
            p_creata_da)
    returning id into v_id;
    esito := 'creato';
  end if;

  insert into marketing_contact_field_values (contact_id, field_id, value)
  select v_id, (c->>'field_id')::uuid, c->>'value'
    from jsonb_array_elements(coalesce(p_custom, '[]'::jsonb)) c
  on conflict (contact_id, field_id) do update set value = excluded.value;

  contatto := v_id;
end;
$$;
revoke all on function public._importa_contatto_programmato(uuid, uuid, text, jsonb, text[], jsonb) from public, anon, authenticated;

-- Un'opportunità: il contatto si ritrova o si crea (come nell'importazione immediata,
-- un contatto già presente non viene riscritto), poi l'opportunità nella prima fase.
create or replace function public._importa_opportunita_programmata(
  p_job public.importazioni_programmate, p_dati jsonb, out esito text, out contatto uuid
)
language plpgsql security definer set search_path = public
as $$
declare
  v_c jsonb := p_dati->'contatto';
  v_o jsonb := p_dati->'opportunita';
  v_email text := lower(nullif(trim(v_c->>'email'), ''));
  v_forme text[] := array(select jsonb_array_elements_text(coalesce(p_dati->'forme', '[]'::jsonb)));
  v_id uuid;
  v_opp uuid;
begin
  if v_email is not null then
    select id into v_id from marketing_contacts
     where company_id = p_job.company_id and deleted_at is null and lower(email) = v_email
     order by created_at limit 1;
  end if;
  if v_id is null and cardinality(v_forme) > 0 then
    select id into v_id from marketing_contacts
     where company_id = p_job.company_id and deleted_at is null and phone = any(v_forme)
     order by created_at limit 1;
  end if;
  if v_id is null then
    insert into marketing_contacts (company_id, first_name, last_name, phone, email, company_name,
                                    city, province, source, created_by)
    values (p_job.company_id,
            coalesce(nullif(trim(v_c->>'first_name'), ''), 'Senza nome'),
            nullif(trim(v_c->>'last_name'), ''),
            nullif(trim(v_c->>'phone'), ''),
            v_email,
            nullif(trim(v_c->>'company_name'), ''),
            nullif(trim(v_c->>'city'), ''),
            nullif(trim(v_c->>'province'), ''),
            coalesce(nullif(trim(v_c->>'source'), ''), 'importazione'),
            p_job.creata_da)
    returning id into v_id;
    insert into marketing_contact_field_values (contact_id, field_id, value)
    select v_id, (c->>'field_id')::uuid, c->>'value'
      from jsonb_array_elements(coalesce(p_dati->'custom_contatto', '[]'::jsonb)) c
    on conflict (contact_id, field_id) do nothing;
  end if;

  insert into marketing_opportunities (company_id, pipeline_id, stage_id, contact_id, name, value,
                                       source, tags, notes, created_by)
  values (p_job.company_id, p_job.pipeline_id, p_job.fase_id, v_id,
          coalesce(nullif(trim(v_o->>'name'), ''), 'Opportunità'),
          coalesce((v_o->>'value')::numeric, 0),
          coalesce(nullif(trim(v_o->>'source'), ''), 'importazione'),
          array(select jsonb_array_elements_text(coalesce(v_o->'tags', '[]'::jsonb))),
          nullif(trim(v_o->>'notes'), ''),
          p_job.creata_da)
  returning id into v_opp;

  insert into marketing_opportunity_field_values (opportunity_id, field_id, value)
  select v_opp, (c->>'field_id')::uuid, c->>'value'
    from jsonb_array_elements(coalesce(p_dati->'custom', '[]'::jsonb)) c;

  esito := 'creato';
  contatto := v_id;
end;
$$;
revoke all on function public._importa_opportunita_programmata(public.importazioni_programmate, jsonb) from public, anon, authenticated;

-- Il giro: per ogni importazione attiva arrivata al suo momento, se è nella fascia
-- oraria e in un giorno scelto, fa entrare le prossime righe. Una riga che non va
-- non ferma le altre: resta segnata con il motivo.
create or replace function public.importazioni_programmate_esegui()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  j public.importazioni_programmate;
  r record;
  a jsonb;
  v_ora timestamp;
  v_ids uuid[];
  v_esito text;
  v_contatto uuid;
  v_fatte int; v_creati int; v_aggiornati int; v_saltati int; v_errori int;
  v_righe_totali int := 0;
  v_errore_auto text;
begin
  for j in
    select * from importazioni_programmate
     where stato = 'attiva' and prossimo_giro <= now()
     order by prossimo_giro
     for update skip locked
  loop
    v_ora := now() at time zone 'Europe/Rome';
    if not (extract(isodow from v_ora)::smallint = any(j.giorni)) then continue; end if;
    if j.fascia_da is not null and j.fascia_a is not null
       and not (v_ora::time >= j.fascia_da and v_ora::time < j.fascia_a) then continue; end if;

    v_ids := '{}'; v_fatte := 0; v_creati := 0; v_aggiornati := 0; v_saltati := 0; v_errori := 0;
    v_errore_auto := null;

    for r in
      select * from importazioni_programmate_righe
       where importazione_id = j.id and stato = 'in_attesa'
       order by ordine
       limit j.per_giro
       for update skip locked
    loop
      begin
        if j.oggetto = 'contatti' then
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_contatto_programmato(
              j.company_id, j.creata_da, j.modalita, r.dati->'contatto',
              array(select jsonb_array_elements_text(coalesce(r.dati->'forme', '[]'::jsonb))),
              r.dati->'custom') t;
        else
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_opportunita_programmata(j, r.dati) t;
        end if;
        update importazioni_programmate_righe
           set stato = case when v_esito = 'saltato' then 'saltata' else 'fatta' end,
               esito = v_esito, contatto_id = v_contatto, elaborata_at = now()
         where id = r.id;
        if v_esito = 'creato' then v_creati := v_creati + 1;
        elsif v_esito = 'aggiornato' then v_aggiornati := v_aggiornati + 1;
        else v_saltati := v_saltati + 1; end if;
        if v_contatto is not null and v_esito <> 'saltato' then v_ids := v_ids || v_contatto; end if;
      exception when others then
        update importazioni_programmate_righe
           set stato = 'errore', esito = left(sqlerrm, 300), elaborata_at = now()
         where id = r.id;
        v_errori := v_errori + 1;
      end;
      v_fatte := v_fatte + 1;
    end loop;

    if cardinality(v_ids) > 0 then
      for a in select * from jsonb_array_elements(j.automazioni) loop
        begin
          perform public._iscrivi_al_flusso_azienda(j.company_id, (a->>'id')::uuid,
                    array(select distinct x from unnest(v_ids) x), 'contact');
        exception when others then
          v_errore_auto := 'Automazione «' || coalesce(a->>'nome', '') || '»: i contatti di un giro non sono entrati';
        end;
      end loop;
    end if;

    update importazioni_programmate set
      fatte = fatte + v_fatte,
      creati = creati + v_creati,
      aggiornati = aggiornati + v_aggiornati,
      saltati = saltati + v_saltati,
      errori = errori + v_errori,
      ultimo_errore = coalesce(v_errore_auto, ultimo_errore),
      stato = case when exists (select 1 from importazioni_programmate_righe
                                 where importazione_id = j.id and stato = 'in_attesa')
                   then stato else 'completata' end,
      prossimo_giro = now() + make_interval(mins => j.ogni_minuti),
      updated_at = now()
    where id = j.id;

    v_righe_totali := v_righe_totali + v_fatte;
    exit when v_righe_totali >= 3000;
  end loop;
  return v_righe_totali;
end;
$$;
revoke all on function public.importazioni_programmate_esegui() from public, anon, authenticated;

-- Un giro al minuto: il momento vero lo decide prossimo_giro di ogni importazione.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'importazioni-programmate') then
    perform cron.schedule('importazioni-programmate', '* * * * *', 'select public.importazioni_programmate_esegui()');
  end if;
end $$;
