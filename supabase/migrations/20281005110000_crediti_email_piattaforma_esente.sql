-- ============================================================================
-- La piattaforma manda le SUE email a proprie spese: niente credito da scalare
-- ============================================================================
-- 05/10/2026: i WhatsApp «scegli giorno e orario» ai lead del sito non partivano.
-- Il flusso «Appuntamenti · 1 · Lead arrivato» è una catena: Email 1 → avvio dei
-- messaggi 2-4 → nurturing → WhatsApp 1. Il commit 60f872015 (01/10, 18:09) ha
-- cambiato l'invio email: se il credito non basta NON si manda più (prima si
-- mandava lo stesso, «non bloccare l'automazione per il credito»). Giusto per i
-- clienti, ma la piattaforma («Platform Admin CRM», 00000000-…-0001) ha il saldo a
-- 0 dal 07/09 e non è mai stata addebitata: dal 02/10 ogni sua email falliva con
-- «Credito email non disponibile», e con lei si fermava tutta la catena — niente
-- WhatsApp, niente messaggi 2-4, niente nurturing. Colpiti i lead arrivati dopo il
-- cambio: tra loro Sokol Heqimi, dal modulo del sito, la sera del 04/10.
--
-- Qui si ripristina quello che la piattaforma faceva da sempre, SOLO per lei: sulle
-- email delle sue automazioni non scala nulla (il costo lo sostiene lei, non c'è un
-- cliente da addebitare). Per tutte le altre aziende il controllo resta com'è.
-- Il resto del corpo è identico alla versione precedente.
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.deduct_email_credits_with_log(
  p_company_id uuid,
  p_cost numeric,
  p_description text default null,
  p_campaign_id uuid default null,
  p_metadata jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_saldo numeric; v_res jsonb;
begin
  perform public.assert_company_access(p_company_id);

  select balance_eur into v_saldo from public.company_credit_pool where company_id = p_company_id;

  -- La piattaforma manda le sue email a proprie spese: non c'è nessuno da addebitare.
  if p_company_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return jsonb_build_object('balance_before', coalesce(v_saldo, 0), 'balance_after', coalesce(v_saldo, 0), 'esente', true);
  end if;

  if coalesce(v_saldo, 0) < p_cost then
    raise exception 'Crediti email insufficienti: saldo % EUR, servono % EUR',
      to_char(coalesce(v_saldo,0), 'FM999999990.0000'), to_char(p_cost, 'FM999999990.0000')
      using errcode = 'check_violation';
  end if;

  v_res := public.pool_consuma(p_company_id, 'email', p_cost, p_description,
             coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('campaign_id', p_campaign_id));

  insert into public.email_credits_log
    (company_id, type, amount_eur, balance_before, balance_after, description, campaign_id, metadata)
  values (p_company_id, 'deduct', p_cost,
          (v_res->>'balance_before')::numeric, (v_res->>'balance_after')::numeric,
          p_description, p_campaign_id, p_metadata);

  return v_res;
end; $function$;
