-- «Ha compilato di nuovo il modulo» solo se il lead è davvero nuovo (12/11/2026)
--
-- IL GUASTO
-- ---------
-- Renova Solution, 12/11/2026. Dal 9 novembre il token della pagina Facebook
-- non funzionava più: niente letture, e il 10 e l'11 zero lead nel CRM. Il
-- titolare ricollega i moduli e lancia un recupero: rientrano 7 lead.
--
-- A tutti e 7 compare in cronologia «Ha compilato di nuovo il modulo Meta», e
-- il flusso «Facebook - Lead Tetti» li iscrive una seconda volta. Nessuno di
-- loro aveva ricompilato niente: era lo stesso lead lavorato due volte, perché
-- il recupero crea il contatto per la sua strada e lo stesso lead passa poi
-- anche dalla coda degli eventi (integration_webhook_events). Al secondo
-- passaggio il contatto esiste già, meta-process-leads emette
-- `facebook_lead_updated`, e questo trigger lo prendeva per una ricompilazione.
--
-- Verificato sui 7: il leadgen_id scritto nell'attività era IDENTICO a quello
-- del primo passaggio, e un `facebook_lead_received` con lo stesso leadgen_id
-- era già passato ~75 secondi prima.
--
-- Perché conta: in cronologia resta scritta una cosa falsa — un venditore
-- legge «ha compilato di nuovo» e crede che il lead sia più caldo di quanto
-- sia. E il flusso riparte: qui fa solo «crea o aggiorna opportunità» e non si
-- vede, ma il giorno che ci si mette un messaggio WhatsApp o un'email, ogni
-- lead recuperato ne riceve due.
--
-- LA CORREZIONE
-- -------------
-- Una compilazione NUOVA porta un leadgen_id che quel contatto non ha mai
-- avuto. Se per QUESTO leadgen_id è già passato un `facebook_lead_received`,
-- il modulo è stato compilato una volta sola: non si scrive niente in
-- cronologia e il flusso non riparte.
--
-- NON si guarda `marketing_contacts.meta_lead_id`: su una ricompilazione vera
-- quel campo è GIÀ stato aggiornato al lead nuovo quando questo trigger scatta
-- (meta-process-leads scrive il contatto prima di emettere l'evento), quindi
-- il confronto direbbe sempre «già visto» e spegnerebbe la funzione legittima.
--
-- Senza leadgen_id non si può dimostrare niente: lì si tiene il comportamento
-- di prima, perché perdere una ricompilazione vera costa più di un'attività di
-- troppo.

-- Il trigger scatta su un evento alla volta e deve leggere gli eventi passati
-- di quel contatto: senza indice sarebbe una scansione di 35.000 righe.
set local lock_timeout = '3s';
create index if not exists idx_automation_trigger_events_contatto_evento
  on public.automation_trigger_events (company_id, entity_id, trigger_event);

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

  -- Lo stesso lead, lavorato due volte, non è una nuova compilazione.
  if v_leadgen is not null then
    select exists (
      select 1
        from public.automation_trigger_events r
       where r.company_id = new.company_id
         and r.entity_type = 'contact'
         and r.entity_id = new.entity_id
         and r.trigger_event = 'facebook_lead_received'
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

-- La funzione resta chiusa: è di trigger, nessuno la chiama direttamente.
revoke all on function public.fb_repeat_lead_reentry() from public, anon;

-- Rete di sicurezza: se il trigger non è più agganciato, la correzione non
-- serve a niente e deve dirlo subito.
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
