-- «Ha compilato di nuovo il modulo» solo per un lead FRESCO, mai per un recupero (17/11/2026)
--
-- IL GUASTO (ricorrente)
-- ----------------------
-- Quando l'azienda ricollega una pagina Facebook e lancia un recupero dei lead,
-- ogni lead già nel CRM rientra una seconda volta: meta-process-leads trova il
-- contatto esistente ed emette `facebook_lead_updated`, e questo trigger lo
-- prendeva per una ricompilazione — scrivendo in cronologia «Ha compilato di
-- nuovo il modulo Meta» e ri-iscrivendo il contatto ai flussi (secondo WhatsApp).
--
-- La guardia del 12/11 (migrazione 20290221090000) provava a riconoscere il
-- rientro cercando un `facebook_lead_received` PRECEDENTE con lo stesso
-- leadgen_id sullo stesso contatto. Fallisce in tre casi reali, visti il
-- 17/11 su Innovasol, Ener Italia, HVC, Green Energy, Suntech:
--   · il contatto a cui il recupero aggancia il lead è stato importato a mano
--     (CSV): non ha nessun evento originale, quindi nessun match;
--   · era una ricompilazione vera: il suo evento originale è un
--     `facebook_lead_updated`, non un `received`, quindi non viene trovato;
--   · gli eventi originali sono stati potati / il formato non combacia.
-- Risultato: su Innovasol 124 contatti marcati «ha fatto richiesta di nuovo»
-- senza aver ricompilato nulla, e un commerciale che richiama un lead vecchio
-- credendolo caldo.
--
-- LA REGOLA GIUSTA (parole del titolare)
-- --------------------------------------
-- «Un lead arrivato ieri e re-importato oggi NON ha rifatto richiesta, perché è
-- arrivato ieri. Ha rifatto richiesta solo se compila DAVVERO di nuovo, oggi.»
-- Quindi «ha compilato di nuovo» vale solo per un lead FRESCO (compilato nelle
-- ultime 24h: `arretrato = false`, lo stesso segnale con cui meta-process-leads
-- già evita le notifiche sui recuperi). Un lead arretrato che rientra è lo
-- stesso lead, non una nuova richiesta: niente cronologia, niente ri-iscrizione.
--
-- In più, la guardia sul leadgen_id ora riconosce lo stesso lead anche se il suo
-- evento originale era un `facebook_lead_updated` (ricompilazione vera
-- re-importata), così copre pure il raro recupero di un lead fresco.

set local lock_timeout = '3s';

create or replace function public.fb_repeat_lead_reentry()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_leadgen text := nullif(btrim(new.payload->>'leadgen_id'), '');
  v_gia_entrato boolean := false;
begin
  if new.entity_type <> 'contact' or new.entity_id is null then
    return new;
  end if;

  -- Lead compilato più di 24h fa e re-importato ora (recupero dello storico):
  -- è lo STESSO lead che rientra, non una nuova richiesta. «Ha compilato di
  -- nuovo» vale solo per una compilazione fresca. Senza questa riga un recupero
  -- marcava centinaia di contatti come se avessero ricompilato (17/11/2026).
  if coalesce((new.payload->>'arretrato')::boolean, false) then
    raise log 'fb_repeat_lead_reentry: lead arretrato del contatto %, recupero storico: non è una nuova compilazione', new.entity_id;
    return new;
  end if;

  -- Lo stesso lead, lavorato due volte, non è una nuova compilazione. Si cerca
  -- un evento PRECEDENTE con lo stesso leadgen_id sullo stesso contatto; vale
  -- anche se quell'evento era un `facebook_lead_updated` (ricompilazione vera
  -- che rientra), non solo un `received`.
  if v_leadgen is not null then
    select exists (
      select 1
        from public.automation_trigger_events r
       where r.company_id = new.company_id
         and r.entity_type = 'contact'
         and r.entity_id = new.entity_id
         and r.id <> new.id
         and r.trigger_event in ('facebook_lead_received', 'facebook_lead_updated')
         and r.payload->>'leadgen_id' = v_leadgen
         and coalesce((r.payload->>'repeat_submission')::boolean, false) = false
    ) into v_gia_entrato;
  end if;

  if v_gia_entrato then
    raise log 'fb_repeat_lead_reentry: lead % del contatto % era già entrato, non è una nuova compilazione',
      v_leadgen, new.entity_id;
    return new;
  end if;

  begin
    insert into public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_at)
    values (
      new.entity_id::uuid, new.company_id, 'lead_form_submission',
      'Ha compilato di nuovo il modulo Meta'
        || coalesce(' — campagna «' || nullif(btrim(new.payload->>'campaign_name'), '') || '»', ''),
      jsonb_build_object('source', 'meta_lead_ads', 'repeat', true,
        'leadgen_id', new.payload->>'leadgen_id',
        'form_id', new.payload->>'form_id',
        'page_id', new.payload->>'page_id',
        'campaign_name', new.payload->>'campaign_name',
        'adset_name', new.payload->>'adset_name',
        'ad_name', new.payload->>'ad_name',
        'platform', new.payload->>'platform',
        'form_created_at', new.payload->>'lead_created_time',
        'arretrato', coalesce((new.payload->>'arretrato')::boolean, false)),
      new.created_at
    );
  exception when others then
    raise log 'fb_repeat_lead_reentry: attività non registrata per %: %', new.entity_id, sqlerrm;
  end;

  begin
    insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload, processed)
    values (new.company_id, 'facebook_lead_received', new.entity_id, 'contact',
      coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('is_new_contact', false, 'repeat_submission', true),
      false);
  exception when others then
    raise log 'fb_repeat_lead_reentry: evento non riemesso per %: %', new.entity_id, sqlerrm;
  end;

  return new;
end;
$function$;

revoke all on function public.fb_repeat_lead_reentry() from public, anon;

-- Rete di sicurezza: la correzione non serve a niente se il trigger non è agganciato.
do $verifica$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'automation_trigger_events'
       and t.tgname = 'trg_fb_repeat_lead_reentry'
       and not t.tgisinternal
  ) then
    raise exception 'trg_fb_repeat_lead_reentry non è agganciato: la correzione non avrebbe effetto';
  end if;
end $verifica$;
