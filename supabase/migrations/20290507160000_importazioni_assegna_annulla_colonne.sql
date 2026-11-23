-- Importazioni: assegnazione, annullamento e colonne ricordate (23/11/2026).
--
-- 1. Assegnazione: chi importa sceglie a chi vanno i contatti nuovi (uno, o più a
--    turno). Nei giri a scaglioni il venditore viaggia nella riga (dati.contatto.assigned_to,
--    dati.opportunita.assigned_to) e vale solo per ciò che viene creato: un contatto già
--    presente tiene il suo. Deve essere una persona dell'azienda.
-- 2. Annullamento: importazioni_registro tiene ogni importazione e cosa ha creato
--    (importazioni_registro_creati). annulla_importazione() sposta nel cestino solo
--    quello, entro 7 giorni; tiene i contatti che hanno nel frattempo altre opportunità
--    e toglie dalle automazioni quelli spostati. Per le importazioni a scaglioni il
--    registro ha lo stesso id dell'importazione programmata.
-- 3. Colonne ricordate: per azienda e oggetto, quale campo va a ogni intestazione
--    del file ('' = non importare). La seconda volta il collegamento è già fatto.

create table if not exists public.importazioni_registro (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  creata_da uuid default auth.uid(),
  oggetto text not null check (oggetto in ('contatti', 'opportunita')),
  nome_file text,
  programmata boolean not null default false,
  created_at timestamptz not null default now(),
  annullata_at timestamptz,
  annullata_da uuid
);
create index if not exists importazioni_registro_azienda on public.importazioni_registro (company_id, created_at desc);

create table if not exists public.importazioni_registro_creati (
  registro_id uuid not null references public.importazioni_registro(id) on delete cascade,
  tipo text not null check (tipo in ('contatto', 'opportunita')),
  elemento_id uuid not null,
  primary key (registro_id, tipo, elemento_id)
);

create table if not exists public.importazioni_colonne_ricordate (
  company_id uuid not null references public.companies(id) on delete cascade,
  oggetto text not null check (oggetto in ('contatti', 'opportunita')),
  intestazione text not null,
  campo text not null default '',
  updated_at timestamptz not null default now(),
  primary key (company_id, oggetto, intestazione)
);

alter table public.importazioni_registro enable row level security;
alter table public.importazioni_registro_creati enable row level security;
alter table public.importazioni_colonne_ricordate enable row level security;

drop policy if exists importazioni_registro_lettura on public.importazioni_registro;
create policy importazioni_registro_lettura on public.importazioni_registro
  for select to authenticated using (public.puo_gestire_importazione(company_id, oggetto));
drop policy if exists importazioni_registro_nuova on public.importazioni_registro;
create policy importazioni_registro_nuova on public.importazioni_registro
  for insert to authenticated
  with check (public.puo_gestire_importazione(company_id, oggetto) and annullata_at is null);

drop policy if exists importazioni_registro_creati_gestione on public.importazioni_registro_creati;
create policy importazioni_registro_creati_gestione on public.importazioni_registro_creati
  for all to authenticated
  using (exists (select 1 from public.importazioni_registro r
                 where r.id = registro_id and public.puo_gestire_importazione(r.company_id, r.oggetto)))
  with check (exists (select 1 from public.importazioni_registro r
                      where r.id = registro_id and r.annullata_at is null
                        and r.creata_da = auth.uid()
                        and public.puo_gestire_importazione(r.company_id, r.oggetto)));

drop policy if exists importazioni_colonne_ricordate_gestione on public.importazioni_colonne_ricordate;
create policy importazioni_colonne_ricordate_gestione on public.importazioni_colonne_ricordate
  for all to authenticated
  using (public.puo_gestire_importazione(company_id, oggetto))
  with check (public.puo_gestire_importazione(company_id, oggetto));

grant select, insert on public.importazioni_registro to authenticated;
grant select, insert on public.importazioni_registro_creati to authenticated;
grant select, insert, update, delete on public.importazioni_colonne_ricordate to authenticated;

-- Chi crea il registro è sempre l'utente collegato.
create or replace function public._importazione_registro_autore()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then new.creata_da := auth.uid(); end if;
  new.annullata_at := null;
  new.annullata_da := null;
  return new;
end;
$$;
revoke all on function public._importazione_registro_autore() from public, anon, authenticated;
drop trigger if exists importazione_registro_autore on public.importazioni_registro;
create trigger importazione_registro_autore before insert on public.importazioni_registro
  for each row execute function public._importazione_registro_autore();

