-- Due correzioni di configurazione, entrambe chieste esplicitamente.
--
-- ── 1. Il portale clienti e' spento di partenza, e spento ovunque ───────────
--
-- `companies.customer_portal_enabled` («Area privata clienti») e' nato nella
-- 20261024130000 con DEFAULT TRUE. Qualcuno ha poi cambiato il valore di
-- partenza in false direttamente nel database, senza file — quindi il
-- repository diceva una cosa e la produzione un'altra — e le aziende create
-- prima di quel cambio sono rimaste accese: 11 su 22. Qui il default si fissa
-- anche nel repository, e le 11 si spengono.
--
-- Cosa comporta spegnerlo: da ora nessun cliente creato riceve un account per
-- il portale ne' l'email con le credenziali; la creazione salva solo
-- l'anagrafica. Nessuno perde un accesso che usava: al momento del cambio,
-- nessun cliente e' MAI entrato nel portale in nessuna azienda, e le 11 aziende
-- accese avevano 12 account cliente in tutto (Ser Style), tutti gia' bloccati.
--
-- Resta intatta la funzione di piano `portale_cliente`: un'azienda che vuole
-- aprirlo ai propri clienti puo' ancora farlo dalle impostazioni, con la
-- doppia conferma che c'era gia'. Spento di partenza, non vietato.
--
-- ── 2. La sezione Email entra nei piani Enterprise e Pro ────────────────────
--
-- La voce «Email» della barra laterale e' legata alla funzione `email_client`,
-- che NON era elencata in nessun piano reale: ne' Enterprise, ne' Pro, ne'
-- Marketing, ne' Starter. Solo i due piani Render l'avevano, e in anteprima.
-- La vedevano soltanto tre aziende, per un'eccezione messa a mano (Demo, Demo 2,
-- Green Energy). Best Infissi e Suntech, che sono Enterprise, no.
--
-- Accesa per Enterprise, Pro e Pro — Offerta Clienti. Restano fuori Marketing e
-- Starter, che nascondono i moduli per scelta. Le eccezioni manuali esistenti
-- non si toccano. Nessuna azienda vera ha ancora una casella collegata: aprendo
-- la sezione la prima volta vedranno «collega la tua casella».

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.companies ALTER COLUMN customer_portal_enabled SET DEFAULT false;

UPDATE public.companies
   SET customer_portal_enabled = false
 WHERE customer_portal_enabled;

-- Enterprise 97206ca0…, Pro 60ba7938…, Pro — Offerta Clienti 2ec6a97a…
INSERT INTO public.plan_feature_defaults (plan_id, feature_key, is_enabled, access_level)
SELECT sp.id, 'email_client', true, 'enabled'::public.feature_access_level
  FROM public.subscription_plans sp
 WHERE sp.id IN ('97206ca0-e681-4d89-a7ea-af1fdaae3fe0',
                 '60ba7938-55ef-4cb4-99ee-3b80f68226e5',
                 '2ec6a97a-8f24-4b4d-9c90-d37a1215bc49')
ON CONFLICT (plan_id, feature_key) DO UPDATE
   SET is_enabled   = true,
       access_level = 'enabled'::public.feature_access_level,
       updated_at   = now();
