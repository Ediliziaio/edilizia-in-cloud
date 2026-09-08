-- Le funzioni citate dalle policy RLS tornano eseguibili da anon (08/09/2026).
--
-- COSA SI È ROTTO: la migrazione 20280911100002 («Delle 235 funzioni aperte ad
-- anon ne restano 43») ha revocato EXECUTE ad anon anche su funzioni che NON
-- sono RPC pubbliche, ma helper chiamati DENTRO le policy RLS con ruolo
-- `public`. Postgres, per un visitatore anonimo, deve comunque valutare quelle
-- policy: senza EXECUTE non restituisce «zero righe», fa fallire l'INTERA
-- query con 42501 → 401. Da ieri /prenota/<slug> mostrava «Calendario
-- momentaneamente non disponibile» a chiunque non fosse loggato, e con lui
-- ogni lettura anonima su 14 tabelle (marketing_calendars, appointments,
-- quotes, tasks, i *_progetti dei verticali, surveys…).
--
-- PERCHÉ RIAPRIRLE NON APRE NIENTE: tutte e quattro rispondono false a un
-- chiamante anonimo — `check_staff_visibility` e `internal_chat_is_order_channel`
-- con un `IF chiamante_anonimo() THEN false`, le altre due perché auth.uid() e
-- get_my_company_id() sono NULL. Restano SECURITY DEFINER, ma non concedono
-- una riga in più: servono solo a far VALUTARE la policy.
--
-- REGOLA: una funzione citata da una policy RLS con ruolo `public` deve restare
-- eseguibile da anon. Il prossimo giro di chiusure la deve saltare.
-- Applicata sul live via Management API, poi migration repair 20280912000005.

GRANT EXECUTE ON FUNCTION public.check_staff_visibility(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_survey_assignee(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.internal_chat_company_allowed(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.internal_chat_is_order_channel(uuid) TO anon;

INSERT INTO public.funzioni_pubbliche_di_proposito (nome, motivo) VALUES
  ('check_staff_visibility',
   'Helper di policy RLS: valutata anche per i visitatori anonimi (pagine /prenota, preventivi pubblici). Ritorna false a chi non ha fatto login; senza EXECUTE ogni lettura anonima sulle sue 14 tabelle fallisce con 401.'),
  ('is_survey_assignee',
   'Helper di policy RLS su surveys: senza EXECUTE una lettura anonima fallisce invece di non restituire righe. Ritorna false senza auth.uid().'),
  ('internal_chat_company_allowed',
   'Helper di policy RLS sulla chat interna: valutata anche dal ruolo public. Ritorna false senza azienda attiva.'),
  ('internal_chat_is_order_channel',
   'Helper di policy RLS sulla chat interna: ritorna false ai chiamanti anonimi.')
ON CONFLICT (nome) DO UPDATE SET motivo = EXCLUDED.motivo;
