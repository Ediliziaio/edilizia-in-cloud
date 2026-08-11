-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Permessi granulari aggiuntivi su staff_permissions:
--  • can_view_formazione         → fruizione area Formazione (prima senza gate). DEFAULT true = nessuna regressione per utenti esistenti, ma ora revocabile.
--  • can_manage_portal           → gestione Portale corsi (prima confuso con can_view_persone). DEFAULT false + backfill da chi già gestiva via persone.
--  • can_view_controllo_gestione → toggle esplicito per il modulo Controllo di Gestione (prima solo derivato da cruscotto/billing/costs). Additivo (OR lato frontend).
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_formazione boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_portal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_controllo_gestione boolean NOT NULL DEFAULT false;

-- Preserva l'accesso attuale: chi poteva gestire il Portale tramite can_view_persone lo mantiene.
UPDATE public.staff_permissions
  SET can_manage_portal = true
  WHERE can_view_persone = true AND can_manage_portal = false;

COMMENT ON COLUMN public.staff_permissions.can_view_formazione IS 'Fruizione area Formazione (/azienda/formazione)';
COMMENT ON COLUMN public.staff_permissions.can_manage_portal IS 'Gestione Portale corsi (/azienda/personale/portale)';
COMMENT ON COLUMN public.staff_permissions.can_view_controllo_gestione IS 'Accesso esplicito al modulo Controllo di Gestione';
