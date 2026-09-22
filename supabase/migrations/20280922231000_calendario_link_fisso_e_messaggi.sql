-- Calendari: link fisso della videochiamata, messaggi WhatsApp, promemoria dei
-- 5 minuti, conferma anche per gli appuntamenti inseriti a mano (22/09/2026).
--
-- Prima:
--   • il calendario non aveva un luogo fisso: il link della call non arrivava
--     mai al cliente (solo un Meet casuale, e solo sull'evento Google);
--   • conferma e promemoria partivano solo per email e solo per chi prenotava
--     dalla pagina pubblica: chi veniva fissato al telefono non riceveva nulla;
--   • spostando l'appuntamento dal CRM o da Google i promemoria già mandati
--     restavano timbrati, e per la nuova data non partivano più.
--
-- Ora, per calendario (tutto spento di serie, nessun cambiamento per chi non
-- lo accende):
--   link_videochiamata   il link fisso (Meet, Zoom…): va nell'appuntamento,
--                        nelle email, nel file .ics e sull'evento Google;
--   whatsapp_numero_id   il numero WhatsApp Locale da cui partono conferma e
--                        promemoria (solo piattaforma: la funzione lo verifica);
--   promemoria_5min      il WhatsApp «siamo già collegati» pochi minuti prima;
--   messaggi_crm_dal     da quando conferma e promemoria valgono anche per gli
--                        appuntamenti inseriti a mano (NULL = no). Una data e
--                        non un sì/no: accendendolo non partono conferme per
--                        gli appuntamenti già in agenda (come
--                        companies.appuntamenti_notifiche_dal);
--   firma_messaggi       la firma dei messaggi al cliente;
--   cosa_preparare       righe «cosa preparare» nella conferma.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS link_videochiamata text,
  ADD COLUMN IF NOT EXISTS whatsapp_numero_id uuid REFERENCES public.openwa_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promemoria_5min boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messaggi_crm_dal timestamptz,
  ADD COLUMN IF NOT EXISTS firma_messaggi text,
  ADD COLUMN IF NOT EXISTS cosa_preparare text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_5m_at timestamptz,
  ADD COLUMN IF NOT EXISTS conferma_inviata_at timestamptz;

-- Spostato l'appuntamento (dal CRM, da Google, dalla pagina pubblica), i
-- promemoria ripartono per la nuova data. La conferma si rimanda solo se chi
-- sposta non l'ha già mandata lui nello stesso aggiornamento (la pagina
-- pubblica «sposta» manda la sua email e timbra conferma_inviata_at).
CREATE OR REPLACE FUNCTION public.appuntamento_spostato_riarma_messaggi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
     OR NEW.appointment_time IS DISTINCT FROM OLD.appointment_time THEN
    NEW.reminder_24h_at := NULL;
    NEW.reminder_1h_at := NULL;
    NEW.reminder_5m_at := NULL;
    IF NEW.conferma_inviata_at IS NOT DISTINCT FROM OLD.conferma_inviata_at THEN
      NEW.conferma_inviata_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Funzione di trigger: nessun EXECUTE a nessuno (il privilegio non si controlla allo scatto).
REVOKE ALL ON FUNCTION public.appuntamento_spostato_riarma_messaggi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_appuntamento_spostato_riarma_messaggi ON public.appointments;
CREATE TRIGGER trg_appuntamento_spostato_riarma_messaggi
  BEFORE UPDATE OF appointment_date, appointment_time ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appuntamento_spostato_riarma_messaggi();

-- Il giro dei promemoria: ogni 5 minuti (per quello dei 5 minuti) e attesa
-- breve. La funzione risponde subito a pg_net e finisce il lavoro in
-- background (serveConMetricheRapida): i WhatsApp simulano la scrittura e
-- possono prendere qualche secondo ciascuno. Il segreto resta nel Vault.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'appuntamenti-promemoria') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'appuntamenti-promemoria'),
      schedule := '2-59/5 * * * *',
      command := $cmd$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/appuntamenti-promemoria',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'proactive_cron_secret')),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 15000
  );$cmd$
    );
  END IF;
END
$cron$;
