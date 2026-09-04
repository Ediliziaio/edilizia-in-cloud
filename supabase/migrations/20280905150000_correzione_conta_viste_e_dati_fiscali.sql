-- ════════════════════════════════════════════════════════════════════════════
-- Correzione a una mia misura sbagliata, e la perdita che nascondeva
-- ════════════════════════════════════════════════════════════════════════════
--
-- Nell'ondata 5.5 avevo contato le viste senza `security_invoker` così:
--     (select option_value from pg_options_to_table(c.reloptions)
--       where option_name = 'security_invoker') = 'true'
-- e avevo riferito «59 protette, 27 no». È falso. Postgres conserva l'opzione
-- come l'ha ricevuta, e `security_invoker = on` è scritto 'on', non 'true'.
-- La conta vera è:
--     62 con 'true'  +  18 con 'on'  =  80 protette
--      6 senza
-- Non 27.
--
-- La correzione che avevo fatto regge lo stesso, e vale la pena dire perché:
-- non avevo scelto le viste da chiudere in base a quella classificazione, ma
-- contando quante righe di altre aziende un utente vedeva davvero. Quella
-- misura era giusta, e il rimedio l'ha portata a zero. La classificazione
-- sbagliata mi ha fatto guardare 21 viste che erano già a posto — tempo perso,
-- non danno — e me ne ha nascosta una che invece non lo era.
--
-- ── La vista nascosta dall'errore, ed è mia ────────────────────────────────
-- `v_dati_fiscali_da_sanare`, scritta da me nell'ondata 1 per elencare le
-- partite IVA e i codici fiscali non validi da correggere. Senza
-- security_invoker e con SELECT concesso ad `anon`.
-- Misurato prima di chiuderla, con `set role anon`:
--     248 righe, di cui 216 con un codice fiscale
-- di aziende, fornitori, profili e contatti — di tutte le aziende. Un codice
-- fiscale contiene data e luogo di nascita: è un dato personale, e stava
-- dietro alla sola chiave pubblica.
ALTER VIEW public.v_dati_fiscali_da_sanare SET (security_invoker = true);
REVOKE SELECT ON public.v_dati_fiscali_da_sanare FROM anon;

COMMENT ON VIEW public.v_dati_fiscali_da_sanare IS
  'Elenco diagnostico dei dati fiscali non validi. security_invoker attivo e anon revocato: senza, mostrava partite IVA e codici fiscali di aziende, fornitori, profili e contatti a chiunque avesse la chiave pubblica. Difetto mio, ondata 1.';

-- Le altre cinque rimaste senza security_invoker sono pubbliche per progetto:
--   ai_personas_public, public_appointment_manage, public_appointment_slots,
--   public_calendar_owner_prefs, referral_leaderboard_public
-- e restano com'è giusto che siano.
