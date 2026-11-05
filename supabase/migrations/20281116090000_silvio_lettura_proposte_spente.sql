-- Due scelte del 03/11/2026, senza righe scritte su tabelle grandi.
--
-- 1. Le proposte automatiche si fermano: 0 approvate su 357 in 60 giorni (324 scadute). Il job si
--    spegne e basta: la funzione e le proposte restano, quelle aperte scadono da sole. Per
--    riaccenderlo: cron.alter_job con active := true.
-- 2. `persona_silvio_lettura`: Haiku per le domande di sola lettura, stesso tier di Silvio. La usa
--    silvio-chat solo su Demo Azienda 2, per confrontare qualita' e costo.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

select cron.alter_job(j.jobid, active := false)
  from cron.job j
 where j.jobname = 'ai-proactive-proposals-daily' and j.active;

insert into public.ai_router_config
  (task_key, task_label, task_description, primary_model, fallback_models, default_params, category, estimated_cost_per_million, enabled, tier_key)
values
  ('persona_silvio_lettura', 'Silvio: domande di sola lettura',
   'Chat Silvio quando la domanda legge soltanto: modello economico, in prova su Demo Azienda 2',
   'anthropic/claude-haiku-4.5',
   '["anthropic/claude-sonnet-4.5","openai/gpt-4o-mini"]'::jsonb,
   '{"max_tokens":2500,"temperature":0.3}'::jsonb, 'analysis', 0.6000, true, 't2_vision')
on conflict (task_key) do nothing;
