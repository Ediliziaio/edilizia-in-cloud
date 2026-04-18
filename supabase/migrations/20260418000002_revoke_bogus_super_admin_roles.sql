-- ============================================================================
-- P1 SECURITY — Revoke any super_admin role/permissions NOT in the allowlist.
-- ============================================================================
-- Contesto: un utente non autorizzato (demo@azienda.srl) aveva `role =
-- super_admin` in `user_roles`, consentendogli di accedere all'area superadmin
-- dopo il login. La fonte di questa riga è ignota (seed errato, migrazione
-- pregressa, bug). Questa migrazione è l'ULTIMA linea di difesa lato dato:
-- rimuove TUTTE le righe super_admin per email NON presenti nell'allowlist
-- applicativa (src/config/superAdmin.ts).
--
-- Allowlist corrente (2026-04-18): flo.andriciuc@gmail.com
--
-- Idempotente: safe to re-run — elimina solo righe indesiderate, non tocca le
-- email consentite. Loggiamo ogni riga rimossa via RAISE NOTICE per audit.
-- ============================================================================

DO $$
DECLARE
  v_allowed_emails text[] := ARRAY['flo.andriciuc@gmail.com'];
  v_removed_count  int   := 0;
  v_row            record;
BEGIN
  -- 1) Revoca righe super_admin per email NON in allowlist
  FOR v_row IN
    SELECT ur.user_id, u.email
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'super_admin'::public.app_role
      AND lower(u.email) <> ALL (ARRAY(SELECT lower(unnest(v_allowed_emails))))
  LOOP
    RAISE NOTICE '[security] Revoca super_admin da user_roles per %: %',
      v_row.email, v_row.user_id;

    DELETE FROM public.user_roles
    WHERE user_id = v_row.user_id
      AND role = 'super_admin'::public.app_role;

    v_removed_count := v_removed_count + 1;
  END LOOP;

  -- 2) Revoca permessi super_admin spuri
  FOR v_row IN
    SELECT sap.user_id, u.email
    FROM public.super_admin_permissions sap
    JOIN auth.users u ON u.id = sap.user_id
    WHERE lower(u.email) <> ALL (ARRAY(SELECT lower(unnest(v_allowed_emails))))
  LOOP
    RAISE NOTICE '[security] Revoca super_admin_permissions per %: %',
      v_row.email, v_row.user_id;

    DELETE FROM public.super_admin_permissions
    WHERE user_id = v_row.user_id;

    v_removed_count := v_removed_count + 1;
  END LOOP;

  -- 3) Summary
  IF v_removed_count = 0 THEN
    RAISE NOTICE '[security] Nessuna riga spuria trovata — allowlist DB già coerente.';
  ELSE
    RAISE NOTICE '[security] Revocate % righe super_admin non autorizzate.',
      v_removed_count;
  END IF;
END
$$;
