-- ════════════════════════════════════════════════════════════════════════════
-- Contatti e opportunità: da 17 secondi (o timeout) a millisecondi
-- ════════════════════════════════════════════════════════════════════════════
-- Le policy staff chiamavano `has_permission_for_company(uid, perm, company_id)`
-- PER RIGA: dentro fa due has_role, un EXISTS su multi_company_access, una
-- lettura di information_schema.columns e una EXECUTE dinamica. Su
-- marketing_contacts (90.380 righe, di cui 89.692 del CRM di piattaforma) un
-- admin di una PMI aspettava 17 s per vedere i suoi 132 contatti, e uno staff
-- sforava il timeout: il database doveva valutare la funzione anche sulle
-- 89.692 righe di un'altra azienda per scoprire che non erano sue.
--
-- La domanda "in quali aziende ho questo permesso?" dipende solo da CHI guarda:
-- si risponde UNA volta con `aziende_con_permesso(perm)` e la policy diventa
-- `company_id IN (SELECT unnest(...))` — un predicato che usa l'indice su
-- company_id e tocca solo le righe dell'azienda giusta.
--
-- Stessa semantica di has_permission_for_company, pezzo per pezzo:
--   • super_admin → non incluso qui: ogni tabella ha già la sua policy
--     "Super admins can manage all …" (verificato su tutte e 5);
--   • company_admin sulla propria azienda → inclusa;
--   • multi_company_access attivo con access_role company_admin → inclusa;
--   • riga staff_permissions (user, company) con la colonna a true → inclusa;
--   • colonna inesistente → nessuna azienda (come il return false originale).
-- "Solo le sue" → solo_assegnati_attivo(), già hoistabile.
--
-- Verificato su 7 utenti campione (2 aziende + un venditore) confrontando il
-- conteggio atteso, calcolato emulando le regole vecchie in SQL puro, con il
-- conteggio reale sotto RLS dopo il cambio: identici, riga per riga.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.aziende_con_permesso(_permission text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _out uuid[] := '{}';
  _staff uuid[] := '{}';
BEGIN
  IF _uid IS NULL THEN RETURN '{}'; END IF;

  -- Amministratore della propria azienda.
  IF has_role(_uid, 'company_admin'::app_role) THEN
    _out := _out || ARRAY(SELECT p.company_id FROM public.profiles p WHERE p.id = _uid AND p.company_id IS NOT NULL);
  END IF;

  -- Accessi multi-azienda con grado amministratore.
  _out := _out || ARRAY(
    SELECT mca.company_id FROM public.multi_company_access mca
    WHERE mca.user_id = _uid
      AND mca.status = 'active'
      AND (mca.expires_at IS NULL OR mca.expires_at > now())
      AND mca.access_role::text = 'company_admin'
  );

  -- Permesso esplicito, una riga per azienda. La colonna è dinamica: si
  -- verifica che esista (UNA volta per chiamata, non per riga).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_permissions' AND column_name = _permission
  ) THEN
    BEGIN
      EXECUTE format(
        'SELECT COALESCE(array_agg(company_id), ''{}'') FROM public.staff_permissions WHERE user_id = $1 AND %I = true',
        _permission
      ) INTO _staff USING _uid;
    EXCEPTION WHEN OTHERS THEN
      _staff := '{}';
    END;
    _out := _out || COALESCE(_staff, '{}');
  END IF;

  RETURN _out;
END;
$function$;

COMMENT ON FUNCTION public.aziende_con_permesso(text) IS
  'Le aziende in cui l''utente corrente ha il permesso dato (stessa semantica di has_permission_for_company, ma UNA chiamata per query invece che una per riga). Super admin esclusi: hanno la loro policy.';

-- L'indice che mancava: senza, ogni lettura scorreva 92.000 righe.
CREATE INDEX IF NOT EXISTS idx_marketing_contact_activities_company
  ON public.marketing_contact_activities (company_id);
CREATE INDEX IF NOT EXISTS idx_marketing_opportunity_notes_company
  ON public.marketing_opportunity_notes (company_id);

-- ── marketing_contacts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view marketing contacts if permitted" ON public.marketing_contacts;
CREATE POLICY "Staff can view marketing contacts if permitted"
  ON public.marketing_contacts FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_view_marketing_contacts') || aziende_con_permesso('can_view_orders')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR assigned_to = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage marketing contacts if permitted" ON public.marketing_contacts;
