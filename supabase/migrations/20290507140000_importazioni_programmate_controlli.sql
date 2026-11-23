-- Importazioni programmate: controlli in più (23/11/2026, dopo la revisione).
--
-- 1. Chi vede solo i contatti assegnati non programma importazioni: il giro gira
--    senza le regole di riga e potrebbe aggiornare contatti che lui non vede.
--    Le opportunità creano anche contatti: serve anche il permesso sui contatti.
-- 2. Pipeline, fase e campi personalizzati devono essere dell'azienda; chi crea
--    l'importazione è sempre l'utente collegato.
-- 3. Una programmazione che non può mai partire (nessun giorno, fascia rovesciata)
--    non si salva.
-- 4. A ogni giro si ricontrolla che chi l'ha creata possa ancora farlo: se no, in pausa.

create or replace function public.puo_gestire_importazione(p_company_id uuid, p_oggetto text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select has_role(auth.uid(), 'super_admin'::app_role))
    or ((select has_role(auth.uid(), 'company_admin'::app_role)) and p_company_id = (select get_user_company_id(auth.uid())))
    or (
      p_company_id in (select unnest(aziende_con_permesso('can_edit_marketing_contacts')))
      and (p_oggetto = 'contatti' or p_company_id in (select unnest(aziende_con_permesso('can_edit_marketing_opportunities'))))
      and not coalesce((select solo_assegnati_attivo()), false)
    ),
    false)
  and not coalesce((select utente_bloccato()), false);
$$;
revoke all on function public.puo_gestire_importazione(uuid, text) from public, anon;
grant execute on function public.puo_gestire_importazione(uuid, text) to authenticated;

alter table public.importazioni_programmate drop constraint if exists importazioni_programmate_orari_validi;
alter table public.importazioni_programmate add constraint importazioni_programmate_orari_validi
  check (cardinality(giorni) > 0
         and giorni <@ '{1,2,3,4,5,6,7}'::smallint[]
         and ((fascia_da is null and fascia_a is null) or (fascia_da is not null and fascia_a is not null and fascia_da < fascia_a)));

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
    end if;
  end if;
  if new.oggetto = 'opportunita' and not exists (
    select 1 from marketing_pipeline_stages s join marketing_pipelines p on p.id = s.pipeline_id
     where s.id = new.fase_id and p.id = new.pipeline_id and p.company_id = new.company_id
  ) then
    raise exception 'La pipeline o la fase scelta non è di questa azienda';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public._importazione_programmata_controlla() from public, anon, authenticated;

drop trigger if exists importazione_programmata_controlla on public.importazioni_programmate;
create trigger importazione_programmata_controlla
  before insert or update on public.importazioni_programmate
  for each row execute function public._importazione_programmata_controlla();

-- I campi personalizzati di una riga devono essere dell'azienda dell'importazione.
create or replace function public._importazione_riga_controlla()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_company uuid;
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
  return new;
end;
$$;
revoke all on function public._importazione_riga_controlla() from public, anon, authenticated;

drop trigger if exists importazione_riga_controlla on public.importazioni_programmate_righe;
create trigger importazione_riga_controlla
  before insert or update of dati on public.importazioni_programmate_righe
  for each row execute function public._importazione_riga_controlla();

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
