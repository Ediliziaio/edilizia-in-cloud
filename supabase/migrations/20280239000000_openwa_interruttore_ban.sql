-- Quando un numero cade, fermare gli altri prima che cadano anche loro.
--
-- Il ban veniva rilevato (il webhook mette stato='banned') e il numero veniva
-- correttamente escluso dagli invii — ma NESSUNO lo sapeva. Perdi un quinto
-- della capacita' e te ne accorgi guardando il pannello, o non te ne accorgi.
--
-- Il problema vero e' un altro: se il ban arriva perche' la lista e' tossica o
-- il messaggio fa segnalare, gli altri numeri continuano a mandare sulla
-- STESSA lista finche' non cadono uno dopo l'altro. Un cold outreach che
-- perde i numeri in fila e' un cold outreach che si e' accorto troppo tardi.
--
-- Qui l'interruttore: al primo ban le campagne in corso vanno in pausa e il
-- super-admin riceve l'avviso. Ripartire e' una scelta umana — deve esserlo,
-- perche' se riparte da sola sul problema che non hai ancora capito perdi
-- anche il numero successivo.

ALTER TABLE public.openwa_numbers
  ADD COLUMN IF NOT EXISTS ban_rilevato_at timestamptz,
  ADD COLUMN IF NOT EXISTS ban_avvisato_at timestamptz;

COMMENT ON COLUMN public.openwa_numbers.ban_rilevato_at IS
  'Quando il numero e'' passato a stato=banned. Azzerato se torna connected.';
COMMENT ON COLUMN public.openwa_numbers.ban_avvisato_at IS
  'Quando e'' partito l''avviso al super-admin. Evita di riavvisare a ogni giro.';

-- Il trigger fa DUE cose, entrambe nel momento in cui il ban viene scritto:
-- marca l'istante e mette in pausa le campagne. Farlo nel trigger e non nel
-- webhook e' voluto: cosi' vale qualunque sia la strada da cui arriva il
-- cambio di stato, anche una modifica a mano dal pannello.
CREATE OR REPLACE FUNCTION public.openwa_ban_ferma_campagne()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stato = 'banned' AND COALESCE(OLD.stato, '') <> 'banned' THEN
    NEW.ban_rilevato_at := now();

    UPDATE public.openwa_campagne
    SET stato = 'in_pausa', updated_at = now()
    WHERE stato = 'in_corso';

  ELSIF NEW.stato = 'connected' AND COALESCE(OLD.stato, '') = 'banned' THEN
    -- Numero recuperato: si riarma l'avviso, cosi' un ban futuro riavvisa.
    NEW.ban_rilevato_at := NULL;
    NEW.ban_avvisato_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_openwa_ban_ferma_campagne ON public.openwa_numbers;
CREATE TRIGGER trg_openwa_ban_ferma_campagne
  BEFORE UPDATE OF stato ON public.openwa_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.openwa_ban_ferma_campagne();

