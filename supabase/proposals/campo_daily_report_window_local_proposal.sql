-- LOCAL PROPOSAL ONLY. Not in migrations; never applied to the remote project.
-- Existing RLS, author/site/day unique constraint and approval permissions stay.
-- Office reopening of an expired report needs a separate audited workflow.
CREATE OR REPLACE FUNCTION public.campo_report_day_allowed_v1(p_day date, p_now timestamptz)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT p_day BETWEEN (p_now AT TIME ZONE 'Europe/Rome')::date - 1
                   AND (p_now AT TIME ZONE 'Europe/Rome')::date;
$$;
REVOKE ALL ON FUNCTION public.campo_report_day_allowed_v1(date,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campo_report_day_allowed_v1(date,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campo_guard_daily_report_window_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  -- Office review and derived outputs may be written after the submission
  -- deadline. These exclusions grant NO authorization; RLS still applies.
  derived_keys text[] := ARRAY['stato','approvato','approvato_at','approvato_da',
    'motivo_rifiuto','updated_at','pdf_url','costo_manodopera',
    'costo_registrato_at','presenze_registrate','ticket_aperto_id'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.data_lavoro IS DISTINCT FROM OLD.data_lavoro THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='La giornata di un rapportino esistente non può essere spostata.';
    END IF;
    IF (to_jsonb(NEW) - derived_keys) IS NOT DISTINCT FROM (to_jsonb(OLD) - derived_keys)
       AND NOT (NEW.stato = 'inviato' AND OLD.stato IS DISTINCT FROM 'inviato') THEN
      RETURN NEW;
    END IF;
  END IF;
  -- clock_timestamp, not client time or transaction start: long transactions
  -- crossing midnight must not extend the submission window.
  IF public.campo_report_day_allowed_v1(NEW.data_lavoro, clock_timestamp()) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='Rapportino fuori termine: inviare entro il giorno successivo al lavoro, ora italiana.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.campo_guard_daily_report_window_v1() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS zz_campo_daily_report_window_v1 ON public.campo_rapportini;
CREATE TRIGGER zz_campo_daily_report_window_v1
  BEFORE INSERT OR UPDATE ON public.campo_rapportini
  FOR EACH ROW EXECUTE FUNCTION public.campo_guard_daily_report_window_v1();
