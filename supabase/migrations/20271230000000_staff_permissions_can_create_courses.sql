-- Permesso "Creazione corsi" separato dalla gestione del Portale.
-- ─────────────────────────────────────────────────────────────────────────────
-- Contesto: finora `can_manage_portal` accorpava sia la CREAZIONE dei corsi
-- (builder) sia la GESTIONE del Portale (libreria, assegnazioni, iscrizioni,
-- report). Si separa la creazione in un permesso dedicato, così un utente può
-- gestire il Portale senza poter creare/modificare corsi (e viceversa).
--
-- Additiva e retro-compatibile: colonna NOT NULL DEFAULT false + backfill dai
-- valori attuali di `can_manage_portal` (chi gestiva il Portale mantiene la
-- capacità di creare). Idempotente.
--
-- ⚠️ ATTIVAZIONE LATO CODICE (da fare in pubblicazione, DOPO questa migration):
--   1) usePermissions.ts → mapDbRowToPermissions:
--        canCreateCourses: g("can_create_courses")   // rimuovere il fallback
--        (oggi è `g("can_create_courses") || g("can_manage_portal")` transitorio)
--   2) permissionsDefaults.ts → DEFAULT_PERMISSIONS: aggiungere
--        can_create_courses: false
--      (serve a buildStaffPermissionsUpdate per SALVARE il toggle; senza colonna
--       DB romperebbe ogni UPDATE, per questo NON è nel codice finché non si
--       applica questa migration)
--   3) permissionsDefaults.ts → PERSONE_SECTIONS: riga toggle "Creazione corsi"
--        { label: "Creazione corsi", viewKey: "can_create_courses", editKey: null, ... }
--   4) supabase/functions/_shared/staffPermissionsDefaults.ts →
--        STAFF_PERMISSION_DEFAULTS: aggiungere `can_create_courses: false`
--        (il test staffPermissionsEdgeParity impone parità di chiavi edge↔client)
--   5) PermissionsDialog.tsx → interface StaffPermissions: `can_create_courses: boolean`
--   6) types.ts (staff_permissions Row/Insert/Update): rigenerare o aggiungere a mano
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_create_courses boolean NOT NULL DEFAULT false;

-- Backfill: chi oggi gestisce il Portale mantiene la capacità di creare corsi.
UPDATE public.staff_permissions
   SET can_create_courses = can_manage_portal
 WHERE can_create_courses IS DISTINCT FROM can_manage_portal;

COMMENT ON COLUMN public.staff_permissions.can_create_courses
  IS 'Abilita creazione/editing corsi nel builder (/azienda/corsi). Distinto da can_manage_portal (gestione libreria + assegnazioni). Separato il 2027-12-25.';
