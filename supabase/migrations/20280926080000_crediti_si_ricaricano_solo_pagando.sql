-- I crediti si ricaricano solo pagando (o dal super admin).
--
-- Trovato il 26/09/2026 nel censimento delle funzioni SECURITY DEFINER che
-- ricevono un'azienda come parametro: le ricariche controllavano soltanto che
-- l'utente fosse di quell'azienda. Qualsiasi membro, non solo l'amministratore,
-- si ricaricava gratis i crediti della propria:
--   - topup_pool, topup_service_credits (email, AI, WhatsApp);
--   - adjust_credits_atomic, adjust_render_credits_atomic (rettifiche);
--   - purchase_extra_render_credit (render, con un «pagamento» qualsiasi);
-- e sms_wallet lasciava a ogni membro inserire o modificare il portafoglio SMS,
-- saldo compreso.
--
-- Le ricariche vere passano da Stripe (stripe-webhook) e dalle funzioni del
-- super admin (admin-adjust-credits, topup-credits), tutte con la chiave di
-- servizio; il saldo SMS lo scrivono solo le funzioni Telnyx, con la chiave di
-- servizio. Dalle pagine si leggono e basta. Quindi l'esecuzione resta al
-- servizio, e sms_wallet si scrive solo da lì.
--
-- Nello stesso giro, stesse condizioni (nessuna pagina le chiama; le usano
-- funzioni del server con la chiave di servizio o altre funzioni SECURITY
-- DEFINER): maybe_auto_recharge, ensure_monthly_free_ai_credits,
-- silvio_crea_bozza_campagna_ads (bozze di campagne pubblicitarie in qualsiasi
-- azienda), log_audit_event (voci di audit con l'azienda scelta da chi
-- chiama), email_seed_user_folders, create_persona_session.

set local lock_timeout = '3s';

do $revoca$
declare
  elenco constant text[] := array[
    'topup_pool', 'topup_service_credits', 'adjust_credits_atomic', 'adjust_render_credits_atomic',
    'purchase_extra_render_credit', 'maybe_auto_recharge', 'ensure_monthly_free_ai_credits',
    'silvio_crea_bozza_campagna_ads', 'log_audit_event', 'email_seed_user_folders', 'create_persona_session'
  ];
  f record;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = any (elenco)
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
    execute format('grant execute on function %s to service_role', f.firma);
    n := n + 1;
  end loop;
  if n <> cardinality(elenco) then
    raise exception 'funzioni trovate % su % in elenco', n, cardinality(elenco);
  end if;
end
$revoca$;

-- Il portafoglio SMS lo leggono i membri, lo scrive solo il servizio.
drop policy if exists sms_wallet_insert on public.sms_wallet;
drop policy if exists sms_wallet_update on public.sms_wallet;
