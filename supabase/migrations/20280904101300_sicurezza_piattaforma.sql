-- F2-04 — Cruscotto sicurezza a livello di piattaforma.
--
-- Esiste già `get-security-report`, con cinque sezioni ben fatte, ma filtra
-- sempre sull'azienda del chiamante: nata per il cruscotto lato azienda, per il
-- SuperAdmin è inutilizzabile, perché sessioni, tentativi falliti e account
-- bloccati sono fatti di piattaforma, non di singolo cliente.
--
-- Invece di allentare lo scoping di quella funzione — che oggi funziona e serve
-- alle aziende — se ne aggiunge una dedicata: nessun rischio di regressione sul
-- percorso esistente, e una separazione netta fra i due punti di vista.

CREATE OR REPLACE FUNCTION public.admin_security_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_riepilogo jsonb;
  v_bloccati  jsonb;
  v_sessioni  jsonb;
  v_tentativi jsonb;
  v_admin     jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    -- Il numero che conta più di tutti: quante persone con poteri
    -- amministrativi proteggono l'accesso con un secondo fattore.
    'admin_totali',       (SELECT count(*) FROM public.user_roles
                            WHERE role::text = 'super_admin' OR role::text LIKE 'platform%'),
    'mfa_attivi',         (SELECT count(DISTINCT f.user_id) FROM auth.mfa_factors f
                            WHERE f.status = 'verified'),
    'utenti_totali',      (SELECT count(*) FROM public.profiles),
    'utenti_bloccati',    (SELECT count(*) FROM public.profiles WHERE COALESCE(is_blocked, false)),
    'account_lockati',    (SELECT count(*) FROM public.profiles
                            WHERE locked_until IS NOT NULL AND locked_until > now()),
    'con_tentativi_falliti', (SELECT count(*) FROM public.profiles
                               WHERE COALESCE(failed_login_count, 0) > 0),
    'sessioni_attive_24h',(SELECT count(*) FROM public.user_sessions
                            WHERE is_active AND last_active_at > now() - interval '24 hours'),
    'tentativi_falliti_24h', (SELECT count(*) FROM public.login_attempts
                               WHERE NOT success AND created_at > now() - interval '24 hours'),
    'aziende_con_ip_allowlist', (SELECT count(*) FROM public.companies
                                  WHERE allowed_ips IS NOT NULL AND array_length(allowed_ips, 1) > 0
                                    AND deleted_at IS NULL),
    'impersonation_7g',   (SELECT count(*) FROM public.admin_audit_log
                            WHERE action LIKE 'impersonation%' AND created_at > now() - interval '7 days')
  ) INTO v_riepilogo;

  -- Chi è bloccato adesso, e perché
  SELECT COALESCE(jsonb_agg(t ORDER BY t.bloccato_il DESC NULLS LAST), '[]'::jsonb) INTO v_bloccati
  FROM (
    SELECT p.id, p.email,
           NULLIF(btrim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS nome,
           c.name AS azienda, p.block_reason AS motivo, p.blocked_at AS bloccato_il,
           p.locked_until AS bloccato_fino, COALESCE(p.failed_login_count, 0) AS tentativi
      FROM public.profiles p
      LEFT JOIN public.companies c ON c.id = p.company_id
     WHERE COALESCE(p.is_blocked, false)
        OR (p.locked_until IS NOT NULL AND p.locked_until > now())
     LIMIT 100
  ) t;

  -- Accessi in corso, per riconoscere una sessione che non dovrebbe esserci
  SELECT COALESCE(jsonb_agg(t ORDER BY t.ultima_attivita DESC), '[]'::jsonb) INTO v_sessioni
  FROM (
    SELECT us.id, p.email, c.name AS azienda, us.ip_address::text AS ip,
           us.browser, us.os AS sistema, us.device_type AS dispositivo,
           us.last_active_at AS ultima_attivita
      FROM public.user_sessions us
      LEFT JOIN public.profiles p ON p.id = us.user_id
      LEFT JOIN public.companies c ON c.id = us.company_id
     WHERE us.is_active AND us.last_active_at > now() - interval '24 hours'
     ORDER BY us.last_active_at DESC
     LIMIT 50
  ) t;

  -- Tentativi falliti recenti: raggruppati per email, così un attacco mirato
  -- si distingue da un utente che ha sbagliato password una volta.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.tentativi DESC), '[]'::jsonb) INTO v_tentativi
  FROM (
    SELECT la.email, count(*) AS tentativi,
           count(DISTINCT la.ip_address) AS indirizzi_diversi,
           max(la.created_at) AS ultimo,
           array_agg(DISTINCT la.failure_reason) AS motivi
      FROM public.login_attempts la
     WHERE NOT la.success AND la.created_at > now() - interval '7 days'
     GROUP BY la.email
     ORDER BY count(*) DESC
     LIMIT 30
  ) t;

  -- Chi ha le chiavi della piattaforma, e se le protegge
  SELECT COALESCE(jsonb_agg(t ORDER BY t.ruolo, t.email), '[]'::jsonb) INTO v_admin
  FROM (
    SELECT p.email, ur.role::text AS ruolo,
           NULLIF(btrim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS nome,
           EXISTS (SELECT 1 FROM auth.mfa_factors f
                    WHERE f.user_id = p.id AND f.status = 'verified') AS ha_mfa,
           (SELECT max(us.last_active_at) FROM public.user_sessions us
             WHERE us.user_id = p.id) AS ultimo_accesso
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.role::text = 'super_admin' OR ur.role::text LIKE 'platform%'
  ) t;

  RETURN jsonb_build_object(
    'riepilogo', v_riepilogo,
    'bloccati', v_bloccati,
    'sessioni_attive', v_sessioni,
    'tentativi_falliti', v_tentativi,
    'amministratori', v_admin,
    'calcolato_il', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_security_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_security_overview() TO authenticated, service_role;
