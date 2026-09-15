-- Opportunità doppione (modulo Facebook o del sito): quella già aperta prende
-- fase e assegnazione di chi la stava creando.
--
-- dedupe_fb_open_opportunity scarta il nuovo inserimento e riporta in prima fase
-- l'opportunità aperta, ma teneva il vecchio venditore e call center, spesso
-- nessuno: Marcella Martinucci (BeMade, 14/09) era stata assegnata dal flusso a
-- Venusia ed è tornata in «Da Chiamare» senza nessuno. In 30 giorni 37 opportunità
-- riaperte così (Green Energy 27, Best Infissi 9, BeMade 1).
--
-- Le automazioni ora aggiornano da sole (process-automation, «Crea o aggiorna
-- opportunità») e qui non arrivano più. Il trigger resta per gli altri
-- inserimenti automatici (moduli, webhook): se chi inserisce indica una fase di
-- quella pipeline o delle persone, valgono quelle. Solo senza utente: una persona
-- che crea a mano un doppione non si prende l'opportunità di un collega.

create or replace function public.dedupe_fb_open_opportunity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_esistente     record;
  v_prima_fase    uuid;
  v_fase          uuid;
  v_nome_fase     text;
  v_nome_fase_era text;
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

  select s.id into v_prima_fase
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_esistente.pipeline_id
   order by s.position, s.created_at
   limit 1;

  -- La fase chiesta da chi inserisce, se è di questa pipeline; altrimenti la prima.
  select s.id into v_fase
    from public.marketing_pipeline_stages s
   where s.id = new.stage_id and s.pipeline_id = v_esistente.pipeline_id;
  v_fase := coalesce(v_fase, v_prima_fase);

  select s.name into v_nome_fase from public.marketing_pipeline_stages s where s.id = v_fase;
  select s.name into v_nome_fase_era from public.marketing_pipeline_stages s where s.id = v_esistente.stage_id;

  v_venditore   := case when v_sistema and new.assigned_to is not null then new.assigned_to else v_esistente.assigned_to end;
  v_call_center := case when v_sistema and new.call_center_id is not null then new.call_center_id else v_esistente.call_center_id end;

  -- stage_changed_at e last_activity_at anche se era già nella fase: è una
  -- richiesta fresca, non una scheda ferma da settimane.
  update public.marketing_opportunities
     set stage_id = coalesce(v_fase, stage_id),
         assigned_to = v_venditore,
         call_center_id = v_call_center,
         stage_changed_at = now(),
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
           when v_fase is not null and v_fase is distinct from v_esistente.stage_id
             then 'L''opportunità è tornata in «' || coalesce(v_nome_fase, '?') || '» (era in «' || coalesce(v_nome_fase_era, '?') || '»).'
           else 'L''opportunità era già in «' || coalesce(v_nome_fase, v_nome_fase_era, '?') || '».'
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
         'L''opportunità è tornata in «' || coalesce(v_nome_fase, v_nome_fase_era, 'prima fase') || '», da richiamare.',
         'marketing_opportunity',
         v_esistente.id,
         '/azienda/marketing/opportunita?pipeline=' || v_esistente.pipeline_id || '&apri=' || v_esistente.id
    from (select distinct unnest(array[v_venditore, v_call_center]) as persona) p
   where persona is not null;

  return null;
end;
$function$;

revoke all on function public.dedupe_fb_open_opportunity() from public, anon;