CREATE POLICY "Staff can manage marketing contacts if permitted"
  ON public.marketing_contacts FOR ALL TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR assigned_to = (SELECT auth.uid()))
  )
  WITH CHECK (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
  );

-- ── marketing_opportunities ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view opportunities if permitted" ON public.marketing_opportunities;
CREATE POLICY "Staff can view opportunities if permitted"
  ON public.marketing_opportunities FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_view_marketing_opportunities') || aziende_con_permesso('can_view_orders')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR assigned_to = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage opportunities if permitted" ON public.marketing_opportunities;
CREATE POLICY "Staff can manage opportunities if permitted"
  ON public.marketing_opportunities FOR ALL TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_opportunities')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR assigned_to = (SELECT auth.uid()))
  )
  WITH CHECK (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_opportunities')))
  );

-- ── marketing_contact_activities ────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view contact activities if permitted" ON public.marketing_contact_activities;
CREATE POLICY "Staff can view contact activities if permitted"
  ON public.marketing_contact_activities FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_view_marketing_contacts') || aziende_con_permesso('can_view_orders')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage contact activities if permitted" ON public.marketing_contact_activities;
CREATE POLICY "Staff can manage contact activities if permitted"
  ON public.marketing_contact_activities FOR ALL TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

-- ── marketing_contact_notes ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view contact notes if permitted" ON public.marketing_contact_notes;
CREATE POLICY "Staff can view contact notes if permitted"
  ON public.marketing_contact_notes FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_view_marketing_contacts') || aziende_con_permesso('can_view_orders')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage contact notes if permitted" ON public.marketing_contact_notes;
CREATE POLICY "Staff can manage contact notes if permitted"
  ON public.marketing_contact_notes FOR ALL TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_contacts')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

-- ── marketing_opportunity_notes ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff can view opportunity notes if permitted" ON public.marketing_opportunity_notes;
CREATE POLICY "Staff can view opportunity notes if permitted"
  ON public.marketing_opportunity_notes FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_view_marketing_opportunities') || aziende_con_permesso('can_view_orders')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Staff can manage opportunity notes if permitted" ON public.marketing_opportunity_notes;
CREATE POLICY "Staff can manage opportunity notes if permitted"
  ON public.marketing_opportunity_notes FOR ALL TO authenticated
  USING (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_opportunities')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    company_id IN (SELECT unnest(aziende_con_permesso('can_edit_marketing_opportunities')))
    AND (NOT (SELECT solo_assegnati_attivo()) OR created_by = (SELECT auth.uid()))
  );

-- ── Policy admin / super-admin: stessa semantica, valutate una volta ─────────
-- Chiamavano has_role e get_user_company_id PER RIGA (90.000 righe → ~1,4 s a
-- tabella anche per chi non è admin: in OR ogni ramo va valutato comunque).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('marketing_contacts',           'Company admins can manage their marketing contacts', 'Super admins can manage all marketing contacts'),
    ('marketing_opportunities',      'Company admins can manage their opportunities',      'Super admins can manage all opportunities'),
    ('marketing_contact_activities', 'Company admins can manage contact activities',       'Super admins can manage all contact activities'),
    ('marketing_contact_notes',      'Company admins can manage contact notes',            'Super admins can manage all contact notes'),
    ('marketing_opportunity_notes',  'Company admins can manage opportunity notes',        'Super admins can manage all opportunity notes')
  ) AS v(tabella, pol_admin, pol_super)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.pol_admin, t.tabella);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING ((SELECT has_role((SELECT auth.uid()), 'company_admin'::app_role)) AND company_id = (SELECT get_user_company_id((SELECT auth.uid()))))
        WITH CHECK ((SELECT has_role((SELECT auth.uid()), 'company_admin'::app_role)) AND company_id = (SELECT get_user_company_id((SELECT auth.uid()))))
    $p$, t.pol_admin, t.tabella);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.pol_super, t.tabella);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
        USING ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role)))
        WITH CHECK ((SELECT has_role((SELECT auth.uid()), 'super_admin'::app_role)))
    $p$, t.pol_super, t.tabella);
  END LOOP;
END $$;
