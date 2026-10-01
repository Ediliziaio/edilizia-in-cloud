-- Chiavi API / MCP: le gestisce solo chi ha il permesso Integrazioni (26/09/2026).
--
-- La policy «Company admins manage own api keys» si chiamava così ma controllava
-- solo l'APPARTENENZA all'azienda, non il ruolo, ed era FOR ALL. Con INSERT
-- concesso a `authenticated`, un dipendente qualunque poteva creare via PostgREST
-- una chiave per la propria azienda — anche con scope `*` — e poi agire come
-- tutta l'azienda tramite il server MCP (che usa il service role e guarda solo
-- gli scope della chiave, non i permessi di chi l'ha emessa). Provato il
-- 26/09/2026: un employee non-admin inseriva una chiave `*`.
--
-- Ora:
-- - leggere le chiavi: chi ha «Vedi» sulle Integrazioni (can_view_settings_integrations);
-- - crearle/modificarle/revocarle: chi ha «Modifica» (can_edit_settings_integrations).
--   has_permission_for_company dà comunque il via a super admin e amministratori.
-- - lo scope jolly `*` resta solo alle chiavi di piattaforma (super admin): una
--   chiave d'azienda deve elencare gli scope, così non esiste una chiave che può
--   tutto emessa dentro un'azienda.
-- - via i privilegi che RLS non protegge: TRUNCATE (svuoterebbe le chiavi di
--   TUTTE le aziende), REFERENCES, TRIGGER, per authenticated e anon.

SET LOCAL lock_timeout = '3s';

REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.api_keys FROM authenticated, anon;

DROP POLICY IF EXISTS "Company admins manage own api keys" ON public.api_keys;
DROP POLICY IF EXISTS api_keys_lettura_integrazioni ON public.api_keys;
DROP POLICY IF EXISTS api_keys_gestione_integrazioni ON public.api_keys;

CREATE POLICY api_keys_lettura_integrazioni ON public.api_keys
  FOR SELECT TO authenticated
  USING (public.has_permission_for_company((SELECT auth.uid()), 'can_view_settings_integrations', company_id));

CREATE POLICY api_keys_gestione_integrazioni ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_permission_for_company((SELECT auth.uid()), 'can_edit_settings_integrations', company_id))
  WITH CHECK (
    public.has_permission_for_company((SELECT auth.uid()), 'can_edit_settings_integrations', company_id)
    AND (
      NOT ('*' = ANY (coalesce(scopes, '{}')))
      OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
    )
  );
