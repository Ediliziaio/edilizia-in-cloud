-- Permesso dedicato "approvazione sconti" (can_approve_discounts).
--
-- Prima la possibilità di impostare/approvare sconti oltre soglia era gated dal
-- RUOLO GLOBALE (role === 'company_admin'): un utente admin di un'azienda poteva
-- forzare/approvare sconti anche in un'altra azienda dove è solo staff marketing
-- (il ruolo globale non cambia con lo switch azienda). Ora è un permesso
-- per-utente-per-azienda: gli admin d'azienda ce l'hanno via bypass
-- (ALL_PERMISSIONS), lo staff solo se esplicitamente autorizzato.
-- Default false = nessuno staff può approvare sconti finché non gli viene concesso.
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_approve_discounts boolean NOT NULL DEFAULT false;
