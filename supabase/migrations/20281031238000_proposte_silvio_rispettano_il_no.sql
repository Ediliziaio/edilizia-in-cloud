-- Proposte di Silvio: un «no» vale, e niente doppioni (31/10/2026).
--
-- Negli ultimi 30 giorni Silvio ha creato 240 proposte automatiche: 0 accettate,
-- 3 rifiutate, 174 scadute senza risposta. Tre difetti in create_proactive_proposal:
--   1. si fermava solo dopo TRE rifiuti in 30 giorni: Innovasol ha rifiutato lo
--      stesso «cantiere in ritardo» tre volte (a 1, 3 e 6 giorni);
--   2. una proposta scaduta senza risposta tornava uguale al giro dopo
--      (Demo 2: 86 proposte per 53 cantieri);
--   3. con signal_entity_id NULL (il sollecito pagamenti generale) il confronto
--      «= NULL» non trovava mai il doppione: una proposta nuova ogni giorno.
-- Ora:
--   · un rifiuto → la stessa proposta sulla stessa cosa tace per 30 giorni;
--   · scaduta senza risposta → tace per 14 giorni;
--   · il confronto usa IS NOT DISTINCT FROM, così vale anche senza entità.

set local lock_timeout = '3s';

create or replace function public.create_proactive_proposal(
  p_company_id uuid, p_user_id uuid, p_persona_key text, p_action_type text, p_summary text,
  p_payload jsonb, p_signal_type text, p_signal_entity_id uuid,
  p_signal_metadata jsonb default '{}'::jsonb, p_risk_level text default 'yellow'::text, p_ttl_days integer default 7)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing uuid;
  v_new_id   uuid;
begin
  -- Già in attesa: la stessa, non un'altra.
  select id into v_existing
  from public.ai_action_proposals
  where company_id = p_company_id
    and signal_type = p_signal_type
    and signal_entity_id is not distinct from p_signal_entity_id
    and status = 'pending'
    and auto_generated = true
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Un «no» vale 30 giorni; una proposta lasciata scadere, 14.
  if exists (
    select 1 from public.ai_action_proposals
    where company_id = p_company_id
      and signal_type = p_signal_type
      and signal_entity_id is not distinct from p_signal_entity_id
      and auto_generated = true
      and ((status = 'rejected' and coalesce(resolved_at, created_at) >= now() - interval '30 days')
        or (status = 'expired' and expires_at >= now() - interval '14 days'))
  ) then
    return null;
  end if;

  insert into public.ai_action_proposals (
    company_id, user_id, persona_key, action_type, summary, payload,
    risk_level, expires_at,
    auto_generated, signal_type, signal_entity_id, signal_metadata
  ) values (
    p_company_id, p_user_id, p_persona_key, p_action_type, p_summary, p_payload,
    p_risk_level, now() + (p_ttl_days || ' days')::interval,
    true, p_signal_type, p_signal_entity_id, coalesce(p_signal_metadata, '{}'::jsonb)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;
