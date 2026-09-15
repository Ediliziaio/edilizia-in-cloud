-- Lead Meta che compila di nuovo il modulo: il registro attività non lo diceva mai.
--
-- fb_repeat_lead_reentry() inseriva l'attività con contact_id = NEW.entity_id,
-- che in automation_trigger_events è TEXT: «column contact_id is of type uuid but
-- expression is of type text». L'EXCEPTION WHEN OTHERS la ingoiava, quindi in 60
-- giorni 426 richieste ripetute (su tutte le aziende) non hanno lasciato traccia.
-- Il file del 18/07 aveva il cast; la versione nel database no.
-- Si vedeva solo la nota di dedupe_fb_open_opportunity, e solo quando c'era già
-- un'opportunità aperta: chi tornava dopo un «Non interessato» (Green Energy, 14/09)
-- riceveva un'opportunità nuova senza nessuna riga che dicesse «è tornato».

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.fb_repeat_lead_reentry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'contact' and new.entity_id is not null then
    -- 1) Registro del contatto: ha compilato di nuovo il modulo
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
          'campaign_name', new.payload->>'campaign_name'),
        new.created_at
      );
    exception when others then
      raise log 'fb_repeat_lead_reentry: attività non registrata per %: %', new.entity_id, sqlerrm;
    end;
    -- 2) Ri-emette 'facebook_lead_received' → l'automazione FB ri-parte.
    --    Il re-enrollment del runtime blocca solo se c'è un'iscrizione ATTIVA.
    begin
      insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload, processed)
      values (new.company_id, 'facebook_lead_received', new.entity_id, 'contact',
        coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('is_new_contact', false, 'repeat_submission', true),
        false);
    exception when others then
      raise log 'fb_repeat_lead_reentry: evento non riemesso per %: %', new.entity_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.fb_repeat_lead_reentry() from public, anon;

-- Recupero: le richieste ripetute ancora presenti tra gli eventi, alla loro data vera.
insert into public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_at)
select c.id, t.company_id, 'lead_form_submission',
       'Ha compilato di nuovo il modulo Meta'
         || coalesce(' — campagna «' || nullif(btrim(t.payload->>'campaign_name'), '') || '»', ''),
       jsonb_build_object('source', 'meta_lead_ads', 'repeat', true, 'recuperata', true,
         'leadgen_id', t.payload->>'leadgen_id',
         'form_id', t.payload->>'form_id',
         'page_id', t.payload->>'page_id',
         'campaign_name', t.payload->>'campaign_name'),
       t.created_at
  from public.automation_trigger_events t
  join public.marketing_contacts c on c.id::text = t.entity_id and c.company_id = t.company_id
 where t.trigger_event = 'facebook_lead_updated'
   and t.entity_type = 'contact'
   and not exists (
     select 1 from public.marketing_contact_activities a
      where a.contact_id = c.id and a.activity_type = 'lead_form_submission'
        and a.metadata->>'leadgen_id' is not distinct from t.payload->>'leadgen_id'
        and abs(extract(epoch from (a.created_at - t.created_at))) < 5
   );
