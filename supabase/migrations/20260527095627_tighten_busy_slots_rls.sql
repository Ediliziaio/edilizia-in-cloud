-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- 2026-05-27: la policy "Company members read busy slots" permetteva a
-- CHIUNQUE della company (anche utenti non-vendita / non-admin) di leggere
-- TUTTI i busy slot Google Calendar di TUTTI i colleghi.
-- Privacy leak: un dipendente operativo poteva vedere quando il CEO o un
-- venditore era in riunione.
--
-- È RIDONDANTE: la policy "gcal_busy_own_or_company_admin" copre già il
-- legittimo bisogno aziendale (admin/sales/call_center vedono per booking
-- interno), e "public_booking_read_busy_slots" copre la pagina pubblica.
-- L'owner vede sempre i suoi via "Users read own busy slots".
--
-- Drop sicuro (le altre 4 policy coprono tutti i casi d'uso).
DROP POLICY IF EXISTS "Company members read busy slots" ON public.google_calendar_busy_slots;
