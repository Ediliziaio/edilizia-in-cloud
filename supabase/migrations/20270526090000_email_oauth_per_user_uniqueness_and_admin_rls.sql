-- ============================================================================
-- Email OAuth — Per-user uniqueness + Platform Admin RLS
-- ============================================================================
-- Fix per 2 bug rilevati nel flusso /admin/email:
--
-- 1. UNIQUE INDEX troppo restrittivo
--    L'index originale `(company_id, provider, lower(email_address))` impediva
--    a 2 utenti diversi della stessa company di collegare LA STESSA casella
--    email. Esempio reale: nel team superadmin, sia Florin che il suo
--    assistente Mario vogliono collegare `info@ediliziaincloud.com` come
--    Gmail — ognuno con il proprio token OAuth, ognuno vede solo le sue
--    email. Il vecchio index bloccava il secondo INSERT.
--
--    Fix: nuovo index `(company_id, user_id, provider, lower(email_address))`
--    → consente lo stesso indirizzo per N utenti diversi, MA ancora UNIQUE
--    per coppia (utente, casella).
--
-- 2. RLS bloccava team superadmin non-Florin
--    Le policy esistenti permettono SELECT/MANAGE solo se:
--      - company_id = get_effective_company_id() (la company AZIENDALE
--        dell'utente loggato, MAI la PLATFORM_ADMIN_COMPANY_ID), OPPURE
--      - has_role('super_admin') (solo Florin)
--
--    Risultato: un platform_manager / support / sales / marketing che
--    collegava la sua casella OAuth da /admin/* salvava la riga (via
--    service_role nell'edge function), ma poi al SELECT lato client la
--    RLS la bloccava → empty state perpetuo.
--
--    Fix: nuova policy `email_oauth_platform_team` che consente a
--    qualsiasi utente authenticated di leggere/gestire le SUE righe nella
--    PLATFORM_ADMIN_COMPANY_ID (scoping rigido su user_id = auth.uid()).
-- ============================================================================

-- ─── 1) UNIQUE INDEX per-user ──────────────────────────────────────────────
-- Drop dell'index troppo restrittivo
DROP INDEX IF EXISTS public.idx_email_oauth_unique;

-- Nuovo index: stessa casella collegabile da N utenti differenti
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_oauth_unique_per_user
  ON public.email_oauth_connections (company_id, user_id, provider, lower(email_address));

COMMENT ON INDEX public.idx_email_oauth_unique_per_user IS
  'Uniqueness scoped per (company, utente, provider, email): più utenti '
  'della stessa company possono collegare la stessa casella (es. info@ '
  'condivisa tra membri del team). Ogni utente vede solo le sue connessioni.';

-- ─── 2) Policy RLS team superadmin (Platform Admin Company) ────────────────
-- Consente a tutti i membri del team superadmin (platform_manager, support,
-- sales, marketing, implementation, ecc. — non solo super_admin) di
-- gestire le LORO connessioni email nella platform admin company.
-- Scoping rigido: user_id = auth.uid() → mai cross-user leak.
DROP POLICY IF EXISTS email_oauth_platform_team ON public.email_oauth_connections;
CREATE POLICY email_oauth_platform_team ON public.email_oauth_connections
  FOR ALL TO authenticated
  USING (
    company_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND user_id = auth.uid()
  )
  WITH CHECK (
    company_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND user_id = auth.uid()
  );

COMMENT ON POLICY email_oauth_platform_team ON public.email_oauth_connections IS
  'Consente al team superadmin (qualsiasi role admin, non solo super_admin) '
  'di gestire le proprie connessioni email scoped sulla PLATFORM_ADMIN_COMPANY_ID. '
  'Isolamento garantito da user_id = auth.uid().';
