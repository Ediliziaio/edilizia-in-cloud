-- Hardening di sicurezza del registro consensi OAuth (mcp_oauth_grants).
--
-- BUCO CHIUSO (escalation cross-azienda): la policy di UPDATE dell'owner
-- controllava solo user_id = auth.uid(). Un utente poteva così cambiare il
-- company_id del PROPRIO grant verso un'azienda che NON amministra e alzare il
-- livello a «operativo»: il suo token OAuth avrebbe poi dato accesso ai dati di
-- quell'azienda. Ora ogni update dell'owner richiede di restare amministratore
-- dell'azienda RISULTANTE (stesso vincolo della RPC che crea il consenso). La
-- revoca (revoked_at) del proprio grant resta possibile: company_id non cambia.

drop policy if exists mcp_oauth_grants_owner_update on public.mcp_oauth_grants;
create policy mcp_oauth_grants_owner_update on public.mcp_oauth_grants
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.has_permission_for_company(auth.uid(), 'can_edit_settings_integrations', company_id)
  );

-- Difesa in profondità: i consensi si creano SOLO tramite la RPC
-- mcp_oauth_upsert_grant (SECURITY DEFINER, verifica l'admin). L'utente
-- autenticato non deve poter inserire/cancellare righe direttamente: non ci sono
-- policy INSERT/DELETE (già bloccati da RLS), ma togliamo anche il privilegio di
-- tabella, così resta chiuso anche se un domani qualcuno aggiungesse una policy.
revoke insert, delete, truncate on public.mcp_oauth_grants from authenticated;
