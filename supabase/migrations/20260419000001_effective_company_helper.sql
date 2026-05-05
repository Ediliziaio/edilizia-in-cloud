-- ============================================================================
-- 20260419000001 — get_effective_company_id() + refactor RLS render
-- ============================================================================
-- Bug fix P1.2 / P1.3 del report stabilization:
--
-- Il pattern RLS attuale "(SELECT company_id FROM profiles WHERE id = auth.uid())"
-- ignora la tabella `active_impersonations`. Quando un superadmin impersona
-- un'azienda, le sue INSERT/SELECT vengono confrontate con la SUA company_id
-- invece che con la target_company_id. Questo ha causato errori "RLS policy
-- violation" durante impersonation sui moduli render.
--
-- Nuovo helper public.get_effective_company_id():
--   1. Se esiste impersonation attiva (expires_at > now()), torna
--      target_company_id (la più recente se ce ne sono più di una).
--   2. Altrimenti, torna profiles.company_id dell'utente corrente.
--   3. Se nessuno dei due, torna NULL (RLS = deny).
--
-- Le policy render vengono riscritte per usare l'helper. I bypass super_admin
-- (`sa_*`) restano immutati — superadmin senza impersonation continua ad avere
-- accesso globale tramite has_role().
-- ============================================================================

-- ── Helper ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_effective_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- 1. Impersonation attiva (super_admin impersona un'azienda)
    (SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ai.admin_user_id = auth.uid()
        AND ai.expires_at > now()
      ORDER BY ai.created_at DESC
      LIMIT 1),
    -- 2. Fallback profilo dell'utente corrente
    (SELECT p.company_id
       FROM public.profiles p
      WHERE p.id = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_company_id() TO authenticated;

COMMENT ON FUNCTION public.get_effective_company_id() IS
'Ritorna la company effettiva per l''utente corrente.
Se esiste impersonation attiva in active_impersonations (super_admin), ritorna
target_company_id; altrimenti fallback su profiles.company_id.
Usare nelle RLS policy al posto del pattern inline
"(SELECT company_id FROM profiles WHERE id = auth.uid())",
che ignora l''impersonation attiva.';

-- ============================================================================
-- Refactor policy render: alcune tabelle nascono in migration successive.
-- Su database pulito le DDL non devono fallire se un modulo render non esiste
-- ancora; quando la tabella arriverà, le migration successive applicheranno
-- le policy definitive.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('public.render_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_sessions" ON public.render_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_sessions" ON public.render_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_gallery') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_gallery" ON public.render_gallery';
    EXECUTE $policy$
      CREATE POLICY "co_render_gallery" ON public.render_gallery
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_credits') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_credits_select" ON public.render_credits';
    EXECUTE $policy$
      CREATE POLICY "co_render_credits_select" ON public.render_credits
        FOR SELECT TO authenticated
        USING (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_bagno_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "render_bagno_select" ON public.render_bagno_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "render_bagno_insert" ON public.render_bagno_sessions';
    EXECUTE 'DROP POLICY IF EXISTS "render_bagno_update" ON public.render_bagno_sessions';
    EXECUTE $policy$
      CREATE POLICY "render_bagno_select" ON public.render_bagno_sessions
        FOR SELECT TO authenticated
        USING (company_id = public.get_effective_company_id())
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "render_bagno_insert" ON public.render_bagno_sessions
        FOR INSERT TO authenticated
        WITH CHECK (company_id = public.get_effective_company_id() AND user_id = auth.uid())
    $policy$;
    EXECUTE $policy$
      CREATE POLICY "render_bagno_update" ON public.render_bagno_sessions
        FOR UPDATE TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_facciata_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_facciata_sessions" ON public.render_facciata_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_facciata_sessions" ON public.render_facciata_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_pavimento_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_pavimento_sessions" ON public.render_pavimento_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_pavimento_sessions" ON public.render_pavimento_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_persiane_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_persiane_sessions" ON public.render_persiane_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_persiane_sessions" ON public.render_persiane_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_tetto_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_tetto_sessions" ON public.render_tetto_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_tetto_sessions" ON public.render_tetto_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;

  IF to_regclass('public.render_stanza_sessions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "co_render_stanza_sessions" ON public.render_stanza_sessions';
    EXECUTE $policy$
      CREATE POLICY "co_render_stanza_sessions" ON public.render_stanza_sessions
        FOR ALL TO authenticated
        USING (company_id = public.get_effective_company_id())
        WITH CHECK (company_id = public.get_effective_company_id())
    $policy$;
  END IF;
END $$;

-- ============================================================================
-- NOTIFY PostgREST per ricaricare lo schema (funzione pubblica)
-- ============================================================================
NOTIFY pgrst, 'reload schema';