-- Una persona dell'azienda (o con accesso attivo a quell'azienda).
create or replace function public._persona_dell_azienda(p_utente uuid, p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profiles where id = p_utente and company_id = p_company_id)
      or exists (select 1 from multi_company_access
                  where user_id = p_utente and company_id = p_company_id and status = 'active'
                    and (expires_at is null or expires_at > now()));
$$;
revoke all on function public._persona_dell_azienda(uuid, uuid) from public, anon, authenticated;

-- Le righe in coda: campi personalizzati e venditore devono essere dell'azienda.
create or replace function public._importazione_riga_controlla()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
  v_persona text;
begin
  select company_id into v_company from importazioni_programmate where id = new.importazione_id;
  if exists (
    select 1
      from jsonb_array_elements(coalesce(new.dati->'custom', '[]'::jsonb) || coalesce(new.dati->'custom_contatto', '[]'::jsonb)) c
     where not exists (select 1 from marketing_custom_fields f
                        where f.id::text = c->>'field_id' and f.company_id = v_company)
  ) then
    raise exception 'Un campo personalizzato della riga non è di questa azienda';
  end if;
  foreach v_persona in array array[new.dati#>>'{contatto,assigned_to}', new.dati#>>'{opportunita,assigned_to}'] loop
    if nullif(v_persona, '') is not null and not public._persona_dell_azienda(v_persona::uuid, v_company) then
      raise exception 'La persona a cui assegnare non è di questa azienda';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public._importazione_riga_controlla() from public, anon, authenticated;

-- Segna nel registro ciò che un giro a scaglioni ha creato (se il registro c'è).
create or replace function public._registra_creato(p_registro uuid, p_tipo text, p_elemento uuid)
returns void
language sql security definer set search_path = public
as $$
  insert into importazioni_registro_creati (registro_id, tipo, elemento_id)
  select p_registro, p_tipo, p_elemento
   where p_elemento is not null and exists (select 1 from importazioni_registro where id = p_registro)
  on conflict do nothing;
$$;
revoke all on function public._registra_creato(uuid, text, uuid) from public, anon, authenticated;

-- Annulla un'importazione: nel cestino ciò che ha creato, nient'altro.
create or replace function public.annulla_importazione(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r importazioni_registro;
  v_opp uuid[];
  v_contatti uuid[];
  v_tenuti int;
begin
  select * into r from importazioni_registro where id = p_id for update;
  if not found or not public.puo_gestire_importazione(r.company_id, r.oggetto) then
    raise exception 'Importazione non trovata';
  end if;
  if r.annullata_at is not null then raise exception 'Questa importazione è già stata annullata'; end if;
  if r.created_at < now() - interval '7 days' then
    raise exception 'Un''importazione si può annullare solo nei 7 giorni successivi';
  end if;

  -- Le righe ancora in coda non entrano più.
  update importazioni_programmate set stato = 'annullata', updated_at = now()
   where id = p_id and company_id = r.company_id and stato in ('attiva', 'in_pausa');

  with tolte as (
    update marketing_opportunities m set deleted_at = now(), deleted_by = auth.uid()
      from importazioni_registro_creati c
     where c.registro_id = p_id and c.tipo = 'opportunita' and m.id = c.elemento_id
       and m.company_id = r.company_id and m.deleted_at is null
       and m.created_at >= r.created_at - interval '1 minute'
    returning m.id)
  select coalesce(array_agg(id), '{}') into v_opp from tolte;

  -- I contatti creati, tranne quelli su cui nel frattempo c'è altro lavoro (opportunità vive).
  with candidati as (
    select m.id from marketing_contacts m
      join importazioni_registro_creati c on c.registro_id = p_id and c.tipo = 'contatto' and c.elemento_id = m.id
     where m.company_id = r.company_id and m.deleted_at is null
       and m.created_at >= r.created_at - interval '1 minute'),
  liberi as (
    select k.id from candidati k
     where not exists (select 1 from marketing_opportunities o where o.contact_id = k.id and o.deleted_at is null)),
  tolti as (
    update marketing_contacts m set deleted_at = now(), deleted_by = auth.uid()
     where m.id in (select id from liberi)
    returning m.id)
  select coalesce(array_agg(id), '{}') into v_contatti from tolti;

  select count(*) into v_tenuti
    from importazioni_registro_creati c join marketing_contacts m on m.id = c.elemento_id
   where c.registro_id = p_id and c.tipo = 'contatto' and m.deleted_at is null and m.company_id = r.company_id;

  -- Chi è nel cestino non riceve più i messaggi delle automazioni.
  update automation_enrollments set status = 'canceled'
   where company_id = r.company_id and entity_type = 'contact'
     and entity_id::text = any (select x::text from unnest(v_contatti) x)
     and status in ('active', 'waiting', 'paused');

  update importazioni_registro set annullata_at = now(), annullata_da = auth.uid() where id = p_id;
  return jsonb_build_object('opportunita', cardinality(v_opp), 'contatti', cardinality(v_contatti), 'tenuti', v_tenuti);
end;
$$;
revoke all on function public.annulla_importazione(uuid) from public, anon;
grant execute on function public.annulla_importazione(uuid) to authenticated;

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
                                    city, province, notes, source, tags, created_by, assigned_to)
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
            p_creata_da,
            nullif(p_contatto->>'assigned_to', '')::uuid)
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
                                    city, province, source, created_by, assigned_to)
    values (p_job.company_id,
            coalesce(nullif(trim(v_c->>'first_name'), ''), 'Senza nome'),
            nullif(trim(v_c->>'last_name'), ''),
            nullif(trim(v_c->>'phone'), ''),
            v_email,
            nullif(trim(v_c->>'company_name'), ''),
            nullif(trim(v_c->>'city'), ''),
            nullif(trim(v_c->>'province'), ''),
            coalesce(nullif(trim(v_c->>'source'), ''), 'importazione'),
            p_job.creata_da,
            nullif(v_o->>'assigned_to', '')::uuid)
    returning id into v_id;
    perform public._registra_creato(p_job.id, 'contatto', v_id);
    insert into marketing_contact_field_values (contact_id, field_id, value)
    select v_id, (c->>'field_id')::uuid, c->>'value'
      from jsonb_array_elements(coalesce(p_dati->'custom_contatto', '[]'::jsonb)) c
    on conflict (contact_id, field_id) do nothing;
  end if;

  insert into marketing_opportunities (company_id, pipeline_id, stage_id, contact_id, name, value,
                                       source, tags, notes, created_by, assigned_to)
  values (p_job.company_id, p_job.pipeline_id, p_job.fase_id, v_id,
          coalesce(nullif(trim(v_o->>'name'), ''), 'Opportunità'),
          coalesce((v_o->>'value')::numeric, 0),
          coalesce(nullif(trim(v_o->>'source'), ''), 'importazione'),
          array(select jsonb_array_elements_text(coalesce(v_o->'tags', '[]'::jsonb))),
          nullif(trim(v_o->>'notes'), ''),
          p_job.creata_da,
          nullif(v_o->>'assigned_to', '')::uuid)
  returning id into v_opp;
  perform public._registra_creato(p_job.id, 'opportunita', v_opp);

  insert into marketing_opportunity_field_values (opportunity_id, field_id, value)
  select v_opp, (c->>'field_id')::uuid, c->>'value'
    from jsonb_array_elements(coalesce(p_dati->'custom', '[]'::jsonb)) c;

  esito := 'creato';
  contatto := v_id;
