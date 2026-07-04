-- P1 Firma Elettronica: audit immutabile protetto + scadenza automatica richieste.

-- 1) L'audit trail (prova legale, CAD) non deve sparire se si cancella la
--    richiesta: da CASCADE a RESTRICT.
ALTER TABLE public.fea_audit_log
  DROP CONSTRAINT IF EXISTS fea_audit_log_request_id_fkey;
ALTER TABLE public.fea_audit_log
  ADD CONSTRAINT fea_audit_log_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.signature_requests(id) ON DELETE RESTRICT;

-- 2) Scadenza automatica: pending/otp_verified scadute → 'expired' + audit.
CREATE OR REPLACE FUNCTION public.fea_expire_stale_requests()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
  v_n integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM public.signature_requests
  WHERE status IN ('pending','otp_verified')
    AND expires_at IS NOT NULL AND expires_at < now();

  IF v_ids IS NULL THEN RETURN 0; END IF;

  UPDATE public.signature_requests
  SET status = 'expired', updated_at = now()
  WHERE id = ANY(v_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.fea_audit_log (request_id, company_id, evento, metadati)
  SELECT id, company_id, 'sessione_scaduta',
         jsonb_build_object('expired_at', now(), 'source', 'cron')
  FROM public.signature_requests WHERE id = ANY(v_ids);

  RETURN v_n;
END; $$;

-- 3) Cron orario (pg_cron). Idempotente.
DO $$
BEGIN
  PERFORM cron.unschedule('fea-expire-stale-requests')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='fea-expire-stale-requests');
  PERFORM cron.schedule('fea-expire-stale-requests', '7 * * * *',
    $cron$ SELECT public.fea_expire_stale_requests(); $cron$);
END $$;
