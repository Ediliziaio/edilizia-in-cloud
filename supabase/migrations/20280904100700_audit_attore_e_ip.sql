-- F1-06 / F1-09 — L'audit impara chi ha fatto cosa, e da quale indirizzo.
--
-- Su 1.016 righe di central_audit_log l'attore risultava presente nel 2,9%
-- degli aggiornamenti ai profili, in nessun inserimento, e l'IP in zero righe.
-- Causa: il trigger leggeva solo auth.uid(), NULL quando la scrittura arriva
-- da una edge function con chiave di servizio.
--
-- PostgREST espone gli header della richiesta come current_setting('request.headers'):
-- le edge function passano x-actor-id / x-actor-email / x-actor-ip tramite
-- _shared/auditContext.ts e il trigger li usa come ripiego.
--
-- NB: central_audit_log.ip_address è di tipo inet. La prima versione passava
-- text, l'INSERT falliva e il catch lo ingoiava: il trigger smetteva di
-- scrivere del tutto. Ora l'IP viene convertito e un valore malformato produce
-- un IP nullo invece di far perdere l'intera riga.

CREATE OR REPLACE FUNCTION public.audit_request_header(p_name text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_raw text;
BEGIN
  v_raw := current_setting('request.headers', true);
  IF v_raw IS NULL OR v_raw = '' THEN RETURN NULL; END IF;
  RETURN NULLIF(btrim((v_raw::json ->> p_name)), '');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_audit_log_row()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_before JSONB; v_after JSONB; v_pk TEXT; v_company UUID; v_changed TEXT[];
  v_role TEXT; v_email TEXT; v_uid UUID; v_ip_txt TEXT; v_ip INET;
  v_ua TEXT; v_impers TEXT; v_notes TEXT;
BEGIN
  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NULL THEN
    BEGIN v_uid := NULLIF(public.audit_request_header('x-actor-id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  END IF;

  v_ip_txt := COALESCE(public.audit_request_header('x-actor-ip'),
    split_part(COALESCE(public.audit_request_header('x-forwarded-for'), ''), ',', 1));
  BEGIN v_ip := NULLIF(btrim(COALESCE(v_ip_txt, '')), '')::inet;
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  v_ua := left(COALESCE(public.audit_request_header('user-agent'), ''), 300);
  v_impers := public.audit_request_header('x-impersonator-id');

  IF TG_OP = 'INSERT' THEN v_before := NULL; v_after := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
    SELECT array_agg(key) INTO v_changed FROM jsonb_each(v_after)
     WHERE v_after->>key IS DISTINCT FROM (v_before->>key);
  ELSIF TG_OP = 'DELETE' THEN v_before := to_jsonb(OLD); v_after := NULL;
  END IF;

  v_pk := COALESCE((v_after->>'id'), (v_before->>'id'));
  v_company := NULLIF(COALESCE((v_after->>'company_id'), (v_before->>'company_id')), '')::uuid;
  IF TG_TABLE_NAME = 'companies' THEN
    v_company := NULLIF(COALESCE((v_after->>'id'), (v_before->>'id')), '')::uuid;
  END IF;

  IF v_uid IS NOT NULL THEN
    BEGIN SELECT (role::text) INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;
    BEGIN SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  END IF;
  IF v_email IS NULL THEN v_email := public.audit_request_header('x-actor-email'); END IF;
  IF v_impers IS NOT NULL THEN
    v_notes := 'azione in impersonation — amministratore: ' || v_impers;
  END IF;

  BEGIN
    INSERT INTO public.central_audit_log (actor_user_id, actor_email, actor_role, company_id,
      table_name, operation, row_pk, before_data, after_data, changed_fields,
      ip_address, user_agent, notes)
    VALUES (v_uid, v_email, v_role, v_company, TG_TABLE_NAME, TG_OP, v_pk,
      v_before, v_after, v_changed, v_ip, NULLIF(v_ua, ''), v_notes);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'central_audit_log insert fallito: % / %', SQLSTATE, SQLERRM;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