-- ── Il canarino se ne accorge ───────────────────────────────────────────────
-- Un numero bannato e non ancora comunicato e' esattamente il tipo di guasto
-- che questa piattaforma lasciava morire in silenzio.
CREATE OR REPLACE FUNCTION public.openwa_numeri_bannati_da_avvisare()
RETURNS TABLE(numero_id uuid, numero text, ban_rilevato_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT n.id, n.numero, n.ban_rilevato_at
  FROM public.openwa_numbers n
  WHERE n.stato = 'banned'
    AND n.ban_rilevato_at IS NOT NULL
    AND n.ban_avvisato_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.openwa_numeri_bannati_da_avvisare() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.openwa_numero_ban_avvisato(p_numero_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.openwa_numbers SET ban_avvisato_at = now() WHERE id = p_numero_id;
$function$;

REVOKE ALL ON FUNCTION public.openwa_numero_ban_avvisato(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Il rapporto mattutino lo dice ──────────────────────────────────────────
-- canarino_vitali riscritta con la sezione whatsapp_numeri_bannati.
CREATE OR REPLACE FUNCTION public.canarino_vitali()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron', 'net'
AS $function$
WITH job_recenti AS (
  SELECT DISTINCT jobid FROM cron.job_run_details WHERE start_time > now() - interval '26 hours'
),
caselle AS (
  SELECT c.provider, count(*) AS totali,
    count(*) FILTER (WHERE (c.expires_at IS NOT NULL AND c.expires_at < now()) OR c.consecutive_errors >= 5) AS rotte
  FROM public.email_oauth_connections c WHERE c.poll_enabled GROUP BY c.provider
)
SELECT jsonb_build_object(
  'generato_alle', now(),
  'cron_silenti', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('job', j.jobname, 'schedule', j.schedule))
    FROM cron.job j WHERE j.active
      AND split_part(j.schedule,' ',3)='*' AND split_part(j.schedule,' ',5)='*'
      AND j.jobid NOT IN (SELECT jobid FROM job_recenti)
      AND EXISTS (SELECT 1 FROM public.ops_cron_visti v WHERE v.jobid=j.jobid AND v.primo_avvistamento < now() - interval '26 hours')
  ), '[]'::jsonb),
  'http_errori_24h', COALESCE((
    SELECT jsonb_agg(x) FROM (
      SELECT coalesce(r.status_code::text,'timeout') AS status, count(*) AS n, left(max(r.content),90) AS esempio
      FROM net._http_response r WHERE r.created > now() - interval '24 hours'
        AND (r.status_code IS NULL OR r.status_code >= 400)
      GROUP BY 1 ORDER BY count(*) DESC LIMIT 8) x
  ), '[]'::jsonb),
  -- NUOVO: numeri WhatsApp bannati. Le campagne si fermano da sole (trigger),
  -- ma la ripartenza e' una scelta umana: qui si dice che serve.
  'whatsapp_numeri_bannati', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'numero', n.numero, 'dal', n.ban_rilevato_at::date,
      'nota', 'le campagne in corso sono state messe in pausa'))
    FROM public.openwa_numbers n WHERE n.stato = 'banned'
  ), '[]'::jsonb),
  'oauth_provider_giu', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('provider', k.provider, 'caselle_rotte', k.rotte, 'su_totale', k.totali,
      'sospetto', 'tutte le caselle ' || k.provider || ' sono giu'': controllare le credenziali OAuth di piattaforma'))
    FROM caselle k WHERE k.totali >= 3 AND k.rotte = k.totali
  ), '[]'::jsonb),
  'caselle_scollegate_totale', COALESCE((SELECT sum(k.rotte) FROM caselle k), 0),
  'caselle_collegate_totale', COALESCE((SELECT sum(k.totali) FROM caselle k), 0),
  'integrazioni_scadute', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('integration_id', ic.integration_id, 'tipo', ic.token_type, 'scaduta_il', ic.expires_at::date))
    FROM integration_credentials ic WHERE ic.expires_at IS NOT NULL AND ic.expires_at < now()
  ), '[]'::jsonb),
  'dunning_fermo', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('azienda', c.name, 'in_ritardo_da', (CURRENT_DATE - c.dunning_started_at::date)))
    FROM companies c WHERE c.stripe_subscription_status='past_due' AND c.dunning_started_at < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM dunning_attempts da WHERE da.company_id=c.id AND da.status='sent' AND da.created_at > now() - interval '4 days')
  ), '[]'::jsonb),
  'ricariche_esaurite', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('azienda', c.name, 'wallet', t.wallet_type, 'motivo', left(coalesce(t.last_failure_reason,'?'),60)))
    FROM company_auto_topup t JOIN companies c ON c.id=t.company_id WHERE t.retries_exhausted_at IS NOT NULL
  ), '[]'::jsonb)
);
$function$;
NOTIFY pgrst, 'reload schema';
