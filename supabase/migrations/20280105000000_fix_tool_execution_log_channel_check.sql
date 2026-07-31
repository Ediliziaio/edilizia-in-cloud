-- FIX audit Silvio SILENZIOSAMENTE ROTTO (scoperto coi test su Demo Azienda,
-- 2026-07-31): tool_execution_log_channel_check permetteva SOLO
-- ('web','mobile','whatsapp','voice','email','cron'), ma il motore tool
-- (silvioToolExecution.writeAudit) scrive `channel: ctx.channel ?? 'internal_chat'`
-- → OGNI insert dalla chat interna violava il CHECK e, essendo l'audit in
-- try/catch, falliva in silenzio. Prova: tool_execution_log = 0 righe TOTALI
-- nonostante il traffico chat reale.
--
-- Fix: il CHECK ora combacia col tipo `Channel` del registry
-- (supabase/functions/_shared/silvioTools.ts): internal_chat, web_persona,
-- telegram e api aggiunti; i valori storici restano validi.

ALTER TABLE public.tool_execution_log
  DROP CONSTRAINT IF EXISTS tool_execution_log_channel_check;

ALTER TABLE public.tool_execution_log
  ADD CONSTRAINT tool_execution_log_channel_check
  CHECK (channel = ANY (ARRAY[
    'internal_chat'::text,
    'web_persona'::text,
    'web'::text,
    'mobile'::text,
    'whatsapp'::text,
    'telegram'::text,
    'voice'::text,
    'email'::text,
    'api'::text,
    'cron'::text
  ]));
