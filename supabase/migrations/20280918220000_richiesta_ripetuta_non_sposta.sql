-- Richiesta ripetuta: la scheda resta dov'è.
--
-- Quando un contatto ricompila il modulo (Facebook o sito) e ha già
-- un'opportunità APERTA in quella pipeline, non se ne crea una seconda: fin
-- qui giusto. Ma quella aperta veniva anche riportata nella prima fase del
-- flusso — «Da Chiamare» — da qualunque fase, e riassegnata a chi diceva il
-- flusso.
--
-- 18/09/2026, BeMade: Venusia e Antonella si sono ritrovate in «Da Chiamare»
-- contatti che avevano appena messo in «Non risponde», «Standby», «Non
-- interessato per ora». Con i caroselli Meta la stessa persona compila il
-- modulo anche più volte di seguito: ogni volta la scheda tornava indietro e
-- cambiava di mano. Chi chiama non riusciva più a tenere il suo ritmo di
-- richiami.
--
-- Ora la scheda non si sposta e non cambia padrone: si aggiorna solo la data
-- dell'ultima attività, si scrive la nota e parte l'avviso a chi la segue. Che
-- il contatto si sia rifatto vivo si vede dal badge «Di nuovo» sulla scheda
-- (opportunita_schede.richiesta_ripetuta, migrazione 20280917101000). Il
-- venditore o il call center del flusso entrano solo se la scheda non è di
-- nessuno.
--
-- Stessa regola nel motore delle automazioni («Crea o aggiorna opportunità»,
-- process-automation): questo trigger copre le opportunità inserite da altre
-- strade (importazioni, moduli del sito, code dei lead).

create or replace function public.dedupe_fb_open_opportunity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_esistente     record;
  v_nome_fase_era text;
  v_nome_fase_flusso text;
  v_fase_flusso   uuid;
  v_prima_fase    uuid;
  v_origine       text;
  v_quando        text;
  v_cliente       text;
  v_sistema       boolean := auth.uid() is null;
  v_venditore     uuid;
  v_call_center   uuid;
begin
  if new.contact_id is null
     or coalesce(new.status, 'open') <> 'open'
     or not (coalesce(new.source, '') ilike 'facebook%'
             or coalesce(new.source, '') ilike '%meta%'
             or coalesce(new.source, '') like 'form\_%')
  then
    return new;
  end if;

  select o.id, o.pipeline_id, o.stage_id, o.assigned_to, o.call_center_id, o.name
    into v_esistente
    from public.marketing_opportunities o
   where o.company_id = new.company_id
     and o.contact_id = new.contact_id
     and o.pipeline_id is not distinct from new.pipeline_id
     and o.status = 'open'
     and o.deleted_at is null
   order by o.updated_at desc nulls last
   limit 1;

  if not found then
    return new;
  end if;

  -- Dove l'avrebbe messa il flusso: serve solo a scriverlo nella nota.
  select s.id into v_prima_fase
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_esistente.pipeline_id
   order by s.position, s.created_at
   limit 1;

  select s.id into v_fase_flusso
    from public.marketing_pipeline_stages s
   where s.id = new.stage_id and s.pipeline_id = v_esistente.pipeline_id;
  v_fase_flusso := coalesce(v_fase_flusso, v_prima_fase);

  select s.name into v_nome_fase_flusso from public.marketing_pipeline_stages s where s.id = v_fase_flusso;
  select s.name into v_nome_fase_era from public.marketing_pipeline_stages s where s.id = v_esistente.stage_id;

  -- Solo se la scheda non è di nessuno: chi la sta seguendo se la tiene.
  v_venditore   := coalesce(v_esistente.assigned_to, case when v_sistema then new.assigned_to end);
  v_call_center := coalesce(v_esistente.call_center_id, case when v_sistema then new.call_center_id end);

  update public.marketing_opportunities
     set assigned_to = v_venditore,
         call_center_id = v_call_center,
         last_activity_at = now(),
         tags = case
                  when coalesce(array_length(new.tags, 1), 0) = 0 then tags
                  else array(
                    select distinct t
                      from unnest(coalesce(tags, '{}'::text[]) || new.tags) as t
                     where nullif(btrim(t), '') is not null
                  )
                end
   where id = v_esistente.id;

  v_quando := to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI');
  v_origine := case
    when new.source like 'form\_%' then coalesce(
      (select 'il modulo «' || f.name || '»' from public.lead_forms f where f.id::text = substr(new.source, 6)),
      'un modulo del sito')
    else 'il modulo di Facebook'
  end;

  insert into public.marketing_contact_notes (company_id, contact_id, opportunity_id, content, created_by)
  values (
    new.company_id,
    new.contact_id,
    v_esistente.id,
    'Ha compilato di nuovo ' || v_origine || ' il ' || v_quando || '. '
      || case
           when v_fase_flusso is not null and v_fase_flusso is distinct from v_esistente.stage_id
             then 'L''opportunità resta in «' || coalesce(v_nome_fase_era, '?') || '»: non la riportiamo in «' || coalesce(v_nome_fase_flusso, '?') || '».'
           else 'L''opportunità è già in «' || coalesce(v_nome_fase_era, v_nome_fase_flusso, '?') || '».'
         end
      || case when nullif(btrim(new.notes), '') is not null then E'\n\n' || btrim(new.notes) else '' end,
    null
  );

  v_cliente := coalesce(
    nullif(btrim((select concat_ws(' ', c.first_name, c.last_name) from public.marketing_contacts c where c.id = new.contact_id)), ''),
    nullif(btrim(v_esistente.name), ''),
    'Un cliente'
  );

  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select new.company_id,
         persona,
         'lead_ripresentato',
         v_cliente || ' ha compilato di nuovo il modulo',
         'La scheda resta dov''è, in «' || coalesce(v_nome_fase_era, 'prima fase') || '»: decidi tu se richiamarlo.',
         'marketing_opportunity',
         v_esistente.id,
         '/azienda/marketing/opportunita?pipeline=' || v_esistente.pipeline_id || '&apri=' || v_esistente.id
    from (select distinct unnest(array[v_venditore, v_call_center]) as persona) p
   where persona is not null;

  return null;
end;
$function$;
