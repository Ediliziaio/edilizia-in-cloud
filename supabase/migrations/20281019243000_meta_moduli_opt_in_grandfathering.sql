-- Moduli Meta: opt-in + grandfathering (19/10/2026, richiesta founder).
-- ════════════════════════════════════════════════════════════════════════════
-- D'ora in poi un lead Meta entra nel CRM SOLO se l'azienda ha ATTIVATO il
-- relativo modulo (una riga meta_lead_forms con status='active'). Prima invece
-- un modulo ACTIVE su Meta ma mai configurato veniva importato lo stesso (sia
-- dal recupero automatico — metaModuliDaInterrogare: esito "normale" — sia dal
-- webhook meta-process-leads, che non controllava lo stato del modulo).
--
-- Il codice è già stato cambiato:
--   - metaModuliDaInterrogare.decidiModulo: nel giro AUTOMATICO un modulo senza
--     riga attiva è "saltato_non_attivato";
--   - meta-process-leads: dal WEBHOOK si importa solo se il modulo ha una riga
--     status='active' (il BACKFILL, incluso il recupero manuale, resta libero).
-- La colonna meta_lead_forms.status ha già default 'inactive': un modulo nuovo
-- nasce spento e va attivato da Marketing → Moduli Facebook.
--
-- GRANDFATHERING. Perché l'opt-in non spenga lead che oggi funzionano, qui
-- ATTIVIAMO una-tantum i moduli che hanno ricevuto lead negli ultimi 30 giorni
-- ma NON hanno ancora una riga in meta_lead_forms. I moduli con una riga già
-- esistente (attiva o spenta) NON si toccano: una scelta dell'azienda resta.
-- Sul live, al 19/10/2026, i candidati sono pochissimi (≈3 moduli su 2 aziende):
-- quasi tutte le aziende hanno già configurato i propri moduli dalla UI.
--
-- Il nome del modulo non è noto qui (gli eventi webhook non lo portano): si usa
-- il form_id come segnaposto, che l'azienda può rinominare dalla UI. page_asset_id
-- resta NULL: pull e webhook lavorano per form_id, non serve per importare.
--
-- Rerunnable: ON CONFLICT (company_id, form_id) DO NOTHING. Scritture su una
-- manciata di righe: immediate.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

insert into public.meta_lead_forms
  (company_id, integration_id, form_id, form_name, status, sync_mode, since_date)
select
  r.company_id,
  mi.integration_id,
  r.form_id,
  r.form_id                 as form_name,   -- segnaposto: nome reale non disponibile qui
  'active'                  as status,
  'new_only'                as sync_mode,
  current_date              as since_date
from (
  select e.company_id, e.payload->>'form_id' as form_id
  from public.integration_webhook_events e
  where e.provider = 'meta'
    and e.event_type = 'leadgen'
    and e.received_at >= now() - interval '30 days'
    and e.payload->>'form_id' is not null
  group by e.company_id, e.payload->>'form_id'
) r
join lateral (
  select i.id as integration_id
  from public.integrations i
  where i.company_id = r.company_id and i.provider = 'meta'
  order by i.created_at
  limit 1
) mi on true
on conflict (company_id, form_id) do nothing;
