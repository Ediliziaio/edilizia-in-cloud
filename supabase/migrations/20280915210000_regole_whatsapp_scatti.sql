-- Regole WhatsApp di campagna: chi le gestisce, e quando sono scattate.
--
-- 1. Le regole di una campagna le gestisce chi gestisce le campagne (staff di
--    piattaforma), non solo il super admin. Le regole GENERALI restano al
--    super admin: valgono per ogni chat di ogni numero.
-- 2. openwa_regole_scatti: ogni volta che una regola combacia con un messaggio
--    in arrivo. Serve a due cose: mostrare accanto alla regola quante volte è
--    scattata (una regola che non scatta mai è scritta male), e mandare la
--    risposta automatica di una regola UNA volta sola per chat — due risposte
--    identiche allo stesso messaggio ripetuto sono il comportamento da bot che
--    fa segnalare il numero.

-- (SELECT …): la funzione si calcola una volta per istruzione, non per riga.
DROP POLICY IF EXISTS openwa_rules_campagna_staff ON public.openwa_rules;
CREATE POLICY openwa_rules_campagna_staff ON public.openwa_rules
  FOR ALL TO authenticated
  USING (campagna_id IS NOT NULL AND (SELECT public.is_platform_staff()))
  WITH CHECK (campagna_id IS NOT NULL AND (SELECT public.is_platform_staff()));

CREATE TABLE IF NOT EXISTS public.openwa_regole_scatti (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_id          uuid NOT NULL REFERENCES public.openwa_rules(id) ON DELETE CASCADE,
  campagna_id      uuid REFERENCES public.openwa_campagne(id) ON DELETE CASCADE,
  wa_chat_id       text NOT NULL,
  contact_id       uuid,
  risposta_inviata boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.openwa_regole_scatti IS
  'WhatsApp Locale: una riga ogni volta che una regola combacia con un messaggio in arrivo. Il webhook scrive, lo staff legge.';

CREATE INDEX IF NOT EXISTS idx_openwa_regole_scatti_regola ON public.openwa_regole_scatti (rule_id, created_at DESC);
-- Il lucchetto della risposta automatica: una sola per regola e per chat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_openwa_regole_scatti_risposta
  ON public.openwa_regole_scatti (rule_id, wa_chat_id) WHERE risposta_inviata;

ALTER TABLE public.openwa_regole_scatti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS openwa_regole_scatti_staff ON public.openwa_regole_scatti;
CREATE POLICY openwa_regole_scatti_staff ON public.openwa_regole_scatti
  FOR SELECT TO authenticated USING ((SELECT public.is_platform_staff()));

REVOKE ALL ON public.openwa_regole_scatti FROM PUBLIC, anon;
GRANT SELECT ON public.openwa_regole_scatti TO authenticated;
GRANT ALL ON public.openwa_regole_scatti TO service_role;
