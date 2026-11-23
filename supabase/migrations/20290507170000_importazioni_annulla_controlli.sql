-- Importazioni: controlli dopo la revisione di assegnazione e annullamento (23/11/2026).
--
-- 1. Il registro di ciò che un'importazione ha creato non si scrive più direttamente:
--    passa da registra_creati_importazione(), che accetta solo elementi dell'azienda
--    creati dopo l'apertura del registro, da chi importa (o senza autore), entro un'ora.
--    Così l'annullamento non può essere usato per buttare nel cestino il lavoro dei colleghi.
-- 2. Assegnazione a turno nei giri a scaglioni: le persone stanno sull'importazione
--    (assegnatari) e il turno passa solo quando un elemento viene davvero creato; un
--    contatto già presente o una riga andata male non consumano il turno.
-- 3. annulla_importazione: lock che non si incrocia col giro in corso (no key update),
--    e toglie dalle automazioni anche le opportunità spostate nel cestino.

alter table public.importazioni_programmate add column if not exists assegnatari uuid[] not null default '{}';
alter table public.importazioni_programmate add column if not exists turno int not null default 0;

drop policy if exists importazioni_registro_creati_gestione on public.importazioni_registro_creati;
drop policy if exists importazioni_registro_creati_lettura on public.importazioni_registro_creati;
create policy importazioni_registro_creati_lettura on public.importazioni_registro_creati
  for select to authenticated
  using (exists (select 1 from public.importazioni_registro r
                 where r.id = registro_id and public.puo_gestire_importazione(r.company_id, r.oggetto)));
revoke insert, update, delete on public.importazioni_registro_creati from authenticated;

create or replace function public.registra_creati_importazione(p_registro uuid, p_tipo text, p_ids uuid[])
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r importazioni_registro;
  v_n int;
begin
  select * into r from importazioni_registro where id = p_registro;
  if not found or r.creata_da is distinct from auth.uid() or r.annullata_at is not null or r.programmata
     or r.created_at < now() - interval '1 hour'
     or not public.puo_gestire_importazione(r.company_id, r.oggetto) then
    raise exception 'Importazione non trovata';
  end if;
  if p_tipo = 'contatto' then
    insert into importazioni_registro_creati (registro_id, tipo, elemento_id)
    select p_registro, 'contatto', m.id from marketing_contacts m
     where m.id = any(p_ids) and m.company_id = r.company_id
       and m.created_at >= r.created_at - interval '1 minute'
       and (m.created_by is null or m.created_by = auth.uid())
    on conflict do nothing;
  elsif p_tipo = 'opportunita' then
    insert into importazioni_registro_creati (registro_id, tipo, elemento_id)
    select p_registro, 'opportunita', m.id from marketing_opportunities m
     where m.id = any(p_ids) and m.company_id = r.company_id
       and m.created_at >= r.created_at - interval '1 minute'
       and (m.created_by is null or m.created_by = auth.uid())
    on conflict do nothing;
  else
    raise exception 'Tipo non valido';
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.registra_creati_importazione(uuid, text, uuid[]) from public, anon;
grant execute on function public.registra_creati_importazione(uuid, text, uuid[]) to authenticated;

create or replace function public._importazione_programmata_controlla()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.creata_da := auth.uid();
    else
      new.creata_da := old.creata_da;
      new.company_id := old.company_id;
      new.oggetto := old.oggetto;
      new.pipeline_id := old.pipeline_id;
      new.fase_id := old.fase_id;
      new.automazioni := old.automazioni;
      new.assegnatari := old.assegnatari;
      new.turno := old.turno;
    end if;
  end if;
  if new.oggetto = 'opportunita' and not exists (
    select 1 from marketing_pipeline_stages s join marketing_pipelines p on p.id = s.pipeline_id
     where s.id = new.fase_id and p.id = new.pipeline_id and p.company_id = new.company_id
  ) then
    raise exception 'La pipeline o la fase scelta non è di questa azienda';
  end if;
  if exists (select 1 from unnest(new.assegnatari) p where not public._persona_dell_azienda(p, new.company_id)) then
    raise exception 'La persona a cui assegnare non è di questa azienda';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public._importazione_programmata_controlla() from public, anon, authenticated;

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
  select * into r from importazioni_registro where id = p_id for no key update;
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
   where company_id = r.company_id
     and ((entity_type = 'contact' and entity_id::text = any (select x::text from unnest(v_contatti) x))
       or (entity_type = 'opportunity' and entity_id::text = any (select x::text from unnest(v_opp) x)))
     and status in ('active', 'waiting', 'paused');

  update importazioni_registro set annullata_at = now(), annullata_da = auth.uid() where id = p_id;
  return jsonb_build_object('opportunita', cardinality(v_opp), 'contatti', cardinality(v_contatti), 'tenuti', v_tenuti);
end;
$$;
revoke all on function public.annulla_importazione(uuid) from public, anon;
grant execute on function public.annulla_importazione(uuid) to authenticated;

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
  v_turno int;
  v_persona uuid;
  v_dati jsonb;
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
    v_turno := j.turno;

    for r in
      select * from importazioni_programmate_righe
       where importazione_id = j.id and stato = 'in_attesa'
       order by ordine
       limit j.per_giro
       for update skip locked
    loop
      begin
        -- A turno: la prossima persona prende ciò che viene creato; il turno passa solo se è stato creato.
        v_dati := r.dati;
        if cardinality(j.assegnatari) > 0 then
          v_persona := j.assegnatari[(v_turno % cardinality(j.assegnatari)) + 1];
          v_dati := jsonb_set(v_dati, case when j.oggetto = 'contatti' then '{contatto,assigned_to}' else '{opportunita,assigned_to}' end::text[],
                              to_jsonb(v_persona::text), true);
        end if;
        if j.oggetto = 'contatti' then
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_contatto_programmato(
              j.company_id, j.creata_da, j.modalita, v_dati->'contatto',
              array(select jsonb_array_elements_text(coalesce(v_dati->'forme', '[]'::jsonb))),
              v_dati->'custom') t;
        else
          select t.esito, t.contatto into v_esito, v_contatto
            from public._importa_opportunita_programmata(j, v_dati) t;
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
        if v_esito = 'creato' then v_turno := v_turno + 1; end if;
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
      turno = v_turno,
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
