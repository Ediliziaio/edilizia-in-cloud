-- Green Energy Group ed Energia Più S.r.l. sono la stessa realtà.
-- Chi lavora in Green Energy deve poter entrare anche in Energia Più: al login
-- sceglie l'azienda (/seleziona-azienda) e poi la cambia quando vuole dal
-- selettore in alto a sinistra (CompanyContextSwitcher).
--
-- Servono DUE cose, non una:
--   1) la riga in multi_company_access (è quella che user_can_access_company /
--      get_effective_company_id leggono per far passare RLS e RPC);
--   2) la riga in staff_permissions per la NUOVA azienda — i permessi sono per
--      (utente, azienda): senza, un company_staff entrerebbe in Energia Più con
--      NO_PERMISSIONS, cioè un'app vuota. I company_admin non ne hanno bisogno
--      (usePermissions dà loro ALL_PERMISSIONS sull'azienda selezionata).
--
-- Idempotente: si può rieseguire senza effetti. Riguarda solo gli utenti
-- ESISTENTI di Green Energy con un ruolo di lavoro (i clienti sono esclusi).

DO $$
DECLARE
  v_green uuid;
  v_piu   uuid;
BEGIN
  SELECT id INTO v_green FROM public.companies WHERE name = 'Green Energy Group';
  SELECT id INTO v_piu   FROM public.companies WHERE name = 'Energia Più S.r.l.';

  IF v_green IS NULL OR v_piu IS NULL THEN
    RAISE NOTICE 'Green Energy Group / Energia Più non presenti: nessun accesso concesso.';
    RETURN;
  END IF;

  -- 1) Accesso alla seconda azienda, con lo stesso ruolo che la persona ha in
  --    Green Energy (un admin resta admin, uno staff resta staff).
  INSERT INTO public.multi_company_access (user_id, company_id, access_role, status)
  SELECT p.id, v_piu, ur.role::text, 'active'
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id = v_green
    AND ur.role::text IN ('company_admin', 'company_staff', 'salesperson', 'call_center')
  ON CONFLICT (user_id, company_id) DO NOTHING;

  -- 2) Permessi clonati da Green Energy verso Energia Più.
  --    Copia colonna-per-colonna via jsonb così restano allineati anche se
  --    staff_permissions cresce di colonne (ne ha ~95).
  INSERT INTO public.staff_permissions
  SELECT (jsonb_populate_record(
            NULL::public.staff_permissions,
            to_jsonb(sp) || jsonb_build_object(
              'id',         gen_random_uuid(),
              'company_id', v_piu,
              'created_at', now(),
              'updated_at', now()
            )
          )).*
  FROM public.staff_permissions sp
  WHERE sp.company_id = v_green
    AND EXISTS (
      SELECT 1 FROM public.multi_company_access m
      WHERE m.user_id = sp.user_id AND m.company_id = v_piu AND m.status = 'active'
    )
  ON CONFLICT (user_id, company_id) DO NOTHING;
END $$;
