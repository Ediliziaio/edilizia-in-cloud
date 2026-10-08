-- Call center di piattaforma: una persona che lavora SOLO sul CRM della piattaforma (contatti, opportunità,
-- calendario, chiamate) dall'area super admin, senza vedere il resto.
--
-- Cosa fa:
--  1. nuovo ruolo `platform_callcenter`;
--  2. `super_admin_permissions.crm_operatore`: il permesso «CRM e chiamate» (non apre campagne, automazioni,
--     statistiche né incassi);
--  3. `has_permission` tratta il call center di piattaforma come uno staff: i suoi permessi stanno in
--     staff_permissions per l'azienda Piattaforma e valgono nelle regole di accesso ai dati.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_callcenter';

ALTER TABLE public.super_admin_permissions
  ADD COLUMN IF NOT EXISTS crm_operatore boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.super_admin_permissions.crm_operatore IS
  'Permesso «CRM e chiamate»: contatti, opportunità e calendario della piattaforma. Lo hanno anche tutti con can_manage_marketing.';

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_perm boolean;
  _company  uuid;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Tutti i chiamanti passano l'utente corrente (assert_permesso,
  -- valida_sconto_fv, valida_sconto_progetto e le policy): si guarda l'azienda
  -- in cui sta lavorando. Se si chiede di un altro utente si ricade sul «ce
  -- l'ha in almeno una azienda», come prima.
  _company := CASE WHEN _user_id IS NOT DISTINCT FROM auth.uid()
                   THEN public.get_effective_company_id() END;

  -- Amministratore di QUESTA azienda (26/09/2026). Prima bastava il ruolo, di
  -- un'azienda qualsiasi: l'amministratore di A entrato in B come staff senza
  -- permessi, in B aveva tutti i permessi.
  IF _company IS NOT NULL THEN
    IF public.e_amministratore_di(_company) THEN
      RETURN true;
    END IF;
  ELSIF has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Staff: col ruolo, oppure con un accesso multi-azienda attivo da staff
  -- proprio in questa azienda. Chi è amministratore altrove ed è entrato qui
  -- come staff prende i permessi che gli ha dato QUESTA azienda.
  IF NOT (
    has_role(_user_id, 'company_staff'::app_role)
    -- Call center di piattaforma (08/10/2026): lavora sul CRM dell'azienda Piattaforma con i permessi
    -- scritti in staff_permissions, come uno staff.
    OR has_role(_user_id, 'platform_callcenter'::app_role)
    OR (_company IS NOT NULL
        AND NOT public.utente_bloccato()
        AND EXISTS (
          SELECT 1 FROM public.multi_company_access m
           WHERE m.user_id = _user_id
             AND m.company_id = _company
             AND m.access_role = 'company_staff'
             AND m.status = 'active'
             AND (m.expires_at IS NULL OR m.expires_at > now())))
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_permissions'
      AND column_name = _permission
  ) THEN
    RETURN false;
  END IF;

  BEGIN
    IF _company IS NULL THEN
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1',
        _permission
      ) INTO _has_perm USING _user_id;
    ELSE
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1 AND company_id = $2',
        _permission
      ) INTO _has_perm USING _user_id, _company;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN COALESCE(_has_perm, false);
END;
$function$;
