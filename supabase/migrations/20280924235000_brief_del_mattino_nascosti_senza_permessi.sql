-- Brief del mattino: via dalla vista quelli scritti come amministratore per
-- chi non vede la finanza.
--
-- Fino al 24/09/2026 silvio-morning-brief interrogava i dati di ogni utente
-- con il ruolo company_admin: dal 29/05/2026, 97 brief per 14 persone senza
-- permessi sulla finanza (venditori, call center, impiegati, in 7 aziende)
-- riportavano cassa, crediti scaduti e sintesi di direzione. La funzione ora
-- usa il ruolo vero (_shared/briefDelMattino.ts); qui si nascondono quelli
-- già salvati.
--
-- Nascosti, non cancellati: le righe restano per il controllo. Per rimostrarne
-- uno: update public.silvio_morning_briefings set nascosto_il = null where id = '…';

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.silvio_morning_briefings
  ADD COLUMN IF NOT EXISTS nascosto_il timestamptz,
  ADD COLUMN IF NOT EXISTS nascosto_motivo text;

COMMENT ON COLUMN public.silvio_morning_briefings.nascosto_il IS
  'Valorizzato = chi ha ricevuto il brief non lo legge più (RLS). Il 24/09/2026: brief scritti come amministratore per utenti senza permessi sulla finanza.';

-- La lettura esclude i nascosti.
DROP POLICY IF EXISTS user_read_own_briefings ON public.silvio_morning_briefings;
CREATE POLICY user_read_own_briefings ON public.silvio_morning_briefings
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND nascosto_il IS NULL);

-- L'utente segna letto o archiviato un suo brief visibile, e basta. Prima
-- poteva riscriverne ogni colonna, contenuto compreso: anche togliere
-- nascosto_il e rileggerlo.
DROP POLICY IF EXISTS user_update_own_briefing_status ON public.silvio_morning_briefings;
CREATE POLICY user_update_own_briefing_status ON public.silvio_morning_briefings
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND nascosto_il IS NULL)
  WITH CHECK (user_id = (SELECT auth.uid()) AND nascosto_il IS NULL);

REVOKE UPDATE ON public.silvio_morning_briefings FROM anon, authenticated;
GRANT UPDATE (read_at, dismissed_at) ON public.silvio_morning_briefings TO authenticated;

-- I brief di chi non è amministratore, fino al giorno della correzione: da
-- domani un impiegato può riceverne uno giusto (solo le aree che vede), e
-- rilanciare questo file non deve toccarlo.
UPDATE public.silvio_morning_briefings smb
   SET nascosto_il = now(),
       nascosto_motivo = 'Scritto come amministratore per un utente senza permessi sulla finanza (fino al 24/09/2026)'
 WHERE smb.nascosto_il IS NULL
   AND smb.brief_date <= DATE '2026-09-24'
   AND NOT EXISTS (
     SELECT 1 FROM public.user_roles r
      WHERE r.user_id = smb.user_id
        AND r.role::text IN ('company_admin', 'super_admin')
   );
