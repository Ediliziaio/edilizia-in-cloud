-- Un cliente che compila di nuovo un modulo, quando ha già un'opportunità
-- aperta nella stessa pipeline, non crea un doppione: quella che c'è torna
-- nella prima fase, così chi lo segue lo richiama.
--
-- Prima (20280914000011) il doppione veniva scartato in silenzio: la richiesta
-- nuova spariva e l'opportunità vecchia restava dov'era — in «Non risponde 3»,
-- in «Nutrimento» — senza che nessuno sapesse che il cliente si era rifatto
-- vivo. E valeva solo se ANCHE la vecchia veniva da Facebook: un cliente
-- arrivato da Google o dal sito che poi compilava il modulo Facebook finiva
-- due volte nella stessa colonna.
--
-- Ora, per le richieste che arrivano da un modulo (Facebook/Meta o form del
-- sito, fonte «form_<id>»):
--   · stessa pipeline, opportunità aperta (di qualunque fonte) → niente riga
--     nuova; la vecchia va nella prima fase, prende le etichette nuove, riceve
--     una nota che spiega cosa è successo, e venditore e call center ricevono
--     una notifica;
--   · pipeline diversa → nasce l'opportunità nuova, come prima.
-- Le opportunità create a mano o importate con altre fonti non sono toccate.

create or replace function public.dedupe_fb_open_opportunity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_esistente     record;
  v_prima_fase    uuid;
  v_nome_prima    text;
  v_nome_fase_era text;
  v_origine       text;
  v_quando        text;
  v_cliente       text;
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

  select s.id, s.name
    into v_prima_fase, v_nome_prima
    from public.marketing_pipeline_stages s
   where s.pipeline_id = v_esistente.pipeline_id
   order by s.position, s.created_at
   limit 1;

  select s.name into v_nome_fase_era
    from public.marketing_pipeline_stages s
   where s.id = v_esistente.stage_id;

  -- stage_changed_at e last_activity_at anche se era già nella prima fase:
  -- è una richiesta fresca, non una scheda ferma da settimane.
  update public.marketing_opportunities
     set stage_id = coalesce(v_prima_fase, stage_id),
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
           when v_prima_fase is not null and v_prima_fase is distinct from v_esistente.stage_id
             then 'L''opportunità è tornata in «' || v_nome_prima || '» (era in «' || coalesce(v_nome_fase_era, '?') || '»).'
           else 'L''opportunità era già in «' || coalesce(v_nome_prima, v_nome_fase_era, '?') || '».'
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
         'L''opportunità è tornata in «' || coalesce(v_nome_prima, v_nome_fase_era, 'prima fase') || '», da richiamare.',
         'marketing_opportunity',
         v_esistente.id,
         '/azienda/marketing/opportunita?pipeline=' || v_esistente.pipeline_id || '&apri=' || v_esistente.id
    from (select distinct unnest(array[v_esistente.assigned_to, v_esistente.call_center_id]) as persona) p
   where persona is not null;

  return null;
end;
$function$;
