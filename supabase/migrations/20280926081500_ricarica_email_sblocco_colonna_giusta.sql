-- topup_service_credits: la ricarica dei crediti email non falliva più a metà.
--
-- Trovato il 26/09/2026 provando la chiusura delle ricariche
-- (crediti_si_ricaricano_solo_pagando): per il servizio 'email' la funzione
-- andava in errore (42703 column "calls_blocked" does not exist). Lo sblocco
-- finale usava sends_blocked solo per whatsapp_credits, ma anche
-- email_credits ha sends_blocked e non calls_blocked. La ricarica manuale dei
-- crediti email dal super admin (topup-credits) non riusciva mai; Stripe la
-- usa solo per gli agenti AI, che restano come prima.
--
-- Provato in una transazione annullata, come servizio: prima 42703, dopo la
-- ricarica email riesce; quella AI invariata.

set local lock_timeout = '3s';

do $correzione$
declare
  v_def text := pg_get_functiondef('public.topup_service_credits(text,uuid,numeric)'::regprocedure);
  vecchio constant text := 'IF v_table = ''whatsapp_credits'' THEN';
  nuovo constant text := 'IF v_table IN (''whatsapp_credits'', ''email_credits'') THEN';
  v_volte integer;
begin
  if position(nuovo in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, vecchio, ''))) / length(vecchio);
  if v_volte <> 1 then
    raise exception 'topup_service_credits: punto da correggere trovato % volte invece di una', v_volte;
  end if;
  execute replace(v_def, vecchio, nuovo);
end
$correzione$;
