-- Nessun piano include email: le email si pagano sempre a consumo.
--
-- Decisione commerciale del 2026-09-03. Fino a ieri i piani portavano un
-- pacchetto di email incluse (Scopri 50, Starter 500, Pro 2000, Enterprise
-- illimitate) e cinque piani non avevano il campo configurato affatto (NULL,
-- che get_company_email_quota leggeva come "nessun limite noto").
--
-- Da adesso il criterio e' uno solo: il piano paga il software, le email si
-- comprano a parte. Chi compra crediti dalla pagina Crediti passa da
-- create-checkout-session, che salva la carta con `setup_intent_data[usage]
-- =off_session`: la stessa carta abilita poi la ricarica automatica, quindi la
-- prima ricarica manuale e' anche l'attivazione dell'automatismo.
--
-- CONSEGUENZA IMMEDIATA, messa a verbale: al momento dell'applicazione 12
-- aziende su 14 attive hanno il borsellino email a zero e nessuna carta
-- salvata. Per loro il primo invio dopo questa migration fallisce (riga
-- 'failed' in email_deliveries con insufficient_credits) finche' non
-- ricaricano. E' l'effetto voluto della politica "tutti pagano a prescindere",
-- non un guasto.
--
-- Reversibile: UPDATE public.subscription_plans SET email_monthly_included = <vecchio valore>.

UPDATE public.subscription_plans
SET email_monthly_included = 0
WHERE email_monthly_included IS DISTINCT FROM 0;

COMMENT ON COLUMN public.subscription_plans.email_monthly_included IS
  'Email incluse nel canone ogni mese. 0 = nessuna inclusa (politica dal 2026-09-03: '
  'le email si pagano sempre a consumo dal borsellino). -1 varrebbe "illimitate", '
  'NULL = non configurato (da evitare: il canarino lo segnala).';
