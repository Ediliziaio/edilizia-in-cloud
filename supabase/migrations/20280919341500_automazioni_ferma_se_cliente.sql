-- 19/09/2026 — Nurturing di Marketing Edile: «non si deve mai fermare, si ferma
-- solo se diventa cliente». Finora un flusso poteva fermarsi solo su risposta
-- (stop_on_reply, che comprende anche la scheda spostata a mano): serviva la
-- regola opposta, un flusso che ignora risposte e spostamenti e si ferma solo
-- quando il contatto ha un'opportunità vinta nella pipeline scelta.
--
-- Una pipeline e non «qualunque vinta»: nella piattaforma ogni brand ha la sua,
-- e un cliente del gestionale (Pipeline Vendita SaaS) resta un contatto buono
-- per Marketing Edile.

alter table public.automation_flows
  add column if not exists stop_on_won_pipeline_id uuid
    references public.marketing_pipelines(id) on delete set null;

comment on column public.automation_flows.stop_on_won_pipeline_id is
  'Se valorizzata, il flusso si ferma per il contatto appena ha un''opportunità vinta (won_at) in questa pipeline.';