end;
$$;
revoke all on function public._importa_opportunita_programmata(public.importazioni_programmate, jsonb) from public, anon, authenticated;

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
  v_permesso boolean;
  v_dopo public.importazioni_programmate;
begin
  for j in
    select * from importazioni_programmate
     where stato = 'attiva' and prossimo_giro <= now()
     order by prossimo_giro
     for update skip locked
  loop
    -- Chi l'ha programmata deve poterlo fare ancora: si guarda coi suoi permessi di adesso.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', j.creata_da, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', coalesce(j.creata_da::text, ''), true);
    v_permesso := j.creata_da is not null and public.puo_gestire_importazione(j.company_id, j.oggetto);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if not v_permesso then
      update importazioni_programmate
         set stato = 'in_pausa',
             ultimo_errore = 'Messa in pausa: chi l''ha programmata non ha più il permesso di importare'
       where id = j.id;
      perform public._avvisa_importazione(j, 'pausa_permesso');
      continue;
    end if;

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
        if v_esito = 'creato' and j.oggetto = 'contatti' then
          perform public._registra_creato(j.id, 'contatto', v_contatto);
        end if;
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
    where id = j.id
    returning * into v_dopo;
    if v_dopo.stato = 'completata' then
      perform public._avvisa_importazione(v_dopo, 'finita');
    end if;

    v_righe_totali := v_righe_totali + v_fatte;
    exit when v_righe_totali >= 3000;
  end loop;
  return v_righe_totali;
end;
$$;
revoke all on function public.importazioni_programmate_esegui() from public, anon, authenticated;
