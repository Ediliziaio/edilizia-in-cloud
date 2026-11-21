-- Il percorso personale può annullare soltanto una propria richiesta in
-- attesa. La procedura amministrativa governa saldo e giornate già approvate.
DROP POLICY IF EXISTS hr_richieste_self_update ON public.hr_richieste;
CREATE POLICY hr_richieste_self_update
  ON public.hr_richieste FOR UPDATE TO authenticated
  USING (
    stato = 'in_attesa'
    AND EXISTS (
      SELECT 1 FROM public.hr_profili p
       WHERE p.id = hr_richieste.profilo_id
         AND p.company_id = hr_richieste.company_id
         AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    stato = 'annullata'
    AND EXISTS (
      SELECT 1 FROM public.hr_profili p
       WHERE p.id = hr_richieste.profilo_id
         AND p.company_id = hr_richieste.company_id
         AND p.user_id = (SELECT auth.uid())
    )
  );
